import { Router } from 'express'
import {
  getPersonalizationFields,
  getPersonalizationValues,
  loadPersonalizationSchemaFiles,
  updatePersonalization
} from '../personalization'

export const personalizationRouter = Router()

// GET /api/settings/personalization — schema + 当前值，渲染端据此自动生成表单
personalizationRouter.get('/settings/personalization', (_req, res) => {
  res.json({ fields: getPersonalizationFields(), values: getPersonalizationValues() })
})

// PUT /api/settings/personalization — 更新一个或多个值（只接受已注册 key，非法值回退默认）
// body: { "values": { "theme": "light", "username": "张三" } }
personalizationRouter.put('/settings/personalization', (req, res) => {
  const body = (req.body ?? {}) as { values?: Record<string, unknown> }
  if (!body.values || typeof body.values !== 'object') {
    res.status(400).json({ error: 'body 需包含 values 对象' })
    return
  }
  res.json({ values: updatePersonalization(body.values) })
})

// POST /api/settings/personalization/reload — 重新扫描第三方 JSON schema 文件
personalizationRouter.post('/settings/personalization/reload', (_req, res) => {
  const { count, removed } = loadPersonalizationSchemaFiles()
  res.json({ count, removed, total: getPersonalizationFields().length })
})
