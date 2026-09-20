// scripts/after-build.cjs
// electron-builder 的 afterAllArtifactBuild 钩子
//
// 作用：打包完成后（安装包与 latest.yml 已生成）额外产出「zip 免安装版」，
//       并把 zip 路径返回给 electron-builder —— 它会自动把这个文件上传到发布目标
//       （GitHub Release），见 app-builder-lib/out/index.js 中的 scheduleUpload 逻辑。
//
// 为什么用钩子而不是自己调 GitHub API 上传：
//   实测自写上传会长时间卡住不完成（HTTP 代理 + 大文件流式上传的组合不稳定），
//   而 electron-builder 自带的上传通道已被验证可用（1.3.1 的 exe/blockmap/latest.yml 就是它传的）。
//
// 在 package.json 中配置： "build": { "afterAllArtifactBuild": "scripts/after-build.cjs" }
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

module.exports = async function afterAllArtifactBuild(buildResult) {
  const root = path.join(__dirname, '..')
  const releaseDir = buildResult.outDir || path.join(root, 'release')
  const unpackedDir = path.join(releaseDir, 'win-unpacked')
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

  // 只有真正要发布时才做 zip（npm run dist 不带 --publish，跳过以省时间）
  const willPublish =
    process.argv.some((a) => a.startsWith('--publish')) && !process.argv.includes('never')
  if (!willPublish) {
    console.log('📦 未启用发布（无 --publish），跳过 zip 免安装包')
    return []
  }

  // ===== 1) 定位 7za（electron-builder 自带的 7zip-bin）=====
  const sevenZip = [
    path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'),
    path.join(root, 'node_modules', '7zip-bin', 'win', 'ia32', '7za.exe')
  ].find((p) => fs.existsSync(p))
  if (!sevenZip) {
    console.warn('⚠️  找不到 7za.exe，跳过 zip 免安装包')
    return []
  }
  if (!fs.existsSync(unpackedDir)) {
    console.warn('⚠️  找不到 win-unpacked 目录，跳过 zip 免安装包')
    return []
  }

  // ===== 2) 压缩 =====
  const zipName = `Wallhaven-Downloader-${pkg.version}-portable.zip`
  const zipPath = path.join(releaseDir, zipName)

  if (fs.existsSync(zipPath)) {
    const zipTime = fs.statSync(zipPath).mtimeMs
    const unpackedTime = fs.statSync(unpackedDir).mtimeMs
    if (zipTime > unpackedTime) {
      console.log(`♻️  复用已存在的 ${zipName}`)
      return [zipPath]
    }
    fs.unlinkSync(zipPath)
  }

  console.log(`\n📦 生成 zip 免安装包：${zipName}（约 255 MB，需要 1~3 分钟）`)
  // -mx=5：中等压缩率，兼顾速度与体积（Electron 二进制压缩收益有限）
  const r = spawnSync(
    sevenZip,
    ['a', '-tzip', '-mx=5', '-y', zipPath, path.join(unpackedDir, '*')],
    { stdio: 'inherit' }
  )
  if (r.status !== 0 || !fs.existsSync(zipPath)) {
    console.warn(`⚠️  zip 压缩失败（7za 退出码 ${r.status}），跳过上传`)
    return []
  }
  const size = fs.statSync(zipPath).size
  console.log(`✅ zip 生成完成：${zipName}（${(size / 1024 / 1024).toFixed(1)} MB），将由 electron-builder 一并上传\n`)

  // 返回给 electron-builder：它会把该文件排入上传队列
  return [zipPath]
}
