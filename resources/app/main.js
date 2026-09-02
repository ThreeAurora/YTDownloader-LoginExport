const {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	shell,
	Tray,
	Menu,
	clipboard,
	session,
	globalShortcut,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs").promises;
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("fs");
const path = require("path");
const DownloadHistory = require("./src/history");
const { platform, homedir } = require("os");

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
autoUpdater.autoDownload = false;
autoUpdater.allowDowngrade = true;
autoUpdater.autoInstallOnAppQuit = true;

const USER_DATA_PATH = app.getPath("userData");
const CONFIG_FILE_PATH = path.join(USER_DATA_PATH, "ytdownloader.json");

const appState = {
	/** @type {BrowserWindow | null} */
	mainWindow: null,
	/** @type {BrowserWindow | null} */
	secondaryWindow: null,
	/** @type {BrowserWindow | null} */
	loginWindow: null,
	/** @type {Array<Function>} */
	loginWaiters: [],
	/** @type {Tray | null} */
	tray: null,
	isQuitting: false,
	indexPageIsOpen: true,
	trayEnabled: false,
	loadedLanguage: {},
	config: {},
	downloadHistory: new DownloadHistory(),
	autoUpdateEnabled: false,
	isManualUpdateCheck: false,
	updateChannel: "stable",
	/** @type {string | null} Currently registered global hotkey accelerator */
	registeredHotkeyAccelerator: null,
};

const isTestEnv = process.env.NODE_ENV === "test" || process.argv.includes("--is-test") || process.env.YTDOWNLOADER_TEST === "true";
const gotTheLock = isTestEnv ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (appState.mainWindow && !isTestEnv) {
			if (appState.mainWindow.isMinimized())
				appState.mainWindow.restore();
			appState.mainWindow.show();
			appState.mainWindow.focus();
			if (app.dock) app.dock.show();
		}
	});
}

