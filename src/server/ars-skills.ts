import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { getSkillsPath } from './settings'
import type { Task } from '../shared/types'

// Map task types to ARS (academic-research-skills) plugin skills + modes.
// The matching SKILL.md is located on disk and injected into the session
// as system prompt, so the task actually runs "with the skill loaded".
export interface ArsSkillRef {
  skill: string // skill directory name under the plugin root
  mode: string // mode within the skill (e.g. 'lit-review')
  label: string // display label, e.g. '/ars-lit-review'
  hint: string // one-line description of what the skill does
}

const TYPE_SKILLS: Record<string, ArsSkillRef> = {
  'research-consult': {
    skill: 'academic-paper',
    mode: 'plan',
    label: '/ars-plan',
    hint: '苏格拉底式逐章规划（研究思路引导）'
  },
  'writing-prep': {
    skill: 'academic-paper',
    mode: 'plan',
    label: '/ars-plan',
    hint: '苏格拉底式章节规划，写作前梳理结构'
  },
  'paper-writing': {
    skill: 'academic-paper',
    mode: 'outline',
    label: '/ars-outline',
    hint: '详细大纲 + 证据图（写作指引）'
  },
  'paper-review': {
    skill: 'academic-paper-reviewer',
    mode: 'full',
    label: '/ars-reviewer',
    hint: '模拟同行评审面板（EIC + 多审稿人）'
  },
  'paper-revision': {
    skill: 'academic-paper',
    mode: 'revision-coach',
    label: '/ars-revision-coach',
    hint: '审稿意见解析 → 修改路线图 + 回复信骨架'
  }
}

export function arsSkillForTaskType(taskType: string): ArsSkillRef | null {
  return TYPE_SKILLS[taskType] ?? null
}

// The task's own skill override (task.skill, a skill id) wins over the type mapping.
export function arsSkillForTask(task: Task): ArsSkillRef | null {
  if (task.skill) {
    if (task.skill.startsWith('custom:')) {
      return {
        skill: task.skill.slice('custom:'.length),
        mode: '',
        label: `/custom:${task.skill.slice('custom:'.length)}`,
        hint: '自定义技能（用户 skills 目录）'
      }
    }
    const byId = TYPE_SKILLS[task.skill]
    if (byId) return byId
  }
  return TYPE_SKILLS[task.type] ?? null
}

// Full catalogue for the UI (task creator dropdown, badges)
export function arsSkillCatalogue(): Record<string, ArsSkillRef> {
  return TYPE_SKILLS
}

// Locate a skill's SKILL.md under the user's Claude plugins (cache first,
// then marketplaces). Returns null when the plugin is not installed.
export function findSkillFile(skill: string): string | null {
  const roots = [
    join(homedir(), '.claude', 'plugins', 'cache', 'academic-research-skills', 'academic-research-skills'),
    join(homedir(), '.claude', 'plugins', 'marketplaces', 'academic-research-skills')
  ]
  for (const root of roots) {
    if (!existsSync(root)) continue
    // version dir (e.g. 3.10.0) then skill dir, or skill dir directly
    const candidates = [
      join(root, skill, 'SKILL.md'),
      join(root, 'academic-research-skills', skill, 'SKILL.md')
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
    // scan one level deep for a version directory
    try {
      for (const entry of readdirSync(root)) {
        const full = join(root, entry)
        if (!statSync(full).isDirectory()) continue
        const nested = join(full, skill, 'SKILL.md')
        if (existsSync(nested)) return nested
      }
    } catch {
      // ignore unreadable dirs
    }
  }
  return null
}

// Build the injection text for a task: skill header + SKILL.md + task prompt.
// The CLI passes this via --append-system-prompt; on Windows the command line
// is capped at ~32K chars, so the skill text must stay well under that.
const MAX_SKILL_CHARS = 8000

export function buildTaskInjection(task: Task): { text: string; skillLabel: string | null } {
  const ref = arsSkillForTask(task)
  if (!ref) {
    // No skill mapped: still inject the task prompt so the session knows its goal
    const text = task.prompt
      ? `【任务指令】\n${task.prompt}\n`
      : `【任务】${task.name}\n`
    return { text, skillLabel: null }
  }

  const lines: string[] = [
    `【ARS 技能注入】${ref.label}（${ref.hint}）`,
    `技能：${ref.skill} · 模式：${ref.mode}`,
    ''
  ]

  const skillFile = task.skill?.startsWith('custom:')
    ? join(getSkillsPath(), ref.skill, 'SKILL.md')
    : findSkillFile(ref.skill)
  if (skillFile && existsSync(skillFile)) {
    const content = readFileSync(skillFile, 'utf-8')
    lines.push('——— 技能说明（SKILL.md，截取）———')
    if (content.length > MAX_SKILL_CHARS) {
      lines.push(content.slice(0, MAX_SKILL_CHARS))
      lines.push(`…（技能说明过长，截断于 ${MAX_SKILL_CHARS}/${content.length} 字符）`)
    } else {
      lines.push(content)
    }
  } else {
    lines.push('（未在本机找到该技能的 SKILL.md，请确认插件已安装）')
  }

  lines.push('', '——— 任务指令 ———')
  lines.push(task.prompt || `请以${ref.hint}的方式完成「${task.name}」。`)
  lines.push('', `请按「${ref.label}」的流程与规范执行本任务。`)
  return { text: lines.join('\n'), skillLabel: ref.label }
}
