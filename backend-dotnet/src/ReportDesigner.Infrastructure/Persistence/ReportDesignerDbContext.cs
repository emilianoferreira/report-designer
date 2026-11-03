using Microsoft.EntityFrameworkCore;
using ReportDesigner.Infrastructure.Persistence.Entities;

namespace ReportDesigner.Infrastructure.Persistence;

// The SQL scripts remain the schema authority. No automatic schema changes.
public sealed class ReportDesignerDbContext(DbContextOptions<ReportDesignerDbContext> options)
    : DbContext(options)
{
    internal DbSet<ReportTemplateRow> Templates => Set<ReportTemplateRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var template = modelBuilder.Entity<ReportTemplateRow>();
        template.ToTable("report_templates");
        template.HasKey(row => row.Id);
        template.Property(row => row.Id).HasColumnName("id");
        template.Property(row => row.CompanyId).HasColumnName("company_id");
        template.Property(row => row.Nombre).HasColumnName("nombre").HasMaxLength(200);
        template.Property(row => row.Descripcion).HasColumnName("descripcion");
        template.Property(row => row.Version).HasColumnName("version");
        template.Property(row => row.Autor).HasColumnName("autor").HasMaxLength(100);
        template.Property(row => row.Tags).HasColumnName("tags").HasColumnType("text[]");
        template.Property(row => row.Estado).HasColumnName("estado").HasMaxLength(20);
        template.Property(row => row.TemplateJson).HasColumnName("template_json").HasColumnType("jsonb");
        template.Property(row => row.BasedOn).HasColumnName("based_on");
        template.Property(row => row.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp with time zone");
        template.Property(row => row.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamp with time zone");
    }
}
