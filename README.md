# LoL Settings Changer

Windows desktop utility for saving and applying League of Legends `PersistedSettings.json` profiles.

The app is designed for players who use multiple accounts or shared settings presets and want a safer way to switch settings without manually copying files.

## Features

- Select and validate a League of Legends `PersistedSettings.json` file.
- Save current settings as account-specific or shared profiles.
- Apply saved profiles through a safe write path.
- Create backups before writes and restore previous backups.
- View a local Activity log for save, apply, and restore operations.
- Recover corrupted local app data files without overwriting the corrupted copy.

## Safety

This app treats settings files as user data:

- JSON is validated before writes.
- A backup is created before apply/restore writes.
- Failed writes keep a recovery path.
- Activity entries use friendly messages and do not store raw settings JSON.
- No Riot login, cloud sync, telemetry, or credential storage is included.

## Development

Prerequisites:

- Node.js 20+
- Rust/Cargo via Rustup
- Visual Studio Build Tools with the C++ workload on Windows

Install dependencies:

```bash
npm ci
```

Run tests:

```bash
npm test
```

Build the web frontend:

```bash
npm run build
```

Build Windows desktop packages:

```bash
npm run tauri:build
```

Release artifacts are created under `src-tauri/target/release/bundle/`.

## Releases

CI runs on pushes and pull requests to `main`.

Pushing a tag like `v0.1.0` triggers the release workflow, builds the Windows installer, and publishes it to a GitHub Release.

## License

MIT
