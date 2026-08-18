/**
 * Google Drive. OAuth2 with a refresh token held in the credential store.
 * Resumable uploads are required here — Drive's simple upload path is unsuitable
 * for archives of the size this tool produces.
 * Settings: { folderId, clientId }.
 */
export const provider = {} as unknown;
