using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using MySql.Data.MySqlClient;
using ReportDesigner.Infrastructure.Authentication;

// Explicit administrator tool, never invoked by API startup. Secrets arrive via stdin/environment.
try
{
    var settings = new MySqlConnectionStringBuilder(Environment.GetEnvironmentVariable("AUTH_MYSQL_CONNECTION"));
    if (string.IsNullOrWhiteSpace(settings.Database) || string.IsNullOrWhiteSpace(settings.UserID)
        || settings.SslMode is not (MySqlSslMode.VerifyCA or MySqlSslMode.VerifyFull))
        throw new InvalidOperationException("Provide an explicit MySQL administrator connection with verified TLS.");
    var buffer = new char[65537]; var length = 0;
    while (length < buffer.Length)
    {
        var count = await Console.In.ReadAsync(buffer.AsMemory(length)); if (count == 0) break; length += count;
    }
    if (length > 65536) throw new InvalidOperationException("Input too large.");
    var body = JsonSerializer.Deserialize<Provision>(new string(buffer, 0, length)) ?? throw new InvalidOperationException("Missing input.");
    var email = body.email?.Trim().ToLowerInvariant();
    if (string.IsNullOrWhiteSpace(email) || email.Length > 254 || body.password is null || body.password.Length is < 12 or > 1024
        || body.companies is null || body.companies.Length == 0
        || body.companies.Any(c => c.id == Guid.Empty || c.role is not ("editor" or "viewer")))
        throw new InvalidOperationException("Invalid user or memberships.");
    var salt = RandomNumberGenerator.GetBytes(16);
    var hash = Rfc2898DeriveBytes.Pbkdf2(body.password, salt, 600_000, HashAlgorithmName.SHA256, 32);
    var database = new SessionDatabase(() => new MySqlConnection(settings.ConnectionString), true);
    await using var connection = database.CreateConnection(); await connection.OpenAsync();
    await using var transaction = await connection.BeginTransactionAsync(IsolationLevel.ReadCommitted);
    async Task<object?> Sql(string sql, params object[] values)
    {
        await using var command = database.Command(connection, sql, values); command.Transaction = transaction;
        return await command.ExecuteScalarAsync();
    }
    await Sql("""
        INSERT INTO auth_users(id,email,password_salt,password_hash) VALUES(@p0,@p1,@p2,@p3)
        ON DUPLICATE KEY UPDATE password_salt=@p2,password_hash=@p3,active=true
        """, Guid.NewGuid(), email, Convert.ToHexStringLower(salt), Convert.ToHexStringLower(hash));
    var id = Guid.Parse(Convert.ToString(await Sql("SELECT id FROM auth_users WHERE email=@p0", email))!);
    await Sql("DELETE FROM auth_sessions WHERE user_id=@p0", id);
    await Sql("DELETE FROM auth_memberships WHERE user_id=@p0", id);
    foreach (var company in body.companies)
    {
        await Sql("""
            INSERT INTO auth_memberships(user_id,company_id,role)
            SELECT @p0,id,@p2 FROM companies WHERE id=@p1 AND activo
            """, id, company.id, company.role);
        if (Convert.ToInt32(await Sql("SELECT ROW_COUNT()")) != 1)
            throw new InvalidOperationException("Company does not exist or is inactive.");
    }
    await transaction.CommitAsync();
    Console.WriteLine("User provisioned: " + id);
}
catch
{
    // Do not print input, passwords, SQL parameters or administrator connection details.
    Console.Error.WriteLine("Provisioning failed. Check input, memberships and administrator connectivity; changes were not committed.");
    Environment.ExitCode = 1;
}

sealed record Provision(string? email, string? password, Company[]? companies);
sealed record Company(Guid id, string role);
