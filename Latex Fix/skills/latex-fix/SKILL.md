---
name: latex-fix
description: Write math that renders on the first try in ChatGPT and other KaTeX/MathJax chats, give the LaTeX source in a copyable code block, and repair broken formulas. Use whenever an answer contains formulas, equations, matrices or units, when the user says formulas "don't render", "show raw LaTeX", "show [ ] or ( )", or when the user wants math converted for Obsidian, Typora, Notion, Jupyter, GitHub, Word or a LaTeX document.
license: MIT
---

# LaTeX Fix

Chat interfaces render math with KaTeX (ChatGPT) or MathJax. A formula only renders when its delimiters, environments and escaping are exactly what the renderer expects. Most "LaTeX is always wrong" problems are one of these:

| Symptom the user sees | Cause |
|---|---|
| `[ \frac{a}{b} ]` or `( \alpha )` as plain text | Delimiters written as `[ ]` / `( )` without backslashes, or the backslash was eaten as a Markdown escape |
| Raw `\[ ... \]` or `$$ ... $$` | Delimiter not alone on its line, inside a list without indentation, or inside a code block |
| `$x$` shown literally | Single `$` is not a math delimiter in ChatGPT |
| Red error text | Unsupported command (`\newcommand`, `\label`, `\eqref`, `\usepackage`), unbalanced `{}` / `\left` / `\begin` |
| Letters in italics, missing `_` | Markdown read `_` / `*` inside math as emphasis because the math was not delimited |
| No way to copy a formula's LaTeX (apps, phones), or copying gives garbled text | Rendered math has no copy button; only code blocks do |
| Table broken around a formula | `|` inside math in a Markdown table |
| Chinese or words squashed together in math | Text outside `\text{...}` |

## Rules for writing math in chat (ChatGPT)

1. **Inline:** `\( ... \)`. **Display:** `$$ ... $$` with each `$$` on its own line and a blank line before and after.
2. Never use a single `$` for math, and never use bare `[ ... ]` or `( ... )` as delimiters.
3. Never put math meant to render in code blocks or backticks (the source block in rule 11 is the exception).
4. Every `\begin{...}` environment goes inside `$$ ... $$`. Multi-line derivations: one block with `\begin{aligned} ... \end{aligned}` and `\\` between lines, `&` before the alignment sign. Do not split one equation across several blocks.
5. KaTeX-safe only: no `\newcommand`, `\def`, `\usepackage`, `\label`, `\ref`, `\eqref`, `equation`, `align` (use `aligned`), `\hfill`, `\mbox`. Prefer `\operatorname{...}`, `\text{...}`, `\mathrm{...}`, `\boldsymbol{...}`.
6. Inside a list item, indent the `$$` lines like the item's text.
7. Words in math (including Chinese) go in `\text{...}`. Function names use `\operatorname{...}` unless a command exists (`\sin`, `\log`, `\max`).
8. In Markdown tables, write `\vert`, `\lvert ... \rvert` or `\mid` instead of `|`.
9. Write prices as `\$5` so they are not read as math.
10. Write each command once: no doubled backslashes (`\\frac`), no `\_` or `\*` inside math. `\\` is only a line break inside an environment.
11. **Copyable source.** If the answer contains formulas, end it with a short "LaTeX source" section: one `latex` code block with the formulas' source in order of appearance, without delimiters, a blank line between formulas (with many inline formulas, list only the important ones). Code blocks have a copy button in every ChatGPT client, including the desktop and mobile apps. Do the same whenever the user asks for a formula's source.

### Self-check before sending

- Every `{` has a `}`; every `\left` has a `\right`; every `\begin{x}` has an `\end{x}`.
- No formula is left without delimiters; no delimiter is inside backticks.
- Display blocks are on their own lines with blank lines around them.
- The answer ends with the LaTeX source block if it contains formulas.

Example:

````markdown
The roots of \( ax^2 + bx + c = 0 \) are

$$
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
$$

and the system becomes

$$
\begin{aligned}
2x + y &= 5 \\
x - y  &= 1
\end{aligned}
$$

LaTeX source:

```latex
x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}

\begin{aligned}
2x + y &= 5 \\
x - y  &= 1
\end{aligned}
```
````

## When the user wants the math somewhere else

| Destination | Inline | Display | Notes |
|---|---|---|---|
| ChatGPT chat | `\( ... \)` | `$$ ... $$` | rules above |
| Obsidian, Typora, Notion, Jupyter, GitHub, VS Code, Zhihu-style Markdown | `$...$` (no space after the opening or before the closing `$`) | `$$ ... $$` on own lines | escape prices as `\$` |
| LaTeX document (`.tex`) | `\( ... \)` | `\[ ... \]` or `equation` / `align` | full LaTeX allowed here, including `\label` / `\eqref` |
| Microsoft Word | give the bare formula | give the bare formula | Insert → Equation → LaTeX, paste, then Convert → Professional |

Put the converted text in a single code block so the user can copy it without the chat re-rendering it.

## Repairing a broken formula the user pasted

1. Restore delimiters: `[ ... ]` on its own line → display block; `( ... )` containing `\commands` → inline math.
2. Undo Markdown damage: `\\frac` → `\frac`, `\_` → `_`, `\*` → `*`, and re-add `_` / `*` that were turned into italics.
3. Replace unsupported commands (`align` → `aligned` inside `$$`, `\eqref{x}` → the equation number as text, `\mbox` → `\text`).
4. Balance braces, `\left` / `\right` and environments.
5. Return the fixed formula in the destination format from the table above.

For repeat fixing on chatgpt.com, point the user to the BetterAI userscript `Latex Fix/userscript/chatgpt-latex-fix.user.js`: it renders formulas left as raw text and copies answers with `$...$` math.
