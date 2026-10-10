// The Code panel: live HTML and the page’s stylesheets.

// Code panel: the inspected page's live markup (HTML) and its stylesheets as
// written (CSS), read from one preview. It only shows code: nothing in it is
// editable, and nothing goes to the reports or reviews.
const codePanel = document.querySelector('#code-panel');
const codeToggle = document.querySelector('#code-toggle');
const codeHtml = document.querySelector('#code-html');
const codeCss = document.querySelector('#code-css');
const codeMedia = document.querySelector('#code-media');
const CODE_WIDTH_KEY = 'pixelprism-code-panel-width';
const CODE_VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
let codeView = 'html';
let codeFrame = null;
// Children per element, by path key ('root' holds the doctype and <html>).
const codeNodes = new Map();
const codeExpanded = new Set();
let codeBodyIndex = null;
let codeSelectedKey = null;
let codePendingReveal = null;
let codeRenderFrame = 0;
let codeHoveredKey;
let codeSheets = null;
let codeMediaMatches = {};
const codeMediaToggled = new Map();
let codeMatchedSelectors = new Set();
let codeScrollToMatch = false;

const codeKey = (path) => (Array.isArray(path) ? path.join('.') : 'root');
const codeEscape = (value) => String(value).replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);

function postToCode(message) {
  codeFrame?.postMessage({ source: 'viewport-parade', ...message }, '*');
}

// The preview the code comes from: the one last worked in, else the first.
function currentCodeFrame() {
  const frames = [...document.querySelectorAll('.viewport-card iframe')].map((iframe) => iframe.contentWindow).filter(Boolean);
  return frames.includes(layersFrame) ? layersFrame : frames[0] || null;
}

function syncCodeFrame() {
  if (codePanel.hidden) return;
  const next = currentCodeFrame();
  if (next === codeFrame) {
    renderCodeContext();
    return;
  }
  postToCode({ type: 'code-watch', enabled: false });
  codeFrame = next;
  postToCode({ type: 'code-watch', enabled: true });
  // The markup is the page's; the media queries that apply are the preview's.
  loadCodeNodes();
  if (codeSheets) requestCodeMedia();
  renderCodeContext();
}

function setCodeOpen(open) {
  if (open === !codePanel.hidden) return;
  codePanel.hidden = !open;
  codeToggle.setAttribute('aria-pressed', String(open));
  if (open) {
    followSelectedCard();
    codeFrame = null;
    codeSheets = null;
    syncCodeFrame();
    if (codeView === 'css') requestCodeStyles();
  } else {
    postToCode({ type: 'code-hover', path: null });
    postToCode({ type: 'code-watch', enabled: false });
    codeFrame = null;
  }
}

// The CSS view names the preview whose media queries it highlights.
function renderCodeContext() {
  const card = codeFrame && cardForFrame(codeFrame);
  const preview = card ? `${card.querySelector('.viewport-name').textContent} ${card.dataset.viewportWidth}` : '';
  codeMedia.textContent = preview ? `Media: ${preview}` : '';
  codeMedia.hidden = codeView !== 'css' || !preview;
}

function setCodeView(view) {
  codeView = view;
  codePanel.querySelectorAll('[data-code-view]').forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.codeView === view)));
  codeHtml.hidden = view !== 'html';
  codeCss.hidden = view !== 'css';
  renderCodeContext();
  if (view === 'css') {
    if (!codeSheets) requestCodeStyles();
    else requestCodeSelectorMatches(true);
  }
}

// HTML

function loadCodeNodes() {
  postToCode({ type: 'code-request-nodes', path: null });
  codeExpanded.forEach((key) => postToCode({ type: 'code-request-nodes', path: key ? key.split('.').map(Number) : [] }));
  if (!codeFrame) codeHtml.innerHTML = '<p class="code-empty">Open a page to see its code.</p>';
}

function toggleCodeNode(key) {
  if (codeExpanded.has(key)) codeExpanded.delete(key);
  else {
    codeExpanded.add(key);
    if (!codeNodes.has(key)) postToCode({ type: 'code-request-nodes', path: key ? key.split('.').map(Number) : [] });
  }
  scheduleCodeRender();
}

