import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc-channels';

export function registerDialogHandlers() {
  ipcMain.handle(IPC.DIALOG_SHOW_OPEN, async (e, opts: Electron.OpenDialogOptions) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return dialog.showOpenDialog(win!, opts);
  });

  ipcMain.handle(IPC.DIALOG_SHOW_SAVE, async (e, opts: Electron.SaveDialogOptions) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return dialog.showSaveDialog(win!, opts);
  });
}
