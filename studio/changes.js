// Inspector edits: recording, reconciling with the page, and applying them to a local file.

// An edit to a state (".button:hover") or to a pseudo-element
// (".link::after", ".link:hover::after") is its own change, beside the same
// property's edit to the element in the default state.
// The pseudo-element an edit was made on ('before', 'after'), or null: the
// end of its rule says.
function changePseudo(change) {
  const selector = String(change.selector || '');
  return Object.keys(INSPECTOR_PSEUDO_SUFFIXES).find((pseudo) => selector.endsWith(INSPECTOR_PSEUDO_SUFFIXES[pseudo])) || null;
}

// The edit's rule without its pseudo-element: ".link:hover::after" → ".link:hover".
function changeRuleWithoutPseudo(change) {
  const selector = String(change.selector || '');
  const pseudo = changePseudo(change);
  return pseudo ? selector.slice(0, -INSPECTOR_PSEUDO_SUFFIXES[pseudo].length) : selector;
}

// The state an edit was made in ('hover', 'focus', 'active'), or null. Older
// edits only carry it in their rule (".button:hover").
function changeState(change) {
  const step = Array.isArray(change.steps) ? change.steps.find((item) => item.kind === 'state') : null;
  if (step?.state && INSPECTOR_STATE_SUFFIXES[step.state]) return step.state;
  const selector = changeRuleWithoutPseudo(change);
  return Object.keys(INSPECTOR_STATE_SUFFIXES).find((state) => selector.endsWith(INSPECTOR_STATE_SUFFIXES[state])) || null;
}

// Text and an image's alt text are the page's content, not CSS: the same at
// every width, and never part of a local CSS file.
const CONTENT_PROPERTIES = new Set(['text', 'alt']);
function isContentChange(change) {
  return CONTENT_PROPERTIES.has(change?.property);
}

function changeKey(change) {
  const selector = changeRuleWithoutPseudo(change);
  const state = Object.values(INSPECTOR_STATE_SUFFIXES).find((suffix) => selector.endsWith(suffix)) || '';
  const pseudo = INSPECTOR_PSEUDO_SUFFIXES[changePseudo(change)] || '';
  return [change.url, change.viewport.width, change.viewport.height, `${change.element?.domPath || selector}${state}${pseudo}`, change.property].join('\u0000');
}

function canonicalInspectorUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('__viewport_parade_refresh');
    // Fragments only point to a place inside the same document. They must not
    // make a local edit look like it belongs to another preview.
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

function recordInspectorChange(change) {
  if (!change || typeof change.selector !== 'string' || typeof change.property !== 'string') return;
  const viewport = change.viewport || {};
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) return;
  const normalized = {
    url: canonicalInspectorUrl(typeof change.url === 'string' ? change.url : targetUrl),
    selector: change.selector,
    property: change.property,
    from: String(change.from ?? ''),
    to: String(change.to ?? ''),
    sourceHint: change.sourceHint && typeof change.sourceHint === 'object' ? change.sourceHint : undefined,
    newDeclaration: change.newDeclaration === true,
    // The HTML width or height attribute the size had before.
    ...(change.htmlAttribute && typeof change.htmlAttribute === 'object'
      ? { htmlAttribute: { name: String(change.htmlAttribute.name), value: String(change.htmlAttribute.value) } }
      : {}),
    viewport: { width: Math.round(viewport.width), height: Math.round(viewport.height) },
    route: typeof change.route === 'string' ? change.route : '/',
    element: change.element && typeof change.element === 'object' ? change.element : null,
    // Text with no element in the source: the span the agent adds around it.
    ...(change.wrapText && typeof change.wrapText === 'object' ? { wrapText: change.wrapText } : {}),
    // The tab, open menu or state (Hover) the edit was made in.
    ...(Array.isArray(change.steps) && change.steps.length ? { steps: change.steps } : {}),
    // An image that had no alt attribute, not an empty one.
    ...(change.fromMissing === true ? { fromMissing: true } : {}),
    ...(typeof change.workspace === 'string' ? { workspace: change.workspace } : {}),
    ...(change.device ? { device: String(change.device) } : {})
  };
  const key = changeKey(normalized);
  const existing = changeLog.get(key);
  // An empty alt is a value of its own (a decorative image), not a dropped edit.
  const emptyIsValue = normalized.property === 'alt';
  // No alt and an empty one both read as '', but they differ.
  const unchanged = (entry) => entry.from === entry.to && !entry.fromMissing;
  // An empty value means the override was dropped: the page is as it was.
  // So does a revert, the way alt text is reset.
  if (existing) {
    existing.to = normalized.to;
    if (change.revert === true || unchanged(existing) || (normalized.to === '' && !emptyIsValue)) changeLog.delete(key);
  } else if (change.revert !== true && !unchanged(normalized) && (normalized.to !== '' || emptyIsValue)) {
    changeLog.set(key, normalized);
    trackProductEvent('inspector_edit_created');
  }
  syncChangeUi();
}

