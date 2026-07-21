"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const config_plugins_1 = require("expo/config-plugins");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
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
const withSecureCredentialBackupPolicy = (config) => {
    config = (0, config_plugins_1.withDangerousMod)(config, [
        'android',
        async (config) => {
            const xmlPath = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res/xml');
            fs.mkdirSync(xmlPath, { recursive: true });
            fs.writeFileSync(path.join(xmlPath, 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES);
            fs.writeFileSync(path.join(xmlPath, 'full_backup_content.xml'), FULL_BACKUP_CONTENT);
            return config;
        },
    ]);
    return (0, config_plugins_1.withAndroidManifest)(config, (config) => {
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
exports.default = (0, config_plugins_1.createRunOncePlugin)(withSecureCredentialBackupPolicy, 'withSecureCredentialBackupPolicy', '1.0.0');
