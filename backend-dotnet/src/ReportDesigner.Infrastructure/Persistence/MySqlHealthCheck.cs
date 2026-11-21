using Microsoft.Extensions.Diagnostics.HealthChecks;
using ReportDesigner.Infrastructure.Authentication;

namespace ReportDesigner.Infrastructure.Persistence;

internal sealed class MySqlHealthCheck(SessionDatabase database) : IHealthCheck
{
    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = database.CreateConnection(); await connection.OpenAsync(cancellationToken);
            await using var command = database.Command(connection,
                "SELECT 1 FROM auth_users,auth_memberships,auth_sessions,auth_login_limits LIMIT 0");
            await command.ExecuteNonQueryAsync(cancellationToken);
            command.CommandText = "SELECT id,company_id,version,template_json,based_on,updated_at FROM report_templates LIMIT 0";
            await command.ExecuteNonQueryAsync(cancellationToken);
            command.CommandText = "SELECT 1 FROM invoices,invoice_types,invoice_lines,invoice_taxes,companies,contacts,branches,currencies LIMIT 0";
            await command.ExecuteNonQueryAsync(cancellationToken);
            return HealthCheckResult.Healthy();
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        { return HealthCheckResult.Unhealthy("MySQL unavailable."); }
    }
}