function syncChangeUi() {
  saveChanges();
  syncChangeNotes();
  agentsHandoffButton.classList.toggle('has-handoff', hasAgentHandoff());
  const shown = siteComments().length;
  commentsCount.hidden = shown === 0;
  commentsCount.textContent = String(shown);
  commentsToggle.classList.toggle('has-comments', shown > 0);
  syncApplyButtons();
}

function reconcilePendingChanges(card) {
  const iframe = card.querySelector('iframe');
  if (!iframe?.contentWindow || card.classList.contains('is-embed-blocked')) return;
  const changes = [...changesForViewport(card), ...contentChangesForPage(card)];
  if (!changes.length) return;

  // A freshly loaded application can still be committing its first render when
  // the content script announces itself. Keep this short, one-shot delay rather
  // than polling: an uncertain result stays pending and is never discarded.
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  card.dataset.reconciliationRequest = requestId;
  setTimeout(() => {
    if (!card.isConnected || card.dataset.reconciliationRequest !== requestId) return;
    iframe.contentWindow?.postMessage({
      source: 'viewport-parade',
      type: 'reconcile-pending-changes',
      requestId,
      changes: changes.map((change) => ({
        key: changeKey(change),
        property: change.property,
        after: change.to,
        element: change.element,
        selector: change.selector
      }))
    }, '*');
  }, 420);
}

// Drops recorded edits and takes them off every preview that shows them:
// style edits at their page and size, text edits at every width of their page.
function revertChanges(changes) {
  changes.forEach((change) => changeLog.delete(changeKey(change)));
  document.querySelectorAll('.viewport-card').forEach((card) => {
    const pageUrl = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
    const size = { width: Number(card.dataset.viewportWidth), height: Number(card.dataset.viewportHeight) };
    const shown = changes.filter((change) => canonicalInspectorUrl(change.url) === pageUrl && (isContentChange(change) || sameViewportSize(change.viewport, size)));
    if (!shown.length) return;
    card.querySelector('iframe')?.contentWindow?.postMessage({
      source: 'viewport-parade',
      type: 'reset-recorded-changes',
      changes: shown.map(recordedChangeMessage)
    }, '*');
  });
  syncChangeUi();
}

// What a preview needs to apply a recorded change, or to undo it. A text
// change is found again by its element and undone to its old text.
function recordedChangeMessage(change) {
  return {
    selector: change.selector,
    property: change.property,
    value: change.to,
    ...(change.wrapText ? { wrapText: change.wrapText } : {}),
    ...(isContentChange(change) ? { element: change.element, from: change.from } : {}),
    // Alt text given back to an image that had none takes the attribute away.
    ...(change.fromMissing ? { fromMissing: true } : {}),
    ...(change.toMissing ? { toMissing: true } : {})
  };
}

// Text and alt text are the same at every width: their changes on this page,
// made in any preview, apply here too.
function contentChangesForPage(card) {
  const pageUrl = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
  return activeChanges().filter((change) => isContentChange(change) && canonicalInspectorUrl(change.url) === pageUrl);
}

// The edits already made for this page and size, back in a preview that
// loaded again (after a workspace switch, a refresh or a link).
function applyRecordedChanges(card) {
  const changes = [...changesForViewport(card), ...contentChangesForPage(card)];
  if (!changes.length) return;
  card.querySelector('iframe')?.contentWindow?.postMessage({
    source: 'viewport-parade',
    type: 'apply-recorded-changes',
    changes: changes.map(recordedChangeMessage)
  }, '*');
}

// A text or alt edit made in one preview shows in the others of the same
// page at once, and so does its return to the old value.
function syncContentChange(fromCard, change) {
  const pageUrl = canonicalInspectorUrl(fromCard.dataset.loadedUrl || targetUrl);
  document.querySelectorAll('.viewport-card').forEach((card) => {
    if (card === fromCard || canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl) !== pageUrl) return;
    card.querySelector('iframe')?.contentWindow?.postMessage({
      source: 'viewport-parade',
      type: 'apply-recorded-changes',
      changes: [recordedChangeMessage(change)]
    }, '*');
  });
}

