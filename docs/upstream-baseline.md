# R1 上游基线与历史导入

## 目标

R1 采用单一主线：UniClipboard 提供桌面端、daemon、领域模型、加密存储和 P2P 基础；UniClip 作为 Android/iOS 应用基线导入 `apps/mobile/`；SyncClipboard 仅作为 v3 线协议兼容性参考。

项目整体许可证固定为 `AGPL-3.0-only`，第三方许可证见 [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md)。

## 固定上游

| 上游 | 固定提交 | R1 用途 |
| --- | --- | --- |
| `UniClipboard/UniClipboard` | `9b91179e8d5c84b0929c3b7b01c2bb8182d9f6a7` | 主线第一父提交 |
| `UniClipboard/UniClip` | `58d0ebf70b6b154ef39c4dc905fbe72ee9c953bd` | `apps/mobile/` 第二父提交 |
| `Jeric-X/SyncClipboard` | `9ac4375c26226e8ab5cbffcfd45f90b03781576a` | 协议参考，不导入产品源码树 |

R1 导入提交为 `43e470e9f960846cc6658c562abf74da16ceff07`。它有两个父提交，并带有 `git-subtree-*` 追踪信息，因此 UniClipboard 的 3,442 个提交和 UniClip 的 428 个提交均可追溯。

## 远程仓库约定

| 远程名 | 地址 | 权限 |
| --- | --- | --- |
| `upstream-uniclipboard` | `https://github.com/UniClipboard/UniClipboard.git` | 只拉取 |
| `upstream-uniclip` | `https://github.com/UniClipboard/UniClip.git` | 只拉取 |
| `upstream-syncclipboard` | `https://github.com/Jeric-X/SyncClipboard.git` | 只拉取 |
| `origin` | 待新项目仓库确定后配置 | 新项目读写 |

任何上游同步都必须单独提交，不得与功能修改、格式化或依赖升级混合。同步后应重新执行许可证检查、安全门禁和对应平台构建。

## 边界

- 不机械合并 UniClipboard 与 SyncClipboard 两套桌面端或服务端。
- `apps/mobile/` 的界面层可继续使用 React Native/Expo；安全关键的配对、密钥和协议逻辑逐步收敛到现有 Rust `uc-mobile`/UniFFI 核心。
- 不把 SyncClipboard 的明文服务端作为默认或隐私核心路径。
- 未通过 [`mobile-security-baseline.md`](architecture/mobile-security-baseline.md) 的发布门禁前，不发布移动端生产版本。
