# Clean release/ stale artifacts and leftover release2/ directory
# Usage: close IDE first, then run in PowerShell:
#   powershell -ExecutionPolicy Bypass -File scripts\debug\clean-release.ps1
# Reason: app.asar / default_app.asar are locked by IDE file watcher at runtime.

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path))

Write-Host "Cleaning stale subdirs in $root\release\ ..."
$oldDirs = @("install-test", "win-unpacked-v2", "win-unpacked.old", "install-test.old", "win-unpacked.old")
foreach ($d in $oldDirs) {
    $p = Join-Path $root "release\$d"
    if (Test-Path $p) {
        Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $p) { Write-Host "  SKIP (still locked): $d" }
        else { Write-Host "  DELETED: $d" }
    }
}

Write-Host ""
Write-Host "Cleaning leftover release2/ ..."
$rel2 = Join-Path $root "release2"
if (Test-Path $rel2) {
    Remove-Item $rel2 -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $rel2) { Write-Host "  SKIP (still locked) - make sure IDE is fully closed" }
    else { Write-Host "  DELETED: release2/" }
} else {
    Write-Host "  release2/ does not exist (already clean)"
}

Write-Host ""
Write-Host "Cleaning leftover release3/ ..."
$rel3 = Join-Path $root "release3"
if (Test-Path $rel3) {
    Remove-Item $rel3 -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $rel3) { Write-Host "  SKIP (still locked) - make sure IDE is fully closed" }
    else { Write-Host "  DELETED: release3/" }
} else {
    Write-Host "  release3/ does not exist (already clean)"
}

Write-Host ""
Write-Host "Cleaning win-unpacked/ in release\ (may contain locked asar) ..."
$winUnpacked = Join-Path $root "release\win-unpacked"
if (Test-Path $winUnpacked) {
    Remove-Item $winUnpacked -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path $winUnpacked) { Write-Host "  SKIP (still locked) - make sure IDE is fully closed" }
    else { Write-Host "  DELETED: release\win-unpacked" }
} else {
    Write-Host "  release\win-unpacked does not exist (already clean)"
}

Write-Host ""
Write-Host "Done. Current contents of release\:"
Get-ChildItem (Join-Path $root "release") -Name
