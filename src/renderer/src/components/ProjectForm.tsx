import { useEffect, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectsStore } from '../store/projects'
import type { Project, ProjectTypeTemplate } from '@shared/types'

interface Props {
  project?: Project // present => edit mode
  onSaved?: (project: Project) => void
}

export default function ProjectForm({ project, onSaved }: Props): JSX.Element {
  const navigate = useNavigate()
  const { projectTypes, loadProjectTypes, createProject, updateProject } = useProjectsStore()

  const [name, setName] = useState(project?.name ?? '')
  const [type, setType] = useState(project?.type ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [mainPrompt, setMainPrompt] = useState(project?.mainPrompt ?? '')
  const [sandboxPath, setSandboxPath] = useState<string | null>(project?.sandboxPath ?? null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (projectTypes.length === 0) loadProjectTypes()
    if (!type && projectTypes.length > 0) setType(projectTypes[0].type)
  }, [projectTypes, loadProjectTypes, type])

  const canSubmit =
    name.trim().length > 0 && type.length > 0 && Boolean(sandboxPath) && !submitting

  async function handlePickFolder(): Promise<void> {
    const picked = await window.api.selectDirectory()
    if (picked) setSandboxPath(picked)
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const saved = project
        ? await updateProject(project.id, { name: name.trim(), type, description, mainPrompt })
        : await createProject({
            name: name.trim(),
            type,
            description,
            mainPrompt,
            sandboxPath: sandboxPath ?? undefined
          })
      onSaved?.(saved)
      navigate(`/projects/${saved.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <h2>{project ? '编辑项目' : '新建项目'}</h2>
        <p className="muted">项目是任务、会话与资源的容器。必填项：名称与类型。</p>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field-label">
            项目名称 <b className="required">*</b>
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：基于深度学习的遥感图像分割研究"
            autoFocus
          />
        </label>

        <div className="field">
          <span className="field-label">
            项目类型 <b className="required">*</b>
          </span>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {projectTypes.length === 0 && <option value="">加载类型中…</option>}
            {projectTypes.map((t: ProjectTypeTemplate) => (
              <option key={t.type} value={t.type}>
                {t.label} — {t.description}
              </option>
            ))}
          </select>
          {type && (
            <span className="muted small">
              {projectTypes.find((t) => t.type === type)?.description ?? ''}
            </span>
          )}
        </div>

        {!project && (
          <div className="field">
            <span className="field-label">
              项目文件夹 <b className="required">*</b>
            </span>
            <div className="row gap">
              <input
                readOnly
                value={sandboxPath ?? ''}
                placeholder="选择存储项目所有文件的文件夹"
                onClick={handlePickFolder}
                style={{ cursor: 'pointer', flex: 1 }}
              />
              <button type="button" className="btn" onClick={handlePickFolder}>
                选择文件夹
              </button>
            </div>
            <span className="muted small">
              该文件夹将成为项目沙盒：Claude Code 会话运行于此，所有文件、产物、知识库引用都存放在此
            </span>
          </div>
        )}

        <label className="field">
          <span className="field-label">项目描述</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="研究目标、背景、交付物……（可选）"
            rows={3}
          />
        </label>

        <label className="field">
          <span className="field-label">主线提示词</span>
          <textarea
            value={mainPrompt}
            onChange={(e) => setMainPrompt(e.target.value)}
            placeholder="可选。将写入项目沙盒的 CLAUDE.md，成为 Claude Code 在此项目中的长期上下文。留空则使用默认模板。"
            rows={5}
          />
        </label>

        {error && <div className="error-box">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={() => navigate(-1)}>
            取消
          </button>
          <button type="submit" className="btn primary" disabled={!canSubmit}>
            {submitting ? '创建中…' : project ? '保存修改' : '创建项目'}
          </button>
        </div>
      </form>
    </div>
  )
}
