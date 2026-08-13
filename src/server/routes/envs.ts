import { Router } from 'express'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getPythonEnv } from '../settings'

export const envsRouter = Router()

export interface PythonEnvInfo {
  conda: { available: boolean; condaPath: string | null; envs: { name: string; path: string }[] }
  uv: { available: boolean }
  python: string | null // python --version output
  pythons: { version: string; path: string }[] // py launcher versions
}

function probe(cmd: string, args: string[], opts: { shell?: boolean } = {}): { ok: boolean; out: string } {
  try {
    const r = spawnSync(cmd, args, {
      encoding: 'utf-8',
      timeout: 12_000,
      windowsHide: true,
      shell: opts.shell ?? false
    })
    return { ok: r.status === 0, out: r.stdout || r.stderr || '' }
  } catch {
    return { ok: false, out: '' }
  }
}

// Windows 注册表查询所有 Python 安装（HKLM + HKCU）——
// 不依赖 PATH / py launcher，最可靠的枚举方式。
function queryRegistryPythons(): { version: string; path: string }[] {
  const found: { version: string; path: string }[] = []
  if (process.platform !== 'win32') return found
  const script = `
$result = @()
foreach ($root in @('HKLM:\\Software\\Python\\PythonCore', 'HKCU:\\Software\\Python\\PythonCore')) {
  if (Test-Path $root) {
    Get-ChildItem $root | ForEach-Object {
      $v = $_.PSChildName
      $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      $install = $props.InstallPath
      if (-not $install) { $sub = Get-ChildItem $_.PSPath | ForEach-Object { Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue } | Where-Object { $_.InstallPath } | Select-Object -First 1; if ($sub) { $install = $sub.InstallPath } }
      if ($install) {
        $exe = Join-Path $install 'python.exe'
        $result += [PSCustomObject]@{ version = $v; path = $exe }
      }
    }
  }
}
$result | ConvertTo-Json -Compress
`
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    encoding: 'utf-8',
    timeout: 15_000,
    windowsHide: true
  })
  if (r.status !== 0 || !r.stdout.trim()) return found
  try {
    const data = JSON.parse(r.stdout.trim()) as { version: string; path: string }[] | { version: string; path: string }
    const list = Array.isArray(data) ? data : [data]
    for (const item of list) {
      if (item?.path && existsSync(item.path)) {
        found.push({ version: item.version, path: item.path })
      }
    }
  } catch {
    // ignore
  }
  return found
}

// Find conda: manual path from settings (file or directory), else common
// install locations, else scan drive roots for *conda* dirs
function findConda(): string | null {
  const manual = getPythonEnv().condaPath?.trim()
  if (manual) {
    if (existsSync(manual)) {
      if (/\.(exe|bat|cmd)$/i.test(manual)) return manual
      // directory: look for Scripts/conda.exe or condabin/conda.bat inside
      const script = join(manual, 'Scripts', 'conda.exe')
      if (existsSync(script)) return script
      const condabin = join(manual, 'condabin', 'conda.bat')
      if (existsSync(condabin)) return condabin
    }
  }
  const common = findCondaCommon()
  if (common) return common

  // scan drive roots (two levels deep) for conda-like dirs
  for (const root of ['C:', 'D:', 'E:', 'F:']) {
    const rootDir = `${root}\\`
    if (!existsSync(rootDir)) continue
    try {
      for (const entry of readdirSync(rootDir)) {
        if (!/conda|anaconda|miniforge|mamba/i.test(entry)) continue
        const candidate = join(rootDir, entry, 'Scripts', 'conda.exe')
        if (existsSync(candidate)) return candidate
        // one more level (e.g. E:\Software\anaconda3)
        try {
          for (const sub of readdirSync(join(rootDir, entry))) {
            if (!/conda|anaconda|miniforge|mamba/i.test(sub)) continue
            const nested = join(rootDir, entry, sub, 'Scripts', 'conda.exe')
            if (existsSync(nested)) return nested
          }
        } catch {
          // unreadable subdir
        }
      }
    } catch {
      // unreadable drive
    }
  }
  return null
}

// Collect conda environment pythons directly (envs/<name>/python.exe) — these
// are usable even when the conda executable itself can't be located.
function collectFromRoot(base: string): { version: string; path: string }[] {
  const found: { version: string; path: string }[] = []
  if (!existsSync(base)) return found
  const basePy = join(base, 'python.exe')
  if (existsSync(basePy)) {
    found.push({ version: `${base.split(/[\\/]/).pop()} (base)`, path: basePy })
  }
  const envsDir = join(base, 'envs')
  if (existsSync(envsDir)) {
    try {
      for (const envName of readdirSync(envsDir)) {
        const envPy = join(envsDir, envName, 'python.exe')
        if (existsSync(envPy)) {
          found.push({ version: `${base.split(/[\\/]/).pop()}/${envName}`, path: envPy })
        }
      }
    } catch {
      // ignore
    }
  }
  return found
}

