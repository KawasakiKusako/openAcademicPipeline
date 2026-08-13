import { Router } from 'express'
import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { getSkillsPath } from '../settings'

export const skillsRouter = Router()

// Custom skills directory (default ~/.claude/skills): list folders with SKILL.md
skillsRouter.get('/skills', (_req, res) => {
  const root = getSkillsPath()
  if (!existsSync(root)) {
    res.json({ path: root, skills: [] })
    return
  }
  const skills: { name: string; hasSkillMd: boolean }[] = []
  try {
    for (const entry of readdirSync(root)) {
      const full = join(root, entry)
      if (!entry.startsWith('.') && existsSync(join(full, 'SKILL.md'))) {
        skills.push({ name: entry, hasSkillMd: true })
      }
    }
  } catch {
    // ignore unreadable dir
  }
  res.json({ path: root, skills })
})
