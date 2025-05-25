const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getCurrentCatOSVersion: () => ipcRenderer.invoke('get-current-catos-version'),
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadAndInstallUpdate: () => ipcRenderer.invoke('download-and-install-update'),
    onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback)
});