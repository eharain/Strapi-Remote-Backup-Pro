namespace StrapiBackup.Core.Client.Http;

/// <summary>
/// Reads a job's Server-Sent Events stream as an async sequence.
/// </summary>
/// <remarks>
/// Reconnects with <c>Last-Event-ID</c> so a dropped connection resumes the run's
/// history rather than losing the events that arrived while it was down — the
/// progress log is the only record the user has of a long backup.
/// </remarks>
public sealed class JobEventStream
{
    public IAsyncEnumerable<object> ReadAsync(string jobId, CancellationToken ct = default)
        => throw new NotImplementedException();
}
