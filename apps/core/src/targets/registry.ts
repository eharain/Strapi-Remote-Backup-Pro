import type { TargetKind } from '../contracts/index.js';
import type { TargetProvider } from './contract.js';

/**
 * Providers register here rather than being imported directly by the runner.
 * Cloud SDKs are heavy, so registration is lazy — running a local backup should
 * not pull the AWS, Azure, Google, and Dropbox SDKs into memory.
 */
const providers = new Map<TargetKind, () => Promise<TargetProvider>>();

export function register(kind: TargetKind, load: () => Promise<TargetProvider>): void {
  providers.set(kind, load);
}

export async function resolve(kind: TargetKind): Promise<TargetProvider> {
  const load = providers.get(kind);
  if (!load) throw new Error(`No provider registered for target kind "${kind}"`);
  return load();
}

export function registerBuiltins(): void {
  register('local', async () => (await import('./local.js')).provider);
  register('s3', async () => (await import('./s3.js')).provider);
  register('azureBlob', async () => (await import('./azure-blob.js')).provider);
  register('googleDrive', async () => (await import('./google-drive.js')).provider);
  register('dropbox', async () => (await import('./dropbox.js')).provider);
  register('oneDrive', async () => (await import('./onedrive.js')).provider);
  register('sftp', async () => (await import('./sftp.js')).provider);
  register('ftp', async () => (await import('./ftp.js')).provider);
}
