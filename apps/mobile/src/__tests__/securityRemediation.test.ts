import { readFileSync } from 'fs';
import path from 'path';

const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');

describe('security remediation source invariants', () => {
  it('keeps both iOS vault implementations fail-closed and synchronized', () => {
    const vaults = [
      read('modules/app-group-store/ios/Shared/CredentialVault.swift'),
      read('targets/_shared/CredentialVault.swift'),
    ];
    for (const source of vaults) {
      expect(source).toContain('case invalidAccessGroup');
      expect(source).toContain('throw CredentialVaultError.invalidAccessGroup');
      expect(source).toContain('kSecAttrAccessGroup] = group');
      expect(source).not.toContain('if let group = Bundle.main.object');
    }
  });

  it('checks Android commit results and excludes the credential preference file', () => {
    const module = read(
      'modules/app-group-store/android/src/main/java/expo/modules/appgroupstore/AppGroupStoreModule.kt'
    );
    const plugin = read('plugins/withSecureCredentialBackupPolicy.ts');
    expect(module).toContain('commitOrThrow');
    expect(module).toContain('"putCredential"');
    expect(module).toContain('"deleteCredential"');
    expect(plugin).toContain('android:dataExtractionRules');
    expect(plugin).toContain('android:fullBackupContent');
    expect(plugin).toContain('uniclipboard.credential-vault.v1.xml');
    expect(plugin).toContain("AppGroupStoreModule.kt's PREFERENCES_NAME");
    expect(plugin).toContain('<data-extraction-rules>');
    expect(plugin).toContain('<full-backup-content>');
  });
  it('keeps both iOS server decoders credential-optional and synchronized', () => {
    const decoders = [
      read('modules/app-group-store/ios/Shared/ServerConfig.swift'),
      read('targets/_shared/ServerConfig.swift'),
    ];
    for (const source of decoders) {
      expect(source).toContain(
        'let username = try c.decodeIfPresent(String.self, forKey: .username)'
      );
      expect(source).toContain(
        'let password = try c.decodeIfPresent(String.self, forKey: .password)'
      );
      expect(source).toContain('credentialRef = ""');
      expect(source).not.toContain('let username = try c.decode(String.self, forKey: .username)');
    }
  });

  it('keeps both iOS server stores fail-closed and migration-write-only', () => {
    const stores = [
      read('modules/app-group-store/ios/Shared/SettingsStore.swift'),
      read('targets/_shared/SettingsStore.swift'),
    ];
    for (const source of stores) {
      expect(source).toContain('public func loadServers() throws -> ServerConfigList');
      expect(source).toContain('let list = try decoder.decode(ServerConfigList.self');
      expect(source).toContain('let legacy = try decoder.decode(LegacyServerConfig.self');
      expect(source).toContain('let migrated = try legacy.migrated()');
      expect(source).toContain('rawConfig?.contains("\\"username\\"")');
      expect(source).not.toContain('try? decoder.decode(ServerConfigList.self');
      expect(source).not.toContain('guard let migrated = try?');
    }
  });
  it('propagates iOS server configuration persistence failures at callers', () => {
    const stores = [
      read('modules/app-group-store/ios/Shared/SettingsStore.swift'),
      read('targets/_shared/SettingsStore.swift'),
    ];

    for (const source of stores) {
      expect(source).toContain('public func saveServers(_ list: ServerConfigList) throws');
      expect(source).toContain('try saveServers(migrated)');
      expect(source).toContain('let data = try encoder.encode(list)');
      expect(source).not.toContain('guard let data = try? encoder.encode(list)');

      const saveIndex = source.indexOf('try saveServers(migrated)');
      const deleteIndex = source.indexOf(
        'defaults.removeObject(forKey: AppSettings.PersistenceKey.legacyServerConfig)'
      );

      expect(saveIndex).toBeGreaterThanOrEqual(0);
      expect(deleteIndex).toBeGreaterThan(saveIndex);
    }

    const module = read('modules/app-group-store/ios/AppGroupStoreModule.swift');
    const keyboard = read('targets/keyboard/KeyboardModel.swift');

    expect(module).toContain('try self.store.saveServers(list)');
    expect(keyboard).toContain('try store.saveServers(list)');
    expect(keyboard).toContain('setActiveServer: failed to save servers');
  });
});
