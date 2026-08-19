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
} = require("electron");
const {autoUpdater} = require("electron-updater");
const fs = require("fs").promises;
const {existsSync, readFileSync} = require("fs");
const path = require("path");
const DownloadHistory = require("./src/history");

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
autoUpdater.autoDownload = false;

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
};

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	app.quit();
} else {
	app.on("second-instance", () => {
		if (appState.mainWindow) {
			if (appState.mainWindow.isMinimized())
				appState.mainWindow.restore();
			appState.mainWindow.show();
			appState.mainWindow.focus();
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

app.on("before-quit", async () => {
	appState.isQuitting = true;
	try {
		// Save the final config state before exiting.
		await saveConfiguration();
	} catch (error) {
		console.error("Failed to save configuration during quit:", error);
	}
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
	await loadConfiguration();
	await loadTranslations();

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
		minWidth: 800,
		minHeight: 600,
		autoHideMenuBar: true,
		show: false,
		icon: path.join(__dirname, "/assets/images/icon.png"),
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			spellcheck: false,
		},
	});

	appState.mainWindow.loadFile("html/index.html");

	appState.mainWindow.once("ready-to-show", () => {
		if (appState.config.isMaximized) {
			appState.mainWindow.maximize();
		}
		appState.mainWindow.show();
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
			nodeIntegration: true,
			contextIsolation: false,
		},
		width: 1000,
		height: 800,
	});

	// appState.secondaryWindow.webContents.openDevTools();
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
						wc.send("link", text);
					});

					await appState.mainWindow.loadFile("html/index.html");
				} else {
					wc.send("link", text);
				}
			},
		},
		{
			label: i18n("downloadPlaylistButton"),
			click: () => {
				appState.indexPageIsOpen = false;
				appState.mainWindow?.loadFile("html/playlist.html");
				appState.mainWindow?.show();
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
		appState.mainWindow?.show();

		if (app.dock) app.dock.show();
	});
}

function registerIpcHandlers() {
	ipcMain.on("autoUpdate", (_event, status) => {
		appState.autoUpdateEnabled = status;

		if (status) {
			autoUpdater.checkForUpdates();
		}
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
		} catch (error) {}
	});

	ipcMain.handle("show-file", async (_event, fullPath) => {
		try {
			await fs.stat(fullPath);
			shell.showItemInFolder(fullPath);

			return {success: true};
		} catch (error) {
			return {success: false, error: error.message};
		}
	});

	ipcMain.handle("open-folder", async (_event, folderPath) => {
		try {
			await fs.stat(folderPath);
			const result = await shell.openPath(folderPath);
			if (result) {
				return {success: false, error: result};
			} else {
				return {success: true};
			}
		} catch (error) {
			return {success: false, error: error.message};
		}
	});

	ipcMain.on("load-win", (_event, file) => {
		appState.indexPageIsOpen = file.includes("index.html");
		appState.mainWindow?.loadFile(file);
	});

	ipcMain.on("load-page", (_event, file) => {
		createSecondaryWindow(file);
	});

	ipcMain.on("close-secondary", () => {
		appState.secondaryWindow?.close();
	});

	ipcMain.on("quit", () => {
		app.quit();
	});

	ipcMain.on("select-location-main", async () => {
		if (!appState.mainWindow) return;
		const {canceled, filePaths} = await dialog.showOpenDialog(
			appState.mainWindow,
			{properties: ["openDirectory"]},
		);
		if (!canceled && filePaths.length > 0) {
			appState.mainWindow.webContents.send("downloadPath", filePaths);
		}
	});

	ipcMain.on("select-location-secondary", async () => {
		if (!appState.secondaryWindow) return;
		const {canceled, filePaths} = await dialog.showOpenDialog(
			appState.secondaryWindow,
			{properties: ["openDirectory"]},
		);
		if (!canceled && filePaths.length > 0) {
			appState.secondaryWindow.webContents.send(
				"downloadPath",
				filePaths,
			);
		}
	});

	ipcMain.on("get-directory", async () => {
		if (!appState.mainWindow) return;
		const {canceled, filePaths} = await dialog.showOpenDialog(
			appState.mainWindow,
			{properties: ["openDirectory"]},
		);
		if (!canceled && filePaths.length > 0) {
			appState.mainWindow.webContents.send("directory-path", filePaths);
		}
	});

	ipcMain.on("select-config", async () => {
		if (!appState.secondaryWindow) return;
		const {canceled, filePaths} = await dialog.showOpenDialog(
			appState.secondaryWindow,
			{properties: ["openFile"]},
		);
		if (!canceled && filePaths.length > 0) {
			appState.secondaryWindow.webContents.send("configPath", filePaths);
		}
	});

	ipcMain.on("useTray", (_event, enabled) => {
		appState.trayEnabled = enabled;
		if (enabled) createTray();
		else {
			appState.tray?.destroy();
			appState.tray = null;
		}
	});

	ipcMain.on("progress", (_event, percentage) => {
		if (appState.mainWindow) appState.mainWindow.setProgressBar(percentage);
	});

	ipcMain.on("error_dialog", async (_event, message) => {
		const {response} = await dialog.showMessageBox(appState.mainWindow, {
			type: "error",
			title: "Error",
			message: message,
			buttons: ["Ok", i18n("clickToCopy")],
		});
		if (response === 1) clipboard.writeText(message);
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

		const fallbackData = JSON.parse(readFileSync(fallbackFile, "utf8"));

		let localeData = {};
		if (locale !== "en" && existsSync(localeFile)) {
			try {
				localeData = JSON.parse(readFileSync(localeFile, "utf8"));
			} catch (e) {
				console.error(`Could not parse ${localeFile}`, e);
			}
		}

		const mergedTranslations = {...fallbackData, ...localeData};

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

const YTDLP_COOKIES_PATH = "C:\\Users\\Administrator\\.ytDownloader\\cookies.txt";
const LOGIN_PARTITION = "persist:ytdlp-login";

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
				result = {success: false, error: error.message};
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
		const path = c.path || "/";
		const secure = c.secure ? "TRUE" : "FALSE";
		const expires = c.expirationDate ? Math.floor(c.expirationDate) : 0;
		const name = c.name || "";
		const value = c.value || "";
		lines.push(
			[domain, includeSubdomains, path, secure, expires, name, value].join(
				"\t",
			),
		);
	}

	await fs.writeFile(YTDLP_COOKIES_PATH, lines.join("\n") + "\n", "utf8");
	return {
		success: true,
		count: selected.length,
		path: YTDLP_COOKIES_PATH,
	};
}

