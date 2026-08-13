import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { useParams } from 'react-router-dom'
import ProjectForm from '../components/ProjectForm'
import { api } from '../lib/api'
import type { Project } from '@shared/types'

// New-project form, or edit mode when /projects/:projectId/edit
export default function ProjectFormPage(): JSX.Element {
  const { projectId } = useParams()
  const [project, setProject] = useState<Project | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    api
      .project(projectId)
      .then(setProject)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [projectId])

  if (error) return <div className="error-box">{error}</div>
  if (projectId && !project) return <p className="muted">加载中…</p>
  return (
    <div className="form-shell">
      <div className="form-card">
        <ProjectForm project={project} />
      </div>
    </div>
  )
}