function collectCondaEnvPythons(): { version: string; path: string }[] {
  const found: { version: string; path: string }[] = []
  // manual conda root from settings (e.g. D:\tools\anaconda3)
  const manual = getPythonEnv().condaPath?.trim()
  if (manual) {
    const manualRoot = /\.(exe|bat|cmd)$/i.test(manual)
      ? join(manual, '..', '..')
      : manual
    for (const p of collectFromRoot(manualRoot)) found.push(p)
  }
  const roots = ['C:', 'D:', 'E:', 'F:']
  for (const root of roots) {
    const rootDir = `${root}\\`
    if (!existsSync(rootDir)) continue
    try {
      for (const entry of readdirSync(rootDir)) {
        if (!/conda|anaconda|miniforge|mamba/i.test(entry)) continue
        const base = join(rootDir, entry)
        for (const p of collectFromRoot(base)) {
          if (!found.some((x) => x.path === p.path)) found.push(p)
        }
        // one more level (e.g. E:\Software\anaconda3)
        try {
          for (const sub of readdirSync(base)) {
            if (!/conda|anaconda|miniforge|mamba/i.test(sub)) continue
            for (const p of collectFromRoot(join(base, sub))) {
              if (!found.some((x) => x.path === p.path)) found.push(p)
            }
          }
        } catch {
          // unreadable subdir
        }
      }
    } catch {
      // unreadable drive
    }
  }
  return found
}

function findCondaCommon(): string | null {
  const home = homedir()
  const candidates = [
    join(home, 'anaconda3', 'Scripts', 'conda.exe'),
    join(home, 'miniconda3', 'Scripts', 'conda.exe'),
    join(home, 'Anaconda3', 'Scripts', 'conda.exe'),
    join(home, 'Miniconda3', 'Scripts', 'conda.exe'),
    join(home, 'mambaforge', 'Scripts', 'conda.exe'),
    join(home, 'Mambaforge', 'Scripts', 'conda.exe'),
    join(home, 'miniforge3', 'Scripts', 'conda.exe'),
    join(home, 'Miniforge3', 'Scripts', 'conda.exe'),
    join(home, '.conda', 'Scripts', 'conda.exe'),
    join(home, 'AppData', 'Local', 'anaconda3', 'Scripts', 'conda.exe'),
    join(home, 'AppData', 'Local', 'miniconda3', 'Scripts', 'conda.exe'),
    join('C:', 'ProgramData', 'anaconda3', 'Scripts', 'conda.exe'),
    join('C:', 'ProgramData', 'miniconda3', 'Scripts', 'conda.exe'),
    join('C:', 'Program Files', 'anaconda3', 'Scripts', 'conda.exe'),
    join('C:', 'anaconda3', 'Scripts', 'conda.exe'),
    join('C:', 'miniconda3', 'Scripts', 'conda.exe')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  // conda.bat on PATH
  const where = probe('where', ['conda'])
  if (where.ok && where.out.trim()) {
    const first = where.out.trim().split(/\r?\n/)[0]
    if (/\.(bat|cmd|exe)$/i.test(first)) return first
  }
  return null
}

// uv location: PATH or ~/.local/bin
function findUv(): string | null {
  const home = homedir()
  const candidates = [
    join(home, '.local', 'bin', 'uv.exe'),
    join(home, '.cargo', 'bin', 'uv.exe')
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return probe('where', ['uv']).ok ? 'uv' : null
}

// Full disk scan for conda (async, non-blocking): where /r on every drive.
// Returns the first conda.exe found plus its environments.
envsRouter.post('/envs/full-scan', async (_req, res) => {
  const drives = ['C:', 'D:', 'E:', 'F:', 'G:']
  const runAsync = (cmd: string, args: string[]): Promise<{ code: number; out: string }> =>
    new Promise((resolve) => {
      const child = spawn(cmd, args, {
        windowsHide: true,
        shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd)
      })
      let out = ''
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill()
      }, 120_000)
      child.stdout?.setEncoding('utf-8')
      child.stderr?.setEncoding('utf-8')
      child.stdout?.on('data', (c: string) => (out += c))
      child.stderr?.on('data', (c: string) => (out += c))
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ code: timedOut ? -1 : (code ?? -1), out })
      })
      child.on('error', () => {
        clearTimeout(timer)
        resolve({ code: -1, out: '' })
      })
    })

  let found: string | null = null
  for (const drive of drives) {
    if (!existsSync(`${drive}\\`)) continue
    const r = await runAsync('where', ['/r', `${drive}\\`, 'conda.exe'])
    if (r.code === 0 && r.out.trim()) {
      found = r.out.trim().split(/\r?\n/)[0]
      break
    }
  }

  if (!found) {
    res.json({ found: null, envs: [] })
    return
  }

  // probe the found conda's environments
  const envList = await runAsync(found, ['env', 'list', '--json'])
  let envs: { name: string; path: string }[] = []
  try {
    const parsed = JSON.parse(envList.out) as { envs?: string[] }
    envs = (parsed.envs ?? []).map((p) => {
      const parts = p.replace(/\\/g, '/').split('/')
      return { name: parts[parts.length - 1] || p, path: p }
    })
  } catch {
    // fall through
  }
  res.json({ found, envs })
})

