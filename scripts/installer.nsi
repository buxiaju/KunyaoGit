; KunyaoGit NSIS Installer
; Builds: KunyaoGit-Setup-0.1.0-x64.exe
; Source: release\win-unpacked\
; Usage:  makensis.exe /DAPP_VERSION=0.1.0 scripts\installer.nsi

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"

SetCompressor /SOLID lzma
SetCompressorDictSize 64
SetDatablockOptimize on

!ifndef APP_VERSION
  !define APP_VERSION "0.1.0"
!endif

!define APP_NAME "KunyaoGit"
!define APP_DISPLAY_NAME "KunyaoGit"
!define APP_PUBLISHER "kunyao"
!define APP_DESCRIPTION "A cross-platform Git GUI client for GitHub and Gitee"
!define APP_EXE "kunyaogit.exe"
!define APP_ID "com.kunyao.kunyaogit"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_ID}"
!define INSTALL_DIR_NAME "KunyaoGit"

Name "${APP_DISPLAY_NAME} ${APP_VERSION}"
OutFile "..\release\KunyaoGit-Setup-${APP_VERSION}-x64.exe"
InstallDir "$PROGRAMFILES64\${INSTALL_DIR_NAME}"
InstallDirRegKey HKCU "Software\${APP_NAME}" ""
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show
BrandingText "${APP_DISPLAY_NAME}"

; Modern UI configuration
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Header\orange.bmp"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\orange.bmp"
!define MUI_WELCOMEPAGE_TITLE "${APP_DISPLAY_NAME} Setup"
!define MUI_WELCOMEPAGE_TEXT "This wizard will guide you through the installation of ${APP_DISPLAY_NAME} v${APP_VERSION}.$\r$\n$\r$\n${APP_DESCRIPTION}$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_TITLE "${APP_DISPLAY_NAME} has been installed"
!define MUI_FINISHPAGE_TEXT "${APP_DISPLAY_NAME} has been installed on your computer.$\r$\n$\r$\nClick Finish to close this wizard."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_DISPLAY_NAME}"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Launch ${APP_DISPLAY_NAME}"
!define MUI_UNFINISHPAGE_TITLE "${APP_DISPLAY_NAME} has been removed"
!define MUI_UNFINISHPAGE_TEXT "${APP_DISPLAY_NAME} has been removed from your computer."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "-Install" SecInstall
  SectionIn RO
  SetOutPath "$INSTDIR"

  ; Clean leftover from earlier build (old layout had resources/app/ dir, new uses resources/app.asar file)
  IfFileExists "$INSTDIR\resources\app\*.*" 0 +2
    RMDir /r "$INSTDIR\resources\app"

  ; Copy all unpacked files except the existing uninstaller
  File /r "..\release\win-unpacked-v2\*.*"

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Registry: Add/Remove Programs
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APP_DISPLAY_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" '"$INSTDIR\${APP_EXE}"'
  WriteRegStr HKLM "${UNINST_KEY}" "URLInfoAbout" "https://github.com/buxiaju/KunyaoGit"
  WriteRegStr HKLM "${UNINST_KEY}" "HelpLink" "https://github.com/buxiaju/KunyaoGit/issues"
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1

  ; Compute and write estimated size
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize" "$0"

  ; Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\${INSTALL_DIR_NAME}"
  CreateShortcut "$SMPROGRAMS\${INSTALL_DIR_NAME}\${APP_DISPLAY_NAME}.lnk" "$INSTDIR\${APP_EXE}"
  CreateShortcut "$SMPROGRAMS\${INSTALL_DIR_NAME}\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  ; Desktop shortcut
  CreateShortcut "$DESKTOP\${APP_DISPLAY_NAME}.lnk" "$INSTDIR\${APP_EXE}"

  ; Save install location for the user (HKCU) so future runs default to it
  WriteRegStr HKCU "Software\${APP_NAME}" "" $INSTDIR
SectionEnd

Section "Uninstall"
  ; Remove installed files
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$DESKTOP\${APP_DISPLAY_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${INSTALL_DIR_NAME}"

  ; Remove registry keys
  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKCU "Software\${APP_NAME}"
SectionEnd
