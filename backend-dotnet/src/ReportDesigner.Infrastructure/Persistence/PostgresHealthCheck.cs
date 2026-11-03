using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace ReportDesigner.Infrastructure.Persistence;

internal sealed class PostgresHealthCheck(IServiceScopeFactory scopes) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ReportDesignerDbContext>();
        try
        {
            await db.Database.ExecuteSqlRawAsync("SELECT 1", cancellationToken);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            // Do not return SQL, credentials or connection details through the health endpoint.
            return HealthCheckResult.Unhealthy("PostgreSQL unavailable.");
        }
    }
}
