namespace StrapiBackup.Sidecar;

/// <summary>
/// Owns the lifetime of the Node engine process.
/// </summary>
/// <remarks>
/// <para>
/// The engine is launched as <c>strapi-backup serve --port 0 --parent-pid &lt;pid&gt;</c>.
/// It binds to an OS-assigned port and prints a single line of JSON to stdout —
/// <c>{"port":54123,"token":"..."}</c> — after which this class stops reading stdout
/// and speaks HTTP for everything else.
/// </para>
/// <para>
/// Nothing here ever parses human-readable output. That coupling breaks the first
/// time someone rewords a log message, and it fails in a way that looks like a
/// hang rather than an error. Logs arrive on stderr and are forwarded to the app
/// log untouched.
/// </para>
/// <para>
/// Shutdown is the part that matters most. This process holds live admin
/// credentials for the user's CMS, so an orphaned engine is a security problem,
/// not just a stray process. Two independent guarantees cover it: the engine
/// watches <c>--parent-pid</c> and exits when the parent disappears, and on
/// Windows this class puts the child in a Job Object with
/// <c>KILL_ON_JOB_CLOSE</c> so even a hard kill of the app takes the engine with it.
/// </para>
/// </remarks>
public sealed class CoreProcessSupervisor : IAsyncDisposable
{
    /// <summary>What the engine prints on stdout at startup, and nothing else.</summary>
    public sealed record Handshake(int Port, string Token);

    /// <summary>
    /// Starts the engine and waits for the handshake line.
    /// </summary>
    /// <remarks>
    /// A missing handshake within the timeout means the engine crashed on
    /// startup — a corrupt install, a blocked port range, an antivirus
    /// quarantine. Whatever the engine wrote to stderr is surfaced with the
    /// failure, because "the app didn't start" is otherwise unactionable for
    /// the user and for support.
    /// </remarks>
    public Task<Handshake> StartAsync(CancellationToken ct = default)
        => throw new NotImplementedException();

    /// <summary>
    /// Restarts the engine if it dies unexpectedly, with backoff.
    /// </summary>
    /// <remarks>
    /// A restart abandons any in-flight job: job state lives in the engine, so a
    /// crash mid-backup cannot be resumed by simply reconnecting. The UI is told
    /// the run was lost rather than being left showing a progress bar that will
    /// never move.
    /// </remarks>
    public Task<bool> EnsureRunningAsync(CancellationToken ct = default)
        => throw new NotImplementedException();

    public ValueTask DisposeAsync() => throw new NotImplementedException();
}
