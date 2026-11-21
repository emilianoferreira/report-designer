using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ReportDesigner.Application.LabelPrinting;
namespace ReportDesigner.Infrastructure.LabelPrinting;
public static class LabelPrintingRegistration
{
    public static IServiceCollection AddLabelPrinting(this IServiceCollection services, IConfiguration configuration, IHostEnvironment environment)
    {
        var provider = configuration["LabelPrinting:Provider"] ?? "Disabled";
        if (provider != "Disabled" && provider != "Demo") throw new InvalidOperationException("LabelPrinting:Provider must be Disabled or Demo.");
        if (provider == "Demo" && !environment.IsDevelopment() && !environment.IsEnvironment("Testing"))
            throw new InvalidOperationException("The demo label provider is restricted to Development and Testing.");
        services.AddScoped<LabelPrintService>();
        if (provider == "Demo") {
            services.AddSingleton(DemoLabelCatalog.Default);
            services.AddScoped<DemoLabelSource>();
            services.AddScoped<ILabelCatalogSource>(sp => sp.GetRequiredService<DemoLabelSource>());
            services.AddScoped<ILabelPriceSource>(sp => sp.GetRequiredService<DemoLabelSource>());
        } else {
            services.AddScoped<DisabledLabelSource>();
            services.AddScoped<ILabelCatalogSource>(sp => sp.GetRequiredService<DisabledLabelSource>());
            services.AddScoped<ILabelPriceSource>(sp => sp.GetRequiredService<DisabledLabelSource>());
        }
        return services;
    }
}
internal sealed class DisabledLabelSource : ILabelCatalogSource, ILabelPriceSource
{
    public Task<LabelPrintContext> ContextAsync(CancellationToken ct) { ct.ThrowIfCancellationRequested(); return Task.FromResult(new LabelPrintContext("disabled", false, null)); }
    private static LabelPrintException Unavailable() => new(503, "provider_unavailable", "Label data provider unavailable.");
    public Task<Page<PriceListSummary>> ListsAsync(string? cursor, int pageSize, CancellationToken ct) => throw Unavailable();
    public Task<Page<ArticleSummary>> SearchAsync(string query, string priceListId, string? cursor, int pageSize, CancellationToken ct) => throw Unavailable();
    public Task<ResolvedPrintSnapshot> ResolveAsync(string priceListId, IReadOnlyList<string> articleIds, CancellationToken ct) => throw Unavailable();
}
