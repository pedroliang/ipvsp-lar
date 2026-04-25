# ============================================================
# Cuidando do Lar - IPVSP
# Setup automatizado COMPLETO: Supabase + GitHub + Pages
# ============================================================
# Como rodar (PowerShell, dentro desta pasta):
#   .\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# Helper: roda git ignorando stderr/warnings
function RunGit {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & git $args 2>&1 | Out-String | Out-Null
    $ErrorActionPreference = $prev
}

# ----- Carrega tokens do arquivo .tokens.ps1 (gitignored) -----
if (-not (Test-Path ".tokens.ps1")) {
    Write-Host "ERRO: arquivo .tokens.ps1 nao encontrado." -ForegroundColor Red
    Write-Host "Crie .tokens.ps1 com:" -ForegroundColor Yellow
    Write-Host '  $Env:GITHUB_TOKEN   = "ghp_..."'
    Write-Host '  $Env:SUPABASE_TOKEN = "sbp_..."'
    exit 1
}
. ".\.tokens.ps1"

$GitHubToken   = $Env:GITHUB_TOKEN
$SupabaseToken = $Env:SUPABASE_TOKEN
if (-not $GitHubToken -or -not $SupabaseToken) {
    Write-Host "ERRO: tokens nao definidos em .tokens.ps1" -ForegroundColor Red
    exit 1
}

$RepoName      = "ipvsp-lar"
$RepoDesc      = "Cuidando do Lar - Igreja Pao da Vida Sao Paulo"
$ProjectName   = "ipvsp-lar"
$ProjectRegion = "sa-east-1"

function Banner($msg) {
    Write-Host ""
    Write-Host "===== $msg =====" -ForegroundColor Cyan
    Write-Host ""
}
function Step($msg)    { Write-Host "-> $msg" -ForegroundColor Yellow }
function OK($msg)      { Write-Host "   [OK] $msg" -ForegroundColor Green }
function WarnMsg($msg) { Write-Host "   [!]  $msg" -ForegroundColor Yellow }
function Fail($msg)    { Write-Host "   [X]  $msg" -ForegroundColor Red }

# ============================================================
# PARTE 1: SUPABASE
# ============================================================
Banner "Cuidando do Lar - setup automatizado"

$sbHeaders = @{
    "Authorization" = "Bearer $SupabaseToken"
    "Content-Type"  = "application/json"
}

Step "Buscando organizacoes do Supabase..."
try {
    $orgs = Invoke-RestMethod -Uri "https://api.supabase.com/v1/organizations" -Headers $sbHeaders -Method Get
    if (-not $orgs -or $orgs.Count -eq 0) {
        Fail "Nenhuma organizacao Supabase encontrada. Crie uma em https://supabase.com/dashboard primeiro."
        exit 1
    }
    $orgId = $orgs[0].id
    OK "Organizacao: $($orgs[0].name) ($orgId)"
} catch {
    Fail "Token Supabase invalido."
    Write-Host $_.Exception.Message
    exit 1
}

Step "Verificando se projeto '$ProjectName' ja existe..."
$existingProjects = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects" -Headers $sbHeaders -Method Get
$existing = $existingProjects | Where-Object { $_.name -eq $ProjectName }

if ($existing) {
    OK "Projeto ja existe: $($existing.id)"
    $projectRef = $existing.id
} else {
    Step "Criando projeto Supabase '$ProjectName' (regiao $ProjectRegion)..."
    $dbPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    $body = @{
        name            = $ProjectName
        organization_id = $orgId
        region          = $ProjectRegion
        db_pass         = $dbPassword
        plan            = "free"
    } | ConvertTo-Json

    try {
        $project = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects" -Headers $sbHeaders -Method Post -Body $body
        $projectRef = $project.id
        OK "Projeto criado: $projectRef"
        $dbPassword | Out-File -FilePath ".supabase-db-password.txt" -Encoding UTF8
        WarnMsg "Senha do banco salva em .supabase-db-password.txt"
    } catch {
        Fail "Falha ao criar projeto Supabase:"
        Write-Host $_.Exception.Message
        exit 1
    }
}

Step "Aguardando projeto ficar disponivel (pode levar 1-2 min)..."
$maxWait = 240
$waited = 0
while ($waited -lt $maxWait) {
    Start-Sleep -Seconds 5
    $waited += 5
    try {
        $status = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef" -Headers $sbHeaders -Method Get
        if ($status.status -eq "ACTIVE_HEALTHY") {
            OK "Projeto ATIVO."
            break
        }
        Write-Host "   ... status: $($status.status) ($waited s)" -ForegroundColor DarkGray
    } catch {
        Write-Host "   ... aguardando ($waited s)" -ForegroundColor DarkGray
    }
}

Step "Aplicando schema (tabelas, policies, realtime)..."
$sqlContent = Get-Content -Raw -Encoding UTF8 "supabase-setup.sql"
# Remove a parte de alter publication (pode falhar via API)
$sqlMain = $sqlContent -replace '(?ms)-- ----------- Habilitar Realtime.*$',''
$sqlRealtime = "alter publication supabase_realtime add table public.escalas;`nalter publication supabase_realtime add table public.estoque;"

$sqlOk = $true
$sqlBody = @{ query = $sqlMain } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" -Headers $sbHeaders -Method Post -Body $sqlBody | Out-Null
    OK "Schema + policies aplicados."
} catch {
    $sqlOk = $false
    WarnMsg "Falha ao aplicar SQL via API: $($_.Exception.Message)"
}

