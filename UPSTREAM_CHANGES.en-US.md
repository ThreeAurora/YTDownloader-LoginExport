# Change List Relative to Upstream (UPSTREAM_CHANGES)

[中文](./UPSTREAM_CHANGES.md) | English

- **Baseline**: [aandrew-me/ytDownloader](https://github.com/aandrew-me/ytDownloader) **v3.22.0** (tag determination: local `package.json` has version=3.22.0; and all session edits replay cleanly, in original order, onto the upstream source — the replay result matches the disk byte for byte).
- **Time of changes**: 2026-08-19 (per the DSH session log; the Claude session 3a604718 only performed directory reconnaissance, with no edit events).
- **Scope of changes**: source under `resources/app/` only; the Electron runtime and `node_modules/` are untouched.

## 1. In-app YouTube login with cookies export (core modification)

| File | Change | Purpose |
| --- | --- | --- |
| `main.js` | Added the `open-youtube-login` IPC handler, `openLoginWindowAndWait()`, and `exportLoginCookies()`; `appState` gains `loginWindow`/`loginWaiters` | The settings page "Log in" button opens a built-in login window (`persist:ytdlp-login` dedicated partition, Google account login → YouTube); once navigation to the YouTube domain detects login-state cookies such as `SID/__Secure-3PSID/__Secure-3PAPISID/SAPISID/LOGIN_INFO`, the window auto-closes after a 1.5 s delay; on close, YouTube-related cookies from the session are exported as a Netscape-format `cookies.txt` written to `%USERPROFILE%\.ytDownloader\cookies.txt` |
| `html/preferences.html` | ① The upstream "Select browser to use cookies from" selector is hidden wholesale with `display:none`; ② a new prefBox is added: "Log in to YouTube & auto-import Cookies (log in again if expired)" + the `#loginYoutubeBtn` login button + a status line | Sidesteps the `Failed to decrypt with DPAPI` error of `--cookies-from-browser` on newer Edge/Chrome (DPAPI/App-Bound encryption; yt-dlp issue #10927) by doing a one-time in-app login export instead |
| `src/preferences.js` | Added the login button event: `ipcRenderer.invoke("open-youtube-login")`, with success/failure status and a popup notice | Wires up the login entry point |

> Companion setup (outside the repository, under `%USERPROFILE%\.ytDownloader\`, not committed): `cookies.txt` (the login export artifact) is loaded by yt-dlp's local config `yt-dlp.conf` (`--cookies "...cookies.txt"`); a `yt-dlp-ChromeCookieUnlock` plugin had previously been installed for DPAPI unlock experiments. The exported cookies.txt path is hard-coded to that convention.

## 2. Automatic audio format preference

| File | Change | Purpose |
| --- | --- | --- |
| `src/renderer.js` | ① Removed the logic that hid `webm` (opus) audio entries outside "more formats" mode; ② audio options now carry `_ext`/`_size` metadata; ③ added automatic preference: `opus > m4a > others`, largest file wins within the same priority, automatically set as selected | Automatically picks the best audio format at download time (user requirement: audio quality first, zero fuss) |
| `html/playlist.html` | Added `selected` to `Opus` in the audio format dropdown | Opus selected by default |

## 3. Mod branding & maintenance policy

| File | Change | Purpose |
| --- | --- | --- |
| `html/mod_notes.html` | **New**: in-app "Mod notes" page (this round's modifications plus the cookies expiry notice) | Makes the modifications visible inside the app |
| `html/index.html` `search.html` `playlist.html` `playlist_new.html` `compressor.html` | Added a "Mod notes" menu item after About in the top-right menu (`id=modNotesWin`) | Entry point on every page |
| `src/renderer.js` `src/playlist.js` `src/playlist_new.js` `src/compressor.js` | `MOD_NOTES_WIN` constants/mappings/click event wiring → opens `mod_notes.html` | Makes the menu item functional |
| `main.js` | Main/secondary window titles fixed to "YTDownloader魔改by简单", intercepting `page-title-updated` | Mod branding |
| `main.js` | Commented out the `registerAutoUpdaterEvents()` call; the `autoUpdate` IPC handler no longer triggers `autoUpdater.checkForUpdates()` | Auto-update off, so upstream releases cannot overwrite the modifications |

## 4. Non-functional differences (packaging artifacts, not modifications)

| File | Difference | Notes |
| --- | --- | --- |
| `package.json` | Compared with upstream, the `scripts`/`devDependencies`/`build` sections are missing (the three dependencies are identical) | Routine trimming of the runtime directory's `resources/app/package.json` by electron-builder packaging; use the upstream full `package.json` when building from source |

## 5. Session event archive notes

- **DSH session** (`session-915627f2`, 2026-08-19 14:56–17:32): all 30 edit/write events hit `E:\YTDownloader\resources\app\` — exactly the changes above; the event stream is in the repository migration archive `events_dsh.jsonl`.
  - Sole exception target: `E:\DSSpace\.ytdlp-temp\probe_edge_cookies.py` (1 write — a throwaway probe script using rookiepy to read Edge cookies, part of the cookies diagnostics, outside the project directory, not committed).
- **Claude session** (`3a604718`): 4 Bash reconnaissance passes (ls/reads) over the `E:\YTDownloader` and `yt-dlp-wrap-plus` directories, **no Edit/Write events**, no commits produced.
- The first half of the fix chain (installing the `yt-dlp-ChromeCookieUnlock` plugin, exporting/placing `cookies.txt`, writing `yt-dlp.conf`) were all configuration operations under `%USERPROFILE%\.ytDownloader\` (pwsh), touching no repository source.
