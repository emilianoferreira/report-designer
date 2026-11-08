using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using ReportDesigner.Infrastructure;
using ReportDesigner.Api.Compatibility;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using ReportDesigner.Api.Authentication;
using ReportDesigner.Application.Common;
using ReportDesigner.Infrastructure.Authentication;
using System.Security.Claims;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var maxRequestBodyBytes = builder.Configuration.GetValue<long?>("Http:MaxRequestBodyBytes");
if (maxRequestBodyBytes is <= 0) throw new InvalidOperationException("Http:MaxRequestBodyBytes must be positive.");
if (maxRequestBodyBytes.HasValue)
    builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = maxRequestBodyBytes.Value);
builder.Services.AddControllers().AddJsonOptions(options =>
{
    // Wire names will be explicit on DTOs. Never rewrite arbitrary editor JSON keys.
    options.JsonSerializerOptions.PropertyNamingPolicy = null;
    options.JsonSerializerOptions.DictionaryKeyPolicy = null;
    options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
    options.JsonSerializerOptions.NumberHandling = JsonNumberHandling.Strict;
});
builder.Services.AddInfrastructure(builder.Configuration);
builder.Services.AddScoped<LegacyApiExceptionFilter>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICompanyContext, CompanyContext>();
builder.Services.AddAuthentication("Session").AddScheme<AuthenticationSchemeOptions, SessionAuthentication>("Session", _ => { });
builder.Services.AddAuthorization(options => options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
builder.Services.AddHttpClient("fiscal-advice", client =>
{
    client.Timeout = TimeSpan.FromSeconds(15);
    client.MaxResponseContentBufferSize = 64 * 1024;
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false, UseCookies = false });
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("fiscal-advice", context => RateLimitPartition.GetFixedWindowLimiter(
        context.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 6, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers.CacheControl = "no-store";
    try { await next(); }
    catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
    catch (Exception exception) when (!context.Response.HasStarted)
    {
        app.Logger.LogError(exception, "API authentication or request failed.");
        context.Response.Clear();
        context.Response.StatusCode = 500;
        context.Response.Headers.CacheControl = "no-store";
        await context.Response.WriteAsJsonAsync(new { statusCode = 500, message = "Internal server error" });
    }
});
app.UseAuthentication();
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true && !HttpMethods.IsGet(context.Request.Method)
        && !HttpMethods.IsHead(context.Request.Method) && !HttpMethods.IsOptions(context.Request.Method)
        && context.Request.Path != "/api/auth/login")
    {
        var session = (AuthSession)context.Items["session"]!;
        if (context.Request.Headers["X-CSRF-Token"] != session.CsrfToken || context.Request.Headers["Sec-Fetch-Site"] == "cross-site"
            || (context.Request.Path.StartsWithSegments("/api/templates") && session.Role != "editor"))
        { await SessionAuthentication.Error(context, 403); return; }
    }
    await next();
});
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();
app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") }).AllowAnonymous();

// The original contract is retained in Git; Development exposes its authenticated successor.
if (app.Environment.IsDevelopment())
    app.MapGet("/reference/openapi.json", () => Results.File(
        Path.Combine(AppContext.BaseDirectory, "contracts", "openapi.auth.json"), "application/json")).AllowAnonymous();
else app.MapGet("/reference/openapi.json", () => Results.NotFound()).AllowAnonymous();

app.Run();
