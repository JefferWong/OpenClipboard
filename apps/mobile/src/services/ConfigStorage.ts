/**
 * Config Storage Service
 * 配置存储服务 - 管理应用配置和服务器配置
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../types/storage';
import { AppSettings, DEFAULT_SETTINGS, SETTINGS_SCHEMA_VERSION } from '../types/settings';
import { ServerConfig } from '../types/api';
import { SyncMode } from '../types/sync';
import { migrateConfig, extractRuntimeState } from './ConfigMigration';
import { runtimeStateStorage } from './RuntimeStateStorage';
import { log } from './Logger';
import { seedConfigFromAppGroup } from './appGroupSeed';
import { deleteCredential, getCredential, putCredential } from 'app-group-store';

/**
 * 配置存储服务
 */
const SCHEMA_VERSION_KEY = '@syncclipboard:schema_version';
export const CONFIG_USER_STATE_KEY = '@syncclipboard:config:user-state';

export class ConfigStorage {
  private static instance: ConfigStorage | null = null;
  private config: AppSettings | null = null;
  private initialized = false;
  private hydratedCredentialRefs = new Set<string>();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ConfigStorage {
    if (!ConfigStorage.instance) {
      ConfigStorage.instance = new ConfigStorage();
    }
    return ConfigStorage.instance;
  }

  /**
   * 初始化配置存储
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.loadConfig();
      this.initialized = true;
    } catch (error) {
      log.error('[ConfigStorage] Failed to initialize:', error);
      this.config = { ...DEFAULT_SETTINGS };
      this.initialized = true;
    }
  }

  /**
   * 加载配置
   */
  private async loadConfig(): Promise<void> {
    this.hydratedCredentialRefs.clear();
    const configJson = await AsyncStorage.getItem(STORAGE_KEYS.CONFIG);
    const versionStr = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
    const storedVersion = versionStr ? parseInt(versionStr, 10) : 1;

    if (configJson) {
      const savedConfig = JSON.parse(configJson);
      const forceCredentialRefs = new Set<string>();

      if (storedVersion < SETTINGS_SCHEMA_VERSION) {
        const runtimeState = extractRuntimeState(savedConfig);
        await runtimeStateStorage.save(runtimeState);
        this.config = migrateConfig(savedConfig);
        await AsyncStorage.setItem(SCHEMA_VERSION_KEY, String(SETTINGS_SCHEMA_VERSION));
      } else {
        this.config = { ...DEFAULT_SETTINGS, ...savedConfig };
      }
      await this.hydrateCredentials();
      const loadedConfig = this.config;
      if (!loadedConfig) throw new Error('Config not initialized');
      for (const server of savedConfig.servers ?? []) {
        if (server.username !== undefined || server.password !== undefined) {
          forceCredentialRefs.add(server.credentialRef ?? '');
        }
      }
      const requiresPersistence =
        storedVersion < SETTINGS_SCHEMA_VERSION ||
        forceCredentialRefs.size > 0 ||
        loadedConfig.servers.some(
          (server) => server.type === 'syncclipboard' && !server.credentialRef
        );
      if (requiresPersistence) await this.persistConfig(loadedConfig, forceCredentialRefs);
    } else {
      const seed = await seedConfigFromAppGroup();
      this.config = seed ? { ...DEFAULT_SETTINGS, ...seed } : { ...DEFAULT_SETTINGS };
      for (const server of this.config.servers) {
        if (server.credentialRef) this.hydratedCredentialRefs.add(server.credentialRef);
      }
      await this.persistConfig(this.config);
      await AsyncStorage.setItem(SCHEMA_VERSION_KEY, String(SETTINGS_SCHEMA_VERSION));
    }
  }

  /**
   * 保存配置
   */
  private async persistConfig(
    nextConfig: AppSettings,
    forceCredentialRefs = new Set<string>()
  ): Promise<void> {
    if (!nextConfig) {
      throw new Error('Config not initialized');
    }

    const previousConfig = this.config;
    const createdReferences: string[] = [];
    const preparedConfig = this.copyConfig(nextConfig);
    try {
      preparedConfig.servers = await Promise.all(
        preparedConfig.servers.map((server) =>
          this.prepareServerCredentials(server, forceCredentialRefs, createdReferences)
        )
      );
      await AsyncStorage.setItem(
        STORAGE_KEYS.CONFIG,
        JSON.stringify(this.redactedConfigFor(preparedConfig))
      );
    } catch (error) {
      await this.cleanupReferences(createdReferences);
      log.error('[ConfigStorage] Failed to save config:', error);
      throw error;
    }
    this.config = preparedConfig;
    await this.cleanupRemovedReferences(previousConfig, preparedConfig);
  }

