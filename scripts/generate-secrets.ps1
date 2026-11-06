# ==============================================================================
# AEROKIN Remote Secrets Generator (Windows PowerShell)
# Generates high-entropy cryptographic tokens for Coturn and Signaling
# ==============================================================================

$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

function Get-RandomHex([int]$bytes = 32) {
    $buffer = New-Object byte[] $bytes
    $rng.GetBytes($buffer)
    return -join ($buffer | ForEach-Object { $_.ToString("x2") })
}

$turnSecret = Get-RandomHex 32
$agentSecret = Get-RandomHex 32

Write-Host "--- AEROKIN Cryptographic Secrets Generator ---" -ForegroundColor Cyan
Write-Host ""
Write-Host "Generated Secrets (store securely in .env):" -ForegroundColor Green
Write-Host "--------------------------------------------------------"
Write-Host "TURN_SECRET=$turnSecret"
Write-Host "AGENT_SECRET=$agentSecret"
Write-Host "--------------------------------------------------------"
Write-Host ""
Write-Host "Tip: Copy these to signaling/.env or your host environment." -ForegroundColor Gray
