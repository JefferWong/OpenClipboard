import {
  ConfigPlugin,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} from 'expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';

// Must remain synchronized with AppGroupStoreModule.kt's PREFERENCES_NAME.
const CREDENTIAL_PREFERENCES_FILE = 'uniclipboard.credential-vault.v1.xml';

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="sharedpref" path="${CREDENTIAL_PREFERENCES_FILE}" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="sharedpref" path="${CREDENTIAL_PREFERENCES_FILE}" />
  </device-transfer>
</data-extraction-rules>
`;

const FULL_BACKUP_CONTENT = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="sharedpref" path="${CREDENTIAL_PREFERENCES_FILE}" />
</full-backup-content>
`;

/**
 * Credentials are encrypted with an Android Keystore key that is intentionally
 * device-bound. Backing up the ciphertext without that key is not useful for
 * recovery and risks preserving sensitive material outside the device, so
 * Keep device-bound credential ciphertext out of both cloud backup and device
 * transfer on every supported Android backup format.
 */
const withSecureCredentialBackupPolicy: ConfigPlugin = (config) => {
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const xmlPath = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(xmlPath, { recursive: true });
      fs.writeFileSync(path.join(xmlPath, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES);
      fs.writeFileSync(path.join(xmlPath, 'full_backup_content.xml'), FULL_BACKUP_CONTENT);
      return config;
    },
  ]);

  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('withSecureCredentialBackupPolicy: Android application manifest is missing');
    }
    application.$ = application.$ ?? { 'android:name': '.MainApplication' };
    application.$['android:allowBackup'] = 'false';
    application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
    application.$['android:fullBackupContent'] = '@xml/full_backup_content';
    return config;
  });
};

export default createRunOncePlugin(
  withSecureCredentialBackupPolicy,
  'withSecureCredentialBackupPolicy',
  '1.0.0'
);
