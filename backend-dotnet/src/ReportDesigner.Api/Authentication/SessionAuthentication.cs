using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using ReportDesigner.Application.Common;
using ReportDesigner.Infrastructure.Authentication;

namespace ReportDesigner.Api.Authentication;

public sealed class CompanyContext(IHttpContextAccessor accessor) : ICompanyContext
{
    public Guid CompanyId => Guid.Parse(accessor.HttpContext!.User.FindFirstValue("company_id")!);
}

public sealed class SessionAuthentication(IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger, UrlEncoder encoder, SessionStore store)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string CookieName = "rd_session";
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Cookies.TryGetValue(CookieName, out var token)) return AuthenticateResult.NoResult();
        var session = await store.FindAsync(token, Context.RequestAborted);
        if (session is null) return AuthenticateResult.Fail("Invalid session");
        Context.Items["session"] = session;
        var identity = new ClaimsIdentity(new[] {
            new Claim(ClaimTypes.NameIdentifier, session.UserId.ToString()), new Claim(ClaimTypes.Name, session.Email),
            new Claim("company_id", session.CompanyId.ToString()), new Claim(ClaimTypes.Role, session.Role)
        }, Scheme.Name);
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name));
    }
    protected override Task HandleChallengeAsync(AuthenticationProperties properties) => Error(Context, 401);
    protected override Task HandleForbiddenAsync(AuthenticationProperties properties) => Error(Context, 403);
    public static Task Error(HttpContext context, int status)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(new { statusCode = status, message = status == 401 ? "Unauthorized" : "Forbidden", error = status == 401 ? "Unauthorized" : "Forbidden" });
    }
}
