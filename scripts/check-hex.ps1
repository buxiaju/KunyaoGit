$bytes = [System.IO.File]::ReadAllBytes('C:\A\03Projects\MiniMax\GitGUI\scripts\installer.nsi')
Write-Host ('length: ' + $bytes.Length)
Write-Host 'first 16 bytes:'
for ($i = 0; $i -lt 16 -and $i -lt $bytes.Length; $i++) {
  Write-Host ('  ' + $i.ToString('X2') + ' = ' + $bytes[$i].ToString('X2') + ' (' + [char]$bytes[$i] + ')')
}
