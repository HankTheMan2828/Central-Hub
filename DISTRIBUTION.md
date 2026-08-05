# Central Hub Distribution

How we ship installers and how installed copies get updates. Use this whenever you cut a release while still building hard.

## Two tracks: test vs main

| Track | What it is | Who uses it | How it updates |
|-------|------------|-------------|----------------|
| **Test / local** | `npm run app:dev` on `main` (or a feature branch) | You while building | Manual — pull code, restart dev |
| **Main (released)** | GitHub Release + `CentralHub-Setup.exe` | Installed testers / “production” copy | `electron-updater` checks GitHub Releases shortly after launch |

Anything sitting only in your local/dev app does **not** reach installed users until you cut a new release from `main` with a higher `package.json` version.

That is the gap you hit: Reg Web and other post-`v0.2.0` work lived on `main` / test, but installed apps stayed on the last published tag until a new tag shipped.

## Ship checklist (repeat every release)

1. Land the work on `main` (merge PRs / commit).
2. Bump `version` in `package.json` (semver):
   - **patch** `0.2.x` — renames, fixes, small features already on main
   - **minor** `0.x.0` — larger surfaces (e.g. vault-backed Notes)
3. Commit: `Release 0.x.y — short summary`
4. Tag and push:
   ```powershell
   git tag v0.x.y
   git push origin main
   git push origin v0.x.y
   ```
5. GitHub Actions workflow **Release** (`.github/workflows/release.yml`) runs on `v*` tags:
   - `npm ci` → `npm run dist:win`
   - Uploads to the GitHub Release:
     - `CentralHub-Setup.exe`
     - `CentralHub-Setup.exe.blockmap`
     - `latest.yml`  ← **required for auto-update**
6. Confirm the release page has those three assets and the notes look right.
7. Launch an installed older build; within ~5s it should download and offer restart.

Manual re-run: Actions → **Release** → Run workflow (uses the tag you select / ref).

## How auto-update works

- Packaged builds only (`app.isPackaged`). Dev skips checks.
- `main/updater.js` + `electron-updater`: check ~5s after launch, download in background, prompt **Restart now / Later**, install on quit if Later.
- Feed: GitHub Releases for this repo (`HankTheMan2828/Central-Hub`) when `GITHUB_REPOSITORY` is set at build time (Actions does this).
- Optional alternate feed: set `CENTRALHUB_UPDATE_URL` to a static HTTPS folder and host `latest.yml` + installer + blockmap there (`npm run dist:win` with that env).

## Local installer without publishing

```powershell
npm run dist:win
# artifacts in release/
```

Unpacked smoke test (no NSIS):

```powershell
npm run app:pack
```

## Version discipline

- **Never retag** an already-published `vX.Y.Z` if people already installed it. Bump and ship `vX.Y.Z+1`.
- Tag name must match intent of `package.json` version (`v0.2.1` ↔ `"version": "0.2.1"`).
- Installed apps only move forward when `latest.yml` on the feed points at a higher version.

## SmartScreen

Unsigned Windows installers trigger SmartScreen for new downloads. “More info → Run anyway” is expected until code signing. Auto-updates after first install still work.

## Ongoing build rhythm

While building a lot:

1. Develop on branches / `app:dev` (test track).
2. Merge to `main` when a chunk is ready.
3. Cut a release whenever you want installed users (including yourself on the “main” install) to catch up — even mid-feature if the build is usable.
4. Prefer small frequent releases over one giant catch-up.
