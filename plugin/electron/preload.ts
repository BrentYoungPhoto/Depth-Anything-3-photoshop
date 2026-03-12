import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Python backend management
  python: {
    start: () => ipcRenderer.invoke('python:start'),
    stop: () => ipcRenderer.invoke('python:stop'),
    status: () => ipcRenderer.invoke('python:status'),
    getPort: () => ipcRenderer.invoke('python:port'),
  },

  // File dialogs
  dialog: {
    openImage: () => ipcRenderer.invoke('dialog:open-image'),
    saveMask: () => ipcRenderer.invoke('dialog:save-mask'),
  },

  // Photoshop integration
  photoshop: {
    check: () => ipcRenderer.invoke('photoshop:check'),
    applyMask: (maskPngBase64: string) =>
      ipcRenderer.invoke('photoshop:apply-mask', maskPngBase64),
  },
});
