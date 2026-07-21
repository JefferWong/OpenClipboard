import { Platform } from 'react-native';
import { getCredential, getServers, getSettings } from 'app-group-store';
import type { ServerConfig } from '../types/api';
import type { AppSettings } from '../types/settings';

const LOG_LEVELS: AppSettings['logLevel'][] = ['debug', 'info', 'warn', 'error'];

export async function seedConfigFromAppGroup(): Promise<Partial<AppSettings> | null> {
  if (Platform.OS !== 'ios') return null;

  const [serverList, settings] = await Promise.all([getServers(), getSettings()]);
  if (!serverList.configs.length) return null;

  const servers: ServerConfig[] = await Promise.all(
    serverList.configs.map(async (config) => {
      const credential = await getCredential(config.credentialRef);
      return {
        type: 'syncclipboard',
        ...(config.name ? { name: config.name } : {}),
        url: config.urls[0] ?? '',
        urls: config.urls,
        ...(config.credentialRef ? { credentialRef: config.credentialRef } : {}),
        ...(credential ?? {}),
      };
    })
  );

  const activeIndex = serverList.activeConfigId
    ? serverList.configs.findIndex((config) => config.id === serverList.activeConfigId)
    : -1;

  const partial: Partial<AppSettings> = {
    servers,
    activeServerIndex: activeIndex >= 0 ? activeIndex : servers.length > 0 ? 0 : -1,
  };

  if (settings.trustInsecureCert !== undefined) {
    partial.trustInsecureCert = settings.trustInsecureCert;
  }
  if (settings.autoApplyServerChanges !== undefined) {
    partial.autoApplyRemote = settings.autoApplyServerChanges;
  }
  if (settings.autoPushDeviceChanges !== undefined) {
    partial.autoPushLocal = settings.autoPushDeviceChanges;
  }
  if (settings.payloadCacheMaxBytes !== undefined) {
    partial.payloadCacheMaxBytes = settings.payloadCacheMaxBytes;
  }
  if (settings.appearance !== undefined) {
    partial.appearance = settings.appearance;
  }
  if (settings.autoCheckUpdate !== undefined) {
    partial.autoCheckUpdate = settings.autoCheckUpdate;
  }
  if (settings.ignoredVersion !== undefined) {
    partial.ignoredVersion = settings.ignoredVersion;
  }
  if (settings.downloadRelativePath !== undefined) {
    partial.downloadRelativePath = settings.downloadRelativePath;
  }
  if (settings.prefetchAttachments !== undefined) {
    partial.attachmentAutoDownload = settings.prefetchAttachments
      ? settings.prefetchOnCellular
        ? 'always'
        : 'wifi'
      : 'off';
  }
  if (settings.logViewLevelFilter && isLogLevel(settings.logViewLevelFilter)) {
    partial.logLevel = settings.logViewLevelFilter;
  }
  if (settings.keyboardSoundFeedback !== undefined) {
    partial.keyboardSoundFeedback = settings.keyboardSoundFeedback;
  }
  if (settings.keyboardHapticFeedback !== undefined) {
    partial.keyboardHapticFeedback = settings.keyboardHapticFeedback;
  }

  return partial;
}

function isLogLevel(value: string): value is AppSettings['logLevel'] {
  return LOG_LEVELS.includes(value as AppSettings['logLevel']);
}