  /**
   * 获取完整配置
   */
  public async getConfig(): Promise<AppSettings> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.copyConfig(this.config!);
  }

  /**
   * 更新配置
   */
  public async updateConfig(updates: Partial<AppSettings>): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    await this.persistConfig({ ...this.config!, ...updates });
    await AsyncStorage.setItem(CONFIG_USER_STATE_KEY, '1');
  }

  /**
   * 重置配置为默认值
   */
  public async resetConfig(): Promise<void> {
    await this.persistConfig({ ...DEFAULT_SETTINGS });
    await AsyncStorage.setItem(CONFIG_USER_STATE_KEY, '1');
  }

  // ========== 服务器配置管理 ==========

  /**
   * 获取所有服务器配置
   */
  public async getServers(): Promise<ServerConfig[]> {
    const config = await this.getConfig();
    return config.servers.map((server) => ({
      ...server,
      urls: server.urls ? [...server.urls] : undefined,
    }));
  }

  /**
   * 获取当前激活的服务器配置
   */
  public async getActiveServer(): Promise<ServerConfig | null> {
    const config = await this.getConfig();
    if (config.activeServerIndex >= 0 && config.activeServerIndex < config.servers.length) {
      return { ...config.servers[config.activeServerIndex] };
    }
    return null;
  }

  /**
   * 添加服务器配置
   */
  public async addServer(server: ServerConfig): Promise<number> {
    const config = await this.getConfig();
    config.servers.push(server);

    // 如果是第一个服务器，自动激活
    if (config.servers.length === 1) {
      config.activeServerIndex = 0;
    }

    await this.updateConfig(config);
    return config.servers.length - 1;
  }

  /**
   * 更新服务器配置
   */
  public async updateServer(index: number, updates: Partial<ServerConfig>): Promise<void> {
    const config = await this.getConfig();

    if (index < 0 || index >= config.servers.length) {
      throw new Error(`Invalid server index: ${index}`);
    }

    const previousReference = config.servers[index].credentialRef;
    config.servers[index] = { ...config.servers[index], ...updates };
    const forceCredentialRefs =
      updates.username !== undefined || updates.password !== undefined
        ? new Set([previousReference ?? ''])
        : new Set<string>();
    await this.persistConfig(config, forceCredentialRefs);
  }

  /**
   * 删除服务器配置
   */
  public async deleteServer(index: number): Promise<void> {
    const config = await this.getConfig();

    if (index < 0 || index >= config.servers.length) {
      throw new Error(`Invalid server index: ${index}`);
    }

    config.servers.splice(index, 1);

    // 调整当前激活索引
    if (config.activeServerIndex === index) {
      config.activeServerIndex = config.servers.length > 0 ? 0 : -1;
    } else if (config.activeServerIndex > index) {
      config.activeServerIndex--;
    }

    await this.persistConfig(config);
  }

  /**
   * 设置激活的服务器
   */
  public async setActiveServer(index: number): Promise<void> {
    const config = await this.getConfig();

    if (index < -1 || index >= config.servers.length) {
      throw new Error(`Invalid server index: ${index}`);
    }

    config.activeServerIndex = index;
    await this.updateConfig(config);
  }

  private async hydrateCredentials(): Promise<void> {
    if (!this.config) return;

    this.config.servers = await Promise.all(
      this.config.servers.map(async (server) => {
        if (!server.credentialRef) return server;
        const credential = await getCredential(server.credentialRef);
        this.hydratedCredentialRefs.add(server.credentialRef);
        return credential ? { ...server, ...credential } : server;
      })
    );
  }

  private redactedConfig(): AppSettings {
    return this.redactedConfigFor(this.config!);
  }

  private redactedConfigFor(source: AppSettings): AppSettings {
    const config = this.copyConfig(source);
    config.servers = config.servers.map((server) => {
      const redacted = { ...server };
      delete redacted.username;
      delete redacted.password;
      return redacted;
    });
    return config;
  }

  private async prepareServerCredentials(
    server: ServerConfig,
    forceCredentialRefs: Set<string>,
    createdReferences: string[]
  ): Promise<ServerConfig> {
    const hasCredentialMaterial = server.username !== undefined || server.password !== undefined;
    if (!hasCredentialMaterial && (server.type !== 'syncclipboard' || server.credentialRef)) {
      return server;
    }

    const username = server.username ?? '';
    const password = server.password ?? '';
    const mustWrite =
      !server.credentialRef ||
      forceCredentialRefs.has(server.credentialRef) ||
      (hasCredentialMaterial && !this.hydratedCredentialRefs.has(server.credentialRef));

    if (hasCredentialMaterial && username && password && !mustWrite) return server;

    if (hasCredentialMaterial && !username && !password && server.type !== 'syncclipboard') {
      const withoutReference = { ...server };
      delete withoutReference.credentialRef;
      return withoutReference;
    }

    const credentialRef = await putCredential(
      { username, password },
      hasCredentialMaterial && mustWrite && server.credentialRef ? undefined : server.credentialRef
    );
    if (!server.credentialRef || credentialRef !== server.credentialRef) {
      createdReferences.push(credentialRef);
    }
    return { ...server, credentialRef };
  }

  private async cleanupReferences(references: string[]): Promise<void> {
    for (const reference of references) {
      try {
        await deleteCredential(reference);
      } catch {
        log.warn('[ConfigStorage] Failed to clean up an unreferenced credential');
      }
    }
  }

  private async cleanupRemovedReferences(
    previousConfig: AppSettings | null,
    nextConfig: AppSettings
  ): Promise<void> {
    if (!previousConfig) return;
    const nextReferences = new Set(
      nextConfig.servers.map((server) => server.credentialRef).filter(Boolean)
    );
    const removedReferences = previousConfig.servers
      .map((server) => server.credentialRef)
      .filter((reference): reference is string =>
        Boolean(reference && !nextReferences.has(reference))
      );
    await this.cleanupReferences([...new Set(removedReferences)]);
  }

  private copyConfig(config: AppSettings): AppSettings {
    return {
      ...config,
      servers: config.servers.map((server) => ({
        ...server,
        urls: server.urls ? [...server.urls] : undefined,
      })),
    };
  }

  // ========== 主题管理 ==========

  /**
   * 获取主题设置
   */
  public async getTheme(): Promise<'system' | 'light' | 'dark'> {
    const config = await this.getConfig();
    return config.appearance;
  }

  /**
   * 设置主题
   */
  public async setTheme(theme: 'system' | 'light' | 'dark'): Promise<void> {
    await this.updateConfig({ appearance: theme });
  }

  // ========== 同步设置管理 ==========

  /**
   * 获取同步模式
   */
  public async getSyncMode(): Promise<string> {
    const config = await this.getConfig();
    return config.syncMode;
  }

  /**
   * 设置同步模式
   */
  public async setSyncMode(mode: string): Promise<void> {
    await this.updateConfig({ syncMode: mode as SyncMode });
  }

  /**
   * 获取同步间隔
   */
  public async getSyncInterval(): Promise<number> {
    const config = await this.getConfig();
    return config.syncInterval;
  }

  /**
   * 设置同步间隔
   */
  public async setSyncInterval(interval: number): Promise<void> {
    if (interval < 1000) {
      throw new Error('Sync interval must be at least 1000ms');
    }
    await this.updateConfig({ syncInterval: interval });
  }

  // ========== 通知设置管理 ==========

  /**
   * 是否启用通知
   */
  public async isNotificationsEnabled(): Promise<boolean> {
    const config = await this.getConfig();
    return config.enableNotifications;
  }

  /**
   * 设置通知开关
   */
  public async setNotificationsEnabled(enabled: boolean): Promise<void> {
    await this.updateConfig({ enableNotifications: enabled });
  }

  // ========== 导入/导出 ==========

  /**
   * 导出配置为 JSON
   */
  public async exportConfig(): Promise<string> {
    const config = await this.getConfig();
    return JSON.stringify(config, null, 2);
  }

  /**
   * 从 JSON 导入配置
   */
  public async importConfig(json: string): Promise<void> {
    try {
      const imported = JSON.parse(json);

      if (!imported.servers || !Array.isArray(imported.servers)) {
        throw new Error('Invalid config: missing servers array');
      }

      this.config = migrateConfig(imported);
      await this.persistConfig(this.config);
      await AsyncStorage.setItem(CONFIG_USER_STATE_KEY, '1');
    } catch (error) {
      log.error('[ConfigStorage] Failed to import config:', error);
      throw new Error('Invalid config JSON');
    }
  }

  /**
   * 清空所有配置
   */
  public async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEYS.CONFIG);
    await AsyncStorage.removeItem(CONFIG_USER_STATE_KEY);
    this.config = { ...DEFAULT_SETTINGS };
    this.hydratedCredentialRefs.clear();
    this.initialized = false;
  }
}

// 导出单例
export const configStorage = ConfigStorage.getInstance();