function scheduleCodeRender() {
  if (codeRenderFrame) return;
  codeRenderFrame = requestAnimationFrame(() => {
    codeRenderFrame = 0;
    renderCodeHtml();
  });
}

function codeOpenTag(node) {
  const attributes = node.attributes.map(([name, value]) => ` <span class="code-attr">${codeEscape(name)}</span>${value === '' ? '' : `=<span class="code-value">"${codeEscape(value)}"</span>`}`).join('');
  return `<span class="code-tag">&lt;${codeEscape(node.tag)}</span>${attributes}<span class="code-tag">&gt;</span>`;
}

function codeCloseTag(tag) {
  return `<span class="code-tag">&lt;/${codeEscape(tag)}&gt;</span>`;
}

function renderCodeHtml() {
  const rows = [];
  const caret = (open, leaf) => `<button type="button" class="code-caret${leaf ? ' is-leaf' : ''}" data-action="toggle" tabindex="-1" aria-hidden="true">${leaf ? '' : window.phosphorIcon(open ? 'caret-down' : 'caret-right')}</button>`;
  const walk = (nodes, depth) => nodes.forEach((node) => {
    if (node.kind !== 'element') {
      const className = node.kind === 'comment' ? 'code-comment' : node.kind === 'doctype' ? 'code-muted' : 'code-text';
      const text = node.kind === 'comment' ? `&lt;!-- ${codeEscape(node.text)} --&gt;` : codeEscape(node.text);
      rows.push(`<div class="code-row" style="--depth:${depth}">${caret(false, true)}<span class="${className}">${text}</span></div>`);
      return;
    }
    const key = codeKey(node.path);
    const hasChildren = node.childCount > 0;
    const open = hasChildren && codeExpanded.has(key);
    const selected = key === codeSelectedKey ? ' is-selected' : '';
    let line = codeOpenTag(node);
    if (node.text !== undefined) line += `<span class="code-text">${codeEscape(node.text)}</span>${codeCloseTag(node.tag)}`;
    else if (hasChildren && !open) line += `<span class="code-muted">…</span>${codeCloseTag(node.tag)}`;
    else if (!hasChildren && !CODE_VOID_TAGS.has(node.tag)) line += codeCloseTag(node.tag);
    rows.push(`<div class="code-row${selected}" role="treeitem" style="--depth:${depth}" data-key="${key}"${hasChildren ? ` aria-expanded="${open}"` : ''}>${caret(open, !hasChildren)}<span>${line}</span></div>`);
    if (!open) return;
    walk(codeNodes.get(key) || [], depth + 1);
    rows.push(`<div class="code-row${selected}" style="--depth:${depth}" data-key="${key}">${caret(false, true)}${codeCloseTag(node.tag)}</div>`);
  });
  walk(codeNodes.get('root') || [], 0);
  const scroll = codeHtml.scrollTop;
  codeHtml.innerHTML = rows.join('') || '<p class="code-empty">Loading the page’s code…</p>';
  codeHtml.scrollTop = scroll;
  if (codePendingReveal === null && codeSelectedKey && codeHtml.dataset.reveal === codeSelectedKey) {
    delete codeHtml.dataset.reveal;
    codeHtml.querySelector(`.code-row[data-key="${codeSelectedKey}"]`)?.scrollIntoView({ block: 'center' });
  }
}

// An element selected in the preview (or in Layers) opens its branch here.
function revealCodeSelection(layerPath) {
  if (codePanel.hidden || !Array.isArray(layerPath)) return;
  if (codeBodyIndex === null) {
    codePendingReveal = layerPath;
    return;
  }
  codePendingReveal = null;
  const path = [codeBodyIndex, ...layerPath];
  for (let length = 0; length < path.length; length += 1) {
    const key = path.slice(0, length).join('.');
    if (!codeExpanded.has(key)) {
      codeExpanded.add(key);
      postToCode({ type: 'code-request-nodes', path: path.slice(0, length) });
    }
  }
  codeSelectedKey = codeKey(path);
  codeHtml.dataset.reveal = codeSelectedKey;
  scheduleCodeRender();
  requestCodeSelectorMatches(true);
}

