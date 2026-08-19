$src = 'C:\A\03Projects\MiniMax\GitGUI\release\win-unpacked'
$items = Get-ChildItem -Path $src -Recurse -Force -ErrorAction SilentlyContinue
foreach ($it in $items) {
  $path = $it.FullName
  try {
    $f = [System.IO.File]::Open($path, 'Open', 'Read', 'None')
    $f.Close()
    Write-Host ('OK    ' + $path)
  } catch {
    Write-Host ('LOCKED ' + $path + ' -- ' + $_.Exception.Message)
  }
}
