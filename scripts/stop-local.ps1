$ErrorActionPreference = "SilentlyContinue"

$temp = [IO.Path]::GetTempPath()
foreach ($name in @("vite", "agent")) {
    $pidPath = Join-Path $temp "infinite-canvas-$name.pid"
    if (Test-Path $pidPath) {
        $existing = [int](Get-Content $pidPath | Select-Object -First 1)
        taskkill.exe /PID $existing /T /F | Out-Null
        Remove-Item -LiteralPath $pidPath -Force
    }
}