app.whenReady().then(async () => {
	await initialize();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on("before-quit", () => {
	appState.isQuitting = true;
	globalShortcut.unregisterAll();
	saveConfiguration();
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

/**
 * Initializes the application by loading config, translations,
 * and setting up handlers.
 */
async function initialize() {
	await Promise.all([loadConfiguration(), loadTranslations()]);

	registerIpcHandlers();
	registerAutoUpdaterEvents();

	createWindow();

	if (process.platform === "win32") {
		app.setAppUserModelId(app.name);
	}
}

function createWindow() {
	const bounds = appState.config.bounds || {};

	appState.mainWindow = new BrowserWindow({
		...bounds,
		minWidth: 680,
		minHeight: 500,
		autoHideMenuBar: true,
		show: false,
		icon: path.join(__dirname, "/assets/images/icon.png"),
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: false,
			preload: path.join(__dirname, "preload.js"),
			spellcheck: false,
		},
	});

	// 魔改：固定窗口标题，防止页面 title 覆盖
	appState.mainWindow.setTitle("YTDownloader魔改by简单");
	appState.mainWindow.on("page-title-updated", (event) => {
		event.preventDefault();
		appState.mainWindow.setTitle("YTDownloader魔改by简单");
	});

	appState.mainWindow.loadFile("html/index.html");

	appState.mainWindow.once("ready-to-show", () => {
		if (!isTestEnv) {
			appState.mainWindow.show();
		}

		if (appState.config.isMaximized) {
			appState.mainWindow.maximize();
		}
	});

	const saveBounds = () => {
		if (appState.mainWindow && !appState.mainWindow.isMaximized()) {
			appState.config.bounds = appState.mainWindow.getBounds();
		}
	};

	appState.mainWindow.on("resize", saveBounds);
	appState.mainWindow.on("move", saveBounds);

	appState.mainWindow.on("maximize", () => {
		appState.config.isMaximized = true;
	});

	appState.mainWindow.on("unmaximize", () => {
		appState.config.isMaximized = false;
	});

	appState.mainWindow.on("close", (event) => {
		if (!appState.isQuitting && appState.trayEnabled) {
			event.preventDefault();
			appState.mainWindow.hide();
			if (app.dock) app.dock.hide();
		}
	});
}

/**
 * @param {string} file The HTML file to load.
 */
function createSecondaryWindow(file) {
	if (appState.secondaryWindow) {
		appState.secondaryWindow.focus();
		return;
	}

	appState.secondaryWindow = new BrowserWindow({
		parent: appState.mainWindow,
		modal: true,
		show: false,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: false,
			preload: path.join(__dirname, "preload.js"),
		},
		width: 900,
		height: 640,
		minWidth: 680,
		minHeight: 500,
	});

	// appState.secondaryWindow.webContents.openDevTools();
	// 魔改：副窗口同样固定标题
	appState.secondaryWindow.setTitle("YTDownloader魔改by简单");
	appState.secondaryWindow.on("page-title-updated", (event) => {
		event.preventDefault();
		appState.secondaryWindow.setTitle("YTDownloader魔改by简单");
	});
	appState.secondaryWindow.loadFile(file);
	appState.secondaryWindow.setMenu(null);
	appState.secondaryWindow.once("ready-to-show", () => {
		appState.secondaryWindow.show();
	});

	appState.secondaryWindow.on("closed", () => {
		appState.secondaryWindow = null;
	});
}

/**
 * Creates the system tray icon
 */
function createTray() {
	if (appState.tray) return;

	let iconPath;
	if (process.platform === "win32") {
		iconPath = path.join(__dirname, "resources/icon.ico");
	} else if (process.platform === "darwin") {
		iconPath = path.join(__dirname, "resources/icons/16x16.png");
	} else {
		iconPath = path.join(__dirname, "resources/icons/256x256.png");
	}

	appState.tray = new Tray(iconPath);

	const contextMenu = Menu.buildFromTemplate([
		{
			label: i18n("openApp"),
			click: () => {
				appState.mainWindow?.show();
				if (app.dock) app.dock.show();
			},
		},
		{
			label: i18n("pasteVideoLink"),
			click: async () => {
				const text = clipboard.readText();

				appState.mainWindow?.show();
				if (app.dock) app.dock.show();

				const wc = appState.mainWindow.webContents;

				if (!appState.indexPageIsOpen) {
					wc.once("did-finish-load", () => {
						appState.indexPageIsOpen = true;
						wc.send("navigate-view", "view-home");
						wc.send("link", text);
					});

					await appState.mainWindow.loadFile("html/index.html");
				} else {
					wc.send("navigate-view", "view-home");
					wc.send("link", text);
				}
			},
		},
		{
			label: i18n("downloadPlaylistButton"),
			click: () => {
				if (appState.mainWindow) {
					appState.mainWindow.show();
					appState.mainWindow.webContents.send("navigate-view", "view-playlist");
				}
				if (app.dock) app.dock.show();
			},
		},
		{
			label: i18n("quit"),
			click: () => {
				app.quit();
			},
		},
	]);

	appState.tray.setToolTip("ytDownloader");
	appState.tray.setContextMenu(contextMenu);
	appState.tray.on("click", () => {
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			if (appState.mainWindow.isMinimized()) appState.mainWindow.restore();
			appState.mainWindow.show();
			appState.mainWindow.focus();
		}

		if (app.dock) app.dock.show();
	});
}

function configureAutoUpdaterChannel(channel = "stable") {
	appState.updateChannel = channel;
	if (channel === "beta") {
		autoUpdater.allowPrerelease = true;
		autoUpdater.channel = "beta";
	} else {
		autoUpdater.allowPrerelease = false;
		autoUpdater.channel = "latest";
	}
}

function registerIpcHandlers() {
	ipcMain.on("autoUpdate", (_event, status) => {
		appState.autoUpdateEnabled = status;

		if (status) {
			triggerUpdateCheck(false);
		}
	});

	ipcMain.on("set-update-channel", (_event, channel) => {
		configureAutoUpdaterChannel(channel);
	});

	ipcMain.on("check-for-updates", async (_event, opts = {}) => {
		if (opts.channel) {
			configureAutoUpdaterChannel(opts.channel);
		}
		triggerUpdateCheck(Boolean(opts.isManual));
	});

	ipcMain.on("download-update", async () => {
		if (!app.isPackaged) {
			if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
				appState.mainWindow.webContents.send("update-error", {
					message: "In-app downloading is only supported in packaged installations (NSIS/AppImage).",
					isManual: true,
				});
			}
			return;
		}

		try {
			await autoUpdater.downloadUpdate();
		} catch (err) {
			console.error("Download update failed:", err);
			if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
				appState.mainWindow.webContents.send("update-error", {
					message: err?.message || "Failed to download update",
					isManual: true,
				});
			}
		}
	});

	ipcMain.on("install-update", (_event, opts = {}) => {
		const isSilent = opts.isSilent !== undefined ? opts.isSilent : true;
		const isForceRunAfter = opts.isForceRunAfter !== undefined ? opts.isForceRunAfter : true;
		autoUpdater.quitAndInstall(isSilent, isForceRunAfter);
	});

	ipcMain.on("reload", () => {
		appState.mainWindow?.reload();
		appState.secondaryWindow?.reload();
	});

	ipcMain.on("get-version", (event) => {
		event.sender.send("version", app.getVersion());
	});

	ipcMain.on("show-file", async (_event, fullPath) => {
		try {
			await fs.stat(fullPath);
			shell.showItemInFolder(fullPath);
		} catch (error) { }
	});

	ipcMain.handle("show-file", async (_event, fullPath) => {
		try {
			await fs.stat(fullPath);
			shell.showItemInFolder(fullPath);

			return { success: true };
		} catch (error) {
			return { success: false, error: error.message };
		}
	});

	ipcMain.handle("open-folder", async (_event, folderPath) => {
		try {
			await fs.stat(folderPath);
			const result = await shell.openPath(folderPath);
			if (result) {
				return { success: false, error: result };
			} else {
				return { success: true };
			}
		} catch (error) {
			return { success: false, error: error.message };
		}
	});

	function resolveHtmlPath(file) {
		if (existsSync(file)) {
			return file;
		}
		const basename = path.basename(file);
		const htmlPath = path.join(__dirname, "html", basename);
		if (existsSync(htmlPath)) {
			return htmlPath;
		}
		const rootPath = path.join(__dirname, file);
		if (existsSync(rootPath)) {
			return rootPath;
		}
		return file;
	}

	ipcMain.on("load-win", (_event, file) => {
		appState.indexPageIsOpen = file.includes("index.html");
		const targetPath = resolveHtmlPath(file);
		appState.mainWindow?.loadFile(targetPath);
	});

	ipcMain.on("load-page", (_event, file) => {
		const targetPath = resolveHtmlPath(file);
		createSecondaryWindow(targetPath);
	});

	ipcMain.on("close-secondary", () => {
		appState.secondaryWindow?.close();
	});

	ipcMain.on("quit", () => {
		app.quit();
	});

	ipcMain.on("select-location-main", async () => {
		if (!appState.mainWindow) return;
		const { canceled, filePaths } = await dialog.showOpenDialog(
			appState.mainWindow,
			{ properties: ["openDirectory"] },
		);
		if (!canceled && filePaths.length > 0) {
			appState.mainWindow.webContents.send("downloadPath", filePaths);
		}
	});

	ipcMain.on("select-location-secondary", async (event) => {
		const targetWindow = appState.secondaryWindow || appState.mainWindow || (event && event.sender && BrowserWindow.fromWebContents(event.sender));
		if (!targetWindow || targetWindow.isDestroyed()) return;
		const { canceled, filePaths } = await dialog.showOpenDialog(
			targetWindow,
			{ properties: ["openDirectory"] },
		);
		if (!canceled && filePaths.length > 0 && !targetWindow.isDestroyed()) {
			targetWindow.webContents.send(
				"downloadPath",
				filePaths,
			);
		}
	});

	ipcMain.on("get-directory", async () => {
		if (!appState.mainWindow) return;
		const { canceled, filePaths } = await dialog.showOpenDialog(
			appState.mainWindow,
			{ properties: ["openDirectory"] },
		);
		if (!canceled && filePaths.length > 0) {
			appState.mainWindow.webContents.send("directory-path", filePaths);
		}
	});

	ipcMain.handle("select-ytdlp-file", async () => {
		if (!appState.mainWindow) return null;
		const isWin = process.platform === "win32";
		const { canceled, filePaths } = await dialog.showOpenDialog(
			appState.mainWindow,
			{
				properties: ["openFile"],
				filters: [
					{
						name: isWin ? "Executable (yt-dlp.exe)" : "Executable (yt-dlp)",
						extensions: isWin ? ["exe", "*"] : ["*"],
					},
					{ name: "All Files", extensions: ["*"] },
				],
			},
		);
		if (!canceled && filePaths.length > 0) {
			return filePaths[0];
		}
		return null;
	});

	ipcMain.handle("get-cookies-path", () => {
		return path.join(USER_DATA_PATH, "cookies.txt");
	});

	ipcMain.on("useTray", (_event, enabled) => {
		appState.trayEnabled = enabled;
		if (enabled) createTray();
		else {
			appState.tray?.destroy();
			appState.tray = null;
		}
	});

	ipcMain.on("useGlobalHotkey", (_event, config) => {
		// Unregister whatever was previously registered
		if (appState.registeredHotkeyAccelerator) {
			globalShortcut.unregister(appState.registeredHotkeyAccelerator);
			appState.registeredHotkeyAccelerator = null;
		}
		if (!config || !config.enabled) return;

		const defaultAccel = process.platform === "darwin" ? "Cmd+Shift+D" : "Ctrl+Shift+D";
		const accelerator = config.accelerator || defaultAccel;

		try {
			globalShortcut.register(accelerator, async () => {
				const text = clipboard.readText().trim();
				if (!appState.mainWindow || appState.mainWindow.isDestroyed()) return;

				if (appState.mainWindow.isMinimized()) appState.mainWindow.restore();
				appState.mainWindow.show();
				appState.mainWindow.focus();
				if (app.dock) app.dock.show();

				const wc = appState.mainWindow.webContents;
				if (!appState.indexPageIsOpen) {
					wc.once("did-finish-load", () => {
						appState.indexPageIsOpen = true;
						wc.send("navigate-view", "view-home");
						if (text) wc.send("link", text);
					});
					await appState.mainWindow.loadFile("html/index.html");
				} else {
					wc.send("navigate-view", "view-home");
					if (text) wc.send("link", text);
				}
			});
			appState.registeredHotkeyAccelerator = accelerator;
		} catch (error) {
			console.error("Failed to register global hotkey:", error);
		}
	});

	ipcMain.handle("get-registered-hotkey", () => {
		return appState.registeredHotkeyAccelerator;
	});

	ipcMain.on("progress", (_event, percentage) => {
		if (appState.mainWindow) appState.mainWindow.setProgressBar(percentage);
	});

	ipcMain.on("error_dialog", async (_event, message) => {
		const win = appState.mainWindow && !appState.mainWindow.isDestroyed() ? appState.mainWindow : null;
		const { response } = await dialog.showMessageBox(win, {
			type: "error",
			title: "Error",
			message: message,
			buttons: ["Ok", i18n("clickToCopy")],
		});
		if (response === 1) clipboard.writeText(message);
	});

	ipcMain.handle("show-confirm-dialog", async (event, options = {}) => {
		const win =
			(event && event.sender && BrowserWindow.fromWebContents(event.sender)) ||
			(appState.mainWindow && !appState.mainWindow.isDestroyed()
				? appState.mainWindow
				: null);
		const { response } = await dialog.showMessageBox(win, {
			type: options.type || "question",
			message: options.message || "",
			buttons: options.buttons || [
				options.confirmLabel || "OK",
				options.cancelLabel || "Cancel",
			],
			defaultId: options.defaultId ?? 0,
			cancelId: options.cancelId ?? 1,
			title: options.title || "",
		});
		return response === (options.confirmIndex ?? 0);
	});

	ipcMain.handle("get-system-locale", async (_event) => {
		return app.getSystemLocale();
	});

	ipcMain.handle("get-translation", (_event, locale) => {
		const fallbackFile = path.join(__dirname, "translations", "en.json");
		const localeFile = path.join(
			__dirname,
			"translations",
			`${locale}.json`,
		);

		let fallbackData = {};
		try {
			fallbackData = JSON.parse(readFileSync(fallbackFile, "utf8"));
		} catch (error) {
			console.error("Could not parse default language file", error);
		}

		let localeData = {};
		if (locale && locale !== "en" && existsSync(localeFile)) {
			try {
				localeData = JSON.parse(readFileSync(localeFile, "utf8"));
			} catch (error) {
				console.error(`Could not parse ${localeFile}`, error);
			}
		}

		const mergedTranslations = { ...fallbackData, ...localeData };
		appState.loadedLanguage = mergedTranslations;
		if (appState.trayEnabled) {
			if (appState.tray) {
				appState.tray.destroy();
				appState.tray = null;
			}
			createTray();
		}

		return mergedTranslations;
	});

	ipcMain.handle("get-download-history", () =>
		appState.downloadHistory.getHistory(),
	);
	ipcMain.handle("add-to-history", (_, info) =>
		appState.downloadHistory.addDownload(info),
	);
	ipcMain.handle("get-download-stats", () =>
		appState.downloadHistory.getStats(),
	);
	ipcMain.handle("delete-history-item", (_, id) =>
		appState.downloadHistory.removeHistoryItem(id),
	);
	ipcMain.handle("clear-all-history", async () => {
		await appState.downloadHistory.clearHistory();
		return true;
	});
	ipcMain.handle("export-history-json", () =>
		appState.downloadHistory.exportAsJSON(),
	);
	ipcMain.handle("export-history-csv", () =>
		appState.downloadHistory.exportAsCSV(),
	);

	ipcMain.handle(
		"get-system-proxy",
		async (_event, targetUrl = "https://youtube.com") => {
			try {
				const proxyInfo =
					await session.defaultSession.resolveProxy(targetUrl);

				const rule = String(proxyInfo)
					.split(";")
					.map((s) => s.trim())
					.find((s) => s && s.toUpperCase() !== "DIRECT");

				if (!rule) {
					return null;
				}

				const [type, hostPort] = rule.split(/\s+/, 2);

				if (!type || !hostPort) {
					return null;
				}

				const protocol = {
					PROXY: "http://",
					HTTP: "http://",
					HTTPS: "https://",
					SOCKS: "socks5://",
					SOCKS5: "socks5://",
					SOCKS4: "socks4://",
				}[type.toUpperCase()];

				return protocol ? `${protocol}${hostPort}` : null;
			} catch (error) {
				console.error("Failed to get system proxy:", error);
				return null;
			}
		},
	);

	ipcMain.handle("open-youtube-login", () => openLoginWindowAndWait());
}

