// src/main/store.js
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const userDataPath = app.getPath('userData')
const historyFile = path.join(userDataPath, 'history.json')
const configFile = path.join(userDataPath, 'config.json')

export function loadHistory() {
  try {
    if (fs.existsSync(historyFile)) {
      const data = fs.readFileSync(historyFile, 'utf8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('加载历史记录失败:', error)
  }
  return []
}

export function saveHistory(history) {
  try {
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2))
  } catch (error) {
    console.error('保存历史记录失败:', error)
  }
}

export function loadConfig() {
  const defaultConfig = {
  apiKey: '',
  concurrency: 16,
  downloadDir: null,
  purity: '100',
  topRange: '1M'
}
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, 'utf8')
      return { ...defaultConfig, ...JSON.parse(data) }
    }
  } catch (error) {
    console.error('加载配置失败:', error)
  }
  return defaultConfig
}

export function saveConfig(config) {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('保存配置失败:', error)
  }
}