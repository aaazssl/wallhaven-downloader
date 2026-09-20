#!/usr/bin/env node
// scripts/portable-zip.cjs
// 生成「zip 免安装版」并上传到对应的 GitHub Release
//
// 用法：
//   node scripts/portable-zip.cjs            # 用 package.json 的版本（tag = v1.3.1）
//   node scripts/portable-zip.cjs v1.3.1     # 指定 tag（给历史版本补传时用）
//   node scripts/portable-zip.cjs --zip-only # 只压缩不上传
//
// 说明：
//   · 压缩用 electron-builder 自带的 7-Zip（node_modules/7zip-bin），不需要额外依赖
//   · zip 内是「平铺结构」：解压后目录里直接就是 Wallhaven Downloader.exe 和资源文件
//   · 上传走 GitHub API（uploads.github.com）；由于国内直连该域名不稳定，
//     会自动读取软件配置里的代理端口（也可以在环境变量 HTTPS_PROXY 里显式指定）
const fs = require('fs')
const path = require('path')
const https = require('https')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const releaseDir = path.join(root, 'release')
const unpackedDir = path.join(releaseDir, 'win-unpacked')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

const args = process.argv.slice(2)
const zipOnly = args.includes('--zip-only')
const tag = args.find((a) => !a.startsWith('--')) || `v${pkg.version}`

// ===== 1) 读取 GH_TOKEN（与 release.cjs 相同的规则）=====
function loadToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN
  const envPath = path.join(root, '.env')
  if (!fs.existsSync(envPath)) return ''
  const m = fs.readFileSync(envPath, 'utf8').match(/^\s*(?:export\s+)?GH_TOKEN\s*=\s*(.+?)\s*$/m)
  return m ? m[1].replace(/^["']|["']$/g, '') : ''
}

// ===== 2) 代理：优先环境变量，其次读软件配置里的端口 =====
function detectProxy() {
  // ⚠️ 仅在显式设置环境变量时才走代理：
  //    实测 GitHub 的 uploads.github.com 直连可用，而经本地代理做大文件流式上传会
  //    长时间卡住不完成（本项目踩过）。需要强制走代理时，设置 HTTPS_PROXY 即可。
  return process.env.HTTPS_PROXY || process.env.https_proxy || ''
}

// ===== 3) 压缩 win-unpacked =====
function makeZip() {
  const sevenZip = [
    path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    path.join(root, 'node_modules', '7zip-bin', 'win', 'ia32', '7za.exe')
  ].find((p) => fs.existsSync(p))
  if (!sevenZip) throw new Error('找不到 7za.exe（应由 electron-builder 的 7zip-bin 提供）')
  if (!fs.existsSync(unpackedDir)) {
    throw new Error('找不到 release/win-unpacked，请先执行 npm run dist 或 npm run release')
  }

  const zipName = `Wallhaven-Downloader-${pkg.version}-portable.zip`
  const zipPath = path.join(releaseDir, zipName)

  // 已存在且比 win-unpacked 更新时直接复用，避免重复压缩（每次要一两分钟）
  if (fs.existsSync(zipPath)) {
    const zipTime = fs.statSync(zipPath).mtimeMs
    const unpackedTime = fs.statSync(unpackedDir).mtimeMs
    if (zipTime > unpackedTime) {
      const size = fs.statSync(zipPath).size
      console.log(`\n♻️  复用已存在的 ${zipName}（${(size / 1024 / 1024).toFixed(1)} MB）`)
      return { zipPath, zipName, size }
    }
    fs.unlinkSync(zipPath)
  }

  console.log(`\n📦 压缩 win-unpacked → ${zipName}`)
  console.log('   （约 255 MB，需要 1~3 分钟，请耐心等待）')
  // -mx=5：中等压缩率，兼顾速度与体积（Electron 的二进制文件压缩收益有限）
  const r = spawnSync(sevenZip, ['a', '-tzip', '-mx=5', '-y', zipPath, path.join(unpackedDir, '*')], {
    stdio: 'inherit'
  })
  if (r.status !== 0) throw new Error('压缩失败，7za 退出码 ' + r.status)

  const size = fs.statSync(zipPath).size
  console.log(`✅ 压缩完成：${zipName}（${(size / 1024 / 1024).toFixed(1)} MB）`)
  return { zipPath, zipName, size }
}

// ===== 4) GitHub API 辅助（可走代理）=====
function getRepo() {
  const pub = (pkg.build && pkg.build.publish) || []
  const cfg = Array.isArray(pub) ? pub[0] : pub
  if (!cfg || !cfg.owner || !cfg.repo) throw new Error('package.json 的 build.publish 缺少 owner/repo')
  return { owner: cfg.owner, repo: cfg.repo }
}

function request(method, urlStr, { token, proxyUrl, headers = {}, bodyStream = null, contentLength = 0 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr)
    const opts = {
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        'User-Agent': 'portable-zip-script',
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...headers
      }
    }
    if (proxyUrl) {
      // 复用项目已有的 https-proxy-agent（生产依赖），不新增依赖
      const { HttpsProxyAgent } = require('https-proxy-agent')
      opts.agent = new HttpsProxyAgent(proxyUrl)
    }
    if (contentLength) opts.headers['Content-Length'] = contentLength

    const req = https.request(opts, (res) => {
      let d = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (d += c))
      res.on('end', () => {
        let json = null
        try {
          json = JSON.parse(d)
        } catch (e) {}
        resolve({ status: res.statusCode, json, raw: d })
      })
    })
    req.on('error', reject)
    if (bodyStream) bodyStream.pipe(req)
    else req.end()
  })
}