// ===== 魔改：应用内 YouTube 登录并导出 cookies（绕开浏览器 DPAPI/App-Bound 加密，yt-dlp#10927）=====
const LOGIN_PARTITION = "persist:ytdlp-login";
// 旧版魔改约定的外部 yt-dlp.conf --cookies 路径，保持同步写入以兼容
const LEGACY_COOKIES_PATH = path.join(homedir(), ".ytDownloader", "cookies.txt");

function openLoginWindowAndWait() {
	return new Promise((resolve) => {
		appState.loginWaiters.push(resolve);

		if (appState.loginWindow) {
			appState.loginWindow.focus();
			return;
		}

		const win = new BrowserWindow({
			width: 1100,
			height: 800,
			parent: appState.mainWindow,
			modal: true,
			show: false,
			autoHideMenuBar: true,
			title: "YouTube Login - close this window after signing in",
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				partition: LOGIN_PARTITION,
			},
		});

		appState.loginWindow = win;

		const loginUrl =
			"https://accounts.google.com/ServiceLogin?continue=" +
			encodeURIComponent("https://www.youtube.com");
		win.loadURL(loginUrl);

		win.webContents.on("did-navigate", async (_event, url) => {
			try {
				const hostname = new URL(url).hostname;
				if (
					hostname !== "www.youtube.com" &&
					hostname !== "youtube.com"
				) {
					return;
				}

				// 等 cookies 写入完成
				await new Promise((resolve) => setTimeout(resolve, 1500));

				if (win.isDestroyed()) return;

				const ses = session.fromPartition(LOGIN_PARTITION);
				const cookies = await ses.cookies.get({
					url: "https://www.youtube.com",
				});
				const hasLogin = cookies.some((c) =>
					/^(SID|__Secure-3PSID|__Secure-3PAPISID|SAPISID|LOGIN_INFO)$/i.test(
						c.name || "",
					),
				);

				if (hasLogin && !win.isDestroyed()) {
					win.close();
				}
			} catch (error) {
				console.error("Auto close login window failed:", error);
			}
		});

		win.once("ready-to-show", () => win.show());

		win.on("closed", async () => {
			appState.loginWindow = null;

			let result;
			try {
				result = await exportLoginCookies();
			} catch (error) {
				result = { success: false, error: error.message };
			}

			const waiters = appState.loginWaiters.splice(0);
			for (const resolveWaiter of waiters) resolveWaiter(result);
		});
	});
}

