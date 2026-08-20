# Setup inicial da plataforma. Cria o .env e gera os segredos desta instalação.
#   Uso:  .\setup.ps1

$ErrorActionPreference = "Stop"

function New-Secret {
    param([int]$Bytes = 48)
    $buffer = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    # base64url: sem +, / ou = pra não atrapalhar o parsing do .env
    [Convert]::ToBase64String($buffer).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

if (Test-Path .env) {
    Write-Host "'.env' ja existe — nada foi alterado." -ForegroundColor Yellow
    Write-Host "Para regerar os segredos, apague o arquivo e rode de novo."
    Write-Host "  ATENCAO: trocar ENCRYPTION_KEY invalida as senhas do Jira ja salvas."
    exit 0
}

Copy-Item .env.example .env

$content = Get-Content .env -Raw
$content = $content -replace 'JWT_SECRET=', ("JWT_SECRET=" + (New-Secret 48))
$content = $content -replace 'ENCRYPTION_KEY=', ("ENCRYPTION_KEY=" + (New-Secret 32))
Set-Content .env $content -NoNewline -Encoding utf8

Write-Host "'.env' criado com segredos novos." -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos:"
Write-Host "  1. (opcional) edite .env e preencha SMART_DESKTOP_PATH"
Write-Host "  2. docker compose up -d --build"
Write-Host "  3. abra http://localhost:3000 e crie o usuario administrador"
