# Change List Relative to Upstream (UPSTREAM_CHANGES)

[中文](./UPSTREAM_CHANGES.md) | English

- **Baseline**: [aandrew-me/ytDownloader](https://github.com/aandrew-me/ytDownloader) upstream main **872210d** (synced 2026-09-02; package.json version=4.0.2, i.e. the v4.0.1 tag plus 11 further fixes/features including the concurrent-fragments download option). All 109 upstream commits since v3.22.0 have been followed.
- **Upstream shape**: since v4 this is a single-page app (seven pages merged into `html/index.html`, plus a new `preload.js` contextIsolation bridge and playwright tests). What this repository tracks — `resources/app/` — is the installed-app layout (the Electron runtime sits at the repository root, untracked).
- **Time of changes**: v3.22.0 modifications = 2026-08-19 (DSH session); v4 upgrade & modification re-port = 2026-09-02.

## 1. In-app YouTube login with cookies export (core modification)

| File | Change | Purpose |
| --- | --- | --- |
| `main.js` | Added the `open-youtube-login` IPC handler, `openLoginWindowAndWait()`, and `exportLoginCookies()`; `appState` gains `loginWindow`/`loginWaiters` | The settings page "Log in" button opens a built-in login window (`persist:ytdlp-login` dedicated partition, Google sign-in → YouTube); once navigation to the YouTube domain detects login-state cookies such as `SID/__Secure-3PSID/__Secure-3PAPISID/SAPISID/LOGIN_INFO`, the window auto-closes after a 1.5 s delay |
| `main.js` | The exported Netscape-format text is returned to the renderer with the invoke result; a copy is also written to `%USERPROFILE%\.ytDownloader\cookies.txt` (the path convention from the v3.22.0 mod) | Feeds the native cookies mechanism upstream v4 already has (see below) while keeping the out-of-app `yt-dlp.conf --cookies` usage working |
| `html/index.html` | The cookies section gains a "Log in to YouTube & auto-import Cookies" button + status line; the **Browser source option is removed** | Upstream v4 ships a native "Netscape cookie blocks → userData/cookies.txt" sync mechanism, so the login export plugs straight into it; `--cookies-from-browser` fails with `Failed to decrypt with DPAPI` on newer Edge/Chrome (DPAPI/App-Bound encryption; yt-dlp issue #10927), so the whole path is removed |
| `src/preferences.js` | Login button event: invoke the main-process login → replace the previous login-generated block by marker (manually pasted blocks untouched) → native persistence via `saveAndSyncCookieBlocks`; a legacy `cookieSource=browser` is force-migrated to `file` | The download-argument chains (`renderer.js _getCookieArgs` / `playlist.js`) read cookies.txt natively — no changes needed there |
| Outside repo | `%USERPROFILE%\.ytDownloader\cookies.txt` + `yt-dlp.conf` (`--cookies`) | For calling yt-dlp directly (not committed) |

> Compared with the v3.22.0 mod: the old version could only deliver the export via an external yt-dlp.conf; after the v4 re-port the login result lives inside the app's native cookie-block system — visible and editable in settings, applied automatically to downloads.

## 2. Automatic audio format preference

| File | Change | Purpose |
| --- | --- | --- |
| `src/renderer.js` | ① webm (opus) audio entries are no longer hidden in compact mode; ② with no explicit audio preference, `standaloneAudioPref` defaults to `"opus"` (an explicit choice still wins) | Upstream v4 already scores audio formats (bitrate weight ≈ size priority, language priority kept); the mod only adds "default to opus + never hide opus entries", everything else follows the upstream engine |

## 3. Mod branding & maintenance policy

| File | Change | Purpose |
| --- | --- | --- |
| `html/mod_notes.html` | In-app "Mod notes" page; **v4 adaptation**: the inline script's `require("electron")` → `window.electronAPI` (no `require` under contextIsolation); its dependency `assets/css/extra.css` (deleted upstream in v4) is kept in the repository | Makes the modifications visible inside the app |
| `html/index.html` + `src/common.js` | A "Mod notes" sidebar nav button (no `data-target`, so it stays out of view switching); clicking opens the standalone secondary window via `load-page` | Entry point |
| `main.js` | Main/secondary window titles fixed to "YTDownloader魔改by简单", intercepting `page-title-updated` | Mod branding |
| `main.js` | `triggerUpdateCheck()` returns immediately (auto-update fully off, including the manual check entry) | Auto-update off, so upstream releases cannot overwrite the modifications |

## 4. Runtime add-ons (not modifications)

- `ffmpeg/`, `node.exe`, `node_modules/` (yt-dlp-wrap-plus 2.5.0 etc.) are the installed app's runtime, committed for loss-proofing.
- Upstream's root-level `patch-snap.js` (a snap-build patch satisfying the package.json postinstall hook) is kept in the repository; it no-ops on Windows.

## 5. Session event archive notes

- **DSH session** (`session-915627f2`, 2026-08-19 14:56–17:32): all 30 edit/write events hit `E:\YTDownloader\resources\app\` — exactly the v3.22.0 modifications; the event stream is in the repository migration archive `events_dsh.jsonl`.
  - Sole exception target: `E:\DSSpace\.ytdlp-temp\probe_edge_cookies.py` (1 write — a throwaway probe script using rookiepy to read Edge cookies, outside the project directory, not committed).
- **Claude session** (`3a604718`): 4 Bash reconnaissance passes over `E:\YTDownloader` and `yt-dlp-wrap-plus`, **no Edit/Write events**, no commits produced.
- **v4 upgrade & re-port** (2026-09-02): performed directly by AI against upstream main (overlay sync → modification re-port → dependency sync → launch smoke test); no session edit events correspond to it. The first half of the fix chain (the `yt-dlp-ChromeCookieUnlock` plugin trial, the `yt-dlp.conf` setup) were configuration operations under `%USERPROFILE%\.ytDownloader\`, touching no repository source.