async function exportLoginCookies() {
	const ses = session.fromPartition(LOGIN_PARTITION);
	const cookies = await ses.cookies.get({});

	const relevant =
		/(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com|googlevideo\.com|ggpht\.com|googleusercontent\.com|google\.com)$/i;
	const selected = cookies.filter((c) =>
		relevant.test((c.domain || "").replace(/^\./, "")),
	);

	const hasLoginCookie = selected.some((c) =>
		/^(SID|__Secure-3PSID|__Secure-3PAPISID|SAPISID|LOGIN_INFO)$/i.test(
			c.name || "",
		),
	);

	if (!hasLoginCookie) {
		return {
			success: false,
			error: "未检测到 YouTube 登录 cookies，请确认已在窗口中登录后再关闭窗口",
		};
	}

	const lines = [
		"# Netscape HTTP Cookie File",
		"# Generated by YTDownloader YouTube Login",
	];

	for (const c of selected) {
		const domain = c.domain || "";
		const includeSubdomains = domain.startsWith(".") ? "TRUE" : "FALSE";
		const cookiePath = c.path || "/";
		const secure = c.secure ? "TRUE" : "FALSE";
		const expires = c.expirationDate ? Math.floor(c.expirationDate) : 0;
		const name = c.name || "";
		const value = c.value || "";
		lines.push(
			[domain, includeSubdomains, cookiePath, secure, expires, name, value].join(
				"\t",
			),
		);
	}

	const cookiesText = lines.join("\n") + "\n";

	// 同步写旧版约定路径（外部 yt-dlp.conf 使用）
	try {
		if (!existsSync(path.dirname(LEGACY_COOKIES_PATH))) {
			mkdirSync(path.dirname(LEGACY_COOKIES_PATH), { recursive: true });
		}
		writeFileSync(LEGACY_COOKIES_PATH, cookiesText, "utf8");
	} catch (error) {
		console.error("Failed to write legacy cookies path:", error);
	}

	return {
		success: true,
		count: selected.length,
		path: LEGACY_COOKIES_PATH,
		cookiesText,
	};
}

