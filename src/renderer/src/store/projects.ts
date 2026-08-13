import { create } from 'zustand'
import { api } from '../lib/api'
import type { Project, ProjectTypeTemplate } from '@shared/types'

interface ProjectsState {
  projects: Project[]
  projectTypes: ProjectTypeTemplate[]
  loading: boolean
  error: string | null
  loadProjects: () => Promise<void>
  loadProjectTypes: () => Promise<void>
  createProject: (input: Parameters<typeof api.createProject>[0]) => Promise<Project>
  updateProject: (
    id: string,
    input: Parameters<typeof api.updateProject>[1]
  ) => Promise<Project>
  deleteProject: (id: string) => Promise<void>
}

export const useProjectsStore = create<ProjectsState>((set) => ({
  projects: [],
  projectTypes: [],
  loading: false,
  error: null,

  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await api.projects()
      set({ projects, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  loadProjectTypes: async () => {
    try {
      set({ projectTypes: await api.projectTypes() })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  createProject: async (input) => {
    const project = await api.createProject(input)
    set((s) => ({ projects: [project, ...s.projects] }))
    return project
  },

  updateProject: async (id, input) => {
    const project = await api.updateProject(id, input)
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? project : p))
    }))
    return project
  },

  deleteProject: async (id) => {
    await api.deleteProject(id)
    set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }))
  }
}))
