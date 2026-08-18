namespace StrapiBackup.Core.Client.Http;

/// <summary>
/// Typed client for the engine's localhost API.
/// </summary>
/// <remarks>
/// Every request carries the bearer token from the startup handshake. The base
/// address is always 127.0.0.1 on the handshake port — never a configurable host,
/// so a misconfiguration cannot point this at a remote machine.
///
/// The DTOs in <c>../Generated</c> are produced from the engine's JSON Schema by
/// <c>build/scripts/generate-csharp-dtos</c>. Do not hand-edit them, and do not add
/// hand-written parallel models: the whole point of the codegen step is that one
/// change to a zod schema cannot leave the two languages disagreeing.
/// </remarks>
public sealed class CoreApiClient
{
    public CoreApiClient(HttpClient http) => Http = http;

    private HttpClient Http { get; }

    public Task<object> ProbeAsync(object connection, CancellationToken ct = default)
        => throw new NotImplementedException();

    public Task<object> GetContentModelAsync(object connection, CancellationToken ct = default)
        => throw new NotImplementedException();

    public Task<string> StartBackupAsync(object request, CancellationToken ct = default)
        => throw new NotImplementedException();

    public Task<object> PlanRestoreAsync(object request, CancellationToken ct = default)
        => throw new NotImplementedException();

    public Task<string> StartRestoreAsync(object request, CancellationToken ct = default)
        => throw new NotImplementedException();

    public Task CancelJobAsync(string jobId, CancellationToken ct = default)
        => throw new NotImplementedException();
}