function isZipBuild() {
	if (!app.isPackaged || platform() !== "win32") return false;

	const exeDir = path.dirname(app.getPath("exe"));

	const uninstallerPath = path.join(exeDir, "Uninstall YTDownloader.exe");

	return !existsSync(uninstallerPath);
}

function hasAppUpdateConfig() {
	if (!app.isPackaged) return false;
	const updateYmlPath = path.join(process.resourcesPath, "app-update.yml");
	return existsSync(updateYmlPath);
}

function triggerUpdateCheck(isManual = false) {
	// 魔改：自动更新整体关闭（含手动检查入口），防止上游版本覆盖魔改内容
	return;
	appState.isManualUpdateCheck = isManual;
	if (hasAppUpdateConfig()) {
		autoUpdater.checkForUpdates().catch((err) => {
			console.error("Auto-updater check failed:", err);
			if (isManual && appState.mainWindow && !appState.mainWindow.isDestroyed()) {
				appState.mainWindow.webContents.send("update-error", {
					message: err?.message || "Failed to check for updates",
					isManual: true,
				});
			}
		});
	} else if (isManual) {
		// For builds that don't support auto update check (ZIP/portable/dev), open the latest release link directly
		const releaseUrl =
			appState.updateChannel === "beta"
				? "https://github.com/aandrew-me/ytDownloader/releases"
				: "https://github.com/aandrew-me/ytDownloader/releases/latest";
		shell.openExternal(releaseUrl);
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.webContents.send("update-not-available", {
				version: app.getVersion(),
				isManual: true,
			});
		}
	}
}

