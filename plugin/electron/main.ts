import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { PythonManager } from './python-manager';
import { PhotoshopBridge } from './photoshop-bridge';

let mainWindow: BrowserWindow | null = null;
const pythonManager = new PythonManager();
const photoshopBridge = new PhotoshopBridge();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Depth Mask Tool',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- IPC Handlers ---

ipcMain.handle('python:start', async () => {
  return pythonManager.start();
});

ipcMain.handle('python:stop', async () => {
  return pythonManager.stop();
});

ipcMain.handle('python:status', async () => {
  return pythonManager.getStatus();
});

ipcMain.handle('python:port', () => {
  return pythonManager.getPort();
});

ipcMain.handle('dialog:open-image', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'heic'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:save-mask', async () => {
  const result = await dialog.showSaveDialog({
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
    defaultPath: 'depth_mask.png',
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('photoshop:check', async () => {
  return photoshopBridge.isRunning();
});

ipcMain.handle('photoshop:apply-mask', async (_event, maskPngBase64: string) => {
  return photoshopBridge.applyMask(maskPngBase64);
});

// --- App Lifecycle ---

app.whenReady().then(async () => {
  createWindow();

  // Auto-start Python backend
  try {
    await pythonManager.start();
    console.log('Python backend started');
  } catch (err) {
    console.error('Failed to start Python backend:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  pythonManager.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  pythonManager.stop();
});
