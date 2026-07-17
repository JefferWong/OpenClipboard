# Security Policy

OpenClipboard is a pre-production, security-focused cross-device clipboard project. It does **not** currently publish production-ready binaries. The imported mobile client still contains known plaintext credential, plaintext history, legacy HTTP Basic Auth, and dependency risks tracked in `docs/security/mobile-security-backlog.md`.

Do not use the current code or CI artifacts with real passwords, private clipboard data, or production infrastructure.

## Supported versions

No version is currently supported for production use. This policy will be updated before the first security-reviewed release.

| Version | Security support |
| --- | --- |
| `main` / CI artifacts | Development and testing only |
| Imported upstream releases | Not supported by this repository |

## Reporting a vulnerability

Please do not open a public issue for an undisclosed vulnerability.

Use GitHub's private vulnerability reporting feature from this repository's **Security** tab. Include the affected commit, platform, reproduction steps, impact, and any suggested mitigation. If private reporting is not yet enabled, contact the repository owner privately and share only enough public information to establish contact.

We will acknowledge reports as capacity permits. No response-time or patch-time service level is promised before the first supported release.

## Release trust

This repository has not yet established its own release-signing keys, notarization identities, package signing, or reproducible release process. Keys and signatures from UniClipboard or UniClip upstream releases do not authenticate OpenClipboard artifacts.

Before the first supported release, the project must publish its own signing and verification procedure and satisfy every release blocker in the mobile security backlog.
