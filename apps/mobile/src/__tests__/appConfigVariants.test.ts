import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

jest.setTimeout(30000);

const readExpoConfig = (variant: 'development' | 'production') => {
  const result = spawnSync('npx', ['expo', 'config', '--type', 'public', '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_VARIANT: variant,
      EXPO_NO_TELEMETRY: '1',
    },
  });

  if (result.status !== 0) {
    throw new Error(
      [`expo config failed for APP_VARIANT=${variant}`, result.stdout.trim(), result.stderr.trim()]
        .filter(Boolean)
        .join('\n')
    );
  }

  return JSON.parse(result.stdout);
};

describe('Expo app config variants', () => {
  it('isolates development installs from production identifiers', () => {
    const config = readExpoConfig('development');
    const appGroups = config.ios.entitlements['com.apple.security.application-groups'];
    const extensions = config.extra.eas.build.experimental.ios.appExtensions;

    expect(config.name).toBe('UniClip Dev');
    expect(config.ios.bundleIdentifier).toBe('app.uniclipboard.UniClipboard.dev');
    expect(config.ios.infoPlist.UCAppGroupIdentifier).toBe(
      'group.app.uniclipboard.UniClipboard.dev'
    );
    expect(config.ios.infoPlist.UCKeychainAccessGroup).toBe(
      '8XG39X5CL8.app.uniclipboard.UniClipboard.dev.shared'
    );
    expect(config.ios.entitlements['keychain-access-groups']).toEqual([
      '8XG39X5CL8.app.uniclipboard.UniClipboard.dev.shared',
    ]);
    expect(appGroups).toEqual(['group.app.uniclipboard.UniClipboard.dev']);
    expect(extensions).toEqual([
      {
        targetName: 'share',
        bundleIdentifier: 'app.uniclipboard.UniClipboard.dev.Share',
        entitlements: {
          'com.apple.security.application-groups': ['group.app.uniclipboard.UniClipboard.dev'],
          'keychain-access-groups': ['8XG39X5CL8.app.uniclipboard.UniClipboard.dev.shared'],
        },
      },
      {
        targetName: 'keyboard',
        bundleIdentifier: 'app.uniclipboard.UniClipboard.dev.Keyboard',
        entitlements: {
          'com.apple.security.application-groups': ['group.app.uniclipboard.UniClipboard.dev'],
          'keychain-access-groups': ['8XG39X5CL8.app.uniclipboard.UniClipboard.dev.shared'],
        },
      },
    ]);
  });

  it('keeps production identifiers and legacy migration access explicit', () => {
    const config = readExpoConfig('production');
    const appGroups = config.ios.entitlements['com.apple.security.application-groups'];
    const extensions = config.extra.eas.build.experimental.ios.appExtensions;

    expect(config.name).toBe('UniClip');
    expect(config.ios.bundleIdentifier).toBe('app.uniclipboard.UniClipboard');
    expect(config.ios.infoPlist.UCAppGroupIdentifier).toBe('group.app.uniclipboard.UniClipboard');
    expect(config.ios.infoPlist.UCKeychainAccessGroup).toBe(
      '8XG39X5CL8.app.uniclipboard.UniClipboard.shared'
    );
    expect(config.ios.entitlements['keychain-access-groups']).toEqual([
      '8XG39X5CL8.app.uniclipboard.UniClipboard.shared',
    ]);
    expect(appGroups).toEqual([
      'group.app.uniclipboard.UniClipboard',
      'group.app.uniclipboard.ios',
    ]);
    expect(extensions).toEqual([
      {
        targetName: 'share',
        bundleIdentifier: 'app.uniclipboard.UniClipboard.Share',
        entitlements: {
          'com.apple.security.application-groups': [
            'group.app.uniclipboard.UniClipboard',
            'group.app.uniclipboard.ios',
          ],
          'keychain-access-groups': ['8XG39X5CL8.app.uniclipboard.UniClipboard.shared'],
        },
      },
      {
        targetName: 'keyboard',
        bundleIdentifier: 'app.uniclipboard.UniClipboard.Keyboard',
        entitlements: {
          'com.apple.security.application-groups': [
            'group.app.uniclipboard.UniClipboard',
            'group.app.uniclipboard.ios',
          ],
          'keychain-access-groups': ['8XG39X5CL8.app.uniclipboard.UniClipboard.shared'],
        },
      },
    ]);
  });

  it('makes native App Group resolution follow the active app variant', () => {
    const files = [
      'modules/app-group-store/ios/Shared/SettingsStore.swift',
      'targets/_shared/SettingsStore.swift',
      'modules/uc-core/ios/UcCoreModule.swift',
    ];

    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).toContain('UCAppGroupIdentifier');
      expect(source).toContain('Bundle.main.bundleIdentifier');
      expect(source).toContain('app.uniclipboard.UniClipboard');
      expect(source).toContain('group.\\(bundleID)');
      expect(source).toContain('[".Share", ".Keyboard"]');
      expect(source).not.toContain(
        'forSecurityApplicationGroupIdentifier: "group.app.uniclipboard.UniClipboard"'
      );
      expect(source).not.toContain('SecTaskCopyValueForEntitlement');
    }
  });

  it('does not rely on per-extension Info.plist build-setting substitution', () => {
    const files = [
      'app.config.ts',
      'targets/share/Info.plist',
      'targets/keyboard/Info.plist',
      'targets/share/expo-target.config.js',
      'targets/keyboard/expo-target.config.js',
    ];

    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).not.toContain('UC_APP_GROUP');
      expect(source).not.toContain('withExtensionAppGroupBuildSetting');
    }
  });

  it('keeps extension vault implementations and generated security inputs aligned', () => {
    const normalize = (source: string) =>
      source
        .replace(/\/\/\/.*$/gm, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/\s+/g, '');
    expect(
      normalize(
        readFileSync(
          path.join(process.cwd(), 'modules/app-group-store/ios/Shared/CredentialVault.swift'),
          'utf8'
        )
      )
    ).toBe(
      normalize(
        readFileSync(path.join(process.cwd(), 'targets/_shared/CredentialVault.swift'), 'utf8')
      )
    );
    for (const file of ['targets/share/Info.plist', 'targets/keyboard/Info.plist']) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).toContain('<key>UCKeychainAccessGroup</key>');
      expect(source).toContain('$(UC_KEYCHAIN_ACCESS_GROUP)');
    }
  });
});
