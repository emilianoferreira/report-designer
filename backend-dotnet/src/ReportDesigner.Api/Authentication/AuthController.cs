using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ReportDesigner.Api.Compatibility;
using ReportDesigner.Infrastructure.Authentication;

namespace ReportDesigner.Api.Authentication;

[ApiController, Route("api/auth"), ServiceFilter(typeof(LegacyApiExceptionFilter))]
public sealed class AuthController(SessionStore store, IConfiguration configuration, IWebHostEnvironment environment) : ControllerBase
{
    public sealed record LoginBody(string? email, string? password);
    public sealed record CompanyBody(Guid company_id);
    private AuthSession Session => (AuthSession)HttpContext.Items["session"]!;
    private string Token => Request.Cookies[SessionAuthentication.CookieName]!;
    private CookieOptions Cookie => new() { HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/",
        Secure = configuration.GetValue<bool?>("Auth:SecureCookie") ?? !environment.IsDevelopment(), MaxAge = TimeSpan.FromHours(8) };

    [AllowAnonymous, HttpPost("login")]
    public async Task<IActionResult> Login(LoginBody body, CancellationToken ct)
    {
        // Login CSRF: this custom header cannot be sent by a cross-origin HTML form.
        if (Request.Headers["X-CSRF-Token"] != "login" || Request.Headers["Sec-Fetch-Site"] == "cross-site") return Forbidden();
        var email = (body.email ?? "").Trim().ToLowerInvariant();
        if (email.Length is 0 or > 254 || body.password is null || body.password.Length > 1024) return UnauthorizedError();
        if (!await store.AllowLoginAsync(email, HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown", ct))
            return StatusCode(429, new { statusCode = 429, message = "Too many login attempts", error = "Too Many Requests" });
        var result = await store.LoginAsync(email, body.password, ct);
        if (result is null) return UnauthorizedError();
        if (Request.Cookies.TryGetValue(SessionAuthentication.CookieName, out var old)) await store.RevokeAsync(old, ct);
        Response.Cookies.Append(SessionAuthentication.CookieName, result.Token, Cookie);
        return Ok(await View(result.Session, ct));
    }

    [HttpGet("session")]
    public async Task<IActionResult> Current(CancellationToken ct) => Ok(await View(Session, ct));

    [HttpPost("company")]
    public async Task<IActionResult> Switch(CompanyBody body, CancellationToken ct)
    {
        if (!(await store.CompaniesAsync(Session.UserId, ct)).Any(c => c.Id == body.company_id)) return Forbidden();
        var result = await store.CreateAsync(Session.UserId, body.company_id, ct);
        await store.RevokeAsync(Token, ct);
        Response.Cookies.Append(SessionAuthentication.CookieName, result.Token, Cookie);
        return Ok(await View(result.Session, ct));
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        await store.RevokeAsync(Token, ct);
        Response.Cookies.Delete(SessionAuthentication.CookieName, Cookie);
        return NoContent();
    }

    private async Task<object> View(AuthSession session, CancellationToken ct) => new {
        user = new { id = session.UserId, email = session.Email }, company_id = session.CompanyId,
        role = session.Role, csrf_token = session.CsrfToken, expires_at = session.ExpiresAt.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"),
        companies = (await store.CompaniesAsync(session.UserId, ct)).Select(c => new { id = c.Id, name = c.Name, role = c.Role })
    };
    private ObjectResult Forbidden() => StatusCode(403, new { statusCode = 403, message = "Forbidden", error = "Forbidden" });
    private ObjectResult UnauthorizedError() => StatusCode(401, new { statusCode = 401, message = "Unauthorized", error = "Unauthorized" });
}
