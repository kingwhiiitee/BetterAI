# Claude.ai / Claude Cowork: always-on instructions

Paste **one** of the blocks below into either of these places:

- **Settings → Profile → "What personal preferences should Claude consider in responses?"** (applies to every chat), or
- **a Project → Instructions** (applies to that project only).

Use this together with the `precise-edit` skill (upload `precise-edit-skill.zip` from the Releases page under Settings → Capabilities → Skills). The skill holds the full workflow, and these instructions keep the rule in context all the time.

## English

```text
When modifying existing files, documents or artifacts, make precise, minimal edits: use str_replace (or the artifact update command) on the smallest unique snippet instead of recreating the whole file or artifact with create_file or rewrite. Read the current content before editing and copy the anchor exactly (indentation, tabs, line endings). If a replacement fails, re-read and retry with a better anchor; never fall back to rewriting the whole thing. Only rewrite in full when the file is new, nearly every line changes, or I explicitly ask. For small changes to long text in chat, show only the changed passages with enough context to locate them, then offer the full version.
```

## 中文

```text
修改已有的文件、文档或 artifact 时,必须做精确的最小改动:对最小的唯一片段使用 str_replace(或 artifact 的 update 命令),不要用 create_file 或 rewrite 重新生成整个文件或 artifact。编辑前先读取当前内容,锚点要逐字复制(缩进、制表符、换行符都要一致)。替换失败时重新读取并换一个更好的锚点重试,绝不退回到整体重写。只有在文件是新建的、几乎每一行都要改,或我明确要求时,才整体重写。在对话中对长文本做小改动时,只展示改动的段落并附上足以定位的上下文,然后询问是否需要完整版本。
```
