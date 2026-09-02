# 相对上游的改动清单（UPSTREAM_CHANGES）

[English](./UPSTREAM_CHANGES.en-US.md) | 中文

- **基线**：[aandrew-me/ytDownloader](https://github.com/aandrew-me/ytDownloader) 上游 main **872210d**（2026-09-02 同步；package.json version=4.0.2，即 v4.0.1 tag 之后再跟 11 个修复/功能提交，含并发分片下载选项）。v3.22.0→v4 共 109 条上游提交已全量跟进。
- **上游形态**：v4 起为单页应用（七个页面并入 `html/index.html`，新增 `preload.js` contextIsolation 桥接 + playwright 测试）。本仓库跟踪的 `resources/app/` 即安装目录形态（Electron 运行时在仓库根，不入库）。
- **改动时间**：v3.22.0 魔改=2026-08-19（DSH 会话）；v4 升级与魔改重移植=2026-09-02。

## 一、应用内 YouTube 登录导出 cookies（核心魔改）

| 文件 | 改动 | 目的 |
| --- | --- | --- |
| `main.js` | 新增 `open-youtube-login` IPC handler、`openLoginWindowAndWait()`、`exportLoginCookies()`；`appState` 增加 `loginWindow`/`loginWaiters` | 设置页「登录」按钮打开内置登录窗口（`persist:ytdlp-login` 独立分区，Google 登录 → YouTube），检测到 `SID/__Secure-3PSID/__Secure-3PAPISID/SAPISID/LOGIN_INFO` 等登录态后延迟 1.5s 自动关窗 |
| `main.js` | 导出 Netscape 格式文本随 invoke 结果返回渲染层；同步写 `%USERPROFILE%\.ytDownloader\cookies.txt`（旧版魔改约定路径） | 与上游 v4 原生 cookies 机制对接（见下），并兼容应用外的 `yt-dlp.conf --cookies` 用法 |
| `html/index.html` | cookies 区新增「登录 YouTube 自动导入 Cookies」按钮 + 状态行；**移除 Browser 来源选项** | 上游 v4 已内置「Netscape cookie 块 → userData/cookies.txt」同步机制，登录导出直接喂进该机制；`--cookies-from-browser` 在新版 Edge/Chrome（DPAPI/App-Bound 加密）下报 `Failed to decrypt with DPAPI`（yt-dlp issue #10927），整条路径移除 |
| `src/preferences.js` | 登录按钮事件：invoke 主进程登录 → 按生成标记替换旧登录块（手动粘贴的块不动）→ `saveAndSyncCookieBlocks` 原生落盘；历史 `cookieSource=browser` 强制回退 `file` | 下载参数链路（`renderer.js _getCookieArgs` / `playlist.js`）原生读取 cookies.txt，无需改动 |
| 仓库外 | `%USERPROFILE%\.ytDownloader\cookies.txt` + `yt-dlp.conf`（`--cookies`） | 兼容直接调用 yt-dlp 的场景（不入库） |

> 相比 v3.22.0 版魔改的进化：旧版只能靠外部 yt-dlp.conf 加载导出文件；v4 重移植后登录结果直接进入应用原生 cookie 块体系，设置页可见、可编辑、随下载参数自动生效。

## 二、音频格式优选

| 文件 | 改动 | 目的 |
| --- | --- | --- |
| `src/renderer.js` | ①不再在紧凑模式下隐藏 webm(opus) 音频条目；②无显式音频偏好时默认 `standaloneAudioPref="opus"`（显式选择仍优先） | 上游 v4 已改用评分制选优（bitrate 权重≈体积优先、语言优先级保留），魔改只补「默认 opus + opus 条目不隐藏」两点，其余沿用上游引擎 |

## 三、魔改标识与维护策略

| 文件 | 改动 | 目的 |
| --- | --- | --- |
| `html/mod_notes.html` | 应用内「魔改说明」页；**v4 适配**：内联脚本 `require("electron")` → `window.electronAPI`（contextIsolation 下无 require）；其依赖的 `assets/css/extra.css`（上游 v4 已删）随仓保留 | 魔改内容在软件内可见 |
| `html/index.html` + `src/common.js` | 侧栏新增「魔改说明」导航按钮（无 `data-target`，不参与视图切换），点击经 `load-page` 打开独立副窗 | 入口 |
| `main.js` | 主/副窗口标题固定「YTDownloader魔改by简单」，拦截 `page-title-updated` | 魔改标识 |
| `main.js` | `triggerUpdateCheck()` 开头直接 return（自动更新整体关闭，含手动检查入口） | 防止上游版本覆盖魔改 |

## 四、运行时附带（非魔改）

- `ffmpeg/`、`node.exe`、`node_modules/`（yt-dlp-wrap-plus 2.5.0 等）为安装目录运行时本体，随防丢仓入库。
- 上游仓库根的 `patch-snap.js`（snap 构建补丁，满足 package.json 的 postinstall 钩子）随仓保留，Windows 上空跑。

## 五、会话事件归档说明

- **DSH 会话**（`session-915627f2`，2026-08-19 14:56–17:32）：30 次编辑/写入全部命中 `E:\YTDownloader\resources\app\`，即 v3.22.0 版魔改；事件流水见仓库迁移档案 `events_dsh.jsonl`。
  - 唯一例外目标：`E:\DSSpace\.ytdlp-temp\probe_edge_cookies.py`（1 次写入，rookiepy 探测 Edge cookies 的临时探针脚本，位于项目目录外，不入库）。
- **Claude 会话**（`3a604718`）：对 `E:\YTDownloader`、`yt-dlp-wrap-plus` 目录的 4 次 Bash 勘察，**无 Edit/Write 事件**，不产生提交。
- **v4 升级与重移植**（2026-09-02）：由 AI 直接对照上游 main 执行（覆盖同步 → 魔改重移植 → 依赖同步 → 启动冒烟），无对应会话编辑事件；修复链前半段（`yt-dlp-ChromeCookieUnlock` 插件试验、`yt-dlp.conf` 配置）均为 `%USERPROFILE%\.ytDownloader\` 下的配置操作，不涉及仓库源码。
