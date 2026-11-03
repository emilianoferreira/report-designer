using Microsoft.EntityFrameworkCore;

namespace ReportDesigner.Infrastructure.Persistence;

// The SQL scripts remain the schema authority. Entity mappings arrive with each feature.
public sealed class ReportDesignerDbContext(DbContextOptions<ReportDesignerDbContext> options)
    : DbContext(options);
