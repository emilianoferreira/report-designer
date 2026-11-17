using System.Globalization;
namespace ReportDesigner.Infrastructure.LabelPrinting;

public sealed record DemoLabelItem(int Number, string Name, decimal? Principal, decimal? Wholesale, bool Active = true, string TaxTreatment = "included")
{
    public string Code => "DEMO-" + Number.ToString("D3", CultureInfo.InvariantCulture);
    // Synthetic internal-use numbers, not assigned retail product identifiers.
    public string Barcode {
        get {
            var body = "200" + Number.ToString("D9", CultureInfo.InvariantCulture);
            var sum = body.Select((digit, index) => (digit - '0') * (index % 2 == 0 ? 1 : 3)).Sum();
            return body + ((10 - sum % 10) % 10).ToString(CultureInfo.InvariantCulture);
        }
    }
}

public sealed class DemoLabelCatalog(IReadOnlyList<DemoLabelItem> items)
{
    public IReadOnlyList<DemoLabelItem> Items { get; } = items.ToArray();
    public static DemoLabelCatalog Default { get; } = new([
        new(1, "Arroz blanco 1 kg", 65m, 52m),
        new(2, "Azúcar blanca 1 kg", 58m, 46m),
        new(3, "Aceite de girasol 900 ml", 115m, 95m),
        new(4, "Yerba mate 1 kg", 210m, 175m),
        new(5, "Fideos secos 500 g", 49m, 39m),
        new(6, "Café molido 250 g", 185m, 155m),
        new(7, "Harina de trigo 1 kg", 55m, 44m),
        new(8, "Sal fina 500 g", 32m, 25m),
        new(9, "Leche entera 1 l", 48m, 41m),
        new(10, "Galletas de agua 200 g", 69m, 55m),
        new(11, "Galletas dulces 250 g", 85m, 68m),
        new(12, "Puré de tomate 500 g", 62m, 50m),
        new(13, "Lentejas secas 500 g", 95m, 78m),
        new(14, "Porotos negros 500 g", 110m, 90m),
        new(15, "Atún al natural 170 g", 125m, 105m),
        new(16, "Dulce de leche 400 g", 155m, 130m),
        new(17, "Mermelada de frutilla 450 g", 145m, 120m),
        new(18, "Cacao en polvo 200 g", 130m, 108m),
        new(19, "Té negro 25 saquitos", 79m, 64m),
        new(20, "Agua mineral 2 l", 59m, 48m),
        new(21, "Jugo de naranja 1 l", 89m, 72m),
        new(22, "Avena arrollada 500 g", 92m, 75m),
        new(23, "Polenta 500 g", 45m, 36m),
        new(24, "Mayonesa 500 g", 120m, 99m),
        new(25, "Vinagre de alcohol 1 l", 60m, 48m),
        new(26, "Detergente 750 ml", 98m, 80m),
        new(27, "Jabón de tocador 90 g", 42m, 33m),
        new(28, "Papel higiénico 4 rollos", 135m, 110m),
        new(29, "Servilletas 100 unidades", 55m, 43m),
        new(30, "Esponja de cocina 2 unidades", 48m, 38m)
    ]);
    public static string Logo { get; } = "data:image/svg+xml;charset=utf-8," + Uri.EscapeDataString(
        "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='100' viewBox='0 0 240 100'><rect width='240' height='100' rx='12' fill='#66164b'/><text x='120' y='45' text-anchor='middle' font-family='Arial' font-size='25' fill='white'>ALMACÉN DEMO</text><text x='120' y='75' text-anchor='middle' font-family='Arial' font-size='16' fill='white'>DATOS FICTICIOS</text></svg>");
}
