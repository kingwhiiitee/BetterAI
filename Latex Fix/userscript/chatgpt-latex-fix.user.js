// ==UserScript==
// @name         ChatGPT LaTeX Fix (BetterAI)
// @namespace    https://github.com/kingwhiiitee/BetterAI
// @version      1.0.0
// @description  Render formulas ChatGPT left as raw LaTeX, and copy answers with $…$ / $$…$$ math that works in Obsidian, Typora, Notion, Jupyter and GitHub.
// @author       WH1T3K1NG
// @license      MIT
// @homepageURL  https://github.com/kingwhiiitee/BetterAI/tree/main/Latex%20Fix
// @supportURL   https://github.com/kingwhiiitee/BetterAI/issues
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.11/katex.min.js#sha256=e6bfe5deebd4c7ccd272055bab63bd3ab2c73b907b6e6a22d352740a81381fd4
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// What it fixes on chatgpt.com:
//   1. Formulas shown as raw text (\[ … \], \( … \), $$ … $$, or the backslash-stripped
//      "[ \frac{a}{b} ]" / "( \alpha )" forms) are rendered with KaTeX.
//   2. The message "Copy" button copies math as $…$ / $$…$$ instead of \( \) / \[ \],
//      so it pastes correctly into Obsidian, Typora, Notion, Jupyter, GitHub and VS Code.
//   3. Selecting and copying rendered formulas copies their LaTeX source instead of
//      garbled duplicated text ("E=mc2E = mc^2E=mc2").
//   4. Alt+click a formula copies its LaTeX source.
// Copy format: run  localStorage.setItem('betterai-latex-fix.format', 'bracket')  in the
// console to keep \( \) / \[ \] instead (default 'dollar').
// The core below has no DOM dependencies; scripts/latex-fix.mjs, web/converter.html and the
// tests load it.

