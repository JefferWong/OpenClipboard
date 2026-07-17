import { ConfigPlugin, createRunOncePlugin, withAndroidManifest } from 'expo/config-plugins';

/**
 * Credentials are encrypted with an Android Keystore key that is intentionally
 * device-bound. Backing up the ciphertext without that key is not useful for
 * recovery and risks preserving sensitive material outside the device, so
 * disable Android Auto Backup for the application until a reviewed encrypted
 * recovery design exists (SEC-103).
 */
const withSecureCredentialBackupPolicy: ConfigPlugin = (config) =>
  withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('withSecureCredentialBackupPolicy: Android application manifest is missing');
    }
    application.$ = application.$ ?? { 'android:name': '.MainApplication' };
    application.$['android:allowBackup'] = 'false';
    return config;
  });

export default createRunOncePlugin(
  withSecureCredentialBackupPolicy,
  'withSecureCredentialBackupPolicy',
  '1.0.0'
);