function registerAutoUpdaterEvents() {
	autoUpdater.on("checking-for-update", () => {
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.webContents.send("checking-for-update", {
				isManual: appState.isManualUpdateCheck,
			});
		}
	});

	autoUpdater.on("update-available", (info) => {
		const isManual = appState.isManualUpdateCheck;
		appState.isManualUpdateCheck = false;
		const payload = {
			version: info.version,
			releaseDate: info.releaseDate,
			releaseNotes: info.releaseNotes || "",
			isPrerelease: Boolean(
				info.prerelease ||
				(info.version && (info.version.includes("-beta") || info.version.includes("-alpha") || info.version.includes("-rc")))
			),
			isZipBuild: isZipBuild(),
			isAppImage: Boolean(process.env.APPIMAGE),
			platform: platform(),
			arch: process.arch,
			isManual: isManual,
		};
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.webContents.send("update-available", payload);
		}
	});

	autoUpdater.on("update-not-available", (info) => {
		const isManual = appState.isManualUpdateCheck;
		appState.isManualUpdateCheck = false;
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.webContents.send("update-not-available", {
				version: app.getVersion(),
				isManual: isManual,
			});
		}
	});

	autoUpdater.on("download-progress", (info) => {
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.webContents.send("download-progress", {
				percent: info.percent || 0,
				bytesPerSecond: info.bytesPerSecond || 0,
				transferred: info.transferred || 0,
				total: info.total || 0,
			});
		}
	});

	autoUpdater.on("update-downloaded", (info) => {
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.webContents.send("update-downloaded", {
				version: info?.version || "",
			});
		}
	});

	autoUpdater.on("error", (error) => {
		const isManual = appState.isManualUpdateCheck;
		appState.isManualUpdateCheck = false;
		console.error("Auto-update error:", error);
		if (appState.mainWindow && !appState.mainWindow.isDestroyed()) {
			appState.mainWindow.webContents.send("update-error", {
				message: error?.message || "Auto-update error",
				isManual: isManual,
			});
		}
	});
}