codeHtml.addEventListener('click', (event) => {
  const row = event.target.closest('.code-row[data-key]');
  if (!row) return;
  if (event.target.closest('[data-action="toggle"]')) {
    toggleCodeNode(row.dataset.key);
    return;
  }
  codeSelectedKey = row.dataset.key;
  scheduleCodeRender();
  postToCode({ type: 'code-select', path: row.dataset.key ? row.dataset.key.split('.').map(Number) : [] });
});
codeHtml.addEventListener('dblclick', (event) => {
  const row = event.target.closest('.code-row[data-key][aria-expanded]');
  if (row && !event.target.closest('[data-action="toggle"]')) toggleCodeNode(row.dataset.key);
});
codeHtml.addEventListener('mouseover', (event) => {
  const key = event.target.closest('.code-row[data-key]')?.dataset.key ?? null;
  if (key === codeHoveredKey) return;
  codeHoveredKey = key;
  postToCode({ type: 'code-hover', path: key === null ? null : key ? key.split('.').map(Number) : [] });
});
codeHtml.addEventListener('mouseleave', () => {
  codeHoveredKey = undefined;
  postToCode({ type: 'code-hover', path: null });
});

// CSS

function requestCodeStyles() {
  codeSheets = null;
  codeMatchedSelectors = new Set();
  codeCss.innerHTML = '<p class="code-empty">Loading the page’s styles…</p>';
  postToCode({ type: 'code-request-styles' });
}

// Splits CSS into declarations and blocks, in source order; blocks nest
// (@media, @supports, CSS nesting). Comments are dropped.
function parseCssBlocks(text) {
  let index = 0;
  const parse = () => {
    const items = [];
    let buffer = '';
    let parens = 0;
    const flush = () => {
      const declaration = buffer.trim();
      if (declaration) items.push({ declaration });
      buffer = '';
    };
    while (index < text.length) {
      const character = text[index];
      if (character === '/' && text[index + 1] === '*') {
        const end = text.indexOf('*/', index + 2);
        index = end === -1 ? text.length : end + 2;
      } else if (character === '"' || character === "'") {
        let end = index + 1;
        while (end < text.length && text[end] !== character) end += text[end] === '\\' ? 2 : 1;
        buffer += text.slice(index, end + 1);
        index = end + 1;
      } else if (character === '(' || character === ')') {
        parens += character === '(' ? 1 : -1;
        buffer += character;
        index += 1;
      } else if (character === '{' && parens <= 0) {
        const prelude = buffer.trim().replace(/\s+/g, ' ');
        buffer = '';
        index += 1;
        items.push({ prelude, items: parse() });
      } else if (character === '}' && parens <= 0) {
        index += 1;
        flush();
        return items;
      } else if (character === ';' && parens <= 0) {
        flush();
        index += 1;
      } else {
        buffer += character;
        index += 1;
      }
    }
    flush();
    return items;
  };
  return parse();
}

const isMediaPrelude = (prelude) => /^@media\b/i.test(prelude);
const mediaQueryOf = (prelude) => prelude.replace(/^@media\s*/i, '');

function codeCssSelectors() {
  const selectors = new Set();
  const walk = (items) => items.forEach((item) => {
    if (!item.items) return;
    if (!item.prelude.startsWith('@')) selectors.add(item.prelude);
    walk(item.items);
  });
  codeSheets?.forEach((sheet) => walk(sheet.items));
  return [...selectors];
}

function requestCodeMedia() {
  const queries = new Set();
  const walk = (items) => items.forEach((item) => {
    if (!item.items) return;
    if (isMediaPrelude(item.prelude)) queries.add(mediaQueryOf(item.prelude));
    walk(item.items);
  });
  codeSheets?.forEach((sheet) => walk(sheet.items));
  postToCode({ type: 'code-match-media', queries: [...queries] });
}