function registerAutoUpdaterEvents() {
	autoUpdater.on("update-available", async (info) => {
		const dialogOpts = {
			type: "info",
			buttons: [i18n("update"), i18n("no")],
			title: "Update Available",
			message: i18n("updateAvailablePrompt"),
			detail:
				info.releaseNotes?.toString().replace(/<[^>]*>?/gm, "") ||
				"No details available.",
		};
		const {response} = await dialog.showMessageBox(
			appState.mainWindow,
			dialogOpts,
		);
		if (response === 0) {
			autoUpdater.downloadUpdate();
		}
	});

	autoUpdater.on("update-downloaded", async () => {
		appState.mainWindow.webContents.send("update-downloaded", "");
		const dialogOpts = {
			type: "info",
			buttons: [i18n("restart"), i18n("later")],
			title: "Update Ready",
			message: i18n("installAndRestartPrompt"),
		};
		const {response} = await dialog.showMessageBox(
			appState.mainWindow,
			dialogOpts,
		);
		if (response === 0) {
			autoUpdater.quitAndInstall(true, true);
		} else {
			// TODO: Consider if its worth enabling
			// autoUpdater.autoInstallOnAppQuit = true;
		}
	});

	autoUpdater.on("download-progress", async (info) => {
		appState.mainWindow.webContents.send("download-progress", info.percent);
	});

	autoUpdater.on("error", (error) => {
		console.error("Auto-update error:", error);
		// dialog.showErrorBox("Update Error", i18n("updateError"));
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
			bounds: {width: 1024, height: 768},
			isMaximized: false,
		};
	}
}

async function saveConfiguration() {
	try {
		await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(appState.config));
	} catch (error) {
		console.error("Failed to save configuration:", error);
	}
}

async function loadTranslations() {
	const locale = app.getSystemLocale();
	console.log({locale});
	const defaultLangPath = path.join(__dirname, "translations", "en.json");
	let langPath = path.join(__dirname, "translations", `${locale}.json`);

	try {
		await fs.access(langPath);
	} catch {
		langPath = defaultLangPath;
	}

	try {
		const fileContent = await fs.readFile(langPath, "utf8");
		appState.loadedLanguage = JSON.parse(fileContent);
	} catch (error) {
		console.error("Failed to load translation file:", error);
		appState.loadedLanguage = {};
	}
}
