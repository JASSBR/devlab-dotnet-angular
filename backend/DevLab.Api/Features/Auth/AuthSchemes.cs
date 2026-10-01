namespace DevLab.Api.Features.Auth;

/// <summary>Scheme names used across the auth lessons. A scheme = one way to authenticate.</summary>
public static class AuthSchemes
{
    public const string Jwt = "Bearer";          // Authorization: Bearer <access token issued by /api/auth/jwt>
    public const string Cookie = "LabCookie";    // Cookie: devlab.auth=<encrypted ticket>
    public const string ApiKey = "ApiKey";       // X-Api-Key: <key>
    public const string Oidc = "OidcBearer";     // Authorization: Bearer <token issued by the fake IdP>
    public const string Smart = "Smart";         // policy scheme that picks one of the above per request
}