function requestCodeSelectorMatches(scroll = false) {
  if (codeView !== 'css' || !codeSheets || selectedLayerPath === undefined) return;
  codeScrollToMatch = scroll;
  postToCode({ type: 'code-match-selectors', selectors: codeCssSelectors() });
}

function renderCodeCss() {
  if (!codeSheets) return;
  const rows = [];
  const caret = (open) => `<span class="code-caret" aria-hidden="true">${window.phosphorIcon(open ? 'caret-down' : 'caret-right')}</span>`;
  const walk = (items, depth, id, inactive, matched = false) => items.forEach((item, position) => {
    const itemId = `${id}.${position}`;
    const dim = `${inactive ? ' is-inactive' : ''}${matched ? ' is-match' : ''}`;
    if (!item.items) {
      const colon = item.declaration.indexOf(':');
      const line = colon > 0 && !item.declaration.startsWith('@')
        ? `<span class="code-property">${codeEscape(item.declaration.slice(0, colon))}</span>: <span class="code-value">${codeEscape(item.declaration.slice(colon + 1).trim())}</span>;`
        : `<span class="code-tag">${codeEscape(item.declaration)}</span>;`;
      rows.push(`<div class="code-row${dim}" style="--depth:${depth}">${line}</div>`);
      return;
    }
    if (isMediaPrelude(item.prelude)) {
      // Collapsed unless it applies to the preview; a click opens or closes it.
      const active = codeMediaMatches[mediaQueryOf(item.prelude)] === true;
      const open = codeMediaToggled.get(itemId) ?? active;
      rows.push(`<div class="code-row code-media-row${active ? ' is-active' : ''}${dim}" style="--depth:${depth}" data-media="${itemId}">${caret(open)}<span class="code-tag">${codeEscape(item.prelude)}</span> {${open ? '' : ' <span class="code-muted">…</span> }'}</div>`);
      if (!open) return;
      walk(item.items, depth + 1, itemId, inactive || !active);
      rows.push(`<div class="code-row${dim}" style="--depth:${depth}">}</div>`);
      return;
    }
    const match = !item.prelude.startsWith('@') && codeMatchedSelectors.has(item.prelude) ? ' is-match' : '';
    const prelude = item.prelude.startsWith('@') ? `<span class="code-tag">${codeEscape(item.prelude)}</span>` : `<span class="code-selector">${codeEscape(item.prelude)}</span>`;
    rows.push(`<div class="code-row${match}${dim}" style="--depth:${depth}"${match && !inactive ? ' data-match' : ''}>${prelude} {</div>`);
    walk(item.items, depth + 1, itemId, inactive, Boolean(match));
    rows.push(`<div class="code-row${match}${dim}" style="--depth:${depth}">}</div>`);
  });
  codeSheets.forEach((sheet, index) => {
    rows.push(`<div class="code-file" title="${codeEscape(sheet.label)}">${codeEscape(sheet.label)}${sheet.media && sheet.media !== 'all' ? ` <span class="code-muted">(${codeEscape(sheet.media)})</span>` : ''}</div>`);
    walk(sheet.items, 0, String(index), false);
  });
  const scroll = codeCss.scrollTop;
  codeCss.innerHTML = rows.join('') || '<p class="code-empty">This page has no styles.</p>';
  codeCss.scrollTop = scroll;
  if (codeScrollToMatch) {
    codeScrollToMatch = false;
    codeCss.querySelector('[data-match]')?.scrollIntoView({ block: 'start' });
  }
}

codeCss.addEventListener('click', (event) => {
  const row = event.target.closest('[data-media]');
  if (!row) return;
  const open = codeMediaToggled.get(row.dataset.media) ?? row.classList.contains('is-active');
  codeMediaToggled.set(row.dataset.media, !open);
  renderCodeCss();
});

