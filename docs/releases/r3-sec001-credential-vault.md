# R3 — SEC-001 credential-vault groundwork

**Status: development implementation. SEC-001 remains P0 open and production release remains blocked.**

## What changed

- `ServerConfig` now persists an opaque `credentialRef`; username and password are runtime-only fields.
- `ConfigStorage` performs a one-way migration: legacy credentials are written to the native vault before AsyncStorage is rewritten without `username` or `password`.
- iOS App Group server records contain `credentialRef` only. Share and Keyboard targets retrieve their credential from a shared Keychain Access Group.
- Android stores AES-GCM ciphertext in private preferences; the AES key is generated and retained by Android Keystore.
- Android Auto Backup is disabled pending a reviewed encrypted recovery design, so a device-bound Keystore credential record is not copied into backups.
- The SMS headless task now uses `ConfigStorage`, rather than reading the raw AsyncStorage config and bypassing vault rehydration.

## Required release evidence before closing SEC-001

1. Signed iOS device test proving the configured Keychain Access Group works for the app, Share extension, and Keyboard extension. The Apple signing profile must grant `8XG39X5CL8.app.uniclipboard.UniClipboard.shared` (or the project-owned replacement) to all three targets.
2. Android device test covering add, edit, delete, upgrade migration, backup/restore policy, and a Keystore invalidation scenario.
3. Automated canary scan proving no password appears in AsyncStorage, App Group preferences, Android private preferences, exported configuration, logs, notifications, or crash fixtures.
4. QR/pairing follow-up under SEC-004: the existing password-bearing pairing format must be replaced rather than merely stored more safely.

## Explicit non-goals

This change does not claim application-layer encryption, encrypted clipboard history, safe legacy SyncClipboard compatibility, or production-ready pairing. Those remain separately gated by SEC-002 through SEC-008.
