import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve, join } from 'path'
import fs from 'fs'
import { HttpsProxyAgent } from 'https-proxy-agent'

// ===== 代理配置：从软件用户配置读取（与设置页保持一致） =====
// 读取 %APPDATA%/wallhaven-downloader/config.json 的 useProxy / proxyPort
function readUserConfig() {
  try {
    const cfgPath = join(process.env.APPDATA || '', 'wallhaven-downloader', 'config.json')
    return JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  } catch (e) {
    return {}
  }
}
const userConfig = readUserConfig()
const PROXY_PORT = userConfig.proxyPort || 7890
const USE_PROXY = userConfig.useProxy || false
const PROXY_URL = `http://127.0.0.1:${PROXY_PORT}`
// 仅当用户开启代理时才使用代理，否则 dev 代理直连
const proxyAgent = USE_PROXY ? new HttpsProxyAgent(PROXY_URL) : undefined
console.log(`[dev] Wallhaven 搜索代理: ${USE_PROXY ? PROXY_URL : '直连'}`)
// ========================================

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        // ⚠️ electron-updater 必须保持外部依赖（运行时从 node_modules 加载）：
        // 若被打包进 bundle，它内部的 require('electron') 会被 vite 的 SSR 转换改写，
        // 导致 ElectronAppAdapter 取不到 app 对象，启动时直接崩溃：
        //   TypeError: Cannot read properties of undefined (reading 'getVersion')
        // 打包时 node_modules 已包含在 files 里（见 package.json），无需额外处理。
        external: ['electron', 'electron-updater']
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    plugins: [react()],
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'https://wallhaven.cc',
          changeOrigin: true,
          agent: proxyAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }
      }
    }
  }
})