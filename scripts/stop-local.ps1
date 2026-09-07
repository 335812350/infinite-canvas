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

# Earlier releases only recorded the command-shell PID. Stop orphaned listeners
# as well, so the next startup cannot silently fall back to another port.
foreach ($port in @(3000, 17371)) {
    Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { taskkill.exe /PID $_ /T /F | Out-Null }
}
