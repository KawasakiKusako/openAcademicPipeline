import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { api } from '../lib/api'
import ContextMenu from './ContextMenu'
import type { ContextMenuItem } from './ContextMenu'
import type { AppSettings, PythonEnv } from '@shared/types'

interface Props {
  projectPath: string | null
  model: string | null
  pythonEnv: string
  totalCost: number | null
}

// VSCode-style status bar: left = project folder, right = env info
export default function StatusBar({
  projectPath,
  model,
  pythonEnv,
  totalCost
}: Props): JSX.Element {
  const [envMenu, setEnvMenu] = useState<{ x: number; y: number } | null>(null)
  const [envs, setEnvs] = useState<{
    conda: { available: boolean; envs: { name: string; path: string }[] }
    uv: { available: boolean }
    python: string | null
    pythons?: { version: string; path: string }[]
  } | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)

  // refresh env info periodically so the menu stays current
  useEffect(() => {
    api.envs().then(setEnvs).catch(() => undefined)
    api.settings().then(setSettings).catch(() => undefined)
  }, [])

  async function pickEnv(env: PythonEnv): Promise<void> {
    // 合并现有 condaPath，避免切换环境时丢失 conda 根目录定位
    const current = settings?.pythonEnv
    const merged: PythonEnv = { ...current, ...env }
    await api.updateSettings({ pythonEnv: merged })
    setSettings(await api.settings())
  }

  function envMenuItems(): ContextMenuItem[] {
    const items: ContextMenuItem[] = []
    for (const p of envs?.pythons ?? []) {
      items.push({
        label: p.version.replace('V:', 'Python '),
        action: () => pickEnv({ type: 'system', value: p.path })
      })
    }
    items.push({
      label: `系统 Python（PATH）${envs?.python ? `：${envs.python}` : ''}`,
      action: () => pickEnv({ type: 'system', value: '' })
    })
    if (envs?.conda.available) {
      for (const env of envs.conda.envs) {
        items.push({
          label: `conda: ${env.name}`,
          action: () =>
            pickEnv({
              type: 'conda',
              value: env.name,
              condaPath: envs.conda.condaPath ?? undefined
            })
        })
      }
    }
    if (envs?.uv.available) {
      items.push({
        label: 'uv (.venv)',
        action: () => pickEnv({ type: 'uv', value: '' })
      })
    }
    return items
  }

  const activeEnv = settings?.pythonEnv
    ? settings.pythonEnv.type === 'conda'
      ? `conda: ${settings.pythonEnv.value}`
      : settings.pythonEnv.type === 'uv'
        ? 'uv (.venv)'
        : pythonEnv
    : pythonEnv

  return (
    <div className="statusbar">
      <div className="statusbar-left">
        {projectPath ? (
          <button
            className="status-item folder"
            title="点击在资源管理器中打开"
            onClick={() => window.api.openPath(projectPath)}
          >
            {projectPath}
          </button>
        ) : (
          <span className="status-item">就绪</span>
        )}
      </div>
      <div className="statusbar-right">
        <span className="status-item" title="文件编码">
          UTF-8
        </span>
        <span className="status-item" title="本次会话 token 花费（累计）">
          ${(totalCost ?? 0).toFixed(4)}
        </span>
        <span className="status-item" title="当前模型">
          {model ?? '未检测到模型'}
        </span>
        <button
          className="status-item"
          title="点击选择沙盒 Python 环境"
          onClick={(e) => setEnvMenu({ x: e.clientX, y: e.clientY - 8 })}
        >
          {activeEnv}
        </button>
      </div>
      {envMenu && (
        <ContextMenu
          x={envMenu.x}
          y={envMenu.y}
          items={envMenuItems()}
          onClose={() => setEnvMenu(null)}
        />
      )}
    </div>
  )
}
