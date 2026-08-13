import { Router } from 'express'
import type { Response } from 'express'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDb, mapTask } from '../db'
import { getPythonEnv } from '../settings'
import { resolveInSandbox } from '../sandbox'
import type { RunResult } from '../../shared/types'

export const runRouter = Router()

const RUN_TIMEOUT_MS = 120_000

// Build the command for a sandbox python script based on the configured env.
// Prefers the environment's own python.exe directly (no conda run wrapper —
// much more reliable on Windows).
function buildCommand(env: ReturnType<typeof getPythonEnv>, scriptPath: string): string[] {
  if (env.type === 'conda') {
    const envName = (env.value ?? '').trim()
    // direct python.exe of the conda env: <condaRoot>/envs/<name>/python.exe
    const conda = (env.condaPath ?? '').trim()
    if (conda) {
      const condaRoot = join(conda, '..', '..')
      if (envName) {
        const envPython = join(condaRoot, 'envs', envName, 'python.exe')
        if (existsSync(envPython)) return [envPython, scriptPath]
      } else {
        const basePython = join(condaRoot, 'python.exe')
        if (existsSync(basePython)) return [basePython, scriptPath]
      }
    }
    // fallback to conda run (located executable, never the bare PATH name)
    if (conda && existsSync(conda)) {
      return [conda, 'run', '-n', envName, '--no-capture-output', 'python', scriptPath]
    }
    return ['python', scriptPath]
  }
  if (env.type === 'uv') {
    return ['uv', 'run', 'python', scriptPath]
  }
  if (env.type === 'system' && env.value && existsSync(env.value.trim())) {
    return [env.value.trim(), scriptPath]
  }
  return ['python', scriptPath]
}

function runScript(projectId: string, filePath: string, res: Response): void {
  const script = resolveInSandbox(projectId, filePath)
  const env = getPythonEnv()
  const cmd = buildCommand(env, script)
  const commandLabel = cmd.join(' ')

  const child = spawn(cmd[0], cmd.slice(1), {
    cwd: script.replace(/[^/\\]+$/, ''),
    windowsHide: true,
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd[0]) // conda may be a .bat
  })

  let stdout = ''
  let stderr = ''
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill()
  }, RUN_TIMEOUT_MS)

  child.stdout?.setEncoding('utf-8')
  child.stderr?.setEncoding('utf-8')
  child.stdout?.on('data', (c: string) => (stdout += c))
  child.stderr?.on('data', (c: string) => (stderr += c))

  child.on('error', (err) => {
    clearTimeout(timer)
    res.status(500).json({ error: `无法启动命令：${err.message}\n命令：${commandLabel}\n请检查设置的运行环境与路径` })
  })

  child.on('close', (code) => {
    clearTimeout(timer)
    const result: RunResult = {
      exitCode: code,
      stdout,
      stderr,
      timedOut,
      command: commandLabel
    }
    res.json(result)
  })
}

// Run a python script inside the project sandbox (data-sandbox tasks)
runRouter.post('/tasks/:id/run', (req, res) => {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id)
  if (!row) {
    res.status(404).json({ error: '任务不存在' })
    return
  }
  const task = mapTask(row as Record<string, unknown>)
  const filePath = String(req.body?.filePath ?? '')
  if (!filePath || !filePath.endsWith('.py')) {
    res.status(400).json({ error: '请指定一个 .py 脚本' })
    return
  }
  runScript(task.projectId, filePath, res)
})

// Project-level run (workbench file editor)
runRouter.post('/projects/:id/run', (req, res) => {
  if (!getDb().prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id)) {
    res.status(404).json({ error: '项目不存在' })
    return
  }
  const filePath = String(req.body?.filePath ?? '')
  if (!filePath || !filePath.endsWith('.py')) {
    res.status(400).json({ error: '请指定一个 .py 脚本' })
    return
  }
  runScript(req.params.id, filePath, res)
})
