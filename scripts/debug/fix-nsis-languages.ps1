# Fix NSIS language .nsh files missing MULTIUSER_INSTALLMODEPAGE section
# These missing strings cause "warning treated as error" in electron-builder NSIS build
# This script appends the English fallback strings to each missing language file

$langDir = "c:\A\03Projects\MiniMax\GitGUI\tools\nsis\nsis-3.11\Contrib\Language files"

# The MULTIUSER section block (English fallback) - using single quotes to avoid PS interpolation
$multiuserBlock = @'
!ifdef MULTIUSER_INSTALLMODEPAGE
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_TITLE "Choose Users"
  ${LangFileString} MULTIUSER_TEXT_INSTALLMODE_SUBTITLE "Choose for which users you want to install ${^NameDA}."
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_TOP "Select whether you want to install ${^NameDA} only for yourself or for all users of this computer. ${^ClickNext}"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_ALLUSERS "Install for anyone using this computer"
  ${LangFileString} MULTIUSER_INNERTEXT_INSTALLMODE_CURRENTUSER "Install just for me"
!endif
'@

$fixed = 0
$skipped = 0

Get-ChildItem $langDir -Filter "*.nsh" | ForEach-Object {
    $file = $_.FullName
    $content = Get-Content $file -Raw

    if ($content -match "MULTIUSER_TEXT_INSTALLMODE_TITLE") {
        $skipped++
    } else {
        # Append the MULTIUSER block with UTF8 (no BOM) encoding
        $newContent = $content.TrimEnd() + "`r`n" + $multiuserBlock + "`r`n"
        [System.IO.File]::WriteAllText($file, $newContent, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "FIXED: $($_.Name)"
        $fixed++
    }
}

Write-Host ""
Write-Host "=== Summary ==="
Write-Host "Fixed: $fixed files"
Write-Host "Skipped (already had MULTIUSER section): $skipped files"
