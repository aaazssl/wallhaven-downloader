import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { downloadManager } from './downloadManager'
import { loadHistory, saveHistory, loadConfig, saveConfig } from './store'

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'Wallhaven Downloader'
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  global.history = loadHistory()
  global.config = loadConfig()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('select-download-dir', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择下载目录'
  })
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('get-config', () => {
  return global.config
})

ipcMain.handle('save-config', (event, config) => {
  global.config = { ...global.config, ...config }
  saveConfig(global.config)
  return true
})

ipcMain.handle('get-history', () => {
  return global.history
})

ipcMain.handle('download-images', async (event, imageIds, downloadDir, concurrency) => {
  const result = await downloadManager(imageIds, downloadDir, concurrency, (update) => {
    mainWindow.webContents.send('download-progress', update)
  })
  saveHistory(global.history)
  return result
})