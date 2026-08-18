import type { TargetProvider } from './contract.js';

/**
 * Dropbox. Files above 150 MB must use the upload-session API rather than a
 * single request, so the provider always takes the session path.
 * Settings: { path, appKey }.
 */
export const provider: TargetProvider = {
  kind: 'dropbox',
  create: async () => {
    throw new Error('The dropbox target provider is not implemented yet.');
  },
};
