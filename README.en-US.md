# YTDownloader Modded Edition (by 简单)

[中文](./README.md) | English

A local Windows modded edition based on [aandrew-me/ytDownloader](https://github.com/aandrew-me/ytDownloader) (upstream version **v3.22.0**). This repository collects the application source under `resources/app/` together with the modifications; for the complete list of changes relative to upstream, see [UPSTREAM_CHANGES.en-US.md](UPSTREAM_CHANGES.en-US.md).

## Modifications at a Glance

1. **In-app YouTube login — cookies once and for all**
   The settings page gains a "Log in to YouTube & auto-import Cookies" option: clicking "Log in" pops up a built-in login window (a dedicated session partition); once Google/YouTube login completes, it detects the signed-in state automatically, closes the window, and exports the cookies as a Netscape-format `cookies.txt` (`%USERPROFILE%\.ytDownloader\cookies.txt`) for yt-dlp to use directly.
   - Background fix: the cookies encryption of newer Edge/Chrome (DPAPI/App-Bound) makes yt-dlp `--cookies-from-browser` fail with `Failed to decrypt with DPAPI` (see [yt-dlp#10927](https://github.com/yt-dlp/yt-dlp/issues/10927)); switching to the exported local cookies file sidesteps it.
   - The implementation approach draws on the browser-cookies solution of [Tyrrrz/YoutubeDownloader](https://github.com/Tyrrrz/YoutubeDownloader).
   - Cookies expire — when they do, log in again on the settings page to re-import.
2. **Automatic audio format preference**: when downloading audio/audio tracks, the format is chosen automatically by the priority `opus > m4a > others`, taking the largest file within the same priority tier; the playlist audio dropdown defaults to Opus.
3. **Mod notes page**: the top-right menu of every page gains a "Mod notes" entry (`html/mod_notes.html`).
4. **Window title fixed** to "YTDownloader魔改by简单".
5. **Auto-update disabled**: the upstream electron-updater check is turned off so upstream updates cannot overwrite the modifications.

## Running & Building

This repository is a subset of the Electron app sources under `resources/app` (runtime binaries are not committed):

- Runtime pieces such as `node_modules/`, `ffmpeg/`, and `node.exe` ship with the installer package, or install them manually:
  ```bash
  cd resources/app
  npm install --production   # dependencies: electron-updater / systeminformation / yt-dlp-wrap-plus
  ```
- For a full packaged build, follow the upstream repository root's `package.json` (electron-builder config plus scripts such as `npm run windows`) together with the notes in [UPSTREAM_CHANGES.en-US.md](UPSTREAM_CHANGES.en-US.md); the upstream `linux.sh` / `mac.sh` / `windows.ps1` also work for environment preparation.
- Layout of the already-packaged Windows runtime: the repository root is the install directory (`YTDownloader.exe` and the Electron runtime are excluded via .gitignore and not committed).

## Directory Structure

```
resources/app/
├── main.js            # main process (login window and cookies export)
├── package.json
├── html/              # pages (including the new mod_notes.html mod notes page)
├── src/               # renderer-process scripts
├── assets/            # styles/fonts/images
├── translations/      # languages
└── resources/         # icons
```

## Acknowledgements

- [aandrew-me/ytDownloader](https://github.com/aandrew-me/ytDownloader) — the base this project builds on (GPL-3.0)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — the download engine
- [Tyrrrz/YoutubeDownloader](https://github.com/Tyrrrz/YoutubeDownloader) — reference for the in-app login cookies flow

## License

This project inherits the upstream **GPL-3.0** license (see [LICENSE](LICENSE)); the modifications are likewise released under GPL-3.0.
