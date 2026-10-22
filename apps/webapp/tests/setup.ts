import { vi } from 'vitest';

// Default mock for sqlite-wasm-http in test environments (jsdom / Node.js)
// where browser Web Workers do not exist. Test suites specifically testing
// SQLite worker behavior (e.g. remote-catalog.test.ts) provide their own dedicated mock.
vi.mock('sqlite-wasm-http', () => {
  return {
    createSQLiteThread: async () => {
      const mockWorker = async (action: string, payload: any) => {
        if (action === 'open') return;
        if (action === 'close') return;
        if (action === 'exec') {
          return { result: { resultRows: [] } };
        }
        return {};
      };
      return mockWorker;
    }
  };
});

