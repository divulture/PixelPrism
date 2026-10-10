// The live HTML and stylesheets shown in the Code panel.

// Studio's Code panel: the page's live markup one level at a time, and its
// stylesheets as written. PixelPrism's own nodes and attributes stay out.
// An element is addressed by its indexes among element children, starting
// at <html>; from <body> down that is the Layers path.
const CODE_TEXT_LIMIT = 4000;
const isStudioNode = (node) => node instanceof Element && node.dataset.viewportParadeOverlay !== undefined;
const codeElementFor = (path) => (Array.isArray(path)
  ? path.reduce((element, index) => element?.children[index], document.documentElement)
  : null);
const codeText = (text) => (text.length > CODE_TEXT_LIMIT ? `${text.slice(0, CODE_TEXT_LIMIT)}…` : text);
const codeChildNodes = (element) => [...element.childNodes].filter((node) => (
  (node.nodeType === Node.ELEMENT_NODE && !isStudioNode(node))
  || (node.nodeType === Node.TEXT_NODE && node.textContent.trim())
  || node.nodeType === Node.COMMENT_NODE
));
const codeElementNode = (element, path) => {
  const children = codeChildNodes(element);
  const text = children.length === 1 && children[0].nodeType === Node.TEXT_NODE ? children[0].textContent.trim() : '';
  return {
    kind: 'element',
    tag: element.tagName.toLowerCase(),
    attributes: [...element.attributes].filter((attribute) => !attribute.name.startsWith('data-viewport-parade')).map((attribute) => [attribute.name, attribute.value]),
    path,
    ...(text && text.length <= 80 ? { text } : { childCount: children.length })
  };
};
const codeNodesFor = (path) => {
  if (!Array.isArray(path)) {
    return [
      ...(document.doctype ? [{ kind: 'doctype', text: `<!DOCTYPE ${document.doctype.name}>` }] : []),
      codeElementNode(document.documentElement, [])
    ];
  }
  const parent = codeElementFor(path);
  if (!parent) return [];
  const nodes = [];
  let elementIndex = -1;
  parent.childNodes.forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      elementIndex += 1;
      if (!isStudioNode(node)) nodes.push(codeElementNode(node, [...path, elementIndex]));
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) nodes.push({ kind: 'text', text: codeText(text) });
    } else if (node.nodeType === Node.COMMENT_NODE) {
      nodes.push({ kind: 'comment', text: codeText(node.textContent.trim()) });
    }
  });
  return nodes;
};
const codeRulesText = (sheet) => {
  try { return [...sheet.cssRules].map((rule) => rule.cssText).join('\n'); } catch { return ''; }
};
// Linked files are fetched by the extension, so files from other origins
// (CDNs) can be read too; a CSS-in-JS <style> with no text gives its rules.
const codeStylesheets = () => Promise.all([...document.styleSheets]
  .filter((sheet) => !isStudioNode(sheet.ownerNode))
  .map(async (sheet, index, sheets) => {
    const media = sheet.media?.mediaText || '';
    if (sheet.href) {
      let text = '';
      try {
        const response = await chrome.runtime.sendMessage({ type: 'load-stylesheet', url: sheet.href });
        if (response?.ok && typeof response.css === 'string') text = response.css;
      } catch { /* Fall back to the rules the page can read. */ }
      return { label: sheet.href, href: sheet.href, media, text: text || codeRulesText(sheet) };
    }
    const own = sheet.ownerNode?.textContent || '';
    const inline = sheets.slice(0, index + 1).filter((candidate) => !candidate.href).length;
    return { label: `Inline <style> ${inline}`, media, text: own.trim() ? own : codeRulesText(sheet) };
  }))
  .then((sheets) => [
    ...sheets,
    ...(document.adoptedStyleSheets || []).map((sheet, index) => ({ label: `Constructed stylesheet ${index + 1}`, media: '', text: codeRulesText(sheet) }))
  ]);
// Media conditions for the Site breakpoints preset, read from the rules the
// page has loaded (imports and nested rules included). Only a sheet the page
// cannot read (another origin) is fetched by the extension, and none may
// hold the answer back for long.
const breakpointMedia = async () => {
  const queries = [];
  const texts = [];
  const fetches = [];
  const seen = new Set();
  const visitRules = (rules) => {
    for (const rule of rules) {
      if (rule.media?.mediaText) queries.push(rule.media.mediaText);
      if (rule.styleSheet) visitSheet(rule.styleSheet);
      if (rule.cssRules) visitRules(rule.cssRules);
    }
  };
  const visitSheet = (sheet) => {
    if (!sheet || seen.has(sheet) || isStudioNode(sheet.ownerNode)) return;
    seen.add(sheet);
    if (sheet.media?.mediaText) queries.push(sheet.media.mediaText);
    let rules = null;
    try { rules = sheet.cssRules; } catch { /* Another origin. */ }
    if (rules) visitRules(rules);
    else if (sheet.href) {
      fetches.push(Promise.race([
        chrome.runtime.sendMessage({ type: 'load-stylesheet', url: sheet.href })
          .then((response) => { if (response?.ok && typeof response.css === 'string') texts.push(response.css); })
          .catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 4000))
      ]));
    }
  };
  [...document.styleSheets, ...(document.adoptedStyleSheets || [])].forEach(visitSheet);
  await Promise.all(fetches);
  return { queries, texts };
};
let codeObserver = null;
let codeChangeTimer = 0;
const reportCodeChange = (records) => {
  const relevant = records.some((record) => {
    const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
    if (target?.closest?.('[data-viewport-parade-overlay]')) return false;
    return record.type !== 'attributes' || !record.attributeName.startsWith('data-viewport-parade');
  });
  if (!relevant) return;
  clearTimeout(codeChangeTimer);
  codeChangeTimer = setTimeout(() => window.parent.postMessage({ source: 'viewport-parade', type: 'code-changed' }, extensionOrigin), 400);
};
window.addEventListener('message', (event) => {
  if (isStudioMessage(event, 'code-request-nodes')) {
    window.parent.postMessage({ source: 'viewport-parade', type: 'code-nodes', path: event.data.path ?? null, nodes: codeNodesFor(event.data.path) }, extensionOrigin);
  } else if (isStudioMessage(event, 'code-watch')) {
    codeObserver?.disconnect();
    codeObserver = event.data.enabled ? new MutationObserver(reportCodeChange) : null;
    codeObserver?.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
  } else if (isStudioMessage(event, 'code-request-styles')) {
    codeStylesheets().then((sheets) => window.parent.postMessage({ source: 'viewport-parade', type: 'code-styles', sheets }, extensionOrigin));
  } else if (isStudioMessage(event, 'breakpoints-request')) {
    breakpointMedia().then(({ queries, texts }) => window.parent.postMessage({
      source: 'viewport-parade', type: 'breakpoints-styles', requestId: event.data.requestId, queries, texts
    }, extensionOrigin));
  } else if (isStudioMessage(event, 'code-match-media')) {
    const queries = Array.isArray(event.data.queries) ? event.data.queries : [];
    const matches = Object.fromEntries(queries.map((query) => {
      try { return [query, window.matchMedia(query).matches]; } catch { return [query, false]; }
    }));
    window.parent.postMessage({ source: 'viewport-parade', type: 'code-media', matches }, extensionOrigin);
  }
});
window.addEventListener('message', (event) => {
  if (!isStudioMessage(event, 'watch-ruler-scroll')) return;
  rulerScrollWatched = Boolean(event.data.enabled);
  if (rulerScrollWatched) reportRulerScroll();
});
