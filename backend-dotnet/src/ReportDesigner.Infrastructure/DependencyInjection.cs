using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using MySql.Data.MySqlClient;
using ReportDesigner.Infrastructure.Persistence;
using ReportDesigner.Application.Templates;
using ReportDesigner.Infrastructure.Templates;
using ReportDesigner.Application.Invoices;
using ReportDesigner.Infrastructure.Invoices;
using ReportDesigner.Infrastructure.Authentication;

namespace ReportDesigner.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var provider = configuration["Database:Provider"] ?? "Postgres";
        if (provider == "MySql")
        {
            MySqlConnectionStringBuilder mysql;
            try { mysql = new MySqlConnectionStringBuilder(configuration.GetConnectionString("MySql")); }
            catch (ArgumentException) { throw new InvalidOperationException("ConnectionStrings:MySql is invalid."); }
            if (string.IsNullOrWhiteSpace(mysql.Server) || string.IsNullOrWhiteSpace(mysql.Database)
                || string.IsNullOrWhiteSpace(mysql.UserID))
                throw new InvalidOperationException("ConnectionStrings:MySql requires Server, Database and User ID.");
            if (mysql.SslMode is not (MySqlSslMode.VerifyCA or MySqlSslMode.VerifyFull))
                throw new InvalidOperationException("MySQL requires TLS with VerifyCA or VerifyFull.");
            services.AddSingleton(new SessionDatabase(() => new MySqlConnection(mysql.ConnectionString), true));
            services.AddScoped<SessionStore>();
            services.AddHealthChecks().AddCheck<MySqlHealthCheck>("mysql", tags: ["ready"]);
            return services;
        }
        if (provider != "Postgres") throw new InvalidOperationException("Database:Provider must be Postgres or MySql.");
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
        services.AddSingleton(_ => NpgsqlDataSource.Create(connectionString));
        services.AddSingleton(sp => new SessionDatabase(() => sp.GetRequiredService<NpgsqlDataSource>().CreateConnection(), false));
        services.AddScoped<SessionStore>();
        services.AddScoped<ITemplateQueries, EfTemplateQueries>();
        services.AddScoped<ITemplateCommands, PostgresTemplateCommands>();
        services.AddScoped<IInvoiceQueries, PostgresInvoiceQueries>();
        services.AddHealthChecks().AddCheck<PostgresHealthCheck>("postgres", tags: ["ready"]);
        return services;
    }
}
