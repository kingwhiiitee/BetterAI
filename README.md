<div align="center">

# BetterAI

**Portable fixes for AI assistants: Claude, Claude Code, Codex and ChatGPT.**<br>
**可复用的 AI 助手修复包:适用于 Claude、Claude Code、Codex 与 ChatGPT。**

[English](#english) · [中文](#中文)

[![test](https://github.com/kingwhiiitee/BetterAI/actions/workflows/test.yml/badge.svg)](https://github.com/kingwhiiitee/BetterAI/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## English

### Fix #1: `precise-edit` stops AI agents from rewriting whole files

**The problem.** Ask an agent to change three lines and it often regenerates the entire file, using `Write`/`create_file`, `cat <<EOF > file`, `sed -i`, `Set-Content`, a Python one-liner, or a Codex `*** Add File:` over an existing path. The result is unrelated code silently lost or "tidied", earlier fixes reverted, broken formatting and line endings, huge unreviewable diffs, and wasted tokens.

**The fix.** `precise-edit` makes the agent use exact-match edit tools (`Edit` / `str_replace` / `apply_patch` hunks / targeted canvas updates). Where the platform allows it, a hook *enforces* this by blocking whole-file rewrites before they run.

### How it works

| Layer | What it does | Kind |
|---|---|---|
| **Skill** ([`SKILL.md`](plugins/precise-edit/skills/precise-edit/SKILL.md)) | Teaches the workflow: read, anchor on a unique snippet, edit, verify. Explains how to recover from "no match" or "multiple matches", and when a full rewrite is OK. | Guidance, loaded on demand |
| **Always-on policy** | A short rule set in `CLAUDE.md` / `AGENTS.md` / SessionStart / custom instructions | Guidance, always in context |
| **Guard hook** ([`guard.mjs`](plugins/precise-edit/scripts/guard.mjs)) | `PreToolUse` hook that denies rewrites of existing non-empty files and tells the agent what to do instead | **Enforcement** |
| **Exec rules** ([`precise-edit.rules`](platforms/codex/precise-edit.rules), Codex only) | `prefix_rule`s that forbid `sed -i`, `perl -pi`, `awk -i inplace` | **Enforcement** |

### Platform support

| Platform | Skill | Always-on policy | Guard hook | Exec rules |
|---|:-:|:-:|:-:|:-:|
| Claude Code | ✅ plugin | ✅ SessionStart | ✅ | n/a |
| Claude Cowork | ✅ plugin | ✅ SessionStart | ⚠️ best effort | n/a |
| Claude.ai chat | ✅ upload | ✅ preferences | n/a | n/a |
| Codex (CLI / IDE / app) | ✅ | ✅ `AGENTS.md` | ✅ | ✅ |
| ChatGPT Work / Business / Enterprise / Edu | ✅ upload | ✅ instructions | n/a | n/a |
| ChatGPT chat (Free / Plus / Pro) | n/a | ✅ custom instructions | n/a | n/a |

Chat products do not run user hooks, so there the fix is guidance only. It still works well, because models follow explicit tool-choice rules closely.

### Install

The guard hook needs **Node.js 18+** on `PATH`. The skill and instructions work without it.

#### Let an AI install it (universal prompt)

Copy the prompt below into any AI tool: Claude Code, Codex, Claude Cowork, Claude.ai, ChatGPT, Cursor, Gemini CLI and so on. The AI works out which tool it is running in and installs the matching version. If it can't install anything itself (for example in plain chat), it gives you the manual steps. It shows you every configuration change and waits for your OK before applying it.

```text
Install the "precise-edit" fix from https://github.com/kingwhiiitee/BetterAI for the AI tool you are running in right now. It makes AI agents change existing files with exact-match edits (Edit / str_replace / apply_patch) instead of rewriting whole files.

Rules:
- Only use files from github.com/kingwhiiitee/BetterAI (releases: https://github.com/kingwhiiitee/BetterAI/releases/latest).
- Before changing any configuration outside the repository, show me the exact commands or file changes and wait for my confirmation.
- Do not use sudo or administrator rights. Requirements: git and Node.js 18+ (check with `node --version`). If Node.js is missing, tell me before continuing.

First identify which tool you are running in, then follow only the matching section.

A. Claude Code (you can run shell commands and the `claude` CLI is available):
   1. Run `claude plugin marketplace add kingwhiiitee/BetterAI`.
   2. Run `claude plugin install precise-edit@betterai`.
   3. Run `claude plugin list` and confirm precise-edit@betterai is enabled. Then tell me to start a new session.

B. Codex (CLI, IDE extension or app):
   1. Clone the repository into <home>/.betterai/BetterAI, or run `git pull --ff-only` there if it already exists.
   2. In that folder run `node --test`. All tests must pass.
   3. Run `node scripts/install.mjs --codex --dry-run` and show me the output. After I confirm, run it again without `--dry-run`.
   4. Tell me to restart Codex, run /hooks and trust the "precise-edit" hook, because Codex skips untrusted hooks.

C. Claude Cowork:
   Download https://github.com/kingwhiiitee/BetterAI/releases/latest/download/precise-edit.plugin, save it to the outputs folder and present it to me so I can accept the plugin card. If you cannot download it, give me the link instead.

D. Chat without a shell (Claude.ai, ChatGPT):
   You cannot install it yourself, so give me these steps:
   - Claude.ai: download https://github.com/kingwhiiitee/BetterAI/releases/latest/download/precise-edit-skill.zip, then go to Settings → Capabilities → Skills → Upload skill.
   - ChatGPT Work / Business / Enterprise / Edu: upload the same zip via Skills → Create → Upload from your computer.
   - Any plan: paste the instruction block from https://github.com/kingwhiiitee/BetterAI/blob/main/platforms/chatgpt/custom-instructions.md (ChatGPT) or https://github.com/kingwhiiitee/BetterAI/blob/main/platforms/claude-ai/instructions.md (Claude.ai) into custom instructions / personal preferences.
   Then follow that editing rule yourself for the rest of this conversation.

E. Any other coding agent (Cursor, Gemini CLI, Windsurf, Cline, ...):
   Clone the repository as in B. If the agent supports Agent Skills, copy plugins/precise-edit/skills/precise-edit into its skills folder. Otherwise append the policy block from platforms/codex/AGENTS.md to its global rules file (for example AGENTS.md, GEMINI.md or .cursor/rules). Show me the target path before writing.

Finish with a short report: what you installed, where, and anything I still have to do by hand.
```

#### Claude Code (plugin, recommended)

Inside Claude Code:

```text
/plugin marketplace add kingwhiiitee/BetterAI
/plugin install precise-edit@betterai
```

Or from a shell:

```bash
claude plugin marketplace add kingwhiiitee/BetterAI
```

```bash
claude plugin install precise-edit@betterai
```

Start a new session afterwards. To install without the marketplace instead, run `node scripts/install.mjs --claude-code` from a clone. It copies the skill to `~/.claude/skills`, adds the hook to `~/.claude/settings.json` and a policy block to `~/.claude/CLAUDE.md`. Pick one method, not both.

#### Codex

```bash
git clone https://github.com/kingwhiiitee/BetterAI.git && cd BetterAI
```

```bash
node scripts/install.mjs --codex
```

This installs:

- the skill: `~/.agents/skills/precise-edit/`
- the guard hook: `~/.codex/precise-edit/guard.mjs`, registered in `~/.codex/hooks.json` for `Bash|apply_patch`
- the exec rules: `~/.codex/rules/precise-edit.rules`
- the policy block: `~/.codex/AGENTS.md`

Then start `codex`, run `/hooks` and **trust** the precise-edit hook. Codex skips untrusted hooks. `CODEX_HOME` is respected.

#### Claude.ai (chat)

1. Download `precise-edit-skill.zip` from [Releases](https://github.com/kingwhiiitee/BetterAI/releases/latest).
2. Go to Settings → Capabilities → Skills → Upload skill. Code execution must be enabled.
3. Recommended: paste a block from [`platforms/claude-ai/instructions.md`](platforms/claude-ai/instructions.md) into your personal preferences or a Project's instructions.

#### Claude Cowork

Download `precise-edit.plugin` from [Releases](https://github.com/kingwhiiitee/BetterAI/releases/latest), drop it into a Cowork conversation and accept the plugin card. Cowork mainly uses the skill. The hook runs only if the Cowork environment has Node available, and fails open otherwise.

#### ChatGPT

- **Work / Business / Enterprise / Edu (Skills enabled):** Skills → Create → Upload from your computer → `precise-edit-skill.zip`. If Skills are switched off, ask your workspace admin.
- **Any plan:** paste a block from [`platforms/chatgpt/custom-instructions.md`](platforms/chatgpt/custom-instructions.md) into Settings → Personalization → Custom instructions, or into a Project's instructions.

### What the guard blocks

It applies only to **existing, non-empty** files outside the system temp directory:

- Claude Code `Write` over an existing file
- Codex `apply_patch`: `*** Add File:` on an existing path, Delete + Add of the same file, or an Update hunk that removes at least 90% of a file of 40+ lines
- Shell: `sed -i`, `perl -pi` / `ruby -i`, `awk -i inplace`, `> file`, `&> file`, `tee file` (without `-a`), `mv tmp file`, including inside `bash -c`, `sudo`, `env`, `xargs` and `powershell -Command`
- PowerShell: `Set-Content`, `Out-File`, `New-Item -Force`, `Move-Item -Force`, `[IO.File]::WriteAll*`, `> file`, `Get-Content … -replace … | Set-Content`
- Inline Python / Node / Ruby / PHP scripts (`-c`, `-e`, heredocs, here-strings) whose write call targets an existing file

Always allowed: new files, empty files, appends (`>>`, `Add-Content`, `tee -a`), `/dev/null` and `$null`, temp files, and anything matching `allowOverwrite`.

When it blocks a call, the agent receives a message explaining what was blocked and which precise tool to use instead, so it corrects itself instead of looping.

### Configuration

| Setting | Values | Default |
|---|---|---|
| `PRECISE_EDIT_MODE` (env var) | `block` · `warn` (allow, but remind the agent) · `off` | `block` |
| `.precise-edit.json` (searched upward from the project dir) | see below | none |

```json
{
  "mode": "block",
  "allowOverwrite": ["dist/**", "*.snap", "docs/generated/**"],
  "rewriteThreshold": 0.9,
  "rewriteMinLines": 40
}
```

The guard is a **guardrail, not a sandbox.** It fails open: if Node is missing or anything goes wrong, the tool call proceeds. A determined agent could still find another route, which is why the skill and policy explain *why* precise edits matter.

### Verify

```bash
npm test
```

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"sed -i s/a/b/ package.json"},"cwd":"."}' | node plugins/precise-edit/scripts/guard.mjs
```

The second command prints a `deny` decision. Inside Claude Code you can also ask the agent to "overwrite package.json with the Write tool" and watch it get redirected to `Edit`.

### Repository layout

```text
.claude-plugin/marketplace.json   Claude Code / Cowork marketplace
plugins/precise-edit/             the plugin (single source of truth)
  skills/precise-edit/SKILL.md    portable skill (Agent Skills format)
  hooks/hooks.json                SessionStart + PreToolUse hooks
  scripts/guard.mjs               the guard, shared by Claude Code and Codex
platforms/                        paste-ready instructions per platform + Codex rules
scripts/install.mjs               installer for Codex and Claude Code (manual mode)
scripts/build.mjs                 builds dist/precise-edit-skill.zip and dist/precise-edit.plugin
tests/                            node:test suite (Linux, macOS, Windows in CI)
```

### Uninstall

- Claude Code plugin: `/plugin uninstall precise-edit@betterai`
- Installer: `node scripts/install.mjs --uninstall --codex` (or `--claude-code`, `--all`). Every file the installer modified is backed up once as `*.bak-precise-edit`.

### Contributing

New fixes are welcome and follow the same shape: one portable skill, an optional hook, and per-platform instructions. Run `npm test` and `node scripts/build.mjs` before opening a pull request.

### License

[MIT](LICENSE)

---

## 中文

### 修复 #1:`precise-edit`,阻止 AI 代理整文件重写

**问题。** 你让代理改三行,它却常常把整个文件重新生成一遍。它会用 `Write`/`create_file`、`cat <<EOF > file`、`sed -i`、`Set-Content`、一段 Python 脚本,或者在 Codex 里对已存在的文件用 `*** Add File:`。后果是无关代码被悄悄删掉或"顺手整理"、之前的修复被回退、格式和换行符被破坏、diff 大到没法审查,还浪费 token。

**修复。** `precise-edit` 让代理使用精确匹配的编辑工具(`Edit` / `str_replace` / `apply_patch` 补丁块 / 画布的局部更新)。在平台允许的地方,还会用 hook 在执行前直接拦截整文件重写,做到**强制**。

### 工作原理

| 层 | 作用 | 性质 |
|---|---|---|
| **Skill**([`SKILL.md`](plugins/precise-edit/skills/precise-edit/SKILL.md)) | 教会代理标准流程:先读取、用唯一片段做锚点、编辑、验证;说明"匹配不到/匹配多处"时如何恢复,以及什么情况下可以整体重写 | 指导,按需加载 |
| **常驻规则** | 写在 `CLAUDE.md` / `AGENTS.md` / SessionStart / 自定义指令里的简短规则 | 指导,始终在上下文中 |
| **Guard hook**([`guard.mjs`](plugins/precise-edit/scripts/guard.mjs)) | `PreToolUse` hook,拒绝对已有非空文件的整体重写,并告诉代理应该改用什么工具 | **强制** |
| **执行规则**([`precise-edit.rules`](platforms/codex/precise-edit.rules),仅 Codex) | 用 `prefix_rule` 禁止 `sed -i`、`perl -pi`、`awk -i inplace` | **强制** |

### 平台支持

| 平台 | Skill | 常驻规则 | Guard hook | 执行规则 |
|---|:-:|:-:|:-:|:-:|
| Claude Code | ✅ 插件 | ✅ SessionStart | ✅ | 不适用 |
| Claude Cowork | ✅ 插件 | ✅ SessionStart | ⚠️ 尽力而为 | 不适用 |
| Claude.ai 对话 | ✅ 上传 | ✅ 个人偏好 | 不适用 | 不适用 |
| Codex(CLI / IDE / 桌面端) | ✅ | ✅ `AGENTS.md` | ✅ | ✅ |
| ChatGPT Work / Business / Enterprise / Edu | ✅ 上传 | ✅ 指令 | 不适用 | 不适用 |
| ChatGPT 对话(Free / Plus / Pro) | 不适用 | ✅ 自定义指令 | 不适用 | 不适用 |

对话类产品不允许运行用户 hook,所以在那里只能靠指导。不过效果依然不错,因为模型会严格遵守明确的工具选择规则。

### 安装

Guard hook 需要 `PATH` 中有 **Node.js 18+**;skill 和指令不依赖 Node。

#### 让 AI 帮你安装(通用提示词)

把下面这段提示词复制给任意 AI 工具即可:Claude Code、Codex、Claude Cowork、Claude.ai、ChatGPT、Cursor、Gemini CLI 等都可以。AI 会先判断自己运行在哪个工具里,然后安装对应的版本。如果它自己无法安装(比如纯对话环境),就会把手动步骤告诉你。每一处配置改动它都会先展示给你,等你确认后才执行。

```text
请为你当前所在的 AI 工具安装 https://github.com/kingwhiiitee/BetterAI 中的 "precise-edit" 修复。它让 AI 代理用精确匹配的编辑(Edit / str_replace / apply_patch)修改已有文件,而不是整文件重写。

规则:
- 只使用来自 github.com/kingwhiiitee/BetterAI 的文件(发布页:https://github.com/kingwhiiitee/BetterAI/releases/latest)。
- 修改仓库以外的任何配置之前,先把具体命令或文件改动展示给我,等我确认后再执行。
- 不要使用 sudo 或管理员权限。需要 git 和 Node.js 18+(用 `node --version` 检查);如果没有 Node.js,先告诉我再继续。

先判断你运行在哪个工具里,然后只执行对应的那一节。

A. Claude Code(你能执行 shell 命令,并且有 `claude` 命令行):
   1. 运行 `claude plugin marketplace add kingwhiiitee/BetterAI`。
   2. 运行 `claude plugin install precise-edit@betterai`。
   3. 运行 `claude plugin list`,确认 precise-edit@betterai 已启用,然后提醒我开启一个新会话。

B. Codex(CLI、IDE 扩展或桌面端):
   1. 把仓库克隆到 <用户主目录>/.betterai/BetterAI;如果已经存在,就在该目录运行 `git pull --ff-only`。
   2. 在该目录运行 `node --test`,所有测试必须通过。
   3. 运行 `node scripts/install.mjs --codex --dry-run` 并把输出展示给我。我确认后,去掉 `--dry-run` 再运行一次。
   4. 提醒我重启 Codex,运行 /hooks 并信任(trust)"precise-edit" hook,因为 Codex 会跳过未被信任的 hook。

C. Claude Cowork:
   下载 https://github.com/kingwhiiitee/BetterAI/releases/latest/download/precise-edit.plugin,保存到 outputs 文件夹并展示给我,让我在插件卡片上确认安装。如果无法下载,就把链接给我。

D. 没有 shell 的对话环境(Claude.ai、ChatGPT):
   你无法自己安装,请把以下步骤告诉我:
   - Claude.ai:下载 https://github.com/kingwhiiitee/BetterAI/releases/latest/download/precise-edit-skill.zip,然后进入 设置 → Capabilities → Skills → Upload skill。
   - ChatGPT Work / Business / Enterprise / Edu:通过 Skills → Create → Upload from your computer 上传同一个 zip。
   - 任意套餐:把 https://github.com/kingwhiiitee/BetterAI/blob/main/platforms/chatgpt/custom-instructions.md(ChatGPT)或 https://github.com/kingwhiiitee/BetterAI/blob/main/platforms/claude-ai/instructions.md(Claude.ai)中的指令粘贴到自定义指令 / 个人偏好里。
   然后在本次对话的剩余部分里,你自己也要遵守这条编辑规则。

E. 其他编程代理(Cursor、Gemini CLI、Windsurf、Cline 等):
   按 B 的方式克隆仓库。如果该代理支持 Agent Skills,把 plugins/precise-edit/skills/precise-edit 复制到它的 skills 目录;否则把 platforms/codex/AGENTS.md 中的规则块追加到它的全局规则文件(例如 AGENTS.md、GEMINI.md 或 .cursor/rules)。写入前先告诉我目标路径。

最后给我一份简短报告:装了什么、装在哪里,以及还有哪些需要我手动完成的步骤。
```

#### Claude Code(插件,推荐)

在 Claude Code 中执行:

```text
/plugin marketplace add kingwhiiitee/BetterAI
/plugin install precise-edit@betterai
```

或在终端中执行:

```bash
claude plugin marketplace add kingwhiiitee/BetterAI
```

```bash
claude plugin install precise-edit@betterai
```

安装后开启新会话即可。如果不想用 marketplace,也可以克隆仓库后运行 `node scripts/install.mjs --claude-code`:它会把 skill 复制到 `~/.claude/skills`,把 hook 写入 `~/.claude/settings.json`,并在 `~/.claude/CLAUDE.md` 中加入规则块。两种方式二选一,不要同时用。

#### Codex

```bash
git clone https://github.com/kingwhiiitee/BetterAI.git && cd BetterAI
```

```bash
node scripts/install.mjs --codex
```

会安装以下内容:

- skill:`~/.agents/skills/precise-edit/`
- guard hook:`~/.codex/precise-edit/guard.mjs`,并在 `~/.codex/hooks.json` 中为 `Bash|apply_patch` 注册
- 执行规则:`~/.codex/rules/precise-edit.rules`
- 规则块:`~/.codex/AGENTS.md`

然后启动 `codex`,运行 `/hooks` 并**信任(trust)** precise-edit hook,Codex 会跳过未被信任的 hook。支持 `CODEX_HOME` 环境变量。

#### Claude.ai(对话)

1. 从 [Releases](https://github.com/kingwhiiitee/BetterAI/releases/latest) 下载 `precise-edit-skill.zip`。
2. 进入 设置 → Capabilities(功能)→ Skills → Upload skill(需要开启代码执行)。
3. 建议:把 [`platforms/claude-ai/instructions.md`](platforms/claude-ai/instructions.md) 中的一段粘贴到个人偏好或某个 Project 的指令里。

#### Claude Cowork

从 [Releases](https://github.com/kingwhiiitee/BetterAI/releases/latest) 下载 `precise-edit.plugin`,拖进 Cowork 对话,在插件卡片上点击安装。Cowork 主要依靠 skill 生效;hook 只有在 Cowork 环境里有 Node 时才会运行,否则自动放行。

#### ChatGPT

- **Work / Business / Enterprise / Edu(已开启 Skills):** Skills → Create → Upload from your computer → 选择 `precise-edit-skill.zip`。如果 Skills 被关闭,请联系工作区管理员开启。
- **任意套餐:** 把 [`platforms/chatgpt/custom-instructions.md`](platforms/chatgpt/custom-instructions.md) 中的一段粘贴到 设置 → 个性化 → 自定义指令,或某个 Project 的指令里。

### Guard 会拦截什么

仅针对系统临时目录之外**已存在且非空**的文件:

- Claude Code 用 `Write` 覆盖已有文件
- Codex `apply_patch`:对已存在路径使用 `*** Add File:`;对同一文件先 Delete 再 Add;或者某个 Update 块删除了 40 行以上文件中至少 90% 的行
- Shell:`sed -i`、`perl -pi` / `ruby -i`、`awk -i inplace`、`> file`、`&> file`、不带 `-a` 的 `tee file`、`mv tmp file`;包裹在 `bash -c`、`sudo`、`env`、`xargs`、`powershell -Command` 里的也算
- PowerShell:`Set-Content`、`Out-File`、`New-Item -Force`、`Move-Item -Force`、`[IO.File]::WriteAll*`、`> file`、`Get-Content … -replace … | Set-Content`
- 内联的 Python / Node / Ruby / PHP 脚本(`-c`、`-e`、heredoc、here-string)中写入目标是已有文件的调用

始终放行:新文件、空文件、追加写入(`>>`、`Add-Content`、`tee -a`)、`/dev/null` 和 `$null`、临时文件,以及匹配 `allowOverwrite` 的路径。

拦截时,代理会收到一条说明:拦截了什么、应该改用哪个精确工具。代理据此自我纠正,不会陷入死循环。

### 配置

| 设置 | 取值 | 默认 |
|---|---|---|
| `PRECISE_EDIT_MODE`(环境变量) | `block` · `warn`(放行但提醒代理) · `off` | `block` |
| `.precise-edit.json`(从项目目录向上查找) | 见下方示例 | 无 |

```json
{
  "mode": "block",
  "allowOverwrite": ["dist/**", "*.snap", "docs/generated/**"],
  "rewriteThreshold": 0.9,
  "rewriteMinLines": 40
}
```

Guard 是**护栏,不是沙箱**。它采用失败放行策略:没有 Node 或出现任何异常时,工具调用照常执行。执意绕过的代理仍可能找到别的办法,所以 skill 和规则里都解释了为什么精确编辑很重要。

### 验证

```bash
npm test
```

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"sed -i s/a/b/ package.json"},"cwd":"."}' | node plugins/precise-edit/scripts/guard.mjs
```

第二条命令会输出 `deny` 决定。在 Claude Code 里,你也可以直接让代理"用 Write 工具覆盖 package.json",观察它被引导改用 `Edit`。

### 目录结构

```text
.claude-plugin/marketplace.json   Claude Code / Cowork 插件市场
plugins/precise-edit/             插件本体(唯一的源文件)
  skills/precise-edit/SKILL.md    可移植的 skill(Agent Skills 格式)
  hooks/hooks.json                SessionStart + PreToolUse hook
  scripts/guard.mjs               guard 脚本,Claude Code 与 Codex 共用
platforms/                        各平台可直接粘贴的指令 + Codex 规则
scripts/install.mjs               Codex / Claude Code 安装器(手动模式)
scripts/build.mjs                 构建 dist/precise-edit-skill.zip 与 dist/precise-edit.plugin
tests/                            node:test 测试(CI 覆盖 Linux、macOS、Windows)
```

### 卸载

- Claude Code 插件:`/plugin uninstall precise-edit@betterai`
- 安装器:`node scripts/install.mjs --uninstall --codex`(或 `--claude-code`、`--all`)。安装器修改过的每个文件都会备份一次,备份名为 `*.bak-precise-edit`。

### 贡献

欢迎提交新的修复,沿用相同结构即可:一个可移植的 skill、可选的 hook,以及各平台的指令。提交 PR 前请运行 `npm test` 和 `node scripts/build.mjs`。

### 许可证

[MIT](LICENSE)
