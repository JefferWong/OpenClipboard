import { CONFIG_USER_STATE_KEY, ConfigStorage } from '../services/ConfigStorage';
import { STORAGE_KEYS } from '../types/storage';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { ServerConfig } from '../types/api';
import { SyncMode } from '../types/sync';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const next = Object.create(actual);
  Object.defineProperty(next, 'Platform', {
    value: {
      ...actual.Platform,
      OS: 'ios',
    },
  });
  return next;
});

jest.mock('app-group-store', () => ({
  getServers: jest.fn().mockResolvedValue({ configs: [], activeConfigId: null }),
  getSettings: jest.fn().mockResolvedValue({}),
  putCredential: jest
    .fn()
    .mockImplementation(({ username }) => Promise.resolve(`vault-${username}`)),
  getCredential: jest.fn().mockResolvedValue(null),
  deleteCredential: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/Logger', () => ({
  log: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  deleteCredential,
  getCredential,
  getServers,
  getSettings,
  putCredential,
} from 'app-group-store';

interface TestableConfigStorage extends ConfigStorage {
  initialize(): Promise<void>;
}

interface ConfigStoragePrivate {
  initialized: boolean;
  config: AppSettings | null;
}

describe('ConfigStorage', () => {
  let configStorage: TestableConfigStorage;
  const mockGetItem = AsyncStorage.getItem as jest.Mock;
  const mockSetItem = AsyncStorage.setItem as jest.Mock;
  const mockGetServers = getServers as jest.Mock;
  const mockGetSettings = getSettings as jest.Mock;
  const mockPutCredential = putCredential as jest.Mock;
  const mockGetCredential = getCredential as jest.Mock;
  const mockDeleteCredential = deleteCredential as jest.Mock;

  const getPrivate = (storage: TestableConfigStorage): ConfigStoragePrivate => {
    return storage as unknown as ConfigStoragePrivate;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockGetServers.mockReset();
    mockGetSettings.mockReset();
    mockPutCredential.mockReset();
    mockGetCredential.mockReset();
    mockDeleteCredential.mockReset();
    mockGetServers.mockResolvedValue({ configs: [], activeConfigId: null });
    mockGetSettings.mockResolvedValue({});
    mockPutCredential.mockImplementation(({ username }) => Promise.resolve(`vault-${username}`));
    mockGetCredential.mockResolvedValue(null);
    mockDeleteCredential.mockResolvedValue(undefined);
    configStorage = ConfigStorage.getInstance() as TestableConfigStorage;
    const privateProps = getPrivate(configStorage);
    privateProps.initialized = false;
    privateProps.config = null;
  });

  describe('initialize', () => {
    it('should load config from storage', async () => {
      const mockConfig: AppSettings = {
        ...DEFAULT_SETTINGS,
        servers: [{ type: 'syncclipboard', url: 'https://test.com' }],
        activeServerIndex: 0,
      };
      mockGetItem.mockResolvedValue(JSON.stringify(mockConfig));

      await configStorage.initialize();

      expect(mockGetItem).toHaveBeenCalledWith(STORAGE_KEYS.CONFIG);
    });

    it('should use default config if no config storage', async () => {
      mockGetItem.mockResolvedValue(null);
      mockSetItem.mockResolvedValue(undefined);

      await configStorage.initialize();

      expect(mockSetItem).toHaveBeenCalled();
    });

    it('seeds first-launch config from App Group servers before saving defaults', async () => {
      mockGetItem.mockResolvedValue(null);
      mockSetItem.mockResolvedValue(undefined);
      mockGetServers.mockResolvedValue({
        configs: [
          {
            id: 'primary',
            name: 'Primary',
            urls: ['https://server.example.com', 'http://lan.local'],
            credentialRef: 'vault-primary',
          },
          {
            id: 'secondary',
            urls: ['https://backup.example.com'],
            credentialRef: 'vault-secondary',
          },
        ],
        activeConfigId: 'secondary',
      });
      mockGetSettings.mockResolvedValue({
        trustInsecureCert: true,
        autoApplyServerChanges: false,
        autoPushDeviceChanges: true,
        prefetchAttachments: true,
        prefetchOnCellular: true,
        payloadCacheMaxBytes: 12345,
        appearance: 'dark',
        autoCheckUpdate: false,
        ignoredVersion: '2.0.0',
        downloadRelativePath: 'Downloads',
        logViewLevelFilter: 'warn',
      });
      mockGetCredential.mockImplementation((reference: string) =>
        Promise.resolve(
          reference === 'vault-primary'
            ? { username: 'alice', password: 'secret' }
            : { username: 'bob', password: 'backup' }
        )
      );

      await configStorage.initialize();

      const savedConfig = JSON.parse(
        mockSetItem.mock.calls.find(([key]) => key === STORAGE_KEYS.CONFIG)?.[1]
      );
      expect(savedConfig.servers).toEqual([
        {
          type: 'syncclipboard',
          name: 'Primary',
          url: 'https://server.example.com',
          urls: ['https://server.example.com', 'http://lan.local'],
          credentialRef: 'vault-primary',
        },
        {
          type: 'syncclipboard',
          url: 'https://backup.example.com',
          urls: ['https://backup.example.com'],
          credentialRef: 'vault-secondary',
        },
      ]);
      expect(savedConfig.activeServerIndex).toBe(1);
      expect(savedConfig.trustInsecureCert).toBe(true);
      expect(savedConfig.autoApplyRemote).toBe(false);
      expect(savedConfig.autoPushLocal).toBe(true);
      expect(savedConfig.attachmentAutoDownload).toBe('always');
      expect(savedConfig.payloadCacheMaxBytes).toBe(12345);
      expect(savedConfig.appearance).toBe('dark');
      expect(savedConfig.autoCheckUpdate).toBe(false);
      expect(savedConfig.ignoredVersion).toBe('2.0.0');
      expect(savedConfig.downloadRelativePath).toBe('Downloads');
      expect(savedConfig.logLevel).toBe('warn');
      expect(mockSetItem).not.toHaveBeenCalledWith(CONFIG_USER_STATE_KEY, '1');
      expect(mockPutCredential).not.toHaveBeenCalled();
    });

    it('should not reload if already initialized', async () => {
      const privateProps = getPrivate(configStorage);
      privateProps.initialized = true;

      await configStorage.initialize();

      expect(mockGetItem).not.toHaveBeenCalled();
    });

    it('does not rewrite hydrated credentials on every initialization', async () => {
      const storedConfig = {
        ...DEFAULT_SETTINGS,
        servers: [
          {
            type: 'syncclipboard',
            url: 'https://server.example.com',
            credentialRef: 'vault-primary',
          },
        ],
        activeServerIndex: 0,
      } as AppSettings;
      mockGetItem.mockImplementation((key: string) => {
        if (key === STORAGE_KEYS.CONFIG) {
          return Promise.resolve(JSON.stringify(storedConfig));
        }
        if (key === '@syncclipboard:schema_version') {
          return Promise.resolve('3');
        }
        return Promise.resolve(null);
      });
      mockGetCredential.mockResolvedValue({ username: 'alice', password: 'secret' });

      await configStorage.initialize();

      expect(mockPutCredential).not.toHaveBeenCalled();
      expect(mockSetItem).not.toHaveBeenCalledWith(STORAGE_KEYS.CONFIG, expect.any(String));
    });
  });

  describe('getConfig', () => {
    it('should return config after initialization', async () => {
      const mockConfig: AppSettings = {
        ...DEFAULT_SETTINGS,
        syncMode: SyncMode.Manual,
      };
      mockGetItem.mockResolvedValue(JSON.stringify(mockConfig));

      const result = await configStorage.getConfig();

      expect(result.syncMode).toBe(SyncMode.Manual);
    });

    it('should return a copy of config', async () => {
      mockGetItem.mockResolvedValue(JSON.stringify(DEFAULT_SETTINGS));

      const result = await configStorage.getConfig();

      result.syncMode = SyncMode.Auto;
      const result2 = await configStorage.getConfig();

      expect(result2.syncMode).not.toBe(SyncMode.Auto);
    });
  });

  describe('credential-safe import and export', () => {
    it('redacts hydrated credentials from exported configuration', async () => {
      const storedConfig = {
        ...DEFAULT_SETTINGS,
        servers: [
          {
            type: 'syncclipboard',
            url: 'https://server.example.com',
            credentialRef: 'vault-primary',
          },
        ],
        activeServerIndex: 0,
      } as AppSettings;

      mockGetItem.mockImplementation((key: string) => {
        if (key === STORAGE_KEYS.CONFIG) {
          return Promise.resolve(JSON.stringify(storedConfig));
        }
        if (key === '@syncclipboard:schema_version') {
          return Promise.resolve('3');
        }
        return Promise.resolve(null);
      });
      mockGetCredential.mockResolvedValue({
        username: 'alice',
        password: 'secret',
      });

      const exported = JSON.parse(await configStorage.exportConfig());

      expect(exported.servers[0]).toEqual({
        type: 'syncclipboard',
        url: 'https://server.example.com',
        credentialRef: 'vault-primary',
      });
      expect(JSON.stringify(exported)).not.toContain('alice');
      expect(JSON.stringify(exported)).not.toContain('secret');
    });

    it('keeps the current config when imported config persistence fails', async () => {
      const storedConfig = {
        ...DEFAULT_SETTINGS,
        servers: [
          {
            type: 'syncclipboard',
            url: 'https://old.example.com',
            credentialRef: 'vault-old',
          },
        ],
        activeServerIndex: 0,
      } as AppSettings;

      mockGetItem.mockImplementation((key: string) => {
        if (key === STORAGE_KEYS.CONFIG) {
          return Promise.resolve(JSON.stringify(storedConfig));
        }
        if (key === '@syncclipboard:schema_version') {
          return Promise.resolve('3');
        }
        return Promise.resolve(null);
      });
      mockGetCredential.mockResolvedValue({
        username: 'old-user',
        password: 'old-password',
      });

      await configStorage.initialize();
      mockSetItem.mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(
        configStorage.importConfig(
          JSON.stringify({
            ...DEFAULT_SETTINGS,
            servers: [
              {
                type: 'syncclipboard',
                url: 'https://new.example.com',
                username: 'new-user',
                password: 'new-password',
              },
            ],
            activeServerIndex: 0,
          })
        )
      ).rejects.toThrow('Invalid config JSON');

      const servers = await configStorage.getServers();
      expect(servers[0].url).toBe('https://old.example.com');
      expect(servers[0].credentialRef).toBe('vault-old');
      expect(mockDeleteCredential).not.toHaveBeenCalledWith('vault-old');
      expect(mockDeleteCredential).toHaveBeenCalledWith('vault-new-user');
    });
  });

  describe('updateConfig', () => {
    it('should update config and save', async () => {
      mockGetItem.mockResolvedValue(JSON.stringify(DEFAULT_SETTINGS));
      mockSetItem.mockResolvedValue(undefined);

      await configStorage.updateConfig({ syncMode: SyncMode.Auto });

      expect(mockSetItem).toHaveBeenCalled();
      expect(mockSetItem).toHaveBeenCalledWith(CONFIG_USER_STATE_KEY, '1');
    });
  });

  it('moves legacy plaintext credentials to the vault before rewriting configuration', async () => {
    mockGetItem.mockImplementation((key: string) =>
      Promise.resolve(
        key === STORAGE_KEYS.CONFIG
          ? JSON.stringify({
              ...DEFAULT_SETTINGS,
              servers: [
                {
                  type: 'syncclipboard',
                  url: 'https://server.example.com',
                  username: 'alice',
                  password: 'secret',
                },
              ],
              activeServerIndex: 0,
            })
          : null
      )
    );

    await configStorage.initialize();

    const stored = JSON.parse(
      mockSetItem.mock.calls.find(([key]) => key === STORAGE_KEYS.CONFIG)?.[1]
    );
    expect(stored.servers[0]).toEqual({
      type: 'syncclipboard',
      url: 'https://server.example.com',
      credentialRef: 'vault-alice',
    });
    expect(JSON.stringify(stored)).not.toContain('secret');
  });

  describe('resetConfig', () => {
    it('should reset to default config', async () => {
      mockGetItem.mockResolvedValue(JSON.stringify(DEFAULT_SETTINGS));
      mockSetItem.mockResolvedValue(undefined);

      await configStorage.resetConfig();

      expect(mockSetItem).toHaveBeenCalledWith(
        STORAGE_KEYS.CONFIG,
        JSON.stringify(DEFAULT_SETTINGS)
      );
      expect(mockSetItem).toHaveBeenCalledWith(CONFIG_USER_STATE_KEY, '1');
    });
  });

  describe('Server Management', () => {
    beforeEach(async () => {
      const mockConfig: AppSettings = {
        ...DEFAULT_SETTINGS,
        servers: [{ type: 'syncclipboard', url: 'https://server1.com' }],
        activeServerIndex: 0,
      };
      mockGetItem.mockResolvedValue(JSON.stringify(mockConfig));
      await configStorage.initialize();
    });

    describe('getServers', () => {
      it('should return all servers', async () => {
        const servers = await configStorage.getServers();

        expect(servers).toHaveLength(1);
        expect(servers[0].url).toBe('https://server1.com');
      });

      it('should return a copy of servers array', async () => {
        const servers = await configStorage.getServers();
        servers.push({ type: 'webdav', url: 'https://server2.com' });

        const servers2 = await configStorage.getServers();
        expect(servers2).toHaveLength(1);
      });
    });

    describe('getActiveServer', () => {
      it('should return active server', async () => {
        const server = await configStorage.getActiveServer();

        expect(server).not.toBeNull();
        expect(server?.url).toBe('https://server1.com');
      });

      it('should return null if no active server', async () => {
        mockGetItem.mockResolvedValue(
          JSON.stringify({ ...DEFAULT_SETTINGS, servers: [], activeServerIndex: -1 })
        );
        const privateProps = getPrivate(configStorage);
        privateProps.initialized = false;
        await configStorage.initialize();

        const server = await configStorage.getActiveServer();

        expect(server).toBeNull();
      });
    });

    describe('addServer', () => {
      it('should add server and return index', async () => {
        const newServer: ServerConfig = { type: 'syncclipboard', url: 'https://server2.com' };
        mockSetItem.mockResolvedValue(undefined);

        const index = await configStorage.addServer(newServer);

        expect(index).toBe(1);
      });

      it('should auto-activate first server', async () => {
        const newServer: ServerConfig = { type: 'syncclipboard', url: 'https://server2.com' };
        mockGetItem.mockResolvedValue(
          JSON.stringify({ ...DEFAULT_SETTINGS, servers: [], activeServerIndex: -1 })
        );
        const privateProps = getPrivate(configStorage);
        privateProps.initialized = false;
        await configStorage.initialize();
        mockSetItem.mockResolvedValue(undefined);

        await configStorage.addServer(newServer);

        const server = await configStorage.getActiveServer();
        expect(server).not.toBeNull();
      });
    });

    describe('updateServer', () => {
      it('should update server at index', async () => {
        mockSetItem.mockResolvedValue(undefined);

        await configStorage.updateServer(0, { url: 'https://updated.com' });

        const servers = await configStorage.getServers();
        expect(servers[0].url).toBe('https://updated.com');
      });

      it('should throw error for invalid index', async () => {
        await expect(configStorage.updateServer(99, { url: 'https://test.com' })).rejects.toThrow(
          'Invalid server index'
        );
      });
    });

    describe('deleteServer', () => {
      it('should delete server at index', async () => {
        mockSetItem.mockResolvedValue(undefined);

        await configStorage.deleteServer(0);

        const servers = await configStorage.getServers();
        expect(servers).toHaveLength(0);
      });

      it('should adjust active index when deleting active server', async () => {
        mockSetItem.mockResolvedValue(undefined);

        await configStorage.deleteServer(0);

        const config = await configStorage.getConfig();
        expect(config.activeServerIndex).toBe(-1);
      });

      it('should throw error for invalid index', async () => {
        await expect(configStorage.deleteServer(99)).rejects.toThrow('Invalid server index');
      });

      it('keeps the old configuration and credential when config persistence fails', async () => {
        const privateProps = getPrivate(configStorage);
        privateProps.config!.servers[0].credentialRef = 'vault-primary';
        mockSetItem.mockRejectedValue(new Error('storage unavailable'));

        await expect(configStorage.deleteServer(0)).rejects.toThrow('storage unavailable');

        expect((await configStorage.getServers())[0].credentialRef).toBe('vault-primary');
        expect(mockDeleteCredential).not.toHaveBeenCalled();
      });
    });

    it('cleans up a newly created credential when config persistence fails', async () => {
      const privateProps = getPrivate(configStorage);
      privateProps.config!.servers[0].credentialRef = 'vault-primary';
      mockPutCredential.mockResolvedValue('vault-new');
      mockSetItem.mockRejectedValue(new Error('storage unavailable'));

      await expect(
        configStorage.updateServer(0, { username: 'new-user', password: 'new-password' })
      ).rejects.toThrow('storage unavailable');

      expect(mockDeleteCredential).toHaveBeenCalledWith('vault-new');
      expect((await configStorage.getServers())[0].credentialRef).toBe('vault-primary');
    });

    it('does not write config when the vault write fails', async () => {
      mockPutCredential.mockRejectedValue(new Error('vault unavailable'));
      mockSetItem.mockClear();

      await expect(
        configStorage.updateServer(0, { username: 'new-user', password: 'new-password' })
      ).rejects.toThrow('vault unavailable');

      expect(mockSetItem).not.toHaveBeenCalledWith(STORAGE_KEYS.CONFIG, expect.any(String));
    });

    describe('setActiveServer', () => {
      it('should set active server index', async () => {
        mockGetItem.mockResolvedValue(
          JSON.stringify({
            ...DEFAULT_SETTINGS,
            servers: [
              { type: 'syncclipboard', url: 'https://server1.com' },
              { type: 'webdav', url: 'https://server2.com' },
            ],
            activeServerIndex: 0,
          })
        );
        const privateProps = getPrivate(configStorage);
        privateProps.initialized = false;
        await configStorage.initialize();
        mockSetItem.mockResolvedValue(undefined);

        await configStorage.setActiveServer(1);

        const config = await configStorage.getConfig();
        expect(config.activeServerIndex).toBe(1);
      });
    });
  });
});
