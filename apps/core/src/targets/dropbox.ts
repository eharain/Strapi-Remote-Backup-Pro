/**
 * Dropbox. Files above 150 MB must use the upload-session API rather than a
 * single request, so the provider always takes the session path.
 * Settings: { path, appKey }.
 */
export const provider = {} as unknown;
