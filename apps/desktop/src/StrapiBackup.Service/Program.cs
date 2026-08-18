using Microsoft.Extensions.Hosting;

namespace StrapiBackup.Service;

/// <summary>
/// Background host — a Windows Service or a systemd unit.
/// </summary>
/// <remarks>
/// Thin by design. Scheduling lives in the engine so that CLI users on headless
/// servers get it too and there is only one scheduler to keep correct. This host
/// supervises the engine process, exposes its state to the desktop app, and
/// handles OS service semantics — start, stop, restart-on-failure, and log
/// destination. It does not decide when a backup runs.
/// </remarks>
internal static class Program
{
    private static Task Main(string[] args) =>
        Host.CreateApplicationBuilder(args)
            .Build()
            .RunAsync();
}
