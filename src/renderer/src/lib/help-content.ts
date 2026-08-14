// 帮助文档的全部文本内容（集中维护，便于更新与翻译）

export interface HelpSection {
  id: string
  title: string
  intro?: string
  blocks: {
    heading?: string
    paragraphs?: string[]
    list?: string[]
    code?: string
  }[]
}

export const HELP_INTRO = {
  title: 'Open Academic Pipeline 帮助',
  subtitle: '以项目为容器，组织研究任务、会话、文件与知识库的学术研究工作台'
}

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'getting-started',
    title: '快速上手',
    intro: '从创建项目到完成一篇论文的标准路径',
    blocks: [
      {
        heading: '1. 创建项目',
        paragraphs: [
          '点击项目总览的「新建项目」，选择项目类型（论文研究 / 数据分析 / 论文检查 / 组会 / 研究报告），并绑定一个本地文件夹作为沙盒。项目会自动生成一组任务。'
        ]
      },
      {
        heading: '2. 执行任务',
        paragraphs: [
          '每个任务按类型提供表单（研究目标、材料、结构、期刊等），提交后由 AI 按对应学术技能（ARS）流程在沙盒内工作，产物直接写入项目文件夹。'
        ]
      },
      {
        heading: '3. 沉淀知识',
        paragraphs: [
          '文献库（BibTeX/RIS 导入）、笔记库（本地目录 / Obsidian）、随记（临时对话沉淀）三类知识在侧栏「知识库」统一管理。'
        ]
      },
      {
        heading: '4. 全局快捷入口',
        list: [
          '托盘：显示主窗口 / 快速搜索 / 开始临时对话（悬浮窗）',
          'Ctrl+Shift+P：全局搜索',
          '右键选中文字：发送到悬浮窗'
        ]
      }
    ]
  },
  {
    id: 'shortcuts',
    title: '常用快捷键',
    blocks: [
      {
        list: [
          'Ctrl+S — 保存当前文件',
          'Ctrl+B — 开关主侧栏',
          'Ctrl+J — 开关输出面板',
          'Ctrl+Shift+B — 开关副侧栏',
          'Ctrl+W — 关闭当前选项卡',
          'Ctrl+Tab — 切换选项卡',
          'Ctrl+Shift+P — 全局搜索',
          'Ctrl+= / Ctrl+- — 增大 / 减小编辑器字体',
          'Enter — 发送消息（Shift+Enter 换行）'
        ]
      }
    ]
  },
  {
    id: 'markdown',
    title: 'Markdown 编辑与导出',
    blocks: [
      {
        heading: '三种编辑模式',
        list: [
          '编辑：源码编辑（CodeMirror）',
          '双栏：左侧源码、右侧实时预览',
          '直观修改：所见即所得，工具栏加粗/标题/列表/表格，可直接导出 Word'
        ]
      },
      {
        heading: '一键导出 Word',
        paragraphs: [
          '在直观修改模式（或任意模式）点击「导出 Word」，即可把当前 Markdown 文档转换为 .docx 文件。'
        ]
      }
    ]
  },
  {
    id: 'assist',
    title: '汇报助手',
    intro: '悬浮窗 AI 汇报助手：导入文件、快速问答、一键导出',
    blocks: [
      {
        heading: '打开方式',
        list: [
          '活动栏「汇报」按钮：直接打开汇报助手悬浮窗',
          '托盘菜单「打开汇报助手」',
          '资源管理器右键文件（pptx/docx/pdf/txt/md）→「在汇报助手中打开」：自动导入该文件'
        ]
      },
      {
        heading: '导入文件',
        paragraphs: [
          '支持 pptx / docx / pdf / txt / md。点击头部「＋」可多选文件批量导入；对话中随时可再导入。',
          'PPT 按页提取文字，PDF 论文提取全文（每文件 2 万字符上限），全部文件作为 AI 回答的上下文。'
        ]
      },
      {
        heading: '模型与思考强度',
        paragraphs: [
          '点击头部「⋯」打开设置面板：可选择模型（跟随设置 / cc-switch 全部模型 / Claude 官方模型）与思考强度（低·最快 到 最大·最慢）。',
          '汇报助手走原生 API 直连（不启动 CLI），响应更快；强度越高回答越深入但越慢。'
        ]
      },
      {
        heading: '对话记录与导出',
        list: [
          '对话与导入文件自动保存：不点「清空」就不会丢失，关闭窗口再打开仍在',
          '点击「↓」把对话导出为 Markdown 存入知识库（随记），可在 知识库 → 随记 查看',
          '「⋯」面板内有「清空对话与文件」（二次确认）'
        ]
      }
    ]
  },
  {
    id: 'floating',
    title: '悬浮窗与临时对话',
    blocks: [
      {
        heading: '临时对话（悬浮窗）',
        list: [
          '托盘「开始临时对话」或 查看菜单「临时对话」打开',
          '不绑定项目，适合随手提问；右键选中任意文字可「发送到悬浮窗」',
          '对话自动保存；「保存」按钮把整段对话存入知识库（随记）；「清空」清除历史'
        ]
      },
      {
        heading: 'AI 回复渲染',
        paragraphs: [
          'AI 回复支持 Markdown 渲染（代码块、表格、引用等）。悬浮窗与汇报助手均走原生引擎，响应速度快。'
        ]
      }
    ]
  },
  {
    id: 'personalize',
    title: '个性化设置',
    blocks: [
      {
        heading: '外观',
        list: [
          '主题：深色 / 浅色（活动栏按钮或 个性化设置 中切换）',
          '强调色：蓝 / 绿 / 紫 / 橙 / 自定义颜色',
          '背景图：选择本地图片作为窗口壁纸（淡显），可调浓度',
          '颜色自定义：主背景、卡片、侧栏、边框、文字颜色均可单独设定（留空跟随主题）'
        ]
      },
      {
        heading: '编辑器',
        list: [
          '字体（6 种等宽字体）、字号（10-24px）、行高、自动换行',
          '代码高亮风格：跟随主题 / VS Code 深浅 / One Dark / Monokai'
        ]
      },
      {
        heading: '备份与第三方',
        list: [
          '「导出全部设置」下载 JSON，可迁移设备或共享；「导入设置」一键恢复',
          '第三方插件可在 data/personalization/*.json 注册自定义设置项，页面自动生成表单'
        ]
      }
    ]
  },
  {
    id: 'faq',
    title: '常见问题',
    blocks: [
      {
        heading: 'API Key 在哪里配置？',
        paragraphs: [
          '设置 → API 直连：填写 Anthropic API Key（sk-…）并「测试」。汇报助手、临时对话的快速响应模式依赖它；未配置时这些功能会提示。'
        ]
      },
      {
        heading: 'PPT / Office 文件如何预览？',
        paragraphs: [
          '工作台双击 pptx/docx/xlsx：docx 用 mammoth 渲染、xlsx 用 SheetJS 表格化。pptx 默认版面渲染；若系统装有 PowerPoint 或 LibreOffice，工具栏出现「高保真渲染」按钮（Office 自身引擎导出 PDF，保真度 100%）。'
        ]
      },
      {
        heading: '数据存放在哪里？',
        paragraphs: [
          '开发模式：项目根 data/（数据库、沙盒、个性化设置、LibreOffice profile）。打包后：系统用户数据目录 oap/。项目文件本身在你创建时选择的文件夹里。'
        ]
      },
      {
        heading: '如何清理缓存？',
        paragraphs: [
          '设置 → 缓存与存储 →「清除缓存」：清理应用渲染缓存与 Office 转换缓存，不影响项目数据与知识库。'
        ]
      },
      {
        heading: '悬浮窗/汇报助手窗口被遮挡怎么办？',
        paragraphs: [
          '汇报助手已设为最高置顶级别（screen-saver），可盖过全屏放映。如仍被遮挡，请确认系统无第三方置顶工具干扰。'
        ]
      }
    ]
  },
  {
    id: 'tech-stack',
    title: '技术栈',
    blocks: [
      {
        list: [
          '桌面框架：Electron 43',
          '构建工具：electron-vite 5 · Vite 7',
          '前端：React 19 · TypeScript',
          '数据存储：SQLite（node:sqlite）',
          'AI 引擎：Claude Code CLI + Anthropic API',
          '学术技能：ARS · academic-paper · deep-research 等',
          '编辑器：CodeMirror 6 · Markdown 渲染 marked · WYSIWYG turndown'
        ]
      }
    ]
  },
  {
    id: 'links',
    title: '链接与反馈',
    blocks: [
      {
        list: [
          '官方网站：https://kawasakikusako.github.io/generalExp/oap/',
          'GitHub 仓库：https://github.com/KawasakiKusako/openAcademicPipeline',
          '反馈问题：https://github.com/KawasakiKusako/openAcademicPipeline/issues'
        ]
      }
    ]
  }
]