// Detect available Python environments (conda / uv / system python)
envsRouter.get('/envs', (_req, res) => {
  const info: PythonEnvInfo = {
    conda: { available: false, condaPath: null, envs: [] },
    uv: { available: false },
    python: null,
    pythons: []
  }

  // conda: PATH / common install paths / CONDA_PREFIX env.
  // Use the conda python's `-m conda` module (more reliable than conda.exe wrapping).
  let condaPath = findConda()
  if (!condaPath && process.env['CONDA_PREFIX']) {
    const prefixConda = join(process.env['CONDA_PREFIX'], 'Scripts', 'conda.exe')
    if (existsSync(prefixConda)) condaPath = prefixConda
  }
  if (condaPath) {
    info.conda.condaPath = condaPath
    // locate the conda base python (../python.exe next to Scripts/conda.exe)
    const condaRoot = join(condaPath, '..', '..')
    const basePython = join(condaRoot, 'python.exe')
    const listVia = existsSync(basePython)
      ? { cmd: basePython, args: ['-m', 'conda', 'env', 'list', '--json'] }
      : { cmd: condaPath, args: ['env', 'list', '--json'], shell: /\.(bat|cmd)$/i.test(condaPath) }
    const r = probe(listVia.cmd, listVia.args, { shell: 'shell' in listVia && !!listVia.shell })
    if (r.ok) {
      try {
        const parsed = JSON.parse(r.out) as { envs?: string[] }
        info.conda.available = true
        info.conda.envs = (parsed.envs ?? []).map((p) => {
          const parts = p.replace(/\\/g, '/').split('/')
          return { name: parts[parts.length - 1] || p, path: p }
        })
      } catch {
        // fall through
      }
    }
  }

  // uv
  info.uv.available = findUv() !== null

  // system python
  const py = probe('python', ['--version'])
  if (py.ok) info.python = py.out.trim()
  else {
    const py3 = probe('py', ['-3', '--version'])
    if (py3.ok) info.python = py3.out.trim()
  }

  // py launcher: list all installed pythons (Windows)
  const pyList = probe('py', ['-0p'])
  if (pyList.ok) {
    for (const line of pyList.out.split(/\r?\n/)) {
      const m = line.match(/^\s*-\s*(\S+)\s+(.+)$/)
      if (m) info.pythons.push({ version: m[1], path: m[2].trim() })
    }
  }

  // 注册表枚举（最可靠）：HKLM + HKCU Software\Python\PythonCore
  for (const p of queryRegistryPythons()) {
    if (!info.pythons.some((x) => x.path === p.path)) {
      info.pythons.push({ version: `Py${p.version}`, path: p.path })
    }
  }

  // uv-managed pythons (~/.local/share/uv/python/*/python.exe)
  const uvPythonRoot = join(homedir(), '.local', 'share', 'uv', 'python')
  if (existsSync(uvPythonRoot)) {
    try {
      for (const entry of readdirSync(uvPythonRoot)) {
        const exe = join(uvPythonRoot, entry, 'python.exe')
        if (existsSync(exe)) {
          const v = probe(exe, ['--version'])
          info.pythons.push({
            version: v.ok ? v.out.trim().replace(/^Python\s*/, 'uv-') : `uv-${entry}`,
            path: exe
          })
        }
      }
    } catch {
      // ignore
    }
  }

  // conda environment pythons found by directory scan (works even without
  // conda on PATH): base env + envs/<name> environments
  const condaEnvPythons = collectCondaEnvPythons()
  for (const p of condaEnvPythons) {
    if (!info.pythons.some((x) => x.path === p.path)) {
      info.pythons.push({ version: `conda:${p.version}`, path: p.path })
    }
  }

  res.json(info)
})
