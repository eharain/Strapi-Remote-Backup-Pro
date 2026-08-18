import type { TargetProvider } from './contract.js';

/** OneDrive / SharePoint via Microsoft Graph, using upload sessions.
 *  Settings: { driveId, folderPath, clientId, tenantId? }. */
export const provider: TargetProvider = {
  kind: 'oneDrive',
  create: async () => {
    throw new Error('The oneDrive target provider is not implemented yet.');
  },
};
