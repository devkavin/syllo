# Syllo authentication testing

Syllo does not ship demo credentials or seed student accounts. For local API tests,
register a unique throwaway account against a non-production database.

## Email and password

```powershell
$api = "http://localhost:8000/api"
$email = "auth-test-$([guid]::NewGuid().ToString('N'))@example.test"
$body = @{ email = $email; password = "Local-test-only-ChangeMe1!"; name = "Auth Test" } | ConvertTo-Json
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post -Uri "$api/auth/register" -ContentType "application/json" -Body $body -WebSession $session
Invoke-RestMethod -Uri "$api/auth/me" -WebSession $session
Invoke-RestMethod -Method Post -Uri "$api/auth/logout" -WebSession $session
```

Web authentication uses secure HTTP-only access and refresh cookies. Mobile clients
store returned bearer tokens in the platform secure store. Protected endpoints
accept a bearer token before falling back to cookies.

## Google OAuth

- Browser start: `GET /api/auth/google/start`
- Browser callback registered with Google: `GET /api/auth/google/callback`
- Mobile exchange: `POST /api/auth/google/mobile/exchange` with the short-lived,
  single-use code returned through the `syllo://google-callback` deep link

Use a dedicated Google OAuth client for each environment and register its exact
redirect URI. Never place `GOOGLE_CLIENT_SECRET` in the web or mobile application.

Automated authentication tests use isolated database fixtures and mocked provider
responses; they do not require real Google credentials.
