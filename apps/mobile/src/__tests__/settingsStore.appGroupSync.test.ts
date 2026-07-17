import AsyncStorage from '@react-native-async-storage/async-storage';
import { putCredential, saveServers, saveSettings } from 'app-group-store';
import { ConfigStorage } from '../services/ConfigStorage';
import { useSettingsStore } from '../stores/settingsStore';

jest.mock('app-group-store', () => ({
  getServers: jest.fn().mockResolvedValue({ configs: [], activeConfigId: null }),
  getSettings: jest.fn().mockResolvedValue({}),
  saveServers: jest.fn().mockResolvedValue(undefined),
  saveSettings: jest.fn().mockResolvedValue(undefined),
  putCredential: jest.fn().mockResolvedValue('vault-primary'),
  getCredential: jest.fn().mockResolvedValue(null),
  deleteCredential: jest.fn().mockResolvedValue(undefined),
}));

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

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;
const mockSaveServers = saveServers as jest.Mock;
const mockSaveSettings = saveSettings as jest.Mock;
const mockPutCredential = putCredential as jest.Mock;

describe('settings store App Group writes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItem.mockResolvedValue(null);
    mockSetItem.mockResolvedValue(undefined);
    mockPutCredential.mockResolvedValue('vault-primary');

    const storage = ConfigStorage.getInstance() as unknown as {
      initialized: boolean;
      config: unknown;
    };
    storage.initialized = false;
    storage.config = null;

    useSettingsStore.setState({
      config: null,
      isLoaded: false,
      isSaving: false,
      error: null,
      isTempDisabledBackgroundTasks: false,
    });
  });

  it('writes the added server to the App Group before addServer resolves on iOS', async () => {
    await useSettingsStore.getState().addServer({
      type: 'syncclipboard',
      name: 'Primary',
      url: 'https://server.example.com/',
      username: 'alice',
      password: 'secret',
    });

    expect(mockSaveServers).toHaveBeenCalledWith({
      configs: [
        {
          id: 'https://server.example.com',
          name: 'Primary',
          urls: ['https://server.example.com'],
          credentialRef: 'vault-primary',
        },
      ],
      activeConfigId: 'https://server.example.com',
    });
    expect(mockSaveSettings).toHaveBeenCalled();
  });
});
