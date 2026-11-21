using Microsoft.EntityFrameworkCore;
using ReportDesigner.Application.Invoices;

namespace ReportDesigner.Infrastructure.Persistence;

// Explicit SQL scripts own the schema. No automatic migrations or EnsureCreated.
public sealed class MySqlReportDesignerDbContext(DbContextOptions<MySqlReportDesignerDbContext> options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var header = modelBuilder.Entity<InvoiceDataHeader>();
        header.HasNoKey();
        // Oracle returns DATE as DateTime; preserve the date-only public contract.
        header.Property(x => x.CaeFechaVto).HasConversion(
            value => value.HasValue ? value.Value.ToDateTime(TimeOnly.MinValue) : (DateTime?)null,
            value => value.HasValue ? DateOnly.FromDateTime(value.Value) : (DateOnly?)null)
            .HasColumnType("date");
    }
}
