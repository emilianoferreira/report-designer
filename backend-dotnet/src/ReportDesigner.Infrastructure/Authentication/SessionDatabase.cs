using System.Data.Common;

namespace ReportDesigner.Infrastructure.Authentication;

// Only connection/SQL differences live here; password and session policy remain shared.
public sealed class SessionDatabase(Func<DbConnection> connect, bool mysql)
{
    public DbConnection CreateConnection() => connect();
    public string Now => mysql ? "UTC_TIMESTAMP(6)" : "now()";
    public string LoginCounterSql => mysql ? """
        INSERT INTO auth_login_limits(key_hash,attempts,window_start) VALUES(@p0,1,UTC_TIMESTAMP(6))
        ON DUPLICATE KEY UPDATE
        attempts=CASE WHEN window_start<UTC_TIMESTAMP(6)-INTERVAL 15 MINUTE THEN 1 ELSE attempts+1 END,
        window_start=CASE WHEN window_start<UTC_TIMESTAMP(6)-INTERVAL 15 MINUTE THEN UTC_TIMESTAMP(6) ELSE window_start END
        """ : """
        INSERT INTO auth_login_limits(key_hash,attempts,window_start) VALUES(@p0,1,now())
        ON CONFLICT(key_hash) DO UPDATE SET
        attempts=CASE WHEN auth_login_limits.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_login_limits.attempts+1 END,
        window_start=CASE WHEN auth_login_limits.window_start<now()-interval '15 minutes' THEN now() ELSE auth_login_limits.window_start END
        """;

    public DbCommand Command(DbConnection connection, string sql, params object[] values)
    {
        var command = connection.CreateCommand(); command.CommandText = sql;
        for (var i = 0; i < values.Length; i++)
        {
            var parameter = command.CreateParameter(); parameter.ParameterName = "p" + i;
            parameter.Value = mysql && values[i] is Guid id ? id.ToString() : values[i];
            command.Parameters.Add(parameter);
        }
        return command;
    }

    public static Guid GuidAt(DbDataReader reader, int index) => reader.GetValue(index) is Guid id ? id : Guid.Parse(reader.GetString(index));
}
