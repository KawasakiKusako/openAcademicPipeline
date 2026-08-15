import type { ProjectTypeTemplate, TaskFormField, TaskTemplate, TaskKind } from '../shared/types'

// Task type catalogue — 5 task types, each with a distinct presentation form.
// kind: chat = conversational, form = form-driven (schema below).
export interface TaskTypeDef {
  type: string
  label: string
  description: string
  kind: TaskKind
  formSchema?: TaskFormField[]
}

const f = (
  key: string,
  label: string,
  type: TaskFormField['type'],
  extra: Partial<TaskFormField> = {}
): TaskFormField => ({ key, label, type, ...extra })

const COMMON_CONSTRAINTS = f('constraints', '约束与要求', 'textarea', {
  placeholder: '格式、篇幅、风格、禁用项…（可选）'
})

const WRITING_SCHEMA: TaskFormField[] = [
  f('goal', '任务目标', 'textarea', { required: true, placeholder: '本次写作要达到的目标…' }),
  f('materials', '输入材料', 'textarea', { placeholder: '数据、结果、已有草稿、文件路径…' }),
  f('structure', '章节结构', 'textarea', { placeholder: '期望的章节结构（可选）' }),
  f('journal', '目标期刊/风格', 'text', { placeholder: '如：Nature 风格 / IEEE 格式（可选）' }),
  COMMON_CONSTRAINTS
]

const REVIEW_SCHEMA: TaskFormField[] = [
  f('paperText', '论文文本/路径', 'textarea', { required: true, placeholder: '粘贴论文全文，或提供沙盒内文件路径…' }),
  f('journal', '目标期刊', 'text', { placeholder: '如：Nature / IEEE（影响审核标准，可选）' }),
  f('focus', '审核重点', 'select', {
    options: ['全面审核', '逻辑与论证', '方法与统计', '引用与文献', '语言与表达'],
    description: '按 ARS 评审面板流程执行'
  }),
  COMMON_CONSTRAINTS
]

const REVISION_SCHEMA: TaskFormField[] = [
  f('paperText', '论文文本/路径', 'textarea', { required: true, placeholder: '粘贴论文全文，或提供沙盒内文件路径…' }),
  f('reviewerComments', '审稿意见', 'textarea', { required: true, placeholder: '粘贴审稿人意见 / 审核问题清单…' }),
  f('focus', '修改重点', 'select', {
    options: ['全部问题', '主要问题优先', '仅语言润色', '结构重组'],
    description: '按 ARS revision-coach 流程：修改路线图 + 回复信'
  }),
  COMMON_CONSTRAINTS
]

export const TASK_TYPES: TaskTypeDef[] = [
  {
    type: 'research-consult',
    label: '研究咨询',
    description: '会话形式：与 AI 讨论研究问题、梳理思路（ARS plan 技能）',
    kind: 'chat'
  },
  {
    type: 'writing-prep',
    label: '准备写作',
    description: '表单交互：写作前的材料、大纲与证据梳理（ARS plan 技能）',
    kind: 'form',
    formSchema: [
      f('goal', '任务目标', 'textarea', { required: true, placeholder: '要准备哪篇论文/报告的写作材料…' }),
      f('materials', '输入材料', 'textarea', { placeholder: '文献、数据、已有笔记…' }),
      f('structure', '期望结构', 'textarea', { placeholder: '大纲框架 / 章节要求（可选）' }),
      COMMON_CONSTRAINTS
    ]
  },
  {
    type: 'paper-writing',
    label: '论文写作',
    description: '表单交互：论文撰写（ARS outline 技能）',
    kind: 'form',
    formSchema: WRITING_SCHEMA
  },
  {
    type: 'paper-review',
    label: '论文审核',
    description: '表单交互：模拟同行评审面板审核（ARS reviewer 技能）',
    kind: 'form',
    formSchema: REVIEW_SCHEMA
  },
  {
    type: 'paper-revision',
    label: '论文修改',
    description: '表单交互：按审核意见修改论文（ARS revision-coach 技能）',
    kind: 'form',
    formSchema: REVISION_SCHEMA
  },
  {
    type: 'presentation-slide',
    label: '演示文稿制作',
    description: '表单交互：基于项目内容生成演示文稿（easyslides PPT 生成技能）',
    kind: 'form',
    formSchema: [
      f('topic', '演示主题', 'textarea', { required: true, placeholder: '本次演示要讲什么…' }),
      f('materials', '输入材料', 'textarea', { placeholder: '论文、数据、图表、备注…（留空自动读取项目状态）' }),
      f('structure', '结构要求', 'textarea', { placeholder: '章节/页数要求（可选）' }),
      f('style', '演示风格', 'select', {
        placeholder: '选择风格包',
        options: ['学术风格', '答辩风格（Notebook Defense）', '极简风格', '自动选择']
      }),
      COMMON_CONSTRAINTS
    ]
  }
]

