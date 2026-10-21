# ChatGPT: the LaTeX rule

One rule that fixes both problems with ChatGPT's math:

1. **Formulas sometimes render wrong** (raw `\[ \]`, bare `[ ]` / `( )`, red errors).
2. **LaTeX can't be copied** (copying a rendered formula gives garbled text or nothing).

Paste **one** of the blocks below into **Settings → Personalization → Custom instructions** (or a Project's instructions). Custom instructions are stored in your ChatGPT account, so the rule applies on chatgpt.com, in the desktop apps (macOS / Windows) and in the iOS / Android apps. Each block is under the 1,500-character limit.

How it fixes copying: every answer that contains formulas ends with a `latex` code block holding their source. Code blocks have a copy button in every ChatGPT client, phone included.

## 中文

```text
LaTeX 规则(每次回答都遵守,保证手机和电脑上公式都能正确显示、能复制):
1. 定界符:行内公式只用 \( ... \);独立公式只用 $$ ... $$,两个 $$ 各占一行,前后各空一行,在列表里与列表文字同样缩进。不要用单个 $、裸的 [ ... ] 或 ( ... ) 当定界符,不要把要显示的公式放进代码块或反引号。
2. 只写 KaTeX 能渲染的内容:所有 \begin{...} 环境都放在 $$ 里,多行公式用一个 $$ 块配合 \begin{aligned} ... \end{aligned};不用 equation、align、\label、\ref、\eqref、\newcommand、\usepackage;公式里的文字(包括中文)放进 \text{...};表格里用 \vert 代替 |;金额写成 \$5。反斜杠只写一个,不转义 _ 和 *。发送前检查 { }、\left \right、\begin \end 都成对。
3. 可复制:只要回答里有公式,就在末尾加一个"LaTeX 源码"小节,用一个 ```latex 代码块按出现顺序列出公式源码(不带定界符,公式之间空一行;行内公式很多时只列重要的)。我要某个公式的源码时也这样给。
```

## English

```text
LaTeX rule (follow in every answer, so formulas render and can be copied on both phone and desktop):
1. Delimiters: inline math only as \( ... \); display math only as $$ ... $$, with each $$ on its own line, a blank line before and after, and indented like the list text inside lists. Never use single $, bare [ ... ] or ( ... ) as delimiters, and never put math meant to render in code blocks or backticks.
2. Only write what KaTeX renders: every \begin{...} environment goes inside $$; multi-line formulas are one $$ block with \begin{aligned} ... \end{aligned}; no equation, align, \label, \ref, \eqref, \newcommand or \usepackage; words inside math (Chinese too) go in \text{...}; in tables write \vert instead of |; write prices as \$5. Write each backslash once and do not escape _ or *. Before sending, check that { }, \left \right and \begin \end are all paired.
3. Copyable: if the answer contains formulas, end it with a short "LaTeX source" section: one ```latex code block with their source in order of appearance (no delimiters, a blank line between formulas; if there are many inline formulas, list only the important ones). Do the same when I ask for a formula's source.
```

On ChatGPT Work / Business / Enterprise / Edu with Skills enabled, you can also upload `latex-fix-skill.zip` from the Releases page (Skills → Create → Upload from your computer). It holds the same rule with examples and a repair procedure for broken formulas.
