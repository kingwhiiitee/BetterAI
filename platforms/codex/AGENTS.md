<!-- BEGIN precise-edit (BetterAI) -->
## File editing policy (precise-edit)

- Modify existing files only with `apply_patch` using `*** Update File:` hunks. Keep hunks minimal: the changed lines plus about three lines of unchanged context, copied exactly.
- Never rewrite an existing file wholesale: no `*** Add File:` on an existing path, no Delete + Add of the same file, no `cat > file <<EOF`, `> file`, `tee file`, `sed -i`, `perl -pi`, `Set-Content`/`Out-File`, and no Python/Node scripts that read-modify-write a file.
- Read the relevant lines first (for example `rg -n` or `sed -n '120,160p' file`). Copy context lines exactly, including indentation, tabs and trailing whitespace.
- If a patch fails to apply, re-read the file and fix the hunk context. Do not fall back to rewriting the file.
- Full rewrites are acceptable only for new or empty files, generated files (lockfiles, build output) produced by their own tool, or when the user explicitly asks for one.
<!-- END precise-edit (BetterAI) -->
