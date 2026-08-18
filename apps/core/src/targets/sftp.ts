import type { TargetProvider } from './contract.js';

/** SFTP over SSH. Supports password and private-key auth, with the key held in
 *  the credential store. Settings: { host, port, username, remotePath }. */
export const provider: TargetProvider = {
  kind: 'sftp',
  create: async () => {
    throw new Error('The sftp target provider is not implemented yet.');
  },
};
