import { useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { api } from '../lib/api'
import type { ArsSkillEntry } from '../lib/api'
import { IconPlus } from './Icon'
import type { Task } from '@shared/types'

interface Props {
  projectId: string
  onCreated: (task: Task) => void
}

// 任务创建器：创建自定义任务（名称 + 类型 + 提示词）
export default function TaskCreator({ projectId, onCreated }: Props): JSX.Element {
  const [taskTypes, setTaskTypes] = useState<{ type: string; label: string; description: string }[]>([])
  const [arsSkills, setArsSkills] = useState<Record<string, ArsSkillEntry>>({})
  const [customSkills, setCustomSkills] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('custom')
  const [skill, setSkill] = useState('')
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.taskTypes().then(setTaskTypes).catch(() => undefined)
    api.arsSkills().then(setArsSkills).catch(() => undefined)
    api
      .skills()
      .then((s) => setCustomSkills(s.skills.map((x) => x.name)))
      .catch(() => undefined)
  }, [])

  const canSubmit = name.trim().length > 0 && !submitting

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const task = await api.createTask(projectId, {
        name: name.trim(),
        type,
        prompt,
        skill: skill || null
      })
      onCreated(task)
      setName('')
      setPrompt('')
      setSkill('')
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="creator">
      <div className="row gap">
        <button className="btn" onClick={() => setOpen((v) => !v)}>
          <IconPlus size={14} />
          {open ? '收起' : '添加任务'}
        </button>
        <span className="muted small">任务是基础工作单元：研究咨询、数据沙盒、论文写作、审核、修改等</span>
      </div>

      {open && (
        <form className="form inset" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">
              任务名称 <b className="required">*</b>
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：论文写作——方法章节"
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">任务类型</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {taskTypes.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">任务提示词</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="该任务的指令提示词，作为会话的初始上下文（可选）"
              rows={3}
            />
          </label>

          <label className="field">
            <span className="field-label">关联 ARS 技能</span>
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">自动（按任务类型匹配）</option>
              {Object.keys(arsSkills).map((id) => {
                const s = arsSkills[id]
                return (
                  <option key={id} value={id}>
                    {s.label} — {s.hint}
                  </option>
                )
              })}
              {customSkills.length > 0 && (
                <optgroup label="自定义技能">
                  {customSkills.map((name) => (
                    <option key={name} value={`custom:${name}`}>
                      /custom:{name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <span className="muted small">创建会话时将注入对应技能提示词（SKILL.md）</span>
          </label>

          {error && <div className="error-box">{error}</div>}

          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={!canSubmit}>
              {submitting ? '创建中…' : '创建任务'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
