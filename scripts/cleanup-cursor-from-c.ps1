# Run this script AFTER closing Cursor completely.
# Deletes remaining Cursor/Codex data from C:\ drive.

$paths = @(
    "C:\Users\Elior\AppData\Roaming\Cursor",
    "C:\Users\Elior\.cursor"
)

foreach ($p in $paths) {
    if (Test-Path $p) {
        try {
            Remove-Item $p -Recurse -Force -ErrorAction Stop
            Write-Host "Deleted: $p"
        } catch {
            Write-Host "Failed: $p - $_"
        }
    }
}

Write-Host "Done. Launch Cursor from Desktop shortcut 'Cursor (D-Drive)'"
