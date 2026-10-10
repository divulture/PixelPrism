// Talking to Studio, and finding an element again from what Studio stored about it.

const INSPECTOR_PROTOCOL_VERSION = 65;
const extensionOrigin = new URL(chrome.runtime.getURL('/')).origin;
const isStudioMessage = (event, type) => (
  event.source === window.parent
  && event.origin === extensionOrigin
  && event.data?.source === 'viewport-parade'
  && event.data?.type === type
);
const queryOne = (selector) => {
  if (!selector || typeof selector !== 'string') return null;
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 ? matches[0] : null;
  } catch { return null; }
};
const matchesContext = (element, context = {}) => {
  if (!(element instanceof Element)) return false;
  if (context.tag && element.tagName.toLowerCase() !== context.tag) return false;
  // A made-up id (React's ":r5:") differs on every load; it proves nothing.
  if (context.id && !GENERATED_ID.test(context.id) && element.id !== context.id) return false;
  if (Array.isArray(context.classes) && context.classes.length
    && !context.classes.every((name) => element.classList.contains(name))) return false;
  return true;
};
const uniqueAttributeMatch = (context) => {
  const attributes = context?.attributes;
  if (!attributes || typeof attributes !== 'object') return null;
  for (const name of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'role', 'aria-label', 'href', 'type']) {
    const value = attributes[name];
    if (value === null || value === undefined || value === '') continue;
    const escaped = CSS.escape(String(value));
    const match = queryOne(`[${CSS.escape(name)}="${escaped}"]`);
    if (match && matchesContext(match, context)) return match;
  }
  return null;
};
const elementForChange = (change) => {
  const context = change?.element || {};
  // Prefer identities that remain meaningful when markup is rearranged.
  if (context.id && !GENERATED_ID.test(context.id)) {
    const byId = queryOne(`#${CSS.escape(context.id)}`);
    if (byId && matchesContext(byId, context)) return byId;
  }
  const byAttribute = uniqueAttributeMatch(context);
  if (byAttribute) return byAttribute;
  // DOM path carries the original hierarchy. It is only trusted when it
  // resolves to exactly one matching element.
  const byPath = queryOne(context.domPath);
  if (byPath && matchesContext(byPath, context)) return byPath;
  const hasReliableIdentity = Boolean(context.id)
    || (Array.isArray(context.classes) && context.classes.length > 0)
    || ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'role', 'aria-label', 'href', 'type']
      .some((name) => context.attributes?.[name]);
  if (!hasReliableIdentity) return null;
  const byContextSelector = queryOne(context.selector);
  if (byContextSelector && matchesContext(byContextSelector, context)) return byContextSelector;
  const bySelector = queryOne(change?.selector);
  return bySelector && matchesContext(bySelector, context) ? bySelector : null;
};
// Describes an element so it can be found again on a fresh load. Used by
// the tools and by the click recorder, which runs before they are set up.
const truncate = (value, limit = 240) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
};
// Ids a framework makes up on each render (React's useId ":r5:", Radix,
// Headless UI, MUI, react-select): after a reload the same id can belong to
// another element, so they never identify one.
const GENERATED_ID = /[:«»]|^(radix-|headlessui-|mui-\d|react-aria|react-select-\d|rc[_-]|downshift-\d|floating-ui-|base-ui-|ember\d)|[0-9a-f]{8}-[0-9a-f]{4}-/i;
const stableIdOf = (element) => (element.id && !GENERATED_ID.test(element.id) ? element.id : '');
const stableSelectorFor = (element) => {
  const tag = element.tagName.toLowerCase();
  if (stableIdOf(element)) return `#${CSS.escape(element.id)}`;
  for (const name of ['data-testid', 'data-test', 'data-cy', 'data-qa']) {
    if (element.hasAttribute(name)) return `[${name}="${CSS.escape(element.getAttribute(name))}"]`;
  }
  const classes = [...element.classList]
    .filter((name) => !name.startsWith('viewport-parade-'))
    .slice(0, 3)
    .map((name) => `.${CSS.escape(name)}`).join('');
  if (classes) return `${tag}${classes}`;
  if (element.getAttribute('name')) return `${tag}[name="${CSS.escape(element.getAttribute('name'))}"]`;
  if (element.getAttribute('role')) return `${tag}[role="${CSS.escape(element.getAttribute('role'))}"]`;
  return tag;
};
const domPathFor = (element) => {
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
    const parent = current.parentElement;
    const base = stableSelectorFor(current);
    const hasStrongIdentity = stableIdOf(current) || [...current.attributes].some((attribute) => /^(data-(testid|test|cy|qa)|name|role)$/.test(attribute.name));
    if (hasStrongIdentity || current.classList.length) parts.unshift(base);
    else if (parent) {
      const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
      parts.unshift(sameTag.length > 1 ? `${base}:nth-of-type(${sameTag.indexOf(current) + 1})` : base);
    } else parts.unshift(base);
    if (stableIdOf(current)) break;
    current = parent;
  }
  return parts.join(' > ');
};
// Exact position from <html>; it survives repeated class names that make
// domPath ambiguous. Studio overlays are skipped so they do not shift it.
const indexPathFor = (element) => {
  const path = [];
  for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
    const parent = current.parentElement;
    if (!parent) return [];
    path.unshift([...parent.children].filter((child) => !child.hasAttribute('data-viewport-parade-overlay')).indexOf(current));
  }
  return path;
};
const htmlSnippetFor = (element) => {
  const clone = element.cloneNode(true);
  clone.querySelectorAll?.('[data-viewport-parade-overlay], style[data-viewport-parade-overlay]').forEach((node) => node.remove());
  [...clone.attributes].forEach((attribute) => {
    if (attribute.name.startsWith('data-viewport-parade-')) clone.removeAttribute(attribute.name);
  });
  if (clone.children.length) clone.replaceChildren(document.createTextNode('…'));
  return truncate(clone.outerHTML, 420);
};
const elementContextFor = (element) => {
  const attributes = {};
  ['role', 'aria-label', 'name', 'href', 'type'].forEach((name) => { attributes[name] = element.getAttribute(name); });
  [...element.attributes].forEach((attribute) => {
    if (attribute.name.startsWith('data-') && !attribute.name.startsWith('data-viewport-parade-')) attributes[attribute.name] = truncate(attribute.value, 120);
  });
  const parent = element.parentElement;
  const box = element.getBoundingClientRect();
  return {
    tag: element.tagName.toLowerCase(),
    id: stableIdOf(element) || null,
    classes: [...element.classList].filter((name) => !name.startsWith('viewport-parade-')).slice(0, 12),
    selector: stableSelectorFor(element),
    domPath: domPathFor(element),
    indexPath: indexPathFor(element),
    // Inside a menu, dropdown or dialog: where in it, as portals move
    // around the page between loads.
    ...popupContextFor(element),
    text: truncate(element.textContent, 240),
    attributes,
    htmlSnippet: htmlSnippetFor(element),
    // Page coordinates at this viewport size. If the page changes and the
    // element cannot be found again, this still says where it was.
    rect: {
      x: Math.round(box.left + window.scrollX),
      y: Math.round(box.top + pageScrollY()),
      width: Math.round(box.width),
      height: Math.round(box.height)
    },
    parent: parent ? {
      tag: parent.tagName.toLowerCase(),
      selector: stableSelectorFor(parent),
      display: getComputedStyle(parent).display
    } : null
  };
};

