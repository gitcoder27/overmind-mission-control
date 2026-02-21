import { createContext, useContext } from 'react';
import type { DataProvider } from './types';
import { createMockProvider } from './mock';
import { createLegacyProvider } from './legacy';
import { createApiProvider } from './api';

export type { DataProvider, ProviderCapabilities } from './types';

const providerName = import.meta.env.VITE_DATA_PROVIDER || 'mock';

function buildProvider(): DataProvider {
  switch (providerName) {
    case 'legacy':
      return createLegacyProvider();
    case 'api':
      return createApiProvider();
    case 'mock':
    default:
      return createMockProvider();
  }
}

const provider = buildProvider();

const DataProviderContext = createContext<DataProvider>(provider);

export const DataProviderProvider = DataProviderContext.Provider;

export function useDataProvider(): DataProvider {
  return useContext(DataProviderContext);
}

export { provider as dataProvider };
