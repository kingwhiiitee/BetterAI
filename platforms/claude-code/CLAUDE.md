<!-- BEGIN precise-edit (BetterAI) -->
## File editing policy (precise-edit)

- Change existing files only with the Edit tool (`old_string` -> `new_string`). Use `replace_all` only when every occurrence must change.
- Never overwrite an existing file with Write, and never rewrite files through Bash or PowerShell: no `sed -i`, `perl -pi`, `> file`, `cat <<EOF > file`, `tee`, `Set-Content`/`Out-File`, or read-modify-write scripts.
- Read the target region first. Anchor on a short, unique snippet copied exactly (indentation, tabs, CRLF), and make one logical change per edit.
- If an edit fails, re-read the file and retry with a better anchor. Never fall back to a full rewrite.
- Full rewrites only for new or empty files, or when the user explicitly asks for one.
<!-- END precise-edit (BetterAI) -->
