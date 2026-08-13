# Open Academic Pipeline (OAP)

<p align="center">
  <img src="icon.png" alt="OAP icon" width="128" height="128" />
</p>

> An open-source academic research assistant workspace — organizing projects, tasks, sessions, and knowledge libraries around a full research pipeline powered by Claude Code and Academic Research Skills (ARS).

![Version](https://img.shields.io/badge/version-0.5.1-blue)
![License](https://img.shields.io/badge/license-MIT%20%2B%20GPLv3-green)

[Official Website](https://kawasakikusako.github.io/generalExp/oap/) · [GitHub Repository](https://github.com/KawasakiKusako/openAcademicPipeline) · [中文 README](../README.md)

---

## ✨ Features

### Project Workspace (VSCode-style)

- **Full workspace layout**: Activity bar (tool switcher) → Primary sidebar (resizable) → Workbench (resizable, tabbed) → Secondary sidebar (resizable)
- **Tab system**: Files / Tasks / Sessions / Settings / Recommendations open as tabs. **Unsaved drafts are never lost** (cached in memory, instant tab switching)
- **File editor**: CodeMirror 6 syntax highlighting for all languages, autocompletion, split-pane Markdown preview, image / video / audio / PDF preview
- **File tree**: Context menu (create / copy / cut / paste / delete / rename / run / send-to-chat), drag-and-drop move, auto-refresh
- **Bottom output panel**: Resizable height, Output / Problems views (Python errors auto-extracted)
- **Theming**: Dark / light modes + accent colors (blue / green / purple / orange / custom HEX)

### Project Management

- **5 project type templates**: Paper Research / Data Analysis / Paper Check / Group Meeting / Research Report (each seeds a default task set)
- **Project sandbox**: Each project is bound to a local folder; `CLAUDE.md` main prompt is auto-generated and Claude Code sessions run inside the sandbox
- **Project import / export**: Full JSON round-trip (metadata + tasks + sessions + messages + literature)
- **AI-assisted project creation**: Describe your research idea on the overview page → AI generates a project suggestion → one-click create

### Task System (5 types, form-driven)

| Task Type | Interaction | ARS Skill |
|---|---|---|
| Research Consultation | Chat-based | `/ars-plan` |
| Writing Preparation | Form (goal / materials / structure) | `/ars-plan` |
| Paper Writing | Form (goal / sections / journal) | `/ars-outline` |
| Paper Review | Form (paper / review focus) | `/ars-reviewer` |
| Paper Revision | Form (paper / reviewer comments / priority) | `/ars-revision-coach` |

- Form submissions auto-compose task instructions and inject the matching ARS skill SKILL.md into the session
- Tasks can bind custom skills (including those in `~/.claude/skills`)

### Sessions

- **Dual engine**: Claude Code CLI (default, runs in the sandbox, cc-switch model applies automatically) + direct Anthropic API (fallback)
- **Global vs task sessions**: Clearly grouped; the secondary sidebar hosts an embedded chat (does not occupy the workbench)
- **Automatic session titles**: AI generates a concise title after the first exchange of non-task sessions
- **Message persistence**: Every conversation is mirrored in real time to `<project folder>/.chat_cache.json`
- **Thinking effort**: low / medium / high / max (mapped to thinking budget)

### Knowledge Library

- **Literature library**: Structured entries + batch import (**BibTeX / RIS (Zotero · EndNote) / JSON / free text**) via paste or file, automatic dedup, project / global scope
- **Notes library**: Register local folders (Obsidian vault supported), recursive browsing, modal editing
- **Scratch notes**: Notes distilled from temporary chats and quick ideas

### Recommended Reading

- Recommends **arXiv** papers based on keywords extracted from project + library literature
- Custom **RSS feeds** (URLs or local `.rss`/`.xml` files)
- Custom keywords and arXiv category filters (e.g. `cs.CV`)
- Source-tabbed display, one-click import to literature library / scratch notes

### Floating Window & Quick Access

- **System-level floating window** (via tray menu): always-on-top compact window for ad-hoc chat; selected text in the workbench can be sent to it via right-click
- **Global search** (`Ctrl+Shift+P` or tray menu): cross-project / task / session / file / literature search
- **System tray**: show main window / quick search / temporary chat / quit

### Environment & Model Management

- **Python environments**: PowerShell registry enumeration + direct conda env scanning, supports conda / uv / system Python with per-version switching; scripts run with the environment's own `python.exe`
- **Model management**: Reads cc-switch configuration and the Claude Code model family; settings dropdown to switch (empty = follow cc-switch)
- **Connection test**: One-click Claude Code link test

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron 43 |
| Build | electron-vite 5 · Vite 7 |
| Frontend | React 19 · TypeScript · Zustand · CodeMirror 6 · marked |
| Backend | Express (localhost port 11455) · node:sqlite |
| AI Engine | Claude Code CLI + Anthropic API |
| Academic Skills | ARS (academic-research-skills plugin) |

---

## 🚀 Getting Started

```bash
# Install dependencies (Electron binary downloads via npmmirror mirror)
npm install

# Development mode (frontend 11454 / backend 11455)
npm run dev

# Type check
npm run typecheck

# Production build
npm run build

# Preview production build
npm run start
```

**Prerequisites**:

- Node.js ≥ 20 (24 recommended for development)
- [Claude Code CLI](https://claude.com/claude-code) (required for the CLI engine; the API fallback engine can substitute)
- Optional: [cc-switch](https://github.com/farion1231/cc-switch) (multi-model switching)
- Optional: ARS academic skills plugin (`academic-research-skills`)

---

## 📖 User Guide

### 1. Create a Project

Overview page → describe your research idea and let AI draft a suggestion, or click "New Project" and fill the form:
- **Project name** (required)
- **Project type** (determines the default task set)
- **Project folder** (required; becomes the sandbox where all files and sessions live)
- Description, main prompt (written to the sandbox `CLAUDE.md`)

### 2. Enter the Workspace

Opening a project gives you a full VSCode-style interface:
- **Activity bar** switches the primary sidebar: Explorer / Tasks / Sessions / Library / Recommendations
- **Workbench** opens files, tasks, and sessions as tabs
- **Secondary sidebar** hosts the embedded chat (global + task session groups)
- The **center input in the title bar** opens the floating global chat

### 3. Run Tasks

- Chat tasks (Research Consultation): converse directly
- Form tasks: fill the form (goal / materials / constraints…) → submit → AI executes following the ARS skill workflow → results stream in real time
- Form submissions reuse the task's session (continuous conversation); session titles are auto-generated after the first exchange

### 4. Knowledge Library

- Add literature: manually or batch import (BibTeX / RIS / JSON / text)
- Notes library: register a local folder (optionally an Obsidian vault), browse and edit markdown
- Scratch notes: save temporary chats as notes

### 5. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save current file |
| `Ctrl+B` | Toggle primary sidebar |
| `Ctrl+J` | Toggle output panel |
| `Ctrl+Shift+B` | Toggle secondary sidebar |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` | Switch tabs |
| `Ctrl+Shift+P` | Global search |
| `Ctrl+= / Ctrl+-` | Editor font size |

---

## 📁 Project Structure

```
├─ src/
│  ├─ main/          # Electron main process (window/tray/floating window/IPC)
│  ├─ preload/       # contextBridge security bridge
│  ├─ server/        # Express backend (11455): SQLite, routes, CLI/API engines
│  │  ├─ claude/     # Dual engines (cli-engine / api-engine)
│  │  └─ routes/     # projects/tasks/sessions/literature/libraries/
│  │                 # recommendations/scratch/ccswitch/envs/update…
│  ├─ shared/        # Shared types between main and renderer
│  └─ renderer/      # React frontend
│     ├─ components/ # Workspace components (Explorer/Workbench/AuxPanel…)
│     └─ pages/      # Pages (Projects/Workspace/Settings/Library…)
├─ resources/        # App icon
├─ scripts/          # Dev utilities (Electron binary bootstrap, icon generation)
└─ data/             # Dev-mode data (SQLite + sandboxes); userData in production
```

---

## ⚙️ Configuration

All settings live in the **Settings** page (gear icon at the bottom-left of the activity bar):

- **Engine & Model**: default engine, model selection (follow cc-switch or explicit), thinking effort, connection test
- **Sandbox Environment**: run environment (system Python / conda envs / uv), manual conda path, full-disk conda search
- **Custom Skills**: skills directory (default `~/.claude/skills`)
- **Recommended Reading**: custom keywords, arXiv categories, RSS feeds (also editable on the recommendations page)
- **API Fallback**: API key, base URL
- **Appearance**: theme, accent color (incl. custom HEX), username

---

## ❓ FAQ

**Q: conda environments are not detected?**
Settings → Sandbox Environment → "Full-disk conda search" (scans all drives); or specify the conda root / conda.exe path manually. The environment list refreshes automatically once found.

**Q: Claude Code connection fails?**
Settings → "Test Claude Code link". Make sure the CLI is installed and `claude --version` works; model switching depends on cc-switch (empty model = follow cc-switch's current configuration).

**Q: Edited content is lost when switching tabs?**
No. Unsaved drafts are kept in memory (tabs stay mounted); press `Ctrl+S` to persist to disk.

**Q: How to import EndNote / Zotero references?**
Library → Literature → Import → pick a `.ris` / `.bib` file (or paste the exported content); parsing and dedup are automatic.

**Q: Port conflicts?**
Frontend is fixed at 11454, backend at 11455. Check port usage if startup fails.

---

## 📄 License

MIT + GPLv3 dual license. See the [official website](https://kawasakikusako.github.io/generalExp/oap/).

---

**Powered by Claude Code** · Research Consultation → Data Sandbox → Writing Preparation → Paper Writing → Paper Review → Paper Revision
