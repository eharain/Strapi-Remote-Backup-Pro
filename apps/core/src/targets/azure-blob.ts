import type { TargetProvider } from './contract.js';

/** Azure Blob Storage. Settings: { account, container, prefix? }. */
export const provider: TargetProvider = {
  kind: 'azureBlob',
  create: async () => {
    throw new Error('The azureBlob target provider is not implemented yet.');
  },
};
