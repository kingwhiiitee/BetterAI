<div align="center">

# Coach

**自适应 AI 学习教练 + 跨会话学习知识库，另附 ChatGPT 公式修复 LaTeX Fix。**<br>
An adaptive AI study coach with a cross-session knowledge base, plus LaTeX Fix for ChatGPT.

[![test](https://github.com/kingwhiiitee/Coach/actions/workflows/test.yml/badge.svg)](https://github.com/kingwhiiitee/Coach/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

> `precise-edit`（阻止 AI 代理整文件重写）已迁到独立仓库 **[kingwhiiitee/precise-edit](https://github.com/kingwhiiitee/precise-edit)**。

## 这是什么

Coach 让 AI 当一个会记事的学习教练：它在有限的时间里决定这一轮该诊断、讲解、练习还是复习，把每次作答拆成步骤记成证据，再根据证据更新你对每个知识点的掌握状态，下次开课从上次停下的地方接着来。

仓库由三部分组成，可以单独使用：

| 部分 | 作用 | 说明 |
| --- | --- | --- |
| [学习教练技能](plugins/adaptive-learning-coach/skills/adaptive-learning-coach/SKILL.md) | 教学流程本身：怎么选下一步、怎么讲、怎么检验理解 | 一个 Claude 技能，不连知识库也能用 |
| [学习知识库 `learning-db/`](learning-db/README.md) | 教练的跨会话记忆：知识点、前置关系、学习证据、掌握状态、教学决策 | 自己部署在 Cloudflare（Worker + D1），附阅览网页 |
| [LaTeX Fix](Latex%20Fix/README.md) | 让 ChatGPT 的公式正确渲染、能复制出 LaTeX 源码 | 与教练无关的独立工具 |

## 学习教练技能

`adaptive-learning-coach` 面向同时学多门课、以考试为目标、时间有限的学习者。它按三条原则排优先级：

1. **Make it worth it**：这点时间最该花在哪，要学到多深，哪些可以先跳过。
2. **Make it work**：从已有知识的不足出发讲动机、直觉、前置和边界；讲解前先建一条带权重的前置知识链（可以跨课程、跨学科），按缺口顺序补。
3. **Make it right**：用题型识别、步骤练习、变式和纠错形成独立作答能力。

复习不排固定日历，而是在之后的学习里找机会抽查旧知识。"理解"以能否在新情境里正确使用为准，而不是能否复述或说"我懂了"。技能内容是中文。

### 安装

Claude Code：

```text
/plugin marketplace add kingwhiiitee/Coach
/plugin install adaptive-learning-coach@coach
```

Claude.ai：从 [Releases](https://github.com/kingwhiiitee/Coach/releases/latest) 下载 `adaptive-learning-coach-skill.zip`（或运行 `node scripts/build.mjs`，生成在 `dist/`），然后 设置 → Capabilities → Skills → Upload skill。

## 学习知识库 learning-db

一个 Cloudflare Worker，数据存在 D1 数据库 `learning-knowledge`。同一个 Worker 提供三样东西：

- **`/mcp`**：给 AI 用的 MCP 接口，19 个固定工具。AI 不直接写 SQL，所有读写都走这些工具，工具层负责校验（比如状态必须引用证据、前置关系不能成环）。
- **`/api/*`**：给网页用的只读 JSON。
- **`/`**：阅览网页。

数据按 Evidence-Centered Design 分四层：知识节点（课程、知识点、前置与类比关系、考核目标及考核价值）→ 学习证据（会话、按步骤拆开的作答）→ 知识状态（unknown / exposed / assisted / independent / validated / weak / recheck 七种，只追加）→ 教学决策（讲解、练习、复测、推进，以及学 / 略读 / 跳过）。

### MCP 工具

| 读 | 写 |
| --- | --- |
| `overview` `find_nodes` `get_node` `prerequisite_chain` `review_candidates` | `upsert_course` `upsert_assessment` `upsert_node` `link_nodes` `move_node` `start_session` `end_session` `record_attempt` `record_evidence` `assess_state` `estimate_value` `decide` `update_decision` `delete_record` |

几个值得单独说的：

- `prerequisite_chain`：沿前置关系向上走（可以跨课程），给出每个前置的权重、需要达到的水平、当前是否有缺口，以及补救顺序。
- `move_node`：把知识点挪到另一门课程。
- `delete_record`：删除建错或重复的记录。先不带 `confirm` 调用，只预览会连带删掉什么；同意后带 `confirm=true` 再调一次，所有删除在一个事务里完成。改判断不靠删除：状态用新的 `assess_state` 覆盖，决策用 `update_decision` 撤销。

### 阅览网页

打开 Worker 的域名，输入访问令牌即可（令牌只存在本机浏览器）。网页只读，不能改数据。侧边栏三个入口：

- **仪表盘**（默认首页）：下一步该做什么，以及最近的学习记录。
- **知识库**：每门课的状态分布、考核目标和倒计时；点进课程按状态看全部知识点，或切到前置关系图看分层依赖、跨课程和跨学科的链接；再点进知识点看定义、直觉、易错点、状态变化、学习证据和教学决策。
- **待办决策**：待执行的讲解、练习、复测，以及仍在生效的学 / 略读 / 跳过范围。

公式（`$…$`、`$$…$$`、`\(…\)`、`\[…\]`）由打包进网页的 KaTeX 渲染，不依赖外部 CDN。

### 部署

```bash
cd learning-db
npm install
npx wrangler login                      # 或设置 CLOUDFLARE_API_TOKEN
npx wrangler secret put ACCESS_TOKEN    # 一个 16 位以上的随机字符串
```

全新数据库先建表：

```bash
npx wrangler d1 execute learning-knowledge --remote --file schema.sql
```

已有数据库升级时，**先迁移 D1，再部署 Worker**（迁移对旧版 Worker 兼容，顺序反了新代码会读到不存在的列）：

```bash
npx wrangler d1 execute learning-knowledge --remote --file migrations/<文件>.sql
npx wrangler deploy
```

`wrangler.jsonc` 里的 `database_id` 指向作者自己的 D1；自己部署时用 `npx wrangler d1 create learning-knowledge` 新建一个并替换这个 id。没有设置 `ACCESS_TOKEN`（或少于 16 位）时，`/mcp` 和 `/api` 一律返回 401。

### 连接到 AI

- **Claude.ai**：设置 → 连接器 → 添加自定义连接器，URL 填 `https://<worker 域名>/mcp/<ACCESS_TOKEN>`。令牌就在 URL 里，不要分享这个地址。
- **Claude Code**：

  ```bash
  claude mcp add --transport http learning-knowledge https://<worker 域名>/mcp --header "Authorization: Bearer <ACCESS_TOKEN>"
  ```

连上之后，教练技能会在开课时调 `overview` 找到上次的中断点，学习过程中自动记录证据、状态和决策。更多细节（数据模型、前置权重、本地开发）见 [`learning-db/README.md`](learning-db/README.md)。

## LaTeX Fix

解决 ChatGPT 的两个公式问题：公式显示成原始文本或 KaTeX 报错，以及公式没法以 LaTeX 源码复制出去。

| 组成 | 作用 | 适用范围 |
| --- | --- | --- |
| [LaTeX 规则](Latex%20Fix/chatgpt/custom-instructions.md) | 粘进自定义指令，让模型只写能渲染的公式，并在回答末尾附可复制的 `latex` 源码块 | 所有 ChatGPT 客户端 |
| [Skill](Latex%20Fix/skills/latex-fix/SKILL.md) | 完整规则、自检、各编辑器的格式对照和修复步骤 | 支持 Skills 的 ChatGPT 套餐、Claude.ai |
| [油猴脚本](Latex%20Fix/userscript/chatgpt-latex-fix.user.js) | 在 chatgpt.com 上渲染漏掉的公式，让复制按钮和选中复制都输出 `$…$` / `$$…$$` | 装了 Tampermonkey / Violentmonkey 的桌面浏览器 |
| [转换网页](Latex%20Fix/web/converter.html) | 粘贴从任意客户端复制的回答，得到修好的文本，离线可用 | 任何浏览器，包括手机 |
| [命令行](Latex%20Fix/scripts/latex-fix.mjs) | 同一套转换：`node "Latex Fix/scripts/latex-fix.mjs" answer.md` | Node.js 18+ |

只用 LaTeX 规则就够了，其余是可选增强。安装步骤和平台支持见 [`Latex Fix/README.md`](Latex%20Fix/README.md)。

## 开发

```bash
# 仓库根目录：测试 LaTeX 核心，打包 dist/（技能 zip、油猴脚本、单文件转换网页）
npm test
node scripts/build.mjs

# learning-db/
npm ci && npm run typecheck
npm run build:web      # 改了 web/ 之后运行，并提交 public/
```

根目录的脚本、技能和测试只用 Node 内置模块，CI 在 Linux / macOS / Windows × Node 20 / 22 / 24 上运行。给在仓库里改代码的 AI 代理看的约定写在 [`AGENTS.md`](AGENTS.md)。

## 许可证

[MIT](LICENSE)