(function () {
  'use strict';

  const LatexFix = (() => {
    const TEX_COMMAND = /\\[A-Za-z]+/;
    const TEX_SIGNAL = /\\[A-Za-z]+|[\^_]/;
    const FENCE = /[ \t]*(`{3,}|~{3,})[^\n]*/y;
    // Backslash-stripped display math, the most common ChatGPT breakage:
    // "[ E = mc^2 ]" on one line, or "[" … "]" on lines of their own.
    const BARE_LINE = /([ \t]*)\[[ \t]+([^\n]*?\S)[ \t]+\][ \t]*(?=\n|$)/y;
    const BARE_BLOCK = /([ \t]*)\[[ \t]*\n((?:[^\n]*\S[^\n]*\n)+?)[ \t]*\][ \t]*(?=\n|$)/y;

    // End of the paragraph that contains index i: math never spans a blank line.
    function paragraphEnd(s, i) {
      const m = /\n[ \t]*\n/g;
      m.lastIndex = i;
      const r = m.exec(s);
      return r ? r.index : s.length;
    }

    // Index of `close` at or after `from`, skipping backslash escapes such as \\ and \$.
    function findClose(s, from, close, limit) {
      for (let i = from; i < limit; i++) {
        if (s.startsWith(close, i)) return i + close.length <= limit ? i : -1;
        if (s[i] === '\\') i++;
      }
      return -1;
    }

    // Index of the ")" that closes the "(" at i on the same line, or -1.
    function matchParen(s, i) {
      let depth = 0;
      for (let j = i; j < s.length; j++) {
        const c = s[j];
        if (c === '\n') return -1;
        if (c === '\\') j++;
        else if (c === '(') depth++;
        else if (c === ')' && --depth === 0) return j;
      }
      return -1;
    }

    // Splits text into text / code / math tokens.
    //   markdown: also recognise fenced and inline code (left untouched)
    //   recover:  also recognise backslash-stripped "[ … ]" and "( \cmd … )" math
    function tokenize(src, { markdown = true, recover = true } = {}) {
      const out = [];
      let text = '';
      const push = (tok) => {
        if (text) out.push({ type: 'text', value: text });
        text = '';
        out.push(tok);
      };
      // Display math alone on its line(s) is a "block": it keeps its indentation (lists).
      const pushMath = (start, end, tex, display) => {
        const lineStart = src.lastIndexOf('\n', start - 1) + 1;
        const indent = src.slice(lineStart, start);
        const block = display && /^[ \t]*$/.test(indent) && /^[ \t]*(?:\n|$)/.test(src.slice(end, end + 200));
        if (block && indent) text = text.slice(0, -indent.length);
        push({ type: 'math', display, block, indent: block ? indent : '', tex, raw: src.slice(start, end) });
      };

      let i = 0;
      while (i < src.length) {
        if (i === 0 || src[i - 1] === '\n') {
          FENCE.lastIndex = i;
          const f = markdown && FENCE.exec(src);
          if (f) {
            const fence = f[1];
            const closer = new RegExp(`\\n[ \\t]*${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*(?=\\n|$)`, 'g');
            closer.lastIndex = i + f[0].length;
            const c = closer.exec(src);
            const end = c ? c.index + c[0].length : src.length;
            push({ type: 'code', value: src.slice(i, end) });
            i = end;
            continue;
          }
          if (recover) {
            let m;
            BARE_LINE.lastIndex = i;
            BARE_BLOCK.lastIndex = i;
            if ((m = BARE_LINE.exec(src) || BARE_BLOCK.exec(src)) && TEX_SIGNAL.test(m[2])) {
              const end = src.lastIndexOf(']', i + m[0].length) + 1;
              text += m[1];
              pushMath(i + m[1].length, end, m[2], true);
              i = end;
              continue;
            }
          }
        }

        const c = src[i];
        if (c === '`' && markdown) {
          let k = 1;
          while (src[i + k] === '`') k++;
          const run = '`'.repeat(k);
          let j = src.indexOf(run, i + k);
          while (j >= 0 && src[j + k] === '`') {
            while (src[j] === '`') j++;
            j = src.indexOf(run, j);
          }
          if (j < 0) {
            text += run;
            i += k;
          } else {
            push({ type: 'code', value: src.slice(i, j + k) });
            i = j + k;
          }
          continue;
        }
        if (c === '\\') {
          const d = src[i + 1];
          if (d === '(' || d === '[') {
            const j = findClose(src, i + 2, d === '(' ? '\\)' : '\\]', paragraphEnd(src, i));
            if (j >= 0 && src.slice(i + 2, j).trim()) {
              pushMath(i, j + 2, src.slice(i + 2, j), d === '[');
              i = j + 2;
              continue;
            }
          }
          text += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        if (c === '$' && src[i + 1] === '$') {
          const j = findClose(src, i + 2, '$$', paragraphEnd(src, i));
          if (j >= 0 && src.slice(i + 2, j).trim()) {
            pushMath(i, j + 2, src.slice(i + 2, j), true);
            i = j + 2;
            continue;
          }
          text += '$$';
          i += 2;
          continue;
        }
        if (c === '(' && recover && src[i + 1] === ' ' && !/[\w\\]/.test(src[i - 1] || '')) {
          const j = matchParen(src, i);
          const inner = j > 0 ? src.slice(i + 1, j) : '';
          if (src[j - 1] === ' ' && inner.trim() && TEX_COMMAND.test(inner)) {
            pushMath(i, j + 1, inner, false);
            i = j + 1;
            continue;
          }
        }
        text += c;
        i++;
      }
      if (text) out.push({ type: 'text', value: text });
      return out;
    }

    const DELIMITERS = {
      dollar: ['$', '$', '$$', '$$'],
      bracket: ['\\(', '\\)', '\\[', '\\]'],
    };

    function formatMath(tok, format = 'dollar') {
      const [io, ic, d0, dc] = DELIMITERS[format] || DELIMITERS.dollar;
      const tex = tok.tex.trim();
      if (!tok.display) return io + tex + ic;
      if (!tok.block) return d0 + tex + dc;
      const body = tex.split('\n').map((l) => tok.indent + l.trim());
      return [tok.indent + d0, ...body, tok.indent + dc].join('\n');
    }

    // Rewrites every formula in Markdown to one delimiter style:
    //   dollar  (default) $…$ and $$…$$  for Obsidian, Typora, Notion, Jupyter, GitHub, VS Code
    //   bracket \(…\) and \[…\]          for LaTeX documents and MathJax sites
    // Code blocks and inline code are never touched. With the dollar format, prices such as
    // "$5" are escaped to "\$5" so that "$5 and $10" does not turn into a formula.
    function convert(md, { format = 'dollar', recover = true } = {}) {
      const money = format !== 'bracket';
      return tokenize(String(md), { recover })
        .map((t) => {
          if (t.type === 'math') return formatMath(t, format);
          return money && t.type === 'text' ? t.value.replace(/(^|[^\\$])\$(?=\d)/g, '$1\\$') : t.value;
        })
        .join('');
    }

    return { tokenize, convert, formatMath };
  })();

  // Node (scripts/latex-fix.mjs, tests) and the converter page only need the core.
  if (typeof document === 'undefined' || globalThis.BETTERAI_LATEX_CORE_ONLY) {
    globalThis.LatexFix = LatexFix;
    return;
  }

  // ---------------------------------------------------------------------------
  // Browser part (chatgpt.com)

  const katex = window.katex;
  const MESSAGE = '[data-message-author-role="assistant"]';
  const SKIP = 'pre, code, kbd, script, style, textarea, [contenteditable="true"], .katex, .katex-display, .betterai-math';
  const CANDIDATE = /\\[([]|\$\$|\[[ \t]|\([ \t]/;

  const getFormat = () => {
    try {
      return localStorage.getItem('betterai-latex-fix.format') === 'bracket' ? 'bracket' : 'dollar';
    } catch {
      return 'dollar';
    }
  };

  // 1. Render leftover raw math. React owns the text nodes, so they are never removed:
  // the original node is emptied and the rendered copy is inserted after it. If React
  // later writes new text into the node, the old copy is dropped and the node re-rendered.
  const renderedFor = new WeakMap(); // text node -> rendered span
  const sourceOf = new WeakMap(); // rendered span -> text node

  function renderTextNode(node) {
    const prev = renderedFor.get(node);
    if (prev) {
      if (node.data === '' && prev.isConnected) return;
      prev.remove();
      renderedFor.delete(node);
    }
    if (!CANDIDATE.test(node.data)) return;
    const tokens = LatexFix.tokenize(node.data, { markdown: false });
    if (!tokens.some((t) => t.type === 'math')) return;

    const span = document.createElement('span');
    span.className = 'betterai-math';
    for (const t of tokens) {
      if (t.type !== 'math') {
        span.append(t.value);
        continue;
      }
      const el = document.createElement('span');
      try {
        katex.render(t.tex.trim(), el, { displayMode: t.display, throwOnError: false, strict: 'ignore' });
      } catch {
        el.textContent = t.raw;
      }
      span.append(el);
    }
    node.after(span);
    node.data = '';
    renderedFor.set(node, span);
    sourceOf.set(span, node);
  }

  function scan() {
    for (const msg of document.querySelectorAll(MESSAGE)) {
      for (const span of msg.querySelectorAll('.betterai-math')) {
        const node = sourceOf.get(span);
        if (!node || !node.isConnected || node.data !== '') span.remove();
      }
      const walker = document.createTreeWalker(msg, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const n of nodes) {
        if (n.data || renderedFor.has(n)) renderTextNode(n);
      }
    }
  }

  let timer = 0;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(scan, 300);
  };
  if (katex) {
    new MutationObserver((records) => {
      if (records.some((r) => !(r.target instanceof Element && r.target.closest('.betterai-math')))) schedule();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
  }

  // 2. Message "Copy" button: convert delimiters in what it writes to the clipboard.
  // Code-block copy buttons sit inside .markdown / pre and are left alone.
  let lastTarget = null;
  document.addEventListener('pointerdown', (e) => (lastTarget = e.target), true);
  document.addEventListener('keydown', (e) => (lastTarget = e.target), true);
  const fromMessageCopyButton = () => {
    const btn = lastTarget instanceof Element && lastTarget.closest('button');
    return !!btn && !btn.closest('pre, .markdown, form, [contenteditable="true"]') && !!btn.closest('article, [data-testid^="conversation-turn"]');
  };

  const clip = navigator.clipboard;
  if (clip) {
    const writeText = clip.writeText && clip.writeText.bind(clip);
    const write = clip.write && clip.write.bind(clip);
    if (writeText) {
      clip.writeText = (text) => writeText(fromMessageCopyButton() ? LatexFix.convert(text, { format: getFormat() }) : text);
    }
    if (write && typeof ClipboardItem !== 'undefined') {
      clip.write = async (items) => {
        if (!fromMessageCopyButton()) return write(items);
        const out = [];
        for (const item of items) {
          if (!item.types.includes('text/plain')) {
            out.push(item);
            continue;
          }
          const data = {};
          for (const type of item.types) data[type] = await item.getType(type);
          const plain = await data['text/plain'].text();
          data['text/plain'] = new Blob([LatexFix.convert(plain, { format: getFormat() })], { type: 'text/plain' });
          out.push(new ClipboardItem(data));
        }
        return write(out);
      };
    }
  }

  // 3. Selecting and copying rendered math: copy the LaTeX source.
  const texOf = (el) => {
    const a = el.querySelector('annotation[encoding="application/x-tex"]');
    return a ? a.textContent : null;
  };
  const wrap = (tex, display) => LatexFix.formatMath({ tex, display, block: false, indent: '' }, getFormat());

  document.addEventListener('copy', (e) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !e.clipboardData) return;
    const box = document.createElement('div');
    for (let r = 0; r < sel.rangeCount; r++) box.append(sel.getRangeAt(r).cloneContents());
    if (!box.querySelector('.katex')) return;
    let changed = false;
    for (const el of box.querySelectorAll('.katex-display, .katex')) {
      if (!box.contains(el)) continue; // inside a .katex-display that was already replaced
      const tex = texOf(el);
      if (tex == null) continue;
      const display = el.classList.contains('katex-display') || !!el.closest('.katex-display');
      const target = el.closest('.katex-display') || el;
      target.replaceWith(display ? `\n${wrap(tex, true)}\n` : wrap(tex, false));
      changed = true;
    }
    if (!changed) return;
    box.style.cssText = 'position:fixed;left:-99999px;top:0;white-space:pre-wrap';
    document.body.append(box);
    const text = box.innerText.replace(/\n{3,}/g, '\n\n').trim();
    box.remove();
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
  });

  // 4. Alt+click a formula to copy its LaTeX source.
  document.addEventListener(
    'click',
    (e) => {
      if (!e.altKey || !(e.target instanceof Element)) return;
      const el = e.target.closest('.katex');
      const tex = el && texOf(el);
      if (tex == null) return;
      e.preventDefault();
      e.stopPropagation();
      const display = !!el.closest('.katex-display');
      lastTarget = null;
      Promise.resolve(clip && clip.writeText(wrap(tex, display))).then(() => {
        el.style.outline = '2px solid #10a37f';
        setTimeout(() => (el.style.outline = ''), 600);
      }, () => {});
    },
    true,
  );
})();
