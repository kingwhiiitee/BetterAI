# LaTeX Fix

**Make ChatGPT's formulas render correctly, and copy them out without breaking.**<br>
**让 ChatGPT 的公式正确渲染,并且复制出去也不会乱。**

[English](#english) · [中文](#中文)

---

## English

### The problem

ChatGPT's LaTeX has two problems, on the web, in the desktop apps and on phones:

1. **Formulas render wrong.** They show up as raw text: `[ \frac{a}{b} ]`, `( \alpha + \beta )`, `\[ ... \]`, `$$ ... $$`, or red KaTeX errors. The model used delimiters the page doesn't render, the backslash was swallowed as a Markdown escape, the block sat inside a list or code block, or it used commands KaTeX doesn't support (`\newcommand`, `\label`, `\eqref`, `align`).
2. **LaTeX can't be copied.** There is no way to copy a formula's source in the apps, and selecting a rendered formula gives garbled text such as `E=mc2E = mc^2E=mc2`. On top of that, the Copy button writes `\( \)` / `\[ \]`, which Obsidian, Typora, Notion, Jupyter and GitHub don't understand. Prices like `$5 and $10` turn into a formula once pasted into a `$`-based editor.

### Start here: one rule

Paste **the LaTeX rule** from [`chatgpt/custom-instructions.md`](chatgpt/custom-instructions.md) into **Settings → Personalization → Custom instructions**. It is one rule with three parts that ChatGPT follows in every answer:

1. **Delimiters** it can render: `\( … \)` inline, `$$ … $$` on their own lines for display, never bare `[ ]` / `( )` or single `$`.
2. **KaTeX-only commands**: `aligned` inside `$$`, no `\label` / `\eqref` / `\newcommand`, words in `\text{}`, balanced braces.
3. **Copyable source**: every answer with formulas ends with a "LaTeX source" `latex` code block, which you copy with the code block's copy button.

Custom instructions live in your ChatGPT account, so this works the same on chatgpt.com, in the desktop apps and in the iOS / Android apps. Nothing else is required; the parts below are optional extras.

### All parts

| Part | What it does | Where it works |
|---|---|---|
| **The LaTeX rule** ([`chatgpt/custom-instructions.md`](chatgpt/custom-instructions.md)) | Makes the model write only what ChatGPT renders, and end each answer with a copyable `latex` source block | Every ChatGPT client and plan |
| **Skill** ([`skills/latex-fix/SKILL.md`](skills/latex-fix/SKILL.md)) | The full rule set, a self-check, a format table for Obsidian / Typora / Notion / LaTeX / Word, and a repair procedure for broken formulas | ChatGPT Work / Business / Enterprise / Edu, Claude.ai, any Agent Skills tool |
| **Userscript** ([`userscript/chatgpt-latex-fix.user.js`](userscript/chatgpt-latex-fix.user.js)) | On chatgpt.com: renders formulas left as raw text, makes the Copy button produce `$...$` / `$$...$$`, makes selection copy return LaTeX source, and Alt+click copies one formula | Desktop browsers with Tampermonkey or Violentmonkey |
| **Converter page** ([`web/converter.html`](web/converter.html)) | Paste an answer copied from any ChatGPT client, get the fixed text back | Any browser, including phones |
| **Command-line converter** ([`scripts/latex-fix.mjs`](scripts/latex-fix.mjs)) | Same conversion from the command line | Node.js 18+ |

The rule fixes the cause (what the model writes) and gives you a copyable source block everywhere. The userscript fixes whatever still slips through on chatgpt.com, plus everything about copying. The converter page covers copying from the desktop and mobile apps, where userscripts can't run.

### Platform support

| Where you use ChatGPT | The LaTeX rule | Skill | Userscript | Converter page |
|---|:-:|:-:|:-:|:-:|
| chatgpt.com, desktop browser | ✅ | ✅ ¹ | ✅ | ✅ |
| ChatGPT desktop app (macOS / Windows) | ✅ synced from your account | ✅ ¹ | ❌ ² | ✅ |
| ChatGPT app (iOS / Android) | ✅ synced from your account | ✅ ¹ | ❌ ² | ✅ |
| chatgpt.com, mobile browser | ✅ | ✅ ¹ | ⚠️ ³ | ✅ |

¹ On plans with Skills (Work / Business / Enterprise / Edu).<br>
² The apps don't run browser extensions. Rendering and copying there rely on the LaTeX rule, which are stored in your account and apply in every client once saved.<br>
³ iOS: Safari with the [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) app. Android: Firefox, Edge or Kiwi with Tampermonkey. Rendering and the Copy button work; selection copy and Alt+click are desktop gestures.

**Phone or desktop app workflow:** long-press (or right-click) the answer → Copy, open the converter page, paste, tap **Copy result**, then paste into Obsidian, Notion, Typora and so on.

### Install

#### 1. The LaTeX rule (web, desktop app, mobile app)

Open [`chatgpt/custom-instructions.md`](chatgpt/custom-instructions.md) and paste one block into **Settings → Personalization → Custom instructions**, or into a Project's instructions. Start a new chat afterwards; the rule applies to new conversations.

#### 2. Skill (optional)

Download `latex-fix-skill.zip` from [Releases](https://github.com/kingwhiiitee/BetterAI/releases/latest), or zip the [`skills/latex-fix`](skills/latex-fix) folder yourself.

- ChatGPT Work / Business / Enterprise / Edu: Skills → Create → Upload from your computer.
- Claude.ai: Settings → Capabilities → Skills → Upload skill.

#### 3. Userscript (desktop browser)

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/). In Chrome / Edge, also turn on "Allow user scripts" (or Developer mode) for the extension.
2. Open the [raw userscript](https://raw.githubusercontent.com/kingwhiiitee/BetterAI/main/Latex%20Fix/userscript/chatgpt-latex-fix.user.js) and click **Install**.
3. Reload chatgpt.com.

It loads KaTeX 0.16.11 from cdnjs with a pinned SHA-256 hash and needs no extra permissions (`@grant none`).

| Action | Result |
|---|---|
| A reply contains raw `\( \)`, `\[ \]`, `$$ $$`, `[ \frac… ]` or `( \alpha … )` | Rendered with KaTeX in place |
| Click a message's **Copy** button | Math is copied as `$...$` / `$$...$$`, prices as `\$5`; code is untouched |
| Select text with formulas and press Ctrl/⌘+C | Formulas are copied as LaTeX source, not as garbled text |
| Alt+click a formula | That formula's LaTeX is copied |

To keep `\( \)` / `\[ \]` when copying (for `.tex` files), run this once in the browser console on chatgpt.com:

```js
localStorage.setItem('betterai-latex-fix.format', 'bracket')
```

Remove the key to go back to `$`.

#### 4. Converter page (any device)

- Open `latex-fix-converter.html` from [Releases](https://github.com/kingwhiiitee/BetterAI/releases/latest) or build it with `node scripts/build.mjs` (it lands in `dist/`). It is one self-contained file and works offline.
- Or host it: with GitHub Pages enabled for your fork (Settings → Pages → Deploy from branch `main`, folder `/`), it is served at `https://<user>.github.io/BetterAI/Latex%20Fix/web/converter.html`. Add it to your phone's home screen.

Nothing is uploaded; the conversion runs in the page.

#### 5. Converter (command line)

```bash
node "Latex Fix/scripts/latex-fix.mjs" answer.md > answer.fixed.md
```

```bash
pbpaste | node "Latex Fix/scripts/latex-fix.mjs" | pbcopy
```

Options: `--format dollar` (default, `$` / `$$`) or `--format bracket` (`\( \)` / `\[ \]`), and `--no-recover` to leave bare `[ … ]` / `( … )` alone.

### Example

ChatGPT answer as copied:

```text
The energy is \( E = mc^2 \), it costs $5, and

[ \int_0^1 x^2\,dx = \frac{1}{3} ]
```

After the userscript or the converter:

```text
The energy is $E = mc^2$, it costs \$5, and

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```

### Limits

- Recovering bare `[ … ]` / `( … )` is a heuristic: it needs a TeX command (`\frac`, `\alpha`) inside `( … )`, or a command, `^` or `_` inside a `[ … ]` line. Links, task lists and normal parentheses are left alone.
- When Markdown has already turned parts of a formula into italics on the page, the original text is lost and the userscript can't rebuild it. The LaTeX rule prevents this case.
- The userscript depends on chatgpt.com's page structure. If an update to ChatGPT breaks it, please open an issue.

---

## 中文

### 问题

ChatGPT 的 LaTeX 有两个问题,网页、桌面端和手机上都会出现:

1. **公式渲染错误。** 公式显示成原始文本:`[ \frac{a}{b} ]`、`( \alpha + \beta )`、`\[ ... \]`、`$$ ... $$`,或者出现红色的 KaTeX 报错。原因是模型用了页面不渲染的定界符、反斜杠被 Markdown 当作转义吃掉了、公式块放在列表或代码块里,或者用了 KaTeX 不支持的命令(`\newcommand`、`\label`、`\eqref`、`align`)。
2. **LaTeX 无法复制。** 在 App 里没有办法复制公式的源码,选中已渲染的公式复制会得到 `E=mc2E = mc^2E=mc2` 这样的乱码。另外,复制按钮输出的是 `\( \)` / `\[ \]`,Obsidian、Typora、Notion、Jupyter、GitHub 都不认。像 `$5 and $10` 这样的价格,粘贴到用 `$` 的编辑器里会被当成公式。

### 从这里开始:一条规则

把 [`chatgpt/custom-instructions.md`](chatgpt/custom-instructions.md) 中的 **LaTeX 规则** 粘贴到 **设置 → 个性化 → 自定义指令**。这是一条规则,分三部分,ChatGPT 每次回答都会遵守:

1. **定界符**只用它能渲染的:行内 `\( … \)`,独立公式 `$$ … $$` 各占一行;不用裸的 `[ ]` / `( )` 或单个 `$`。
2. **只用 KaTeX 支持的写法**:`$$` 里用 `aligned`,不用 `\label` / `\eqref` / `\newcommand`,文字放进 `\text{}`,括号成对。
3. **源码可复制**:有公式的回答末尾都会附一个"LaTeX 源码" `latex` 代码块,用代码块的复制按钮即可复制。

自定义指令保存在你的 ChatGPT 账号里,所以在 chatgpt.com、桌面端和 iOS / Android App 上效果一样。只用这条规则就够了,下面的内容都是可选的增强。

### 全部组成

| 组成 | 作用 | 适用范围 |
|---|---|---|
| **LaTeX 规则**([`chatgpt/custom-instructions.md`](chatgpt/custom-instructions.md)) | 让模型只写 ChatGPT 能渲染的公式,并在每个回答末尾附上可复制的 `latex` 源码块 | 所有 ChatGPT 客户端和套餐 |
| **Skill**([`skills/latex-fix/SKILL.md`](skills/latex-fix/SKILL.md)) | 完整规则、发送前自检、面向 Obsidian / Typora / Notion / LaTeX / Word 的格式对照表,以及修复坏公式的步骤 | ChatGPT Work / Business / Enterprise / Edu、Claude.ai、任何支持 Agent Skills 的工具 |
| **油猴脚本**([`userscript/chatgpt-latex-fix.user.js`](userscript/chatgpt-latex-fix.user.js)) | 在 chatgpt.com 上:渲染没被渲染的公式;让复制按钮输出 `$...$` / `$$...$$`;选中复制时得到 LaTeX 源码;Alt+点击复制单个公式 | 装有 Tampermonkey 或 Violentmonkey 的桌面浏览器 |
| **转换网页**([`web/converter.html`](web/converter.html)) | 粘贴从任意 ChatGPT 客户端复制的回答,得到修好的文本 | 任何浏览器,包括手机 |
| **命令行转换器**([`scripts/latex-fix.mjs`](scripts/latex-fix.mjs)) | 命令行版的同一套转换 | Node.js 18+ |

LaTeX 规则从源头解决问题(模型怎么写),并在所有客户端提供可复制的源码块;油猴脚本在 chatgpt.com 上兜底处理漏网的情况,以及所有复制相关的问题;转换网页负责桌面端和手机 App 的复制,因为那里无法运行油猴脚本。

### 平台支持

| 使用 ChatGPT 的地方 | LaTeX 规则 | Skill | 油猴脚本 | 转换网页 |
|---|:-:|:-:|:-:|:-:|
| chatgpt.com,电脑浏览器 | ✅ | ✅ ¹ | ✅ | ✅ |
| ChatGPT 桌面端(macOS / Windows) | ✅ 随账号同步 | ✅ ¹ | ❌ ² | ✅ |
| ChatGPT 手机 App(iOS / Android) | ✅ 随账号同步 | ✅ ¹ | ❌ ² | ✅ |
| chatgpt.com,手机浏览器 | ✅ | ✅ ¹ | ⚠️ ³ | ✅ |

¹ 需要支持 Skills 的套餐(Work / Business / Enterprise / Edu)。<br>
² App 不能运行浏览器扩展。在 App 里公式的渲染和复制依靠 LaTeX 规则;自定义指令保存在账号里,设置一次后所有客户端都会生效。<br>
³ iOS:Safari 配合 [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) App;Android:Firefox、Edge 或 Kiwi 配合 Tampermonkey。渲染和复制按钮可用;选中复制和 Alt+点击是电脑端操作。

**手机或桌面端的用法:** 长按(或右键)回答 → 复制,打开转换网页,粘贴,点 **复制结果**,再粘贴到 Obsidian、Notion、Typora 等。

### 安装

#### 1. LaTeX 规则(网页、桌面端、手机 App)

打开 [`chatgpt/custom-instructions.md`](chatgpt/custom-instructions.md),把其中一段粘贴到 **设置 → 个性化 → 自定义指令**,或某个 Project 的指令里。之后新开一个对话,规则对新对话生效。

#### 2. Skill(可选)

从 [Releases](https://github.com/kingwhiiitee/BetterAI/releases/latest) 下载 `latex-fix-skill.zip`,或者自己把 [`skills/latex-fix`](skills/latex-fix) 文件夹打包成 zip。

- ChatGPT Work / Business / Enterprise / Edu:Skills → Create → Upload from your computer。
- Claude.ai:设置 → Capabilities → Skills → Upload skill。

#### 3. 油猴脚本(桌面浏览器)

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [Violentmonkey](https://violentmonkey.github.io/)。在 Chrome / Edge 中还需要为该扩展打开"允许用户脚本"(或开发者模式)。
2. 打开 [脚本原始文件](https://raw.githubusercontent.com/kingwhiiitee/BetterAI/main/Latex%20Fix/userscript/chatgpt-latex-fix.user.js),点击 **安装**。
3. 刷新 chatgpt.com。

脚本从 cdnjs 加载 KaTeX 0.16.11,并用固定的 SHA-256 校验;不需要任何额外权限(`@grant none`)。

| 操作 | 效果 |
|---|---|
| 回复里出现原始的 `\( \)`、`\[ \]`、`$$ $$`、`[ \frac… ]` 或 `( \alpha … )` | 原地用 KaTeX 渲染 |
| 点击消息的 **复制** 按钮 | 公式复制为 `$...$` / `$$...$$`,价格变成 `\$5`;代码不受影响 |
| 选中包含公式的文字并按 Ctrl/⌘+C | 公式以 LaTeX 源码复制,不再是乱码 |
| Alt+点击某个公式 | 复制这个公式的 LaTeX |

如果复制时想保留 `\( \)` / `\[ \]`(比如要写进 `.tex` 文件),在 chatgpt.com 的浏览器控制台里运行一次:

```js
localStorage.setItem('betterai-latex-fix.format', 'bracket')
```

删除这个键即可恢复为 `$`。

#### 4. 转换网页(任何设备)

- 从 [Releases](https://github.com/kingwhiiitee/BetterAI/releases/latest) 下载 `latex-fix-converter.html`,或运行 `node scripts/build.mjs` 生成(位于 `dist/`)。它是单个独立文件,离线也能用。
- 也可以托管:在你的 fork 中开启 GitHub Pages(Settings → Pages → Deploy from branch `main`,目录 `/`),地址为 `https://<用户名>.github.io/BetterAI/Latex%20Fix/web/converter.html`,可以添加到手机主屏幕。

所有转换都在网页内完成,不会上传任何内容。

#### 5. 转换器(命令行)

```bash
node "Latex Fix/scripts/latex-fix.mjs" answer.md > answer.fixed.md
```

```bash
pbpaste | node "Latex Fix/scripts/latex-fix.mjs" | pbcopy
```

选项:`--format dollar`(默认,`$` / `$$`)或 `--format bracket`(`\( \)` / `\[ \]`);`--no-recover` 表示不处理裸的 `[ … ]` / `( … )`。

### 示例

复制出来的 ChatGPT 回答:

```text
The energy is \( E = mc^2 \), it costs $5, and

[ \int_0^1 x^2\,dx = \frac{1}{3} ]
```

经过油猴脚本或转换器之后:

```text
The energy is $E = mc^2$, it costs \$5, and

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```

### 局限

- 恢复裸的 `[ … ]` / `( … )` 依靠启发式判断:`( … )` 里必须有 TeX 命令(如 `\frac`、`\alpha`),独占一行的 `[ … ]` 里必须有命令、`^` 或 `_`。链接、任务列表和普通括号不会被改动。
- 如果页面上的 Markdown 已经把公式的一部分变成了斜体,原文已经丢失,脚本无法还原。LaTeX 规则可以避免这种情况。
- 油猴脚本依赖 chatgpt.com 的页面结构。如果 ChatGPT 更新后脚本失效,欢迎提 issue。
