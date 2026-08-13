// Postinstall hook: ensures the Electron binary is present after `npm install`.
//
// Why: npm 11+ rewrites the `electron_mirror` key in .npmrc to `electron-mirror`
// (underscore -> dash) when exporting npm_config_* env vars to scripts, so
// Electron's installer never sees the mirror and falls back to the GitHub CDN,
// which is slow/unreachable on CN networks. We pass ELECTRON_MIRROR explicitly.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronPkgDir = dirname(require.resolve('electron/package.json'))
const distExe = join(electronPkgDir, 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron')

if (existsSync(distExe)) {
  console.log('ensure-electron-binary: binary already present, skipping download.')
  process.exit(0)
}

console.log('ensure-electron-binary: downloading Electron binary...')
const result = spawnSync(process.execPath, [join(electronPkgDir, 'install.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_MIRROR:
      process.env.ELECTRON_MIRROR ?? 'https://npmmirror.com/mirrors/electron/'
  }
})
process.exit(result.status ?? 1)
