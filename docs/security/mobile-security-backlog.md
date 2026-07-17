# Mobile security backlog

**R2 status: production release blocked.**

This backlog converts the mandatory controls in `docs/architecture/mobile-security-baseline.md` into reviewable work. The IDs are stable references for issues and pull requests. A checked implementation task is not sufficient by itself: its acceptance evidence must also be attached to the corresponding PR.

## Release-blocking work

| ID | Priority | Control | Work item | Acceptance evidence | Status |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | P0 | M1, M7 | Replace plaintext mobile credentials with opaque references backed by iOS Keychain Access Group and Android Keystore-wrapped storage. Remove passwords from AsyncStorage, App Group JSON, logs, state snapshots, and QR persistence. | Platform tests prove secrets are not present in app databases, preferences, backups, or logs after add/edit/delete/migration. | Open |
| SEC-002 | P0 | M2, M3 | Disable plaintext clipboard history and caches. Add encrypted storage with authenticated metadata, TTL, secure deletion best effort, and a migration that deletes legacy plaintext. | Fresh-install and upgrade tests inspect SQLite/App Group/filesystem data at rest; history remains off until encryption is active. | Open |
| SEC-003 | P0 | M4, M6, M7 | Implement versioned XChaCha20-Poly1305 message envelopes in `uc-mobile`; bind version, method, route, device ID, sequence, content type, and expiry in AAD. | Cross-platform test vectors, tamper tests, nonce-uniqueness tests, replay rejection, expiry rejection, and Rust API review. | Open |
| SEC-004 | P0 | M5, M6 | Replace reusable password QR pairing with single-use, short-lived invitations and per-device identities. Add revocation and monotonic receive state. | Tests cover invitation reuse, expiry, wrong desktop identity, revoked devices, sequence rollback, and concurrent pairing. | Open |
| SEC-005 | P0 | M8 | Centralize redaction and remove clipboard contents, passwords, tokens, invitations, full URLs, and crypto material from logs, notifications, crash reports, and analytics. | Automated canary-secret test scans Android logcat, Apple unified logs, test output, and crash payload fixtures. | Open |
| SEC-006 | P0 | M1–M8 | Remove or explicitly quarantine legacy SyncClipboard plaintext compatibility. Insecure TLS and Basic Auth payload mode must be off by default and impossible in production builds. | Build-time assertions and negative integration tests show production cannot enable insecure modes. | Open |
| SEC-007 | P0 | Supply chain | Reduce the mobile production dependency audit from the R2 baseline of **3 critical / 36 high** findings to zero, or document narrowly scoped reviewed exceptions. | `npm audit --omit=dev` report, exploitability review, lockfile diff, and passing mobile build/tests. | Open |
| SEC-008 | P0 | Release trust | Establish project-owned Android signing, Apple signing/notarization, protected release environments, SBOM/provenance, checksums, and key rotation/revocation runbooks. | Rehearsed release from a protected tag; independent verification of every artifact. | Open |

## Platform work

| ID | Priority | Platform | Work item | Acceptance evidence | Status |
| --- | --- | --- | --- | --- | --- |
| SEC-101 | P1 | Android | Separate store-safe and advanced sideload variants. Store build uses only user-visible sharing, tile, notification, and foreground flows; restricted automation is clearly labeled and excluded. | Manifest diff and Play policy review for each variant; device tests on Android 10 and current stable Android. | Open |
| SEC-102 | P1 | iOS | Restrict sync entry points to foreground, Share Extension, Shortcuts/App Intent, widget/control entry, and notification actions. App Group contains only ciphertext and non-sensitive metadata. | Extension/app integration tests plus App Group filesystem inspection. | Open |
| SEC-103 | P1 | Both | Add lost-device, key-rotation, account-reset, and legacy-data recovery UX without revealing secret material. | Usability test script and security review of every recovery path. | Open |
| SEC-104 | P1 | Both | Add clipboard-content classification and explicit exclusions for password-manager/one-time-code/sensitive sources where platform APIs permit. | Documented platform limits and tests for every supported exclusion signal. | Open |

## Protocol and assurance work

| ID | Priority | Work item | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| SEC-201 | P1 | Publish the encrypted envelope and pairing protocol specification with canonical encodings, limits, state machines, and downgrade rules. | Spec review plus generated test vectors consumed by Rust, Android, iOS, Windows, and macOS tests. | Open |
| SEC-202 | P1 | Fuzz parsers, envelope decoding, QR invitations, and attachment metadata; cap sizes before allocation/decompression. | CI fuzz corpus, resource-limit tests, and crash-free target runtime. | Open |
| SEC-203 | P1 | Add an adversarial integration harness for MITM, tampering, replay, reordering, duplication, delayed delivery, revocation, and clock skew. | Reproducible test report on all four platforms. | Open |
| SEC-204 | P1 | Commission an external cryptography/application security review before claiming production readiness. | Public scope and remediation summary; private details follow coordinated disclosure. | Open |

## Gate rules

1. No production release, store submission, or “secure/E2EE-ready” claim while any P0 item is open.
2. CI build artifacts are for development only and must use development identifiers and unsigned/debug signing where possible.
3. A compatibility feature may not weaken the secure default. Its risk must be explicit, isolated, testable, and unavailable in production unless separately approved.
4. Vulnerability counts in CI are a ratchet against regression, not an acceptance threshold. The current non-zero ceiling records inherited debt only.
5. Closing an item requires tests and evidence; code review alone is insufficient for secret-storage or protocol controls.
