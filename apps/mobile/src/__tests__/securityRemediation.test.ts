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
    expect(plugin).toContain('uniclipboard.credential-vault.v1');
    expect(plugin).toContain('<data-extraction-rules>');
    expect(plugin).toContain('<full-backup-content>');
  });
});
