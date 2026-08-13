import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { JSX } from 'react'
import { IconClose, IconMin, IconMax, IconMore } from './Icon'
import appBack from '../assets/app-back.png'

export interface MenuItem {
  label: string
  action?: () => void
  disabled?: boolean
  type?: 'separator'
}

interface Props {
  menus: { label: string; items: MenuItem[] }[]
  projectLabel?: string | null
  onChatIdea?: (text: string) => void
  onChatOpen?: () => void // 点击输入框 / ⋯ 按钮 → 展开悬浮会话窗（含历史）
}

// VSCode-style title bar: menu bar + centered global-chat input + window controls
export default function TitleBar({
  menus,
  projectLabel,
  onChatIdea,
  onChatOpen
}: Props): JSX.Element {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openMenu) return
    const onDown = (e: MouseEvent): void => {
      if (!barRef.current?.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openMenu])

  return (
    <div className="titlebar" ref={barRef}>
      <div className="titlebar-menus" onMouseDown={(e) => e.stopPropagation()}>
        <img className="titlebar-logo" src={appBack} alt="OAP" />
        {menus.map((menu) => (
          <div key={menu.label} className="menu">
            <button
              className={`menu-btn${openMenu === menu.label ? ' open' : ''}`}
              onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
              onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
            >
              {menu.label}
            </button>
            {openMenu === menu.label && (
              <div className="menu-drop">
                {menu.items.map((item) =>
                  item.type === 'separator' ? (
                    <div key={`sep-${item.label ?? ''}`} className="menu-sep" />
                  ) : (
                    <button
                      key={item.label}
                      className="menu-item"
                      disabled={item.disabled}
                      onClick={() => {
                        setOpenMenu(null)
                        item.action?.()
                      }}
                    >
                      {item.label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
        {projectLabel && <span className="titlebar-project">{projectLabel}</span>}
      </div>

      {projectLabel && (onChatIdea || onChatOpen) && (
        <div className="titlebar-center" onMouseDown={(e) => e.stopPropagation()}>
          <input
            className="titlebar-chat-input"
            placeholder="点击输入想法，与全局会话对话…"
            spellCheck={false}
            onFocus={() => onChatOpen?.()}
            onClick={() => onChatOpen?.()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                onChatIdea?.(e.currentTarget.value.trim())
                e.currentTarget.value = ''
              }
            }}
          />
          {onChatOpen && (
            <button className="tb-btn center-btn" title="查看历史对话" onClick={onChatOpen}>
              <IconMore size={14} />
            </button>
          )}
        </div>
      )}

      <div className="titlebar-controls" onMouseDown={(e) => e.stopPropagation()}>
        <button className="tb-btn" title="最小化" onClick={() => window.api.windowMinimize()}>
          <IconMin size={13} />
        </button>
        <button className="tb-btn" title="最大化" onClick={() => window.api.windowMaximize()}>
          <IconMax size={12} />
        </button>
        <button className="tb-btn close" title="关闭" onClick={() => window.api.windowClose()}>
          <IconClose size={14} />
        </button>
      </div>
    </div>
  )
}

export interface MenuActions {
  navigate: ReturnType<typeof useNavigate>
  projectId?: string | null
  sandboxPath?: string | null
  theme: string
  toggleTheme: () => void
  wordWrap: boolean
  setWordWrap: (v: boolean) => void
  fontSize: number
  setFontSize: (n: number) => void
  requestSave: () => void
  closeActiveTab: () => void
  toggleSidebar: () => void
  togglePanel: () => void
  toggleAux: () => void
  onAbout?: () => void
  onExportProject?: () => void
  onImportProject?: () => void
  onTempChat?: () => void
  onRecommend?: () => void
  onCheckUpdate?: () => void
}

export function buildMenus(opts: MenuActions): { label: string; items: MenuItem[] }[] {
  const {
    navigate,
    projectId,
    sandboxPath,
    theme,
    toggleTheme,
    wordWrap,
    setWordWrap,
    fontSize,
    setFontSize,
    requestSave,
    closeActiveTab,
    toggleSidebar,
    togglePanel,
    toggleAux,
    onAbout,
    onExportProject,
    onImportProject,
    onTempChat,
    onRecommend,
    onCheckUpdate
  } = opts
  return [
    {
      label: '文件',
      items: [
        { label: '项目总览', action: () => navigate('/projects') },
        { label: '新建项目…', action: () => navigate('/projects/new') },
        { label: '导出当前项目…', action: () => onExportProject?.(), disabled: !projectId },
        { label: '导入项目…', action: () => onImportProject?.() },
        { label: '设置', action: () => navigate('/settings') },
        { label: '退出', action: () => window.api.windowClose() }
      ]
    },
    {
      label: '项目',
      items: [
        {
          label: '打开项目文件夹',
          action: () => {
            if (sandboxPath) window.api.openPath(sandboxPath)
          },
          disabled: !sandboxPath
        },
        { label: '新建任务', action: () => navigate(`/projects/${projectId}`), disabled: !projectId },
        { label: '知识库', action: () => navigate(`/projects/${projectId}?tab=library`), disabled: !projectId }
      ]
    },
    {
      label: '编辑',
      items: [
        { label: '撤销 (Ctrl+Z)', action: () => document.execCommand('undo') },
        { label: '重做 (Ctrl+Y)', action: () => document.execCommand('redo') },
        { type: 'separator', label: '' },
        { label: '复制 (Ctrl+C)', action: () => document.execCommand('copy') },
        { label: '粘贴 (Ctrl+V)', action: () => document.execCommand('paste') },
        { label: '删除', action: () => document.execCommand('delete') },
        { label: '全选 (Ctrl+A)', action: () => document.execCommand('selectAll') },
        { type: 'separator', label: '' },
        { label: '保存 (Ctrl+S)', action: requestSave },
        { label: '关闭选项卡 (Ctrl+W)', action: closeActiveTab },
        { label: '开关主侧栏 (Ctrl+B)', action: toggleSidebar },
        { label: '开关面板 (Ctrl+J)', action: togglePanel },
        { label: '开关副侧栏 (Ctrl+Shift+B)', action: toggleAux }
      ]
    },
    {
      label: '查看',
      items: [
        {
          label: theme === 'dark' ? '切换浅色主题' : '切换深色主题',
          action: toggleTheme
        },
        {
          label: wordWrap ? '自动换行：开' : '自动换行：关',
          action: () => setWordWrap(!wordWrap)
        },
        { label: `字体大小：${fontSize}px`, disabled: true, action: () => undefined },
        { label: '增大字体 (Ctrl+=)', action: () => setFontSize(fontSize + 1) },
        { label: '减小字体 (Ctrl+-)', action: () => setFontSize(fontSize - 1) },
        { label: '推荐阅读', action: () => onRecommend?.() },
        { label: '临时对话', action: () => onTempChat?.() }
      ]
    },
    {
      label: '帮助',
      items: [
        { label: '检查更新…', action: () => onCheckUpdate?.() },
        {
          label: '关于',
          action: () => onAbout?.()
        }
      ]
    }
  ]
}
