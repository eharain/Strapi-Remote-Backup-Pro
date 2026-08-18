using Microsoft.Extensions.Hosting;

namespace StrapiBackup.Service;

/// <summary>Keeps the engine running for as long as the service is running.</summary>
internal sealed class EngineHostedService : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken)
        => throw new NotImplementedException();
}
