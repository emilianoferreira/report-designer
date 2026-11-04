using System.Security.Cryptography;
using System.Text;
using Npgsql;

namespace ReportDesigner.Infrastructure.Authentication;

public sealed record Membership(Guid Id, string Name, string Role);
public sealed record AuthSession(Guid UserId, string Email, Guid CompanyId, string Role, string CsrfToken, DateTime ExpiresAt);
public sealed record LoginResult(string Token, AuthSession Session);

// Opaque sessions are shared by both runtimes; only SHA-256 token hashes are persisted.
public sealed class SessionStore(NpgsqlDataSource source)
{
    public static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    public async Task<AuthSession?> FindAsync(string token, CancellationToken ct)
    {
        if (token.Length != 64 || !token.All(Uri.IsHexDigit)) return null;
        await using var command = source.CreateCommand("""
            SELECT u.id,u.email,s.company_id,m.role,s.csrf_token,s.expires_at
            FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id AND u.active
            JOIN auth_memberships m ON m.user_id=u.id AND m.company_id=s.company_id
            JOIN companies c ON c.id=s.company_id AND c.activo
            WHERE s.token_hash=$1 AND s.expires_at>now()
            """);
        command.Parameters.AddWithValue(Hash(token));
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? new(reader.GetGuid(0), reader.GetString(1), reader.GetGuid(2), reader.GetString(3), reader.GetString(4), reader.GetDateTime(5)) : null;
    }

    public async Task<IReadOnlyList<Membership>> CompaniesAsync(Guid userId, CancellationToken ct)
    {
        await using var command = source.CreateCommand("""
            SELECT c.id,c.nombre,m.role FROM auth_memberships m
            JOIN companies c ON c.id=m.company_id AND c.activo
            WHERE m.user_id=$1 ORDER BY c.id
            """);
        command.Parameters.AddWithValue(userId);
        await using var reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<Membership>();
        while (await reader.ReadAsync(ct)) rows.Add(new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2)));
        return rows;
    }

    public async Task<bool> AllowLoginAsync(string email, string remoteIp, CancellationToken ct)
    {
        var allowed = true;
        foreach (var (key, limit) in new[] { ("email:" + email, 10), ("ip:" + remoteIp, 100) })
        {
            await using var command = source.CreateCommand("""
                INSERT INTO auth_login_limits(key_hash,attempts,window_start) VALUES($1,1,now())
                ON CONFLICT(key_hash) DO UPDATE SET
                attempts=CASE WHEN auth_login_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_login_limits.attempts+1 END,
                window_start=CASE WHEN auth_login_limits.window_start<now()-interval '15 minutes' THEN now() ELSE auth_login_limits.window_start END
                RETURNING attempts
                """);
            command.Parameters.AddWithValue(Hash(key));
            allowed &= Convert.ToInt32(await command.ExecuteScalarAsync(ct)) <= limit;
        }
        return allowed;
    }

    public async Task<LoginResult?> LoginAsync(string email, string password, CancellationToken ct)
    {
        Guid userId = default;
        // Dummy credentials ensure the expensive hash is also evaluated for unknown users.
        var salt = new byte[16]; var expected = new byte[32];
        await using (var command = source.CreateCommand("SELECT id,password_salt,password_hash FROM auth_users WHERE email=$1 AND active"))
        {
            command.Parameters.AddWithValue(email);
            await using var reader = await command.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                userId = reader.GetGuid(0); salt = Convert.FromHexString(reader.GetString(1)); expected = Convert.FromHexString(reader.GetString(2));
            }
        }
        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, 600_000, HashAlgorithmName.SHA256, 32);
        if (!CryptographicOperations.FixedTimeEquals(expected, actual) || userId == Guid.Empty) return null;
        var companies = await CompaniesAsync(userId, ct);
        return companies.Count == 0 ? null : await CreateAsync(userId, companies[0].Id, ct);
    }

    public async Task<LoginResult> CreateAsync(Guid userId, Guid companyId, CancellationToken ct)
    {
        var token = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
        var csrf = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
        await using var command = source.CreateCommand("""
            INSERT INTO auth_sessions(token_hash,user_id,company_id,csrf_token)
            SELECT $1,u.id,m.company_id,$4 FROM auth_users u JOIN auth_memberships m ON m.user_id=u.id
            JOIN companies c ON c.id=m.company_id AND c.activo
            WHERE u.id=$2 AND u.active AND m.company_id=$3
            """);
        command.Parameters.AddWithValue(Hash(token)); command.Parameters.AddWithValue(userId);
        command.Parameters.AddWithValue(companyId); command.Parameters.AddWithValue(csrf);
        if (await command.ExecuteNonQueryAsync(ct) != 1) throw new InvalidOperationException("Membership unavailable.");
        return new(token, (await FindAsync(token, ct))!);
    }

    public async Task RevokeAsync(string token, CancellationToken ct)
    {
        await using var command = source.CreateCommand("DELETE FROM auth_sessions WHERE token_hash=$1");
        command.Parameters.AddWithValue(Hash(token));
        await command.ExecuteNonQueryAsync(ct);
    }
}
