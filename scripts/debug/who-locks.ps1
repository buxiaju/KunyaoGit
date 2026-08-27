# 用 Windows Restart Manager API 查出「谁锁住了这个文件」
#
# 场景：electron-builder 报
#   ⨯ remove ...\release\win-unpacked\resources\app.asar:
#     The process cannot access the file because it is being used by another process.
# 而 Get-Process 里看不到任何 electron / KunyaoGit 进程。
# v0.6.3 实测真正的持有者是 MiniMax Code（agent 宿主进程），不能杀 —— 详见 docs/development-guide.md §13.5.1
#
# ⚠️ 本机 ExecutionPolicy 禁止直接运行 .ps1 文件（`& .\scripts\debug\who-locks.ps1` 会报 UnauthorizedAccess）。
#    需要把下面 $code 那段 C# + 末尾的 [RmLock]::Who(...) 调用**inline 粘进 PowerShell** 执行，
#    或临时 `powershell -ExecutionPolicy Bypass -File scripts\debug\who-locks.ps1 -Path <file>`。
#
# 输出：每行 "<PID> | <应用名>"；没有持有者时输出 NO_LOCKING_PROCESS_REPORTED

param([Parameter(Mandatory = $true)][string]$Path)

$ErrorActionPreference = 'Stop'

$code = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class RmLock {
    [StructLayout(LayoutKind.Sequential)]
    struct RM_UNIQUE_PROCESS { public int dwProcessId; public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime; }

    const int RmRebootReasonNone = 0;
    const int CCH_RM_MAX_APP_NAME = 255;
    const int CCH_RM_MAX_SVC_NAME = 63;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct RM_PROCESS_INFO {
        public RM_UNIQUE_PROCESS Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_APP_NAME + 1)] public string strAppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = CCH_RM_MAX_SVC_NAME + 1)] public string strServiceShortName;
        public int ApplicationType; public uint AppStatus; public uint TSSessionId;
        [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
    }

    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);
    [DllImport("rstrtmgr.dll")]
    static extern int RmEndSession(uint pSessionHandle);
    [DllImport("rstrtmgr.dll", CharSet = CharSet.Unicode)]
    static extern int RmRegisterResources(uint pSessionHandle, uint nFiles, string[] rgsFilenames, uint nApplications, RM_UNIQUE_PROCESS[] rgApplications, uint nServices, string[] rgsServiceNames);
    [DllImport("rstrtmgr.dll")]
    static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded, ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps, ref uint lpdwRebootReasons);

    public static List<string> Who(string path) {
        var result = new List<string>();
        uint handle; string key = Guid.NewGuid().ToString();
        if (RmStartSession(out handle, 0, key) != 0) { result.Add("RmStartSession failed"); return result; }
        try {
            if (RmRegisterResources(handle, 1, new string[] { path }, 0, null, 0, null) != 0) { result.Add("RmRegisterResources failed"); return result; }
            uint pnProcInfoNeeded = 0, pnProcInfo = 0, rebootReasons = RmRebootReasonNone;
            int res = RmGetList(handle, out pnProcInfoNeeded, ref pnProcInfo, null, ref rebootReasons);
            if (res == 234) {
                var info = new RM_PROCESS_INFO[pnProcInfoNeeded];
                pnProcInfo = pnProcInfoNeeded;
                if (RmGetList(handle, out pnProcInfoNeeded, ref pnProcInfo, info, ref rebootReasons) == 0) {
                    for (int i = 0; i < pnProcInfo; i++) result.Add(info[i].Process.dwProcessId + " | " + info[i].strAppName);
                } else result.Add("RmGetList(2) failed");
            } else if (res == 0) result.Add("NO_LOCKING_PROCESS_REPORTED");
            else result.Add("RmGetList failed code=" + res);
        } finally { RmEndSession(handle); }
        return result;
    }
}
'@

if (-not ('RmLock' -as [type])) { Add-Type -TypeDefinition $code -Language CSharp }

[RmLock]::Who($Path)
