import type { TargetProvider } from './contract.js';

/** Plain FTP and FTPS. Offered because a lot of shared hosting still only has
 *  this; FTPS is the default and unencrypted FTP requires an explicit opt-in,
 *  since the archive may hold an entire content database. */
export const provider: TargetProvider = {
  kind: 'ftp',
  create: async () => {
    throw new Error('The ftp target provider is not implemented yet.');
  },
};
