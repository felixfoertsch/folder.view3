# Folder View 3 for Unraid 7

Group Docker containers and VMs into folders on Unraid's Docker, VM, and Dashboard pages. Folder View 3 forks [VladoPortos/folder.view2](https://github.com/VladoPortos/folder.view2), originally created by [scolcipitato](https://github.com/scolcipitato/folder.view).

## Install

In **Plugins → Install Plugin**, paste:

```text
https://github.com/felixfoertsch/folder.view3/releases/latest/download/folder.view3.plg
```

Alternatively, download `folder.view3.plg` from [Releases](https://github.com/felixfoertsch/folder.view3/releases/latest), copy it to `/boot/config/plugins/`, and select it in **Install Plugin**. Each release also includes the matching `.txz` package; the `.plg` downloads and verifies that package automatically.

Release links become available after the first successful release workflow. The checked-in `.plg` is a build template, not an installable release.

## Migrate from Folder View 2

Folder View 3 uses its own plugin and configuration paths. **Do not keep both plugins installed: both modify the same Unraid pages.**

1. In Folder View 2's settings, use **Export all** separately for Docker and VMs. Keep both JSON files outside the server.
2. Before uninstalling, copy `/boot/config/plugins/folder.view2/` to a safe backup location. This also preserves custom scripts and styles. If settings cannot open, back up `docker.json` and `vm.json` directly; they use the same format as Export all.
3. Uninstall Folder View 2 through **Plugins**, then install Folder View 3 using the URL above.
4. Open Folder View 3's settings. Import the Docker JSON under **Docker** and VM JSON under **VMs**. Import into a fresh configuration; existing matching folder IDs are overwritten.
5. If used, copy backed-up `scripts/` and `styles/` into `/boot/config/plugins/folder.view3/`. Update custom code referencing `/plugins/folder.view2/` or `/boot/config/plugins/folder.view2/` to the corresponding `folder.view3` paths.
6. Hard-refresh the Docker, VM, and Dashboard pages. Verify folder membership, ordering, and custom actions before discarding backups.

Folder IDs and JSON structure stay unchanged, preserving existing order entries. Existing `folder.view2` Docker labels still work; use `folder.view3` for new labels. When both labels exist, `folder.view3` takes precedence. No containers or VMs need recreation.

To roll back, export any changed Folder View 3 settings, uninstall it, reinstall Folder View 2, and restore the original backup. Folder View 3 does not automatically delete or migrate Folder View 2 data.

## Fork contributions

- Correct Docker statistics handling for Unraid's `NchanSubscriber`, which passes a message string rather than a browser event object.
- Ignore empty and incomplete statistics rows, including the trailing newline produced by `docker stats`.
- Add a runnable regression check for statistics parsing and folder totals.
- Separate Folder View 3's plugin paths while retaining Folder View 2 configuration and Docker-label compatibility.
- Build and publish installable plugin manifests and packages automatically.
- Compact two-column editor with settings left and order/assignment right; stack on narrow screens.
- Correct dashboard restart, VM custom actions, and newly added folder refreshes.
- Validate configuration inputs, protect concurrent saves, and escape folder HTML.
- Bound and cache Tailscale lookups; fix JSON export downloads.

## Build and test

Install the pinned toolchain with `mise install`. Run:

```fish
mise exec -- node tests/docker-load.cjs
mise exec -- node tests/folder-editor.cjs
mise exec -- node tests/folder-actions.cjs
mise exec -- bash scripts/build.sh 2026.10.09.1
```

Build output lives in `dist/<version>/`. The build computes the package MD5 and writes a matching `.plg` without changing source files. Versions use `YYYY.MM.DD` with a numeric suffix.

GitHub Actions checks and builds pull requests. Pushes to `main` and manual workflow runs on `main` also publish a release, using the UTC date and workflow run number. Unraid's plugin update URL follows the latest published release.

## Attribution and contributions

- **scolcipitato** — original Folder View plugin.
- **VladoPortos** — Folder View 2 maintenance and Unraid 7 support.
- **TurboStreetCar** — improved `folder.js` compatibility for Unraid 7 and earlier versions.
- **felixfoertsch** — Folder View 3 maintenance, statistics regression fix, migration path, and release automation.
- Upstream contributors — translations, layout fixes, and features retained in this fork; see Git history and the plugin changelog.

Report fork issues and submit contributions at [felixfoertsch/folder.view3](https://github.com/felixfoertsch/folder.view3/issues). Include Unraid version, plugin version, reproduction steps, and relevant errors. Remove secrets and private container configuration before sharing diagnostics.

Bundled libraries: Chart.js, chartjs-adapter-moment, Moment.js, chartjs-plugin-streaming, jquery.i18n, and jQuery UI MultiSelect. Their existing notices remain in the source tree.