# Realtime separado (pode falhar se ja estiver habilitado, OK)
$rtBody = @{ query = $sqlRealtime } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/database/query" -Headers $sbHeaders -Method Post -Body $rtBody | Out-Null
    OK "Realtime habilitado."
} catch {
    WarnMsg "Realtime ja estava habilitado (ou nao foi possivel habilitar via API)."
}

if (-not $sqlOk) {
    Write-Host ""
    WarnMsg "Aplicar SQL manualmente:"
    Write-Host "  1. Abra: https://supabase.com/dashboard/project/$projectRef/sql/new"
    Write-Host "  2. Cole TODO o conteudo do arquivo supabase-setup.sql"
    Write-Host "  3. Clique em RUN"
    Write-Host "  4. Depois rode novamente: .\setup.ps1"
    Write-Host ""
    Read-Host "Pressione ENTER apos aplicar o SQL para continuar"
}

Step "Buscando chave anon..."
$keys = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$projectRef/api-keys" -Headers $sbHeaders -Method Get
$anonKey = ($keys | Where-Object { $_.name -eq "anon" }).api_key
if (-not $anonKey) {
    Fail "Nao consegui obter a anon key."
    exit 1
}
OK "Chave anon obtida."

$supabaseUrl = "https://$projectRef.supabase.co"

Step "Atualizando config.js..."
$configContent = "// Configuracao do Supabase - gerado pelo setup.ps1`r`n`r`nexport const SUPABASE_URL = `"$supabaseUrl`";`r`nexport const SUPABASE_ANON_KEY = `"$anonKey`";`r`n"
Set-Content -Path "config.js" -Value $configContent -Encoding UTF8 -NoNewline
OK "config.js atualizado."

# ============================================================
# PARTE 2: GITHUB
# ============================================================
Banner "Configurando GitHub"

$ghHeaders = @{
    "Authorization" = "Bearer $GitHubToken"
    "Accept"        = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent"    = "ipvsp-lar-setup"
}

Step "Identificando conta GitHub..."
try {
    $me = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $ghHeaders
    $login = $me.login
    OK "Logado como: $login"
} catch {
    Fail "Token GitHub invalido."
    exit 1
}

Step "Criando repositorio $login/$RepoName..."
$createBody = @{
    name        = $RepoName
    description = $RepoDesc
    private     = $false
    has_issues  = $true
    has_wiki    = $false
} | ConvertTo-Json
try {
    $repo = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $ghHeaders -Method Post -Body $createBody
    OK "Repositorio criado."
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 422) {
        OK "Repositorio ja existia."
        $repo = Invoke-RestMethod -Uri "https://api.github.com/repos/$login/$RepoName" -Headers $ghHeaders
    } else {
        Fail $_.Exception.Message
        exit 1
    }
}

Step "Inicializando git limpo (sem historico contendo tokens)..."
# Forca reinit para garantir que nao ha commits antigos com secrets
if (Test-Path ".git") {
    Remove-Item -Recurse -Force ".git" -ErrorAction SilentlyContinue
}
RunGit init -b main

# Configura line endings para evitar warnings no Windows
RunGit config core.autocrlf true
RunGit config user.email "pedro.liang@gmail.com"
RunGit config user.name  "Pedro Liang"
RunGit add .
RunGit commit -m "Cuidando do Lar - primeira versao" --allow-empty
RunGit remote remove origin
RunGit remote add origin "https://github.com/$login/$RepoName.git"
RunGit branch -M main

# Desabilita credential helper para esta operacao (evita Windows Credential Manager)
RunGit config --local credential.helper ""

Step "Fazendo push (autenticando via header)..."
$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"

# Usa extraHeader com o token - metodo mais confiavel
$basicAuth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$GitHubToken"))
$pushOutput = & git -c "http.extraHeader=Authorization: Basic $basicAuth" push -u origin main --force 2>&1
$pushExit = $LASTEXITCODE
$ErrorActionPreference = $prev

if ($pushExit -eq 0) {
    OK "Push concluido."
} else {
    Fail "Push falhou (exit $pushExit). Saida do git:"
    Write-Host ""
    $pushOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkYellow }
    Write-Host ""
    Write-Host "Tente manualmente:" -ForegroundColor Yellow
    Write-Host "  git -c http.extraHeader=`"Authorization: Basic $basicAuth`" push -u origin main"
    exit 1
}

Step "Ativando GitHub Pages..."
$pagesBody = @{ source = @{ branch = "main"; path = "/" } } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "https://api.github.com/repos/$login/$RepoName/pages" -Headers $ghHeaders -Method Post -Body $pagesBody | Out-Null
    OK "Pages ativado."
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
        OK "Pages ja estava ativo."
    } else {
        WarnMsg "Ative manualmente em: https://github.com/$login/$RepoName/settings/pages"
    }
}

# ============================================================
# RESUMO
# ============================================================
$pagesUrl = "https://$login.github.io/$RepoName/"
Banner "TUDO PRONTO"
Write-Host "Site:     $pagesUrl"
Write-Host "Repo:     https://github.com/$login/$RepoName"
Write-Host "Supabase: https://supabase.com/dashboard/project/$projectRef"
Write-Host ""
Write-Host "(O Pages leva ~1-2 min para publicar a primeira vez.)"
Write-Host ""
