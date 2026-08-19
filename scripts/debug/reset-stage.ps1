$ErrorActionPreference = 'Stop'
$src = 'C:\A\03Projects\MiniMax\GitGUI\release\win-unpacked'
$dst = 'C:\A\03Projects\MiniMax\GitGUI\release\win-unpacked-stale'

# 通过 cmd 移动目录
if (Test-Path $src) {
  for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 3
    $tryDst = $dst + '-' + $i
    if (Test-Path $tryDst) { continue }
    $result = cmd /c "ren ""$src"" ""$(Split-Path $tryDst -Leaf)""" 2>&1
    if ($LASTEXITCODE -eq 0 -and (Test-Path $tryDst)) {
      Write-Host ('renamed -> ' + $tryDst)
      exit 0
    }
  }
}

Write-Host 'all rename attempts failed'
exit 1