// Messages from the preview the code comes from.
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || codePanel.hidden || event.source !== codeFrame) return;
  const { type } = event.data;
  if (type === 'code-nodes') {
    const nodes = Array.isArray(event.data.nodes) ? event.data.nodes : [];
    const key = codeKey(event.data.path);
    codeNodes.set(key, nodes);
    // <html> and <body> start open.
    if (key === 'root' && !codeNodes.has('')) toggleCodeNode('');
    if (key === '') {
      const body = nodes.find((node) => node.tag === 'body');
      const firstLoad = codeBodyIndex === null;
      codeBodyIndex = body ? body.path[0] : null;
      if (body && firstLoad && !codeExpanded.has(codeKey(body.path))) toggleCodeNode(codeKey(body.path));
      if (codePendingReveal) revealCodeSelection(codePendingReveal);
    }
    scheduleCodeRender();
  } else if (type === 'code-changed') {
    loadCodeNodes();
  } else if (type === 'code-styles') {
    codeSheets = (Array.isArray(event.data.sheets) ? event.data.sheets : []).map((sheet) => ({
      label: String(sheet.label || ''), media: String(sheet.media || ''), items: parseCssBlocks(String(sheet.text || ''))
    }));
    codeMediaMatches = {};
    codeMediaToggled.clear();
    renderCodeCss();
    requestCodeMedia();
    requestCodeSelectorMatches(true);
  } else if (type === 'code-media') {
    codeMediaMatches = event.data.matches || {};
    renderCodeCss();
  } else if (type === 'code-selectors') {
    codeMatchedSelectors = new Set(Array.isArray(event.data.matched) ? event.data.matched : []);
    renderCodeCss();
  }
});

codeToggle.addEventListener('click', () => setCodeOpen(codePanel.hidden));
document.querySelector('#code-panel-close').addEventListener('click', () => setCodeOpen(false));
codePanel.querySelectorAll('[data-code-view]').forEach((tab) => tab.addEventListener('click', () => setCodeView(tab.dataset.codeView)));

// A panel's left edge resizes it, and each panel remembers its own width:
// Code by default, the Variables panel through its data-width-* attributes (it
// needs room for its filters beside the table).
function setCodePanelWidth(width, panel = codePanel) {
  const { widthVar = '--code-panel-width', widthKey = CODE_WIDTH_KEY } = panel.dataset;
  const min = Number(panel.dataset.minWidth) || 280;
  const clamped = Math.round(Math.min(Math.max(width, min), Math.max(min, window.innerWidth - 360)));
  document.documentElement.style.setProperty(widthVar, `${clamped}px`);
  try { localStorage.setItem(widthKey, String(clamped)); } catch { /* Not remembered this time. */ }
}
document.querySelectorAll('.code-panel').forEach((panel) => {
  const { widthVar = '--code-panel-width', widthKey = CODE_WIDTH_KEY } = panel.dataset;
  try {
    const stored = Number(localStorage.getItem(widthKey));
    if (stored) document.documentElement.style.setProperty(widthVar, `${stored}px`);
  } catch { /* The default width. */ }
});
document.querySelectorAll('.code-panel-resize').forEach((codeResize) => {
  const panel = codeResize.closest('.code-panel');
  codeResize.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const right = panel.getBoundingClientRect().right;
    const move = (pointer) => setCodePanelWidth(right - pointer.clientX, panel);
    const finish = () => {
      codeResize.removeEventListener('pointermove', move);
      codeResize.removeEventListener('pointerup', finish);
      codeResize.removeEventListener('pointercancel', finish);
      document.body.classList.remove('is-resizing-code');
    };
    document.body.classList.add('is-resizing-code');
    codeResize.setPointerCapture(event.pointerId);
    codeResize.addEventListener('pointermove', move);
    codeResize.addEventListener('pointerup', finish);
    codeResize.addEventListener('pointercancel', finish);
  });
  codeResize.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: 16, ArrowRight: -16 }[event.key];
    if (!step) return;
    event.preventDefault();
    setCodePanelWidth(panel.getBoundingClientRect().width + step, panel);
  });
});
