# YTDownloader 魔改版（by 简单）

基于 [aandrew-me/ytDownloader](https://github.com/aandrew-me/ytDownloader)（上游版本 **v3.22.0**）的 Windows 本地魔改版。本仓库收录 `resources/app/` 下的应用源码与魔改内容，相对上游的全部改动见 [UPSTREAM_CHANGES.md](UPSTREAM_CHANGES.md)。

## 魔改内容一览

1. **应用内 YouTube 登录，cookies 一劳永逸**
   设置页新增「登录 YouTube 自动导入 Cookies」：点击"登录"弹出内置登录窗口（独立 session 分区），完成 Google/YouTube 登录后自动检测登录态并关闭窗口，将 cookies 导出为 Netscape 格式的 `cookies.txt`（`%USERPROFILE%\.ytDownloader\cookies.txt`），供 yt-dlp 直接使用。
   - 背景修复：新版 Edge/Chrome 的 cookies 加密（DPAPI/App-Bound）导致 yt-dlp `--cookies-from-browser` 报 `Failed to decrypt with DPAPI`（参见 [yt-dlp#10927](https://github.com/yt-dlp/yt-dlp/issues/10927)），改用导出的本地 cookies 文件规避。
   - 实现思路参考 [Tyrrrz/YoutubeDownloader](https://github.com/Tyrrrz/YoutubeDownloader) 的浏览器 cookies 方案。
   - Cookies 有时效，过期后请在设置页重新登录导入。
2. **音频格式自动优选**：下载音频/音轨时自动按 `opus > m4a > 其他` 优先级选择，同优先级取体积最大者；播放列表音频下拉默认选中 Opus。
3. **魔改说明页**：各页面右上角菜单新增「魔改说明」（`html/mod_notes.html`）。
4. **窗口标题固定** 为「YTDownloader魔改by简单」。
5. **关闭自动更新**：停用上游 electron-updater 检查，避免上游更新覆盖魔改内容。

## 运行与构建

本仓库为 Electron 应用 `resources/app` 的源码子集（运行时二进制不入库）：

- `node_modules/`、`ffmpeg/`、`node.exe` 等运行时由安装包自带，或手动安装：
  ```bash
  cd resources/app
  npm install --production   # 依赖：electron-updater / systeminformation / yt-dlp-wrap-plus
  ```
- 完整打包构建请参照上游仓库根目录的 `package.json`（含 electron-builder 配置与 `npm run windows` 等脚本）与本仓库 `UPSTREAM_CHANGES.md` 的说明；上游 `linux.sh` / `mac.sh` / `windows.ps1` 亦可用于环境准备。
- 已打包的 Windows 运行环境结构：仓库根即安装目录（`YTDownloader.exe` 及 Electron 运行时按 .gitignore 排除，不入库）。

## 目录结构

```
resources/app/
├── main.js            # 主进程（含登录窗口与 cookies 导出）
├── package.json
├── html/              # 各页面（含新增 mod_notes.html 魔改说明）
├── src/               # 渲染进程脚本
├── assets/            # 样式/字体/图片
├── translations/      # 多语言
└── resources/         # 图标
```

## 致谢

- [aandrew-me/ytDownloader](https://github.com/aandrew-me/ytDownloader) —— 本项目基座（GPL-3.0）
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) —— 下载内核
- [Tyrrrz/YoutubeDownloader](https://github.com/Tyrrrz/YoutubeDownloader) —— 应用内登录获取 cookies 的实现参考

## License

本项目沿用上游的 **GPL-3.0** 协议（见 [LICENSE](LICENSE)），魔改部分同样以 GPL-3.0 发布。
