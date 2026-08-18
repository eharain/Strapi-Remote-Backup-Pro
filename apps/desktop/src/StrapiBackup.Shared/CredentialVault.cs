namespace StrapiBackup.Shared;

/// <summary>
/// Stores target credentials and refresh tokens in the OS keystore.
/// </summary>
/// <remarks>
/// Windows DPAPI / Credential Manager, macOS Keychain, libsecret on Linux. This is
/// the main thing the native shell contributes that the engine cannot do for
/// itself, and the reason profiles carry a <c>secretRef</c> rather than a secret.
///
/// Strapi admin passwords are never stored here or anywhere else. They are used
/// once to obtain a JWT and then dropped. What lives in the vault is the
/// destination credentials — S3 keys, OAuth refresh tokens, SFTP private keys —
/// which are long-lived by nature and have to persist for scheduled runs to work
/// unattended.
/// </remarks>
public interface ICredentialVault
{
    Task<string?> GetAsync(string reference, CancellationToken ct = default);
    Task SetAsync(string reference, string secret, CancellationToken ct = default);
    Task RemoveAsync(string reference, CancellationToken ct = default);
}
