# 相对上游的改动清单（UPSTREAM_CHANGES）

- **基线**：[aandrew-me/ytDownloader](https://github.com/aandrew-me/ytDownloader) **v3.22.0**（tag 判定：本地 `package.json` version=3.22.0；且全部会话编辑可按原序干净回放到上游源码内容，回放结果与磁盘逐字节一致）。
- **改动时间**：2026-08-19（DSH 会话记录；Claude 会话 3a604718 仅做过目录勘察，无编辑事件）。
- **改动范围**：仅 `resources/app/` 下源码；Electron 运行时与 `node_modules/` 无改动。

## 一、应用内 YouTube 登录导出 cookies（核心魔改）

| 文件 | 改动 | 目的 |
| --- | --- | --- |
| `main.js` | 新增 `open-youtube-login` IPC handler、`openLoginWindowAndWait()`、`exportLoginCookies()`；`appState` 增加 `loginWindow`/`loginWaiters` | 设置页"登录"按钮打开内置登录窗口（`persist:ytdlp-login` 独立分区，Google 账号登录 → YouTube）；导航到 YouTube 域检测到 `SID/__Secure-3PSID/__Secure-3PAPISID/SAPISID/LOGIN_INFO` 等登录态 cookies 后延迟 1.5s 自动关窗；关窗时将会话内 YouTube 相关 cookies 导出为 Netscape 格式 `cookies.txt` 写入 `%USERPROFILE%\.ytDownloader\cookies.txt` |
| `html/preferences.html` | ①上游「Select browser to use cookies from」选择器整块 `display:none`；②新增 prefBox：「登录 YouTube 自动导入 Cookies（若过期请重新登录）」+ `#loginYoutubeBtn` 登录按钮 + 状态行 | 绕开 `--cookies-from-browser` 在新版 Edge/Chrome（DPAPI/App-Bound 加密）下的 `Failed to decrypt with DPAPI` 报错（yt-dlp issue #10927），改为应用内登录一次性导出 |
| `src/preferences.js` | 新增登录按钮事件：`ipcRenderer.invoke("open-youtube-login")`，成功/失败状态与弹窗提示 | 接线登录入口 |

> 配套（仓库外，位于 `%USERPROFILE%\.ytDownloader\`，不入库）：`cookies.txt`（登录导出产物）由 yt-dlp 的本地配置 `yt-dlp.conf`（`--cookies "...cookies.txt"`）加载；此前另装过 `yt-dlp-ChromeCookieUnlock` 插件做 DPAPI 解锁试验。登录导出的 cookies.txt 路径即按此约定写死。

## 二、音频格式自动优选

| 文件 | 改动 | 目的 |
| --- | --- | --- |
| `src/renderer.js` | ①去掉非"更多格式"模式下隐藏 `webm`(opus) 音频条目的逻辑；②音频选项附带 `_ext`/`_size` 元数据；③新增自动优选：`opus > m4a > 其他`，同优先级取体积最大，自动置为选中 | 下载时音频自动选最优格式（用户需求：音质优先且省心） |
| `html/playlist.html` | 音频格式下拉 `Opus` 增加 `selected` | 默认选中 Opus |

## 三、魔改标识与维护策略

| 文件 | 改动 | 目的 |
| --- | --- | --- |
| `html/mod_notes.html` | **新增**：应用内「魔改说明」页（本次魔改内容与 cookies 时效提示） | 让魔改内容在软件内可见 |
| `html/index.html` `search.html` `playlist.html` `playlist_new.html` `compressor.html` | 右上菜单 About 后新增「魔改说明」菜单项（`id=modNotesWin`） | 全页面入口 |
| `src/renderer.js` `src/playlist.js` `src/playlist_new.js` `src/compressor.js` | `MOD_NOTES_WIN` 常量/映射/点击事件接线 → 打开 `mod_notes.html` | 菜单项可用 |
| `main.js` | 主/副窗口标题固定为「YTDownloader魔改by简单」，拦截 `page-title-updated` | 魔改标识 |
| `main.js` | 注释 `registerAutoUpdaterEvents()` 调用；`autoUpdate` IPC handler 不再触发 `autoUpdater.checkForUpdates()` | 关闭自动更新，防止上游版本覆盖魔改 |

## 四、非功能差异（打包痕迹，非魔改）

| 文件 | 差异 | 说明 |
| --- | --- | --- |
| `package.json` | 相比上游缺少 `scripts`/`devDependencies`/`build` 段（依赖三者一致） | electron-builder 打包时对运行目录 `resources/app/package.json` 的例行裁剪；从源码构建请使用上游完整 `package.json` |

## 五、会话事件归档说明

- **DSH 会话**（`session-915627f2`，2026-08-19 14:56–17:32）：30 次编辑/写入全部命中 `E:\YTDownloader\resources\app\`，即上述改动；事件流水见仓库迁移档案 `events_dsh.jsonl`。
  - 唯一例外目标：`E:\DSSpace\.ytdlp-temp\probe_edge_cookies.py`（1 次写入，rookiepy 探测 Edge cookies 的临时探针脚本，属 cookies 诊断过程，位于项目目录外，不入库）。
- **Claude 会话**（`3a604718`）：对 `E:\YTDownloader`、`yt-dlp-wrap-plus` 目录的 4 次 Bash 勘察（ls/读取），**无 Edit/Write 事件**，不产生提交。
- 修复链前半段（安装 `yt-dlp-ChromeCookieUnlock` 插件、导出/挪放 `cookies.txt`、写 `yt-dlp.conf`）均为 `%USERPROFILE%\.ytDownloader\` 下的配置操作（pwsh），不涉及仓库源码。
