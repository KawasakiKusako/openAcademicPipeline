#!/usr/bin/env node
// OAP 个性化设置工具：供沙盒里的 Claude Code（AI 会话）修改应用外观/个性化设置。
// 自然语言场景：用户在全局会话中说"把主题改成浅色、背景调深一点"，
// AI 通过 Bash 执行本脚本 → PUT 到 OAP 后端（127.0.0.1:11455）→ 界面即时生效。
//
// 用法：
//   node "<DATA_ROOT>/oap-style.js"            # 打印全部字段（key/label/type/options/当前值）
//   node "<DATA_ROOT>/oap-style.js" --list     # 同上
//   node "<DATA_ROOT>/oap-style.js" theme=light bgColor=#222831 radiusMode=sharp
//   node "<DATA_ROOT>/oap-style.js" --reset    # 恢复全部默认值
//
// 部署方式：本文件是唯一源码。构建时经 Vite `?raw` 内嵌进主进程产物，
// 运行时由 server 的 ensureStyleScript() 写入 <DATA_ROOT>/oap-style.js。

const API = process.env.OAP_API_URL || 'http://127.0.0.1:11455/api/settings/personalization'

async function main() {
  const args = process.argv.slice(2)
  const res = await fetch(API)
  if (!res.ok) throw new Error(`无法连接 OAP 后端 (HTTP ${res.status})，请确认 OAP 正在运行`)
  const { fields, values } = await res.json()

  if (args.length === 0 || args[0] === '--list') {
    console.log('【OAP 个性化字段】（key=当前值；修改示例：node oap-style.js theme=light）')
    for (const f of fields) {
      const opts = f.type === 'select' && Array.isArray(f.options)
        ? ` [${f.options.map((o) => o.value).join('|')}]`
        : ''
      console.log(`  ${f.key} = ${JSON.stringify(values[f.key] ?? f.defaultValue)}  (${f.type}${opts}) ${f.label}`)
    }
    return
  }

  if (args[0] === '--reset') {
    const patch = {}
    for (const f of fields) patch[f.key] = f.defaultValue
    const r = await fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: patch })
    })
    if (!r.ok) throw new Error(`恢复默认失败 (HTTP ${r.status})`)
    console.log('✅ 已恢复全部默认设置')
    return
  }

  // key=value 批量赋值：先整体校验（非法 key 报错且不写入任何值）
  const patch = {}
  for (const arg of args) {
    const idx = arg.indexOf('=')
    if (idx <= 0) throw new Error(`参数格式错误（应为 key=value）：${arg}`)
    const key = arg.slice(0, idx).trim()
    const raw = arg.slice(idx + 1)
    const field = fields.find((f) => f.key === key)
    if (!field) throw new Error(`未知字段：${key}（可用 --list 查看全部字段，禁止修改列表之外的 key）`)
    // 按字段类型转换（布尔/数字必须正确解析，避免 'false' 被当成 true）
    if (field.type === 'boolean') {
      if (raw === 'true') patch[key] = true
      else if (raw === 'false') patch[key] = false
      else throw new Error(`字段 ${key} 是布尔类型，取值应为 true/false`)
    } else if (field.type === 'number') {
      const n = Number(raw)
      if (Number.isNaN(n)) throw new Error(`字段 ${key} 是数字类型，取值非法：${raw}`)
      patch[key] = n
    } else {
      patch[key] = raw
    }
  }

  const r = await fetch(API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: patch })
  })
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    throw new Error(`修改失败 (HTTP ${r.status})：${body.error ?? ''}`)
  }
  const out = await r.json()
  const changed = Object.keys(patch).map((k) => `${k}=${JSON.stringify(out.values[k])}`).join(' ')
  console.log(`✅ 已生效：${changed}`)
}

main().catch((err) => {
  console.error(`❌ ${err.message}`)
  process.exit(1)
})
