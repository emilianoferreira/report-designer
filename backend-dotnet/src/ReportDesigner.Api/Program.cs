using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using ReportDesigner.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers().AddJsonOptions(options =>
{
    // Wire names will be explicit on DTOs. Never rewrite arbitrary editor JSON keys.
    options.JsonSerializerOptions.PropertyNamingPolicy = null;
    options.JsonSerializerOptions.DictionaryKeyPolicy = null;
    options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
    options.JsonSerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});
builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();
app.MapControllers();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") });

// This is the legacy reference, not a claim that these operations are implemented here.
if (app.Environment.IsDevelopment())
    app.MapGet("/reference/openapi.json", () => Results.File(
        Path.Combine(AppContext.BaseDirectory, "contracts", "openapi.json"), "application/json"));

app.Run();
