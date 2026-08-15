#!/usr/bin/env node
// OAP 权限确认 Hook：由 Claude Code 的 PreToolUse hook 调用。
// 流程：CLI 要执行 Bash → 本脚本收到 hook JSON → POST 到 OAP 后端(11455) →
// 桌面弹窗用户决策 → 后端返回决策 → 本脚本输出 permissionDecision 给 CLI。
//
// 部署方式：本文件是唯一源码（单点维护）。构建时经 Vite `?raw` 内嵌进主进程产物，
// 运行时由 chat.ts 的 ensurePermHook() 写入 <DATA_ROOT>/perm-hook.js，
// 沙盒 .claude/settings.json 引用的是该磁盘路径（dev 与打包版均生效）。
// 用法（写入沙盒 .claude/settings.json 的 hooks.PreToolUse）：
//   node "<DATA_ROOT>/perm-hook.js"

const OAP_API = process.env.OAP_API_URL || 'http://127.0.0.1:11455/api/cli-permission/request'

let input = ''
process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk) => (input += chunk))
process.stdin.on('end', async () => {
  try {
    const ev = JSON.parse(input || '{}')
    const toolInput = ev.tool_input || {}
    const command = String(toolInput.command || toolInput.file_path || toolInput.prompt || '')
    const payload = {
      action: String(ev.tool_name || 'Bash'),
      command,
      toolInput: JSON.stringify(toolInput),
      cwd: process.cwd()
    }
    // 5 分钟超时：用户不响应默认拒绝
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000)
    const res = await fetch(OAP_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    clearTimeout(timer)
    const data = await res.json().catch(() => ({ decision: 'deny' }))
    // hook 响应协议：permissionDecision allow/deny
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: data.decision === 'allow' ? 'allow' : 'deny'
        }
      })
    )
  } catch {
    // 任何异常默认拒绝（安全优先）
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' }
      })
    )
  }
})
