import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DB_PATH } from './paths'

// Lazily opened single connection (node:sqlite is synchronous, safe in the main process).
let _db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (!_db) {
    mkdirSync(dirname(DB_PATH), { recursive: true })
    _db = new DatabaseSync(DB_PATH)
    _db.exec('PRAGMA foreign_keys = ON')
    migrate(_db)
  }
  return _db
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      type         TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      main_prompt  TEXT NOT NULL DEFAULT '',
      sandbox_path TEXT,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL DEFAULT 'custom',
      prompt     TEXT NOT NULL DEFAULT '',
      skill      TEXT,
      status     TEXT NOT NULL DEFAULT 'todo',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, position);

    CREATE TABLE IF NOT EXISTS sessions (
      id                TEXT PRIMARY KEY,
      project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id           TEXT REFERENCES tasks(id) ON DELETE SET NULL,
      claude_session_id TEXT,
      engine            TEXT NOT NULL DEFAULT 'cli',
      cost             REAL NOT NULL DEFAULT 0,
      title             TEXT NOT NULL DEFAULT '新会话',
      model             TEXT NOT NULL DEFAULT '',
      status            TEXT NOT NULL DEFAULT 'idle',
      created_at        TEXT NOT NULL,
      updated_at        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);

    CREATE TABLE IF NOT EXISTS messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role       TEXT NOT NULL,
      content    TEXT NOT NULL DEFAULT '',
      tool_uses  TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

    CREATE TABLE IF NOT EXISTS libraries (
      id          TEXT PRIMARY KEY,
      project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scratch_notes (
      id         TEXT PRIMARY KEY,
      content    TEXT NOT NULL,
      summary    TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS literature (
      id         TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      authors    TEXT NOT NULL DEFAULT '[]',
      year       INTEGER,
      venue      TEXT NOT NULL DEFAULT '',
      doi        TEXT NOT NULL DEFAULT '',
      url        TEXT NOT NULL DEFAULT '',
      abstract   TEXT NOT NULL DEFAULT '',
      notes      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_literature_title ON literature(title);
  `)

  // Column migrations for pre-existing databases
  const sessionCols = db.prepare('PRAGMA table_info(sessions)').all() as { name: string }[]
  if (!sessionCols.some((c) => c.name === 'engine')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN engine TEXT NOT NULL DEFAULT 'cli'`)
  }
  if (!sessionCols.some((c) => c.name === 'cost')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN cost REAL NOT NULL DEFAULT 0`)
  }
  const messageCols = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[]
  if (!messageCols.some((c) => c.name === 'tool_uses')) {
    db.exec(`ALTER TABLE messages ADD COLUMN tool_uses TEXT NOT NULL DEFAULT '[]'`)
  }
  const taskCols = db.prepare('PRAGMA table_info(tasks)').all() as { name: string }[]
  if (!taskCols.some((c) => c.name === 'skill')) {
    db.exec(`ALTER TABLE tasks ADD COLUMN skill TEXT`)
  }
  const litCols = db.prepare('PRAGMA table_info(literature)').all() as { name: string }[]
  if (!litCols.some((c) => c.name === 'project_id')) {
    db.exec(`ALTER TABLE literature ADD COLUMN project_id TEXT`)
  }
}

export function now(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return crypto.randomUUID()
}

// Row -> camelCase mapping helpers
import type {
  Library,
  Literature,
  Message,
  Project,
  Session,
  Task
} from '../shared/types'

type Row = Record<string, unknown>

export function mapProject(r: Row): Project {
  return {
    id: String(r.id),
    name: String(r.name),
    type: String(r.type),
    description: String(r.description ?? ''),
    mainPrompt: String(r.main_prompt ?? ''),
    sandboxPath: r.sandbox_path ? String(r.sandbox_path) : null,
    status: r.status as Project['status'],
    taskCount: Number(r.task_count ?? 0),
    taskDone: Number(r.task_done ?? 0),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  }
}

export function mapTask(r: Row): Task {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    name: String(r.name),
    type: String(r.type),
    prompt: String(r.prompt ?? ''),
    skill: r.skill ? String(r.skill) : null,
    status: r.status as Task['status'],
    position: Number(r.position),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  }
}

export function mapSession(r: Row): Session {
  return {
    id: String(r.id),
    projectId: String(r.project_id),
    taskId: r.task_id ? String(r.task_id) : null,
    claudeSessionId: r.claude_session_id ? String(r.claude_session_id) : null,
    engine: (r.engine as Session['engine']) ?? 'cli',
    cost: Number(r.cost ?? 0),
    title: String(r.title),
    model: String(r.model ?? ''),
    status: r.status as Session['status'],
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  }
}

export function mapMessage(r: Row): Message {
  let toolUses: Message['toolUses'] = []
  try {
    toolUses = JSON.parse(String(r.tool_uses ?? '[]')) as Message['toolUses']
  } catch {
    toolUses = []
  }
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    role: r.role as Message['role'],
    content: String(r.content ?? ''),
    toolUses,
    createdAt: String(r.created_at)
  }
}

export function mapLibrary(r: Row): Library {
  return {
    id: String(r.id),
    projectId: r.project_id ? String(r.project_id) : null,
    name: String(r.name),
    path: String(r.path),
    description: String(r.description ?? ''),
    createdAt: String(r.created_at)
  }
}

export function mapLiterature(r: Row): Literature {
  let authors: string[] = []
  try {
    authors = JSON.parse(String(r.authors ?? '[]')) as string[]
  } catch {
    authors = []
  }
  return {
    id: String(r.id),
    projectId: r.project_id ? String(r.project_id) : null,
    title: String(r.title),
    authors,
    year: r.year !== null && r.year !== undefined ? Number(r.year) : null,
    venue: String(r.venue ?? ''),
    doi: String(r.doi ?? ''),
    url: String(r.url ?? ''),
    abstract: String(r.abstract ?? ''),
    notes: String(r.notes ?? ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at)
  }
}