function t(type: string, label: string, prompt: string): TaskTemplate {
  return { type, label, prompt }
}

// Project type templates — task sets rebuilt around the 6 task types,
// each carrying the matching ARS skill via the type mapping.
export const PROJECT_TYPES: ProjectTypeTemplate[] = [
  {
    type: 'paper-research',
    label: '论文研究',
    description: '从研究咨询到论文写作、审核、修改的完整研究流程',
    defaultTasks: [
      t('research-consult', '研究咨询', '与 AI 讨论研究问题、确定研究目标与路线。'),
      t('writing-prep', '准备写作', '梳理材料、大纲与证据，为论文写作做准备。'),
      t('paper-writing', '论文写作', '根据研究结果撰写论文，结构完整、论证严谨。'),
      t('paper-review', '论文审核', '从审稿人视角全面审核论文，输出问题清单。'),
      t('paper-revision', '论文修改', '根据审核意见逐条修改论文，记录修改说明。')
    ]
  },
  {
    type: 'data-analysis',
    label: '数据分析',
    description: '面向数据集的分析流程：探索、统计、可视化与报告',
    defaultTasks: [
      t('research-consult', '研究咨询', '明确分析目标、假设与交付物。'),
      t('writing-prep', '准备写作', '整理分析结论与图表，形成报告大纲。'),
      t('paper-writing', '分析报告撰写', '撰写数据分析报告，完整记录方法与结论。'),
      t('paper-review', '报告审核', '审核报告的完整性、一致性与可复现性。')
    ]
  },
  {
    type: 'paper-check',
    label: '论文核查',
    description: '对已有论文进行格式、引用、逻辑与语言的全面核查',
    defaultTasks: [
      t('research-consult', '核查范围咨询', '确定核查目标与重点（格式/引用/逻辑/语言）。'),
      t('paper-review', '论文全面审核', '模拟同行评审面板，输出问题清单与修改优先级。'),
      t('paper-revision', '修订核查意见', '按审核意见逐条核查并修订论文。')
    ]
  },
  {
    type: 'group-meeting',
    label: '组会汇报',
    description: '文献速览、汇报材料制作与预演问答',
    defaultTasks: [
      t('research-consult', '汇报思路咨询', '明确汇报主题、受众与要点。'),
      t('writing-prep', '汇报材料准备', '提炼文献要点与汇报结构。'),
      t('paper-writing', '汇报稿撰写', '撰写汇报讲稿与材料（PPT 大纲/讲稿）。')
    ]
  },
  {
    type: 'research-report',
    label: '研究报告',
    description: '面向课题/项目的完整研究报告流程',
    defaultTasks: [
      t('research-consult', '研究方案咨询', '梳理研究目标、方法与数据策略。'),
      t('writing-prep', '报告材料准备', '整理文献综述素材与报告结构。'),
      t('paper-writing', '报告撰写', '撰写完整研究报告。'),
      t('paper-review', '报告审核', '审核报告的完整性与一致性。'),
      t('paper-revision', '报告修订', '按审核意见修订报告。')
    ]
  },
  {
    type: 'presentation',
    label: '演示与汇报',
    description: '基于项目内容生成演示文稿（PPT）并演练汇报',
    defaultTasks: [
      t('research-consult', '演示方案咨询', '明确演示目标、受众、要点与篇幅。'),
      t('presentation-slide', '演示文稿制作', '基于项目状态与材料生成演示文稿（PPTX），结构清晰、风格统一。'),
      t('paper-writing', '汇报讲稿撰写', '撰写与幻灯片配套的口语化汇报讲稿。')
    ]
  }
]

export function getProjectType(type: string): ProjectTypeTemplate | undefined {
  return PROJECT_TYPES.find((p) => p.type === type)
}

// Default main prompt (主线提示词) scaffold for a project sandbox CLAUDE.md.
export function buildMainPrompt(projectName: string, typeLabel: string, description: string, userPrompt: string): string {
  const lines = [
    `# ${projectName}`,
    '',
    `项目类型：${typeLabel}`,
    description ? `项目描述：${description}` : null,
    '',
    '## 工作规范',
    '- 本目录是项目沙盒，所有工作产物存放在对应子目录中（resources/ 资源、data/ 数据、drafts/ 草稿、notes/ 笔记）。',
    '- 任务是本项目的核心工作单元，每个任务完成时应记录关键结论与产出路径。',
    '- 所有数据来源、处理步骤与结果必须可复现、可追溯。',
    '- 涉及引用时，使用标准引用格式并保留完整文献信息。',
    '',
    userPrompt ? `## 主线提示词\n${userPrompt}\n` : ''
  ]
  return lines.filter((l) => l !== null).join('\n')
}
