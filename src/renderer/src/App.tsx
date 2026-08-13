import type { JSX } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import Layout from './components/Layout'
import ProjectsPage from './pages/ProjectsPage'
import ProjectFormPage from './pages/ProjectFormPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import WorkspacePage from './pages/WorkspacePage'
import SessionPage from './pages/SessionPage'
import SettingsPage from './pages/SettingsPage'
import TaskDetailPage from './pages/TaskDetailPage'
import LibraryPage from './pages/LibraryPage'
import RecommendationsPage from './pages/RecommendationsPage'
import FloatingChatPage from './pages/FloatingChatPage'

function App(): JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<ProjectFormPage />} />
          <Route path="/projects/:projectId/edit" element={<ProjectFormPage />} />
          <Route path="/projects/:projectId" element={<WorkspacePage />} />
          <Route path="/projects/:projectId/overview" element={<ProjectDetailPage />} />
          <Route path="/projects/:projectId/tasks/:taskId" element={<TaskDetailPage />} />
          <Route path="/projects/:projectId/sessions/:sessionId" element={<SessionPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/projects/:projectId/recommendations" element={<RecommendationsPage />} />
          <Route path="/floating-chat" element={<FloatingChatPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
