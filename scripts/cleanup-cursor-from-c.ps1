# Back-compat name: this no longer deletes C:\ paths (that lets Cursor recreate GB on C:).
# It creates directory junctions so Roaming\Cursor, Local\Cursor, and %USERPROFILE%\.cursor
# point at D:\Users\Elior\DevData\... — same as scripts\cursor-junctions-d-only.ps1.
#
# Close Cursor completely before running.

$junctionScript = Join-Path $PSScriptRoot "cursor-junctions-d-only.ps1"
if (-not (Test-Path -LiteralPath $junctionScript)) {
    throw "Missing $junctionScript"
}

& $junctionScript @args
