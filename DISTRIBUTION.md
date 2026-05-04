# Central Hub Distribution

This app now has the pieces needed for a single downloadable desktop installer and a mass-update path for installed testers.

## Build A Windows Installer

```bash
npm run dist:win
```

The installer and update metadata are written to `release/`.

If `CENTRALHUB_UPDATE_URL` is not set, the installer is still created, but update metadata is skipped.

For a local unpacked smoke test without creating the installer:

```bash
npm run app:pack
```

## How Updates Work

Packaged builds check for updates shortly after launch. If a newer version is available, the app downloads it in the background and prompts the user to restart. If they choose later, the update installs when the app closes.

Development runs skip update checks.

## GitHub Releases

GitHub is the preferred distribution path while the app is in early testing.

1. Push this repo to GitHub.
2. Create a version tag, for example `v0.1.0`.
3. Push the tag.
4. The release workflow builds the Windows installer and publishes it to GitHub Releases.

Packaged builds created by the GitHub workflow use GitHub Releases as their update feed. Installed copies will check that feed shortly after launch.

```bash
git tag v0.1.0
git push origin main --tags
```

You can also run the `Release` workflow manually from GitHub Actions.

## Generic HTTPS Update Hosting

Pick an HTTPS folder that can serve static files, then build with that folder baked in:

```powershell
$env:CENTRALHUB_UPDATE_URL = "https://your-domain.example/centralhub/updates/"
npm run dist:win
```

Upload the contents of `release/` to that same HTTPS folder, especially:

- `latest.yml`
- the `.exe` installer
- the `.blockmap` file

For each release, increase `version` in `package.json`, rebuild, and replace the hosted files. Installed copies will see the newer version on their next launch.

## Testing Flow

1. Build `0.1.0` with `CENTRALHUB_UPDATE_URL` set and install it on a test machine.
2. Bump `package.json` to `0.1.1`.
3. Build again with the same update URL.
4. Upload the new `release/` files.
5. Launch the installed `0.1.0` app and confirm it offers `0.1.1`.

## Release Notes

Windows installers that are not code-signed may show SmartScreen warnings for friends and online testers. That is normal for unsigned early builds, but code signing is the clean path before wider distribution.
