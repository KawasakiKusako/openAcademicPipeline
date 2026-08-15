import { useCallback, useEffect, useRef, useState } from 'react'
import { api, sendChat } from './api'
import type { ToolUse } from '@shared/types'

// 统一聊天流控制 hook：ChatPanel / SessionPage / TaskDetailPage / GlobalChatPopup 共用。
// 收敛以下 Bug 4 前端修复，避免五个调用点各自漂移：
//  - sendingRef 同步锁：start() 第一行（任何 await 之前）拦截双发送连点穿透
//  - runIdRef 守卫：旧 run 的 finally / 计时器 / stop 的 await 之后，
//    发现已有新 run 接管则不再碰共享状态（不清新 run 的 abortRef/sending，
//    计时器不误杀新 run 的引擎）
//  - start 捕获会话 id：计时器 / stop 用捕获值（路由切换后 stop 的是旧会话，正确）
//  - 计时器"真停止"：到点 abort fetch + 后端 stopSession + 释放 sending
//    （旧实现只复位 sending，fetch 仍活着 → 旧 run 残留占用会话）
//  - stop() await stopSession：sending 保持到停止完成，消除"stop 在途 + 重发"跨 run 竞态
//  - 卸载清理：中止在途请求，不遗留孤儿流

export interface ChatStreamHandlers {
  onText: (delta: string) => void
  onToolUse?: (tool: ToolUse) => void
}

export interface UseChatStreamOptions {
  getSessionId: () => string | Promise<string>
  preCheck?: boolean // 默认 true：发送前 GET status，running 则先 stopSession
  onDone?: () => void | Promise<void>
  onIncomplete?: () => void // 流在 done/error 前结束 / 非中断错误：刷新状态
}

export interface UseChatStreamResult {
  sending: boolean
  error: string | null
  setError: (e: string | null) => void
  start: (content: string, handlers: ChatStreamHandlers) => Promise<void>
  stop: () => Promise<void>
}

export function useChatStream(opts: UseChatStreamOptions): UseChatStreamResult {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sendingRef = useRef(false)
  const runIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const currentSidRef = useRef<string | null>(null)

  const optsRef = useRef(opts)
  optsRef.current = opts

  // 注：前端不设自动停止超时——大型任务（论文写作/长分析）可能持续数十分钟，
  // 固定时限会误杀；后端有"活动感知"兜底（10 分钟无任何输出才强制收敛），
  // 用户始终可通过停止按钮主动打断。

  // 卸载清理：中止在途请求，不遗留孤儿流
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const start = useCallback(
    async (content: string, handlers: ChatStreamHandlers): Promise<void> => {
      if (sendingRef.current) return // 同步锁：任何 await 之前拦截双发送
      sendingRef.current = true
      const runId = ++runIdRef.current
      setSending(true)
      setError(null)
      try {
        const sid = await optsRef.current.getSessionId()
        currentSidRef.current = sid
        // 发送前检查：后端残留 running 则先强制停止再发送，避免 409 卡死
        if (optsRef.current.preCheck !== false) {
          try {
            const s = await api.session(sid)
            if (s.status === 'running') {
              await api.stopSession(sid)
            }
          } catch {
            // 查询失败不阻塞发送
          }
        }
        if (runIdRef.current !== runId || !sendingRef.current) return
        const controller = new AbortController()
        abortRef.current = controller
        // 流式文本节流：每个 delta 触发一次 React 渲染（外加 markdown 解析）会拖垮
        // 渲染线程——长回复数百个 delta → 整个窗口输入卡死、设置页无法响应。
        // 按 80ms 批量派发；终态（done/error/中断）前强制 flush 剩余增量。
        let pendingDelta = ''
        let flushTimer: ReturnType<typeof setTimeout> | null = null
        const flushDelta = (): void => {
          flushTimer = null
          if (pendingDelta) {
            const d = pendingDelta
            pendingDelta = ''
            handlers.onText(d)
          }
        }
        await sendChat(
          sid,
          content,
          {
            onText: (delta) => {
              pendingDelta += delta
              if (!flushTimer) flushTimer = setTimeout(flushDelta, 80)
            },
            onToolUse: handlers.onToolUse,
            onDone: () => {
              flushDelta()
              void optsRef.current.onDone?.()
            },
            onError: (message) => {
              flushDelta()
              if (runIdRef.current === runId) setError(message)
            },
            onIncomplete: () => {
              flushDelta()
              if (runIdRef.current === runId) {
                setError('响应流意外中断，回复可能不完整')
                optsRef.current.onIncomplete?.()
              }
            }
          },
          controller.signal
        )
        flushDelta()
      } catch (err) {
        if (runIdRef.current === runId) {
          if (!(err instanceof Error && err.name === 'AbortError')) {
            setError(err instanceof Error ? err.message : String(err))
            optsRef.current.onIncomplete?.()
          }
        }
      } finally {
        if (runIdRef.current === runId) {
          sendingRef.current = false
          setSending(false)
          abortRef.current = null
        }
      }
    },
    []
  )

  const stop = useCallback(async (): Promise<void> => {
    const runId = runIdRef.current
    const sid = currentSidRef.current
    abortRef.current?.abort()
    if (sid) {
      // 等 stopSession 落库 idle（5s 超时防挂）；失败由下次 start 的 preCheck 自愈
      await Promise.race([
        api.stopSession(sid).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 5000))
      ])
    }
    if (runIdRef.current === runId) {
      sendingRef.current = false
      setSending(false)
    }
  }, [])

  return { sending, error, setError, start, stop }
}
