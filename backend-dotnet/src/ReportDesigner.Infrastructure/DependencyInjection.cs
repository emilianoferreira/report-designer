using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using ReportDesigner.Infrastructure.Persistence;
using ReportDesigner.Application.Templates;
using ReportDesigner.Infrastructure.Templates;

namespace ReportDesigner.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Postgres");
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("Configure ConnectionStrings:Postgres before starting the API.");

        NpgsqlConnectionStringBuilder settings;
        try { settings = new NpgsqlConnectionStringBuilder(connectionString); }
        catch (ArgumentException) { throw new InvalidOperationException("ConnectionStrings:Postgres is invalid."); }

        if (string.IsNullOrWhiteSpace(settings.Host) || string.IsNullOrWhiteSpace(settings.Database)
            || string.IsNullOrWhiteSpace(settings.Username))
            throw new InvalidOperationException("ConnectionStrings:Postgres requires Host, Database and Username.");

        services.AddDbContext<ReportDesignerDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<ITemplateQueries, EfTemplateQueries>();
        services.AddHealthChecks().AddCheck<PostgresHealthCheck>("postgres", tags: ["ready"]);
        return services;
    }
}