// Same lookup as the exported review, so a marker shown here is also
// placed on the review screenshot.
const queryAll = (selector) => {
  if (!selector || typeof selector !== 'string') return [];
  try { return [...document.querySelectorAll(selector)].slice(0, 400); } catch { return []; }
};
const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const snippetFor = (element) => {
  const clone = element.cloneNode(true);
  [...clone.attributes].forEach((attribute) => {
    if (attribute.name.startsWith('data-viewport-parade-') || attribute.name.startsWith('data-pixelprism-')) clone.removeAttribute(attribute.name);
  });
  if (clone.children.length) clone.replaceChildren(document.createTextNode('…'));
  return normalizeText(clone.outerHTML);
};
const elementAtIndexPath = (path) => {
  if (!Array.isArray(path) || !path.length) return null;
  let node = document.documentElement;
  for (const index of path) {
    node = [...node.children].filter((child) => !child.hasAttribute('data-viewport-parade-overlay'))[index];
    if (!node) return null;
  }
  return node;
};
// An element in a popup is checked by its text too: menu items share
// their markup, and a portal's place in the page changes between loads.
const textAgrees = (element, context) => {
  if (!context?.popup || !context.text) return true;
  const text = normalizeText(context.text).replace(/…$/, '');
  const own = normalizeText(element.textContent);
  return own === text || own.startsWith(text);
};
// Found by its place inside one of the popups open now.
const elementInPopups = (context) => {
  if (!Array.isArray(context?.popup?.path)) return null;
  for (const layer of shownPopupLayers()) {
    let node = layer;
    for (const index of context.popup.path) node = node?.children[index];
    if (node && matchesContext(node, context) && textAgrees(node, context)) return node;
  }
  return null;
};
const commentElementFor = (marker) => {
  const context = marker.element || { selector: marker.selector };
  if (context.id && !GENERATED_ID.test(context.id)) {
    const byId = document.getElementById(context.id);
    if (byId && matchesContext(byId, context)) return byId;
  }
  const attributes = context.attributes || {};
  for (const name of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'role', 'aria-label', 'href', 'type']) {
    const value = attributes[name];
    if (value === null || value === undefined || value === '') continue;
    const match = queryOne(`[${CSS.escape(name)}="${CSS.escape(String(value))}"]`);
    if (match && matchesContext(match, context) && textAgrees(match, context)) return match;
  }
  const inPopup = elementInPopups(context);
  if (inPopup) return inPopup;
  const byIndexPath = elementAtIndexPath(context.indexPath);
  if (byIndexPath && matchesContext(byIndexPath, context) && textAgrees(byIndexPath, context)) return byIndexPath;
  const candidates = [];
  for (const selector of [context.domPath, context.selector, marker.selector]) {
    const matches = queryAll(selector).filter((element) => matchesContext(element, context));
    if (matches.length === 1 && textAgrees(matches[0], context)) return matches[0];
    matches.forEach((element) => { if (!candidates.includes(element)) candidates.push(element); });
  }
  if (!candidates.length) return null;
  const snippet = normalizeText(context.htmlSnippet).replace(/…$/, '');
  const text = normalizeText(context.text).replace(/…$/, '');
  let best = null;
  let bestScore = 0;
  candidates.forEach((element) => {
    let score = 0;
    if (snippet) {
      const candidateSnippet = snippetFor(element);
      if (candidateSnippet === snippet) score += 4;
      else if (candidateSnippet.startsWith(snippet) || snippet.startsWith(candidateSnippet.slice(0, 80))) score += 2;
    }
    if (text) {
      const candidateText = normalizeText(element.textContent);
      if (candidateText === text) score += 3;
      else if (candidateText.startsWith(text)) score += 2;
    }
    if (score > bestScore) { best = element; bestScore = score; }
  });
  return best || (candidates.length === 1 && textAgrees(candidates[0], context) ? candidates[0] : null);
};
