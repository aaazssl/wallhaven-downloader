#!/usr/bin/env node
// scripts/release.cjs
// 发布到 GitHub Release 的包装脚本（npm run release 实际执行的是它）
//
// 为什么需要这层包装：
//   electron-builder **不会自动读取项目根目录的 .env**，
//   找不到 GH_TOKEN 环境变量时，`--publish always` 会「静默跳过上传」——
//   不报错、只是没发布（本项目踩过：打包成功、进程正常退出，但 GitHub 上什么都没有）。
//   所以这里先把 .env 里的 GH_TOKEN 读出来注入环境变量，再调用 electron-builder。
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const envPath = path.join(root, '.env')

// 1) 取 GH_TOKEN：优先用已有的环境变量，否则读 .env
if (!process.env.GH_TOKEN && fs.existsSync(envPath)) {
  const text = fs.readFileSync(envPath, 'utf8')
  const m = text.match(/^\s*(?:export\s+)?GH_TOKEN\s*=\s*(.+?)\s*$/m)
  if (m) process.env.GH_TOKEN = m[1].replace(/^["']|["']$/g, '')
}

if (!process.env.GH_TOKEN) {
  console.error('\n❌ 未找到 GH_TOKEN')
  console.error('   请在项目根目录创建 .env 文件，写入一行：GH_TOKEN=你的token\n')
  process.exit(1)
}
console.log(`🔑 已加载 GH_TOKEN（${process.env.GH_TOKEN.slice(0, 4)}...，${process.env.GH_TOKEN.length} 字符）`)

// 2) 版本号提醒（自动更新只看这个，与文件名无关）
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
console.log(`📦 即将发布 v${pkg.version} → GitHub Release（tag: v${pkg.version}）`)
console.log('   ⚠️ 若这不是新版本号，请先改 package.json 的 version，否则用户端检测不到更新\n')

// 3) 打包并发布（stdio 继承，输出直接打到当前终端）
const cmd = 'npx electron-builder --win --x64 --publish always'
console.log('▶ 执行:', cmd, '\n')
const result = spawnSync(cmd, { stdio: 'inherit', cwd: root, env: process.env, shell: true })

process.exit(result.status === null ? 1 : result.status)
