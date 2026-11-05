<div align="center">

# Coach

**An adaptive AI study coach with a cross-session knowledge base, plus LaTeX Fix for ChatGPT.**<br>
**自适应 AI 学习教练 + 跨会话学习知识库,另附 ChatGPT 公式修复 LaTeX Fix。**

[English](#english) · [中文](#中文)

[![test](https://github.com/kingwhiiitee/Coach/actions/workflows/test.yml/badge.svg)](https://github.com/kingwhiiitee/Coach/actions/workflows/test.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

> `precise-edit` (stop AI agents from rewriting whole files) has moved to its own repository: **[kingwhiiitee/precise-edit](https://github.com/kingwhiiitee/precise-edit)**.<br>
> `precise-edit`(阻止 AI 代理整文件重写)已迁到独立仓库:**[kingwhiiitee/precise-edit](https://github.com/kingwhiiitee/precise-edit)**。

---

## English

### What's here

| Part | What it does |
| --- | --- |
| [`adaptive-learning-coach`](plugins/adaptive-learning-coach/skills/adaptive-learning-coach/SKILL.md) | Study coach skill for time-limited, exam-oriented learners. Picks diagnose / explain / practice / review by expected learning gain. Written in Chinese. |
| [`learning-db/`](learning-db/README.md) | The coach's memory across sessions: a Cloudflare Worker (MCP tools + read-only API) on D1, plus a web viewer. |
| [`Latex Fix/`](Latex%20Fix/README.md) | Makes ChatGPT's formulas render and copy correctly: a custom-instructions rule, a skill, a userscript and a converter page. |

### Install the coach skill

Claude Code:

```text
/plugin marketplace add kingwhiiitee/Coach
/plugin install adaptive-learning-coach@coach
```

Claude.ai: download `adaptive-learning-coach-skill.zip` from [Releases](https://github.com/kingwhiiitee/Coach/releases/latest) (or build it with `node scripts/build.mjs`), then Settings → Capabilities → Skills → Upload skill.

To give the coach a memory, deploy `learning-db/` and add it as a custom connector; see [`learning-db/README.md`](learning-db/README.md).

### LaTeX Fix

Start with [`Latex Fix/chatgpt/custom-instructions.md`](Latex%20Fix/chatgpt/custom-instructions.md). Everything else is in [`Latex Fix/`](Latex%20Fix/README.md).

### Development

```bash
npm test
node scripts/build.mjs
```

### License

[MIT](LICENSE)

---

## 中文

### 包含什么

| 部分 | 作用 |
| --- | --- |
| [`adaptive-learning-coach`](plugins/adaptive-learning-coach/skills/adaptive-learning-coach/SKILL.md) | 学习教练技能:面向时间有限、考试导向的学习者,按预期学习收益选择诊断、讲解、练习或复习。 |
| [`learning-db/`](learning-db/README.md) | 教练的跨会话记忆:Cloudflare Worker(MCP 工具 + 只读 API)+ D1,以及阅览网页。 |
| [`Latex Fix/`](Latex%20Fix/README.md) | 让 ChatGPT 的公式正确渲染、可以复制:自定义指令规则、skill、油猴脚本和转换网页。 |

### 安装教练技能

Claude Code:

```text
/plugin marketplace add kingwhiiitee/Coach
/plugin install adaptive-learning-coach@coach
```

Claude.ai:从 [Releases](https://github.com/kingwhiiitee/Coach/releases/latest) 下载 `adaptive-learning-coach-skill.zip`(或运行 `node scripts/build.mjs` 自己生成),然后进入 设置 → Capabilities → Skills → Upload skill。

想让教练记住学习进度,部署 `learning-db/` 并把它添加为自定义连接器,见 [`learning-db/README.md`](learning-db/README.md)。

### LaTeX Fix

从 [`Latex Fix/chatgpt/custom-instructions.md`](Latex%20Fix/chatgpt/custom-instructions.md) 开始,其余内容在 [`Latex Fix/`](Latex%20Fix/README.md)。

### 开发

```bash
npm test
node scripts/build.mjs
```

### 许可证

[MIT](LICENSE)