/**
 * @param {string} phrase The key to translate.
 * @returns {string} The translated string or the key itself.
 */
function i18n(phrase) {
	return appState.loadedLanguage[phrase] || phrase;
}

/**
 * Loads the configuration from the config file.
 */
async function loadConfiguration() {
	try {
		const fileContent = await fs.readFile(CONFIG_FILE_PATH, "utf8");
		appState.config = JSON.parse(fileContent);
	} catch (error) {
		console.log(
			"Could not load config file, using defaults.",
			error.message,
		);
		appState.config = {
			bounds: { width: 900, height: 640 },
			isMaximized: false,
		};
	}
}

function saveConfiguration() {
	try {
		writeFileSync(CONFIG_FILE_PATH, JSON.stringify(appState.config, null, 2));
	} catch (error) {
		console.error("Failed to save configuration:", error);
	}
}

async function loadTranslations() {
	const locale = app.getSystemLocale();
	const defaultLangPath = path.join(__dirname, "translations", "en.json");
	let fallbackData = {};
	try {
		const defaultContent = await fs.readFile(defaultLangPath, "utf8");
		fallbackData = JSON.parse(defaultContent);
	} catch (e) {
		console.error("Failed to load default translations:", e);
	}

	let langPath = path.join(__dirname, "translations", `${locale}.json`);
	let localeData = {};
	if (locale !== "en") {
		try {
			await fs.access(langPath);
			const fileContent = await fs.readFile(langPath, "utf8");
			localeData = JSON.parse(fileContent);
		} catch {
			const baseCode = locale.split("-")[0];
			const altPath = path.join(__dirname, "translations", `${baseCode}.json`);
			try {
				const altContent = await fs.readFile(altPath, "utf8");
				localeData = JSON.parse(altContent);
			} catch (_) { }
		}
	}

	appState.loadedLanguage = { ...fallbackData, ...localeData };
}
