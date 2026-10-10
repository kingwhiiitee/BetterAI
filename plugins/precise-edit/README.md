# precise-edit

Makes the agent change existing files with exact-match edits (`Edit` / `str_replace` / `apply_patch` hunks) instead of rewriting them, and blocks whole-file rewrites with a `PreToolUse` hook.

让代理用精确匹配的编辑(`Edit` / `str_replace` / `apply_patch` 补丁块)修改已有文件,不再整文件重写;并通过 `PreToolUse` hook 拦截整体重写。

| Component | Purpose |
|---|---|
| `skills/precise-edit/SKILL.md` | Editing workflow, failure recovery, when a rewrite is acceptable |
| `hooks/hooks.json` | SessionStart policy reminder + PreToolUse guard on `Write`, `Bash`, `PowerShell` |
| `scripts/guard.mjs` | The guard (Node.js 18+). Config: `PRECISE_EDIT_MODE=block\|warn\|off`, `.precise-edit.json` |

Full documentation / 完整文档: https://github.com/kingwhiiitee/BetterAI
