$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$rootIgnore = Get-Content -LiteralPath (Join-Path $repoRoot ".dockerignore")
$frontendIgnore = Get-Content -LiteralPath (Join-Path $repoRoot "frontend\.dockerignore")
$compose = Get-Content -Raw -LiteralPath (Join-Path $repoRoot "compose.yaml")

$requiredRootRules = @(
    "**",
    "!backend/",
    "!backend/**",
    "backend/.env",
    "backend/.venv",
    "backend/tests",
    "mobile",
    "frontend",
    ".git",
    ".env",
    ".emergent",
    ".local-backups"
)

foreach ($rule in $requiredRootRules) {
    if ($rootIgnore -notcontains $rule) {
        throw "Backend Docker context is missing exclusion rule: $rule"
    }
}

foreach ($rule in @(".env", "node_modules", "dist", "coverage")) {
    if ($frontendIgnore -notcontains $rule) {
        throw "Frontend Docker context is missing exclusion rule: $rule"
    }
}

if ($compose -notmatch "context:\s+\./frontend") {
    throw "The web image must use frontend/ as its isolated build context."
}
if ($compose -match "context:\s+\./mobile" -or $compose -match "context:\s+mobile") {
    throw "The mobile workspace must never be a production image context."
}
Push-Location $repoRoot
try {
    $services = @(docker compose --env-file .env.example config --services)
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose configuration could not be rendered."
    }
    $renderedCompose = docker compose --env-file .env.example config --format json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose configuration could not be rendered as JSON."
    }
}
finally {
    Pop-Location
}
if (($services | Sort-Object) -join "," -ne "api,web") {
    throw "Production Compose must declare exactly the api and web services. Found: $($services -join ', ')"
}
$caMount = @($renderedCompose.services.api.volumes | Where-Object {
    $_.target -eq "/etc/ssl/certs/coolify-ca.crt" -and $_.read_only -eq $true
})
if ($caMount.Count -ne 1) {
    throw "The API must mount the Coolify CA certificate read-only."
}
$webCaMount = @($renderedCompose.services.web.volumes | Where-Object {
    $_.target -eq "/etc/ssl/certs/coolify-ca.crt"
})
if ($webCaMount.Count -ne 0) {
    throw "The web container must not mount the database CA certificate."
}

Write-Output "PASS: backend context is allow-listed to backend/ and excludes tests, secrets, caches, Git metadata, and mobile/."
Write-Output "PASS: frontend context is isolated to frontend/ and excludes dependencies, build output, coverage, and env files."
Write-Output "PASS: Compose declares only api and web; no MySQL or mobile service is included."
Write-Output "PASS: only the API mounts the Coolify database CA certificate read-only."
