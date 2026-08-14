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
import PersonalSettingsPage from './pages/PersonalSettingsPage'
import TaskDetailPage from './pages/TaskDetailPage'
import LibraryPage from './pages/LibraryPage'
import RecommendationsPage from './pages/RecommendationsPage'
import HelpPage from './pages/HelpPage'
import AudiencePage from './pages/AudiencePage'
import FloatingChatPage from './pages/FloatingChatPage'
import PresentAssistPage from './pages/PresentAssistPage'

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
          <Route path="/settings/personal" element={<PersonalSettingsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/projects/:projectId/recommendations" element={<RecommendationsPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>
        {/* 托盘悬浮窗：独立对话框，不加载应用壳（无标题栏/活动栏/状态栏/启动检查） */}
        <Route path="/floating-chat" element={<FloatingChatPage />} />
        {/* 观众窗口：演讲者视图的第二显示器全屏放映 */}
        <Route path="/audience" element={<AudiencePage />} />
        {/* 汇报助手悬浮窗：读 PPT + 原生 API 生成讲稿 */}
        <Route path="/present-assist" element={<PresentAssistPage />} />
      </Routes>
    </HashRouter>
  )
}

export default App
