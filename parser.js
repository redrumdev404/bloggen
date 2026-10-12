const MarkdownParser = {
  inlineRules: [
    { reg: /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g, replace: (m, tokens) => `\u0000T${tokens.push(m) - 1}\u0000` },
    { reg: /!\[([^\]]*)\]\(([^)\s]+)\)/gi, replace: (_, alt, url) => `<img src="${url}" alt="${alt}">` },
    { reg: /\[([^\]]+)\]\(((?:ext\s+)?([^)\s]+))\)/gi, replace: (_, label, full, url) => `<a href="${url}"${full.toLowerCase().startsWith('ext ') ? ' target="_blank"' : ''} rel="noopener noreferrer">${label}</a>` },
    { reg: /~~(.+?)~~/g, replace: '<del>$1</del>' },
    { reg: /\*\*(.+?)\*\*/g, replace: '<strong>$1</strong>' },
    { reg: /__(.+?)__/g, replace: '<u>$1</u>' },
    { reg: /(^|[^\w])\*([^*\n]+)\*(?!\w)/g, replace: '$1<em>$2</em>' },
    { reg: /:([a-zA-Z0-9_-]+)\s+(.+?):/g, replace: (_, cls, content) => `<span class="${cls}">${content}</span>` }
  ],
  parse(md) {
    const tokens = [], html = [], paragraphs = [];
    let inTable = false, inList = false, listType = null;
    const flush = () => {
      if (!paragraphs.length) return;
      const text = paragraphs.join("\n").trim();
      if (text) {
        const m = text.match(/^:([a-zA-Z0-9_-]+)\s+(.+)$/s);
        html.push(m ? `<p class="${m[1]}">${this.parseInline(m[2], tokens)}</p>` : `<p>${this.parseInline(text, tokens)}</p>`);
      }
      paragraphs.length = 0;
    };
    const closeList = () => { if (inList) { html.push(`</${listType}>`); inList = false; listType = null; } };
    for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        closeList();
        if (!inTable) { flush(); html.push('<table'); inTable = true; }
        if (/^\|[\s\d\w]*[:\s\-|]*\|$/.test(trimmed) && trimmed.includes('-')) continue;
        const cells = trimmed.split('|').slice(1, -1);
        const tag = html[html.length - 1] === '<table>' ? 'th' : 'td';
        html.push(`<tr>${cells.map(c => `<${tag}>${this.parseInline(c.trim(), tokens)}</${tag}>`).join('')}</tr>`);
        continue;
      }
      const ul = trimmed.match(/^([\*\-\+])\s+(.+)$/), ol = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (ul || ol) {
        const type = ul ? 'ul' : 'ol', content = ul ? ul[2] : ol[2];
        if (inList && listType !== type) closeList();
        if (!inList) { flush(); html.push(`<${type}>`); inList = true; listType = type; }
        html.push(`<li>${this.parseInline(content, tokens)}</li>`);
        continue;
      }
      if (inTable) { html.push('</table>'); inTable = false; }
      closeList();
      if (!trimmed) { flush(); continue; }
      if (/^!\[([^\]]*)\]\(([^)\s]+)\)$/.test(trimmed)) { flush(); html.push(this.parseInline(trimmed, tokens)); continue; }
      if (/^<\/?[a-zA-Z][^>]*>|^<!--[\s\S]*-->/.test(trimmed)) { flush(); html.push(line); continue; }
      const h = line.match(/^(#{1,6})[ \t]+(.+?)\s*#*\s*$/);
      if (h) { flush(); html.push(`<h${h[1].length}>${this.parseInline(h[2], tokens)}</h${h[1].length}>`); continue; }
      paragraphs.push(line);
    }
    if (inTable) html.push('</table>');
    closeList(); flush();
    return html.join("\n");
  },
  parseInline(text, tokens) {
    let res = text.replace(this.inlineRules[0].reg, m => this.inlineRules[0].replace(m, tokens));
    res = res.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    for (let i = 1; i < this.inlineRules.length; i++) res = res.replace(this.inlineRules[i].reg, this.inlineRules[i].replace);
    return res.replace(/\u0000T(\d+)\u0000/g, (_, i) => tokens[i]);
  },
  async init() {
    await Promise.all(Array.from(document.querySelectorAll('[data-md-src]')).map(async div => {
      try {
        const r = await fetch(div.dataset.mdSrc);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        div.innerHTML = this.parse(await r.text());
      } catch (e) {
        div.innerHTML = `<span class="r">${e.message}</span>`;
      }}));
}};
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', () => MarkdownParser.init()); } else { MarkdownParser.init(); }
