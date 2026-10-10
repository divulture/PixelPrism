// Copies of the page as shown, for comments left on a view the page does not open in.

// A comment left on a view the page does not open in (a tab switched, a
// menu, dropdown or panel opened, a dialog, a container scrolled) keeps a
// copy of the page as the preview shows it, and the HTML review captures
// that copy instead of clicking the view open again on a fresh load, which
// misses whatever the recorder could not tell apart (tabs and panels
// without ARIA, menus that do not float high, hand-made toggles). A
// comment on the page as it loads keeps none, and the review captures the
// live page. The copy is static HTML: scripts, PixelPrism's nodes and its
// CSS edits are left out; the held state's sheet stays. Marks
// (data-pixelprism-*) tell the background what HTML cannot hold: scroll
// positions, canvases, modal dialogs and popovers, and the hovered and
// focused elements (for a CSS hover menu). Left-out nodes keep an empty
// place, and added ones count as PixelPrism's, so the comment's element is
// found in the copy by the same index path as in the page.
const SNAPSHOT_VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SNAPSHOT_EMPTIED_TAGS = new Set(['script', 'noscript', 'template', 'noembed', 'noframes']);
const escapeSnapshotText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');
const escapeSnapshotAttribute = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\u00a0/g, '&nbsp;');
// Rules added from script (CSS-in-JS insertRule) are not in the <style> text.
const sheetText = (sheet) => {
  try { return [...sheet.cssRules].map((rule) => rule.cssText).join('\n'); } catch { return null; }
};
const snapshotStyle = (sheet) => `<style data-viewport-parade-overlay>${(sheetText(sheet) || '').replace(/<\/style/gi, '<\\/style')}</style>`;
const snapshotShadowRoot = (element) => {
  try { return chrome.dom?.openOrClosedShadowRoot?.(element) || element.shadowRoot; } catch { return element.shadowRoot; }
};
const pageSnapshot = () => {
  const parts = [];
  const canvases = [];
  let focused = document.activeElement;
  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
  if (focused === document.body) focused = null;
  const matchesSafely = (element, selector) => {
    try { return element.matches(selector); } catch { return false; }
  };
  const attributesFor = (element, tag) => {
    const attributes = new Map();
    [...element.attributes].forEach(({ name, value }) => {
      if (/^on/i.test(name) || ['loading', 'autoplay', 'autofocus', 'nonce'].includes(name)) return;
      if (name.startsWith('data-pixelprism-')) return;
      if (name.startsWith('data-viewport-parade-') && name !== STATE_ATTRIBUTE) return;
      if (name === 'class') value = value.split(/\s+/).filter((token) => token && !token.startsWith('viewport-parade-')).join(' ');
      if ((name === 'src' || name === 'href') && /^\s*javascript:/i.test(value)) return;
      attributes.set(name, value);
    });
    if (SNAPSHOT_EMPTIED_TAGS.has(tag)) return tag === 'script' ? ' type="text/plain"' : '';
    if (tag === 'meta') attributes.delete('http-equiv');
    if (tag === 'link' && /(^|\s)(modulepreload|preload|prefetch)(\s|$)/i.test(element.rel)) attributes.delete('rel');
    if ((tag === 'style' || tag === 'link') && element.sheet?.disabled) attributes.set('media', 'not all');
    if (tag === 'input') {
      const type = (element.getAttribute('type') || '').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        if (element.checked) attributes.set('checked', '');
        else attributes.delete('checked');
      } else if (type === 'password') attributes.set('value', '•'.repeat(element.value.length));
      else if (type !== 'file') attributes.set('value', element.value);
    } else if (tag === 'option') {
      if (element.selected) attributes.set('selected', '');
      else attributes.delete('selected');
    } else if (tag === 'canvas') {
      try {
        canvases.push(element.toDataURL());
        attributes.set('data-pixelprism-canvas', String(canvases.length - 1));
        attributes.set('width', String(element.width));
        attributes.set('height', String(element.height));
      } catch { /* A tainted canvas stays blank. */ }
    } else if (tag === 'img' && element.complete && /^blob:/.test(element.currentSrc)) {
      // A blob URL belongs to the preview's document; the copy gets the pixels.
      try {
        const canvas = document.createElement('canvas');
        canvas.width = element.naturalWidth;
        canvas.height = element.naturalHeight;
        canvas.getContext('2d').drawImage(element, 0, 0);
        attributes.set('src', canvas.toDataURL());
        attributes.delete('srcset');
      } catch { /* Left as it is. */ }
    }
    if (element.scrollTop || element.scrollLeft) attributes.set('data-pixelprism-scroll', `${element.scrollLeft},${element.scrollTop}`);
    if (matchesSafely(element, ':hover')) attributes.set('data-pixelprism-hover', '');
    if (element === focused) attributes.set('data-pixelprism-focus', '');
    if (matchesSafely(element, 'dialog:modal')) attributes.set('data-pixelprism-modal', '');
    if (matchesSafely(element, ':popover-open')) attributes.set('data-pixelprism-popover', '');
    return [...attributes].map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeSnapshotAttribute(value)}"`)).join('');
  };
  const writeChildren = (parent) => {
    for (let node = parent.firstChild; node; node = node.nextSibling) {
      if (node.nodeType === Node.TEXT_NODE) parts.push(escapeSnapshotText(node.data));
      else if (node.nodeType === Node.ELEMENT_NODE) writeElement(node);
    }
  };
  const writeElement = (element) => {
    if (element.hasAttribute('data-viewport-parade-overlay') && element !== stateStyle) return;
    const html = element.namespaceURI === 'http://www.w3.org/1999/xhtml';
    // SVG keeps its case (linearGradient, viewBox).
    const tag = html ? element.localName : element.tagName;
    parts.push(`<${tag}${attributesFor(element, tag.toLowerCase())}>`);
    if (tag === 'head') parts.push(`<base data-viewport-parade-overlay href="${escapeSnapshotAttribute(document.baseURI)}">`);
    if ((html && SNAPSHOT_VOID_TAGS.has(tag)) || SNAPSHOT_EMPTIED_TAGS.has(tag.toLowerCase())) {
      if (!SNAPSHOT_VOID_TAGS.has(tag)) parts.push(`</${tag}>`);
      return;
    }
    const shadow = snapshotShadowRoot(element);
    if (shadow) {
      // Declarative shadow DOM; written open so the copy can reach inside.
      parts.push('<template shadowrootmode="open">');
      (shadow.adoptedStyleSheets || []).forEach((sheet) => parts.push(snapshotStyle(sheet)));
      writeChildren(shadow);
      parts.push('</template>');
    }
    if (html && tag === 'style') {
      const text = (element.sheet && sheetText(element.sheet)) ?? element.textContent;
      parts.push(text.replace(/<\/style/gi, '<\\/style'));
    } else if (html && tag === 'textarea') {
      // The parser drops one newline right after the tag.
      parts.push(`${element.value.startsWith('\n') ? '\n' : ''}${escapeSnapshotText(element.value)}`);
    } else {
      if (html && (tag === 'pre' || tag === 'listing') && element.firstChild?.nodeType === Node.TEXT_NODE && element.firstChild.data.startsWith('\n')) parts.push('\n');
      writeChildren(element);
    }
    // Adopted sheets come after the document's own in the cascade.
    if (tag === 'body') (document.adoptedStyleSheets || []).forEach((sheet) => parts.push(snapshotStyle(sheet)));
    parts.push(`</${tag}>`);
  };
  if (document.compatMode === 'CSS1Compat') parts.push('<!DOCTYPE html>');
  writeElement(document.documentElement);
  return {
    id: `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    html: parts.join(''),
    canvases,
    scrollX: window.scrollX,
    scrollY: window.scrollY
  };
};
let viewSnapshot = null;
const viewSnapshotFor = (steps) => {
  // The page's own scroller moves like the window; the review scrolls it.
  const scroller = pageScroller();
  const scrolled = [...scrolledContainers].filter((element) => element.isConnected && element !== scroller && (element.scrollTop || element.scrollLeft));
  if (!viewVersion && !steps.length && !scrolled.length) return null;
  const key = `${viewVersion}|${location.href}|${steps.length}|${scrolled.map((element) => `${element.scrollLeft},${element.scrollTop}`).join(';')}`;
  if (viewSnapshot?.key !== key) {
    try {
      viewSnapshot = { key, snapshot: pageSnapshot() };
    } catch {
      viewSnapshot = null;
    }
  }
  return viewSnapshot?.snapshot || null;
};
