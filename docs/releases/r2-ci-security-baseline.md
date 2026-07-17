# R2 CI and security baseline

Date: 2026-07-16

R2 makes the imported repository build boundaries visible and turns known security debt into explicit release blockers. It does not claim production readiness.

## What R2 adds

| Gate | Runner | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Desktop core | Windows, macOS | The pinned Rust workspace can check the desktop daemon and CLI packages on both target operating systems. | Signed installers, GUI/Tauri packaging, runtime clipboard behavior, or release signing. |
| Mobile JS quality | Linux | TypeScript type-check, ESLint, and Jest run from the imported `apps/mobile` workspace. | Native platform correctness or data-at-rest security. |
| Android debug app | Linux + Java 17 | Expo can generate the Android project and Gradle can produce a development debug APK using the currently imported native Rust libraries. | Reproducible Rust-to-AAR delivery, release signing, Play compliance, or secure storage. |
| iOS simulator app | macOS + Xcode | The local Rust source produces an xcframework/UniFFI bindings and the Expo app can build unsigned for the simulator. | Device signing, App Store export, background clipboard access, or Keychain/App Group security. |
| Dependency ratchet | Linux | Critical/high production dependency counts cannot silently rise above the captured inherited baseline. | That the inherited findings are acceptable; release still requires remediation. |

The Android Rust delivery script remains a design placeholder. Android CI therefore validates the imported app binary integration, not a source-reproducible Android Rust core. Implementing and verifying a source-built AAR is required before a supported release.

## Workflow routing

GitHub only executes workflow files under the repository root `.github/workflows/`. The original UniClip workflows remain in `apps/mobile/.github/workflows/` as upstream history/reference and are intentionally not treated as active automation.

The root desktop PR workflow now watches `apps/cli/**` and `apps/daemon/**` instead of all `apps/**`. Pure React Native changes therefore do not accidentally run the Linux desktop workspace gate. Mobile changes are owned by `.github/workflows/mobile-ci.yml`.

## Dependency audit snapshot

The 2026-07-16 `npm audit --omit=dev` snapshot reported 3 critical and 36 high findings in the imported mobile dependency graph. R2 records these counts only as temporary maximums so a new advisory or dependency regression becomes visible. `SEC-007` blocks release until they are eliminated or individually reviewed and explicitly excepted.

## Merge and release criteria

- R2 may merge when workflow syntax is valid and the new jobs have produced reviewable results on the draft PR.
- Individual platform failures discovered by the first remote run must be fixed or documented with a narrow follow-up issue before the PR is marked ready.
- No CI artifact from this baseline may be distributed as a supported OpenClipboard release.
- Production readiness requires every P0 item in `docs/security/mobile-security-backlog.md` to be closed with evidence.