// Style changes made at this preview's size; text changes are not CSS (a
// local file gets no text from here).
function changesForViewport(card) {
  const width = Number(card.dataset.viewportWidth);
  const height = Number(card.dataset.viewportHeight);
  const pageUrl = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
  return activeChanges().filter((change) => (
    !isContentChange(change)
    && canonicalInspectorUrl(change.url) === pageUrl
    && change.viewport.width === width
    && change.viewport.height === height
    // These selectors identify temporary nodes that exist only inside Studio;
    // wrapped text is the exception, as the page wraps the same text again.
    && (change.wrapText || !change.selector.includes('data-viewport-parade-'))
  ));
}

function syncApplyButtons() {
  document.querySelectorAll('.viewport-card').forEach((card) => {
    const button = card.querySelector('.apply-button');
    if (!button) return;
    const hasChanges = changesForViewport(card).length > 0;
    const available = hasChanges;
    button.hidden = !hasChanges;
    button.disabled = !available;
    button.title = available
      ? 'Apply changes to source file'
      : 'No changes for this viewport';
  });
}

// The rules an earlier Apply wrote to the file's overrides block. An edit
// the source already shows leaves the change log on the next load, so these
// rules are the only record of it and must survive the next Apply.
function savedOverrideRules(html) {
  const rules = new Map();
  const block = String(html).match(/<style id="viewport-parade-overrides">([\s\S]*?)<\/style>/i)?.[1] || '';
  for (const [, selector, body] of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // A rule the browser rejects (an older "body > ") never applied.
    if (!CSS.supports(`selector(${selector.trim()})`)) continue;
    const declarations = rules.get(selector.trim()) || new Map();
    // One declaration per line, as cssOverridesFor writes them: a ; inside
    // a value (a data: URL) doesn't end it.
    body.split(/;[ \t]*(?:\r?\n|$)/).forEach((declaration) => {
      const colon = declaration.indexOf(':');
      if (colon < 0) return;
      const property = declaration.slice(0, colon).trim();
      const value = declaration.slice(colon + 1).replace(/!important/i, '').trim();
      if (property && value) declarations.set(property, value);
    });
    if (declarations.size) rules.set(selector.trim(), declarations);
  }
  return rules;
}

function cssOverridesFor(changes, rules = new Map()) {
  changes.forEach((change) => {
    const declarations = rules.get(change.selector) || new Map();
    if (change.to) declarations.set(change.property, change.to);
    else declarations.delete(change.property);
    if (declarations.size) rules.set(change.selector, declarations);
    else rules.delete(change.selector);
  });
  return [...rules].map(([selector, declarations]) => (
    `${selector} {\n${[...declarations].map(([property, value]) => `  ${property}: ${value} !important;`).join('\n')}\n}`
  )).join('\n\n');
}

function insertOverrides(html, css) {
  const start = '<!-- viewport-parade-overrides:start -->';
  const end = '<!-- viewport-parade-overrides:end -->';
  const block = `${start}\n<style id="viewport-parade-overrides">\n${css}\n</style>\n${end}`;
  const existing = /<!-- viewport-parade-overrides:start -->[\s\S]*?<!-- viewport-parade-overrides:end -->/i;
  if (existing.test(html)) return html.replace(existing, block);
  return /<\/head\s*>/i.test(html)
    ? html.replace(/<\/head\s*>/i, `${block}\n</head>`)
    : `${html}\n${block}\n`;
}

async function applyChangesToFile(card) {
  const button = card.querySelector('.apply-button');
  const changes = changesForViewport(card);
  if (!changes.length) return;
  if (!window.showOpenFilePicker) {
    notify('Your Chrome version does not support writing to the selected file', 'error');
    return;
  }
  button.disabled = true;
  try {
    const targetName = decodeURIComponent(new URL(targetUrl).pathname.split('/').pop() || '');
    const expectedName = /\.html?$/i.test(targetName) ? targetName : '';
    if (!localFileHandle) {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Website HTML file', accept: { 'text/html': ['.html', '.htm'] } }]
      });
      if (expectedName && handle.name !== expectedName) throw new Error(`Select the source file “${expectedName}”`);
      localFileHandle = handle;
    }
    if (await localFileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
      throw new Error('Permission to write to the file was not granted');
    }
    const file = await localFileHandle.getFile();
    const html = await file.text();
    const css = cssOverridesFor(changes, savedOverrideRules(html));
    if (!css) throw new Error('There are no changes to write to CSS');
    const writable = await localFileHandle.createWritable();
    await writable.write(insertOverrides(html, css));
    await writable.close();
    notify(`Changes applied to ${file.name}`, 'success');
  } catch (error) {
    if (error.name !== 'AbortError') notify(`Unable to apply changes: ${error.message}`, 'error');
  } finally {
    syncApplyButtons();
  }
}
