$exe = 'C:\A\03Projects\MiniMax\GitGUI\release\install-test\kunyaogit.exe'
$proc = Start-Process -FilePath $exe -PassThru -ErrorAction Stop
Start-Sleep -Seconds 5
if ($proc.HasExited) {
  Write-Host ('exited with code ' + $proc.ExitCode)
} else {
  Write-Host ('still running, pid ' + $proc.Id)
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Write-Host 'killed'
}