async function findRelease({ owner, repo, token, proxyUrl, tag }) {
  const r = await request('GET', `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`, {
    token,
    proxyUrl
  })
  if (r.status !== 200) {
    throw new Error(`找不到 Release「${tag}」（HTTP ${r.status}）：${String(r.raw).slice(0, 160)}`)
  }
  return r.json
}

// GitHub 不允许同名 asset 重复上传，重跑脚本前先删掉旧的
async function deleteAssetIfExists({ owner, repo, token, proxyUrl, release, name }) {
  const old = (release.assets || []).find((a) => a.name === name)
  if (!old) return false
  const r = await request('DELETE', `https://api.github.com/repos/${owner}/${repo}/releases/assets/${old.id}`, {
    token,
    proxyUrl
  })
  console.log(`   已删除同名旧 asset（HTTP ${r.status}）`)
  return true
}

async function uploadAsset({ owner, repo, token, proxyUrl, release, zipPath, zipName, size }) {
  const base = String(release.upload_url).replace('{?name,label}', '')
  const uploadUrl = `${base}?name=${encodeURIComponent(zipName)}`
  console.log(`\n⬆️  上传 ${zipName}（${(size / 1024 / 1024).toFixed(1)} MB）`)
  console.log('   大文件上传较慢，请耐心等待（进度不会打印，属正常现象）')
  const r = await request('POST', uploadUrl, {
    token,
    proxyUrl,
    headers: { 'Content-Type': 'application/zip' },
    bodyStream: fs.createReadStream(zipPath),
    contentLength: size
  })
  if (r.status >= 200 && r.status < 300 && r.json) {
    console.log(`✅ 上传成功：${r.json.name}（${(r.json.size / 1024 / 1024).toFixed(1)} MB）`)
    console.log(`   ${r.json.browser_download_url}`)
    return true
  }
  throw new Error(`上传失败 HTTP ${r.status}：${String(r.raw).slice(0, 200)}`)
}

// ===== 5) 主流程 =====
async function main() {
  const { zipPath, zipName, size } = makeZip()

  if (zipOnly) {
    console.log('\n（--zip-only：已跳过上传，zip 就在 release/ 目录下）')
    return
  }

  const token = loadToken()
  if (!token) {
    console.error('\n❌ 未找到 GH_TOKEN：请确认项目根目录的 .env 里有 GH_TOKEN=xxx')
    process.exit(1)
  }
  const proxyUrl = detectProxy()
  const { owner, repo } = getRepo()
  console.log(`\n🔗 目标 Release：${owner}/${repo} @ ${tag}`)
  console.log(proxyUrl ? `🌐 上传经代理 ${proxyUrl}` : '🌐 上传直连（未检测到代理）')

  const release = await findRelease({ owner, repo, token, proxyUrl, tag })
  console.log(`   已找到：${release.name}（draft=${release.draft}）`)
  await deleteAssetIfExists({ owner, repo, token, proxyUrl, release, name: zipName })
  await uploadAsset({ owner, repo, token, proxyUrl, release, zipPath, zipName, size })
  console.log('\n🎉 zip 免安装包已发布完成')
}

if (require.main === module) {
  main().catch((e) => {
    console.error('\n❌ 失败：', e.message)
    process.exit(1)
  })
}

module.exports = { makeZip, loadToken, detectProxy, main, root, pkg }
