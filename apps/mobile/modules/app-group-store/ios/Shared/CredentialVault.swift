import Foundation
import Security

/// A credential is deliberately separate from `ServerConfig`: only its opaque
/// reference is allowed in App Group preferences and the React Native config.
public struct VaultCredential: Codable, Equatable, Sendable {
    public let username: String
    public let password: String
}

public enum CredentialVaultError: Error, LocalizedError {
    case unexpectedStatus(OSStatus)
    case malformedCredential
    case invalidAccessGroup

    public var errorDescription: String? {
        switch self {
        case .unexpectedStatus(let status): return "Keychain operation failed (\(status))"
        case .malformedCredential: return "Stored credential is malformed"
        case .invalidAccessGroup: return "Keychain access group is not configured"
        }
    }
}

/// Shared iOS Keychain vault for the main app and its Share/Keyboard targets.
/// The access group is injected by `app.config.ts`; there is intentionally no
/// UserDefaults or file-backed fallback when the entitlement is missing.
public final class CredentialVault: @unchecked Sendable {
    public static let shared = CredentialVault()

    private let service = "app.uniclipboard.credential-vault.v1"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {}

    public func put(reference: String?, username: String, password: String) throws -> String {
        let requestedRef = reference?.trimmingCharacters(in: .whitespacesAndNewlines)
        let ref = (requestedRef?.isEmpty == false) ? requestedRef! : UUID().uuidString.lowercased()
        let data = try encoder.encode(VaultCredential(username: username, password: password))
        var query = try baseQuery(reference: ref)
        let attributes: [CFString: Any] = [
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecSuccess { return ref }
        guard status == errSecItemNotFound else { throw CredentialVaultError.unexpectedStatus(status) }
        query.merge(attributes) { _, new in new }
        let addStatus = SecItemAdd(query as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw CredentialVaultError.unexpectedStatus(addStatus) }
        return ref
    }

    public func get(reference: String) throws -> VaultCredential? {
        var query = try baseQuery(reference: reference)
        query[kSecReturnData] = true
        query[kSecMatchLimit] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw CredentialVaultError.unexpectedStatus(status)
        }
        do {
            return try decoder.decode(VaultCredential.self, from: data)
        } catch {
            throw CredentialVaultError.malformedCredential
        }
    }

    public func delete(reference: String) throws {
        let status = SecItemDelete(try baseQuery(reference: reference) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw CredentialVaultError.unexpectedStatus(status)
        }
    }

    private func baseQuery(reference: String) throws -> [CFString: Any] {
        var query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: reference,
        ]
        guard let rawGroup = Bundle.main.object(forInfoDictionaryKey: "UCKeychainAccessGroup") as? String else {
            throw CredentialVaultError.invalidAccessGroup
        }
        let group = rawGroup.trimmingCharacters(in: .whitespacesAndNewlines)
        guard group.range(of: #"^[A-Z0-9]{10}\.app\.uniclipboard\.UniClipboard(?:\.dev)?\.shared$"#, options: .regularExpression) != nil else {
            throw CredentialVaultError.invalidAccessGroup
        }
        query[kSecAttrAccessGroup] = group
        return query
    }
}
