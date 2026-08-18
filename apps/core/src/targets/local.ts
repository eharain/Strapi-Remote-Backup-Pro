import type { TargetProvider } from './contract.js';

/** Local or network-mounted folder. Settings: { directory }. */
export const provider: TargetProvider = {
  kind: 'local',
  create: async () => {
    throw new Error('The local target provider is not implemented yet.');
  },
};
