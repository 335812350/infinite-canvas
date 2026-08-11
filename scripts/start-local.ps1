$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$temp = [IO.Path]::GetTempPath()

function Start-ManagedProcess([string]$name, [string]$filePath, [string[]]$arguments, [string]$workingDirectory) {
    $pidPath = Join-Path $temp "infinite-canvas-$name.pid"
    if (Test-Path $pidPath) {
        $existing = [int](Get-Content $pidPath | Select-Object -First 1)
        if (Get-Process -Id $existing -ErrorAction SilentlyContinue) { return }
        Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    }

    $started = Start-Process -FilePath $filePath -ArgumentList $arguments -WorkingDirectory $workingDirectory -WindowStyle Hidden -PassThru
    $started.Id | Set-Content -Path $pidPath
}

$web = Join-Path $root "web"
$viteCommand = 'cd /d "' + $web + '" && bun run dev'
Start-ManagedProcess "vite" $env:ComSpec @("/d", "/c", $viteCommand) $root
Start-ManagedProcess "agent" $env:ComSpec @("/d", "/c", "npx.cmd --yes @basketikun/canvas-agent@latest") $root
