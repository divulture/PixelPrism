const DEVICES = {
  phone: { name: 'Phone', width: 390, height: 844 },
  phoneWide: { name: 'Phone L', width: 568, height: 740 },
  tablet: { name: 'Tablet', width: 768, height: 1024 },
  laptop: { name: 'Laptop', width: 1024, height: 820 },
  desktop: { name: 'Desktop', width: 1440, height: 900 }
};

const params = new URLSearchParams(location.search);
const form = document.querySelector('#address-form');
const urlInput = document.querySelector('#page-url');
const addressDisplay = document.querySelector('#address-display');
const grid = document.querySelector('#viewport-grid');
const emptyState = document.querySelector('#empty-state');
const template = document.querySelector('#viewport-template');
const status = document.querySelector('#status');
const toast = document.querySelector('#toast');
const notice = document.querySelector('#embed-notice');
const zoomValue = document.querySelector('#zoom-value');
const devicePicker = document.querySelector('.device-picker');
const customDialog = document.querySelector('#custom-dialog');
const customForm = document.querySelector('#custom-form');
const favicon = document.querySelector('#site-favicon');
const customPreset = document.querySelector('#custom-preset');
const customWidth = document.querySelector('#custom-width');
const customHeight = document.querySelector('#custom-height');
const customTrigger = document.querySelector('#custom-trigger');
const changeReportButton = document.querySelector('#change-report-button');
const copyCodexButton = document.querySelector('#copy-codex-button');
const handoffFab = document.querySelector('#handoff-fab');
const handoffFabToggle = document.querySelector('#handoff-fab-toggle');
const handoffFabMenu = document.querySelector('#handoff-fab-menu');
const handoffFabClose = document.querySelector('#handoff-fab-close');
const inspectorPanel = document.querySelector('#inspector-panel');
const inspectorPanelTitle = document.querySelector('#inspector-title');
const inspectorPanelSelector = document.querySelector('#inspector-selector');
const inspectorPanelFields = document.querySelector('#inspector-panel-fields');
const inspectorPanelClose = document.querySelector('#inspector-panel-close');
const cursorToggle = document.querySelector('#cursor-toggle');
const inspectorToggle = document.querySelector('#inspector-toggle');
const layersToggle = document.querySelector('#layers-toggle');
const layersPanel = document.querySelector('#layers-panel');
const layersPanelClose = document.querySelector('#layers-panel-close');
const layersTree = document.querySelector('#layers-tree');
const layersEmpty = document.querySelector('#layers-empty');
const layersViewport = document.querySelector('#layers-viewport');
const commentsToggle = document.querySelector('#comments-toggle');
const commentsPanel = document.querySelector('#comments-panel');
const commentsPanelClose = document.querySelector('#comments-panel-close');
const commentsForm = document.querySelector('#comments-form');
const commentInput = document.querySelector('#comment-input');
const commentsContext = document.querySelector('#comments-context');
const commentsList = document.querySelector('#comments-list');
const commentsEmpty = document.querySelector('#comments-empty');
const commentsCount = document.querySelector('#comments-count');

let targetUrl = normalizeUrl(params.get('url') || '');
let fileAccessAllowed = params.get('fileAccess') !== 'false';
let selected = new Set(['laptop']);
let mode = 'multi';
let zoom = 1;
let singleWidth = DEVICES.laptop.width;
let customDeviceCount = 0;
let dragState = null;
let faviconCandidates = [];
let toastTimer;
let inspectorFrame;
let inspectorModeActive = false;
let layersFrame;
let layersTreeData;
let selectedLayerPath;
let hoveredLayerPath;
const expandedLayerPaths = new Set();
const collapsedLayerPaths = new Set();
const changeLog = new Map();
const comments = [];
let commentSelection;
const commentPickerFrames = new Set();
let localFileHandle;
const hasExtensionRuntime = Boolean(window.chrome?.runtime?.id);


const MAIN_BREAKPOINTS = [
  { width: 320, label: 'Phone · iPhone SE' },
  { width: 390, label: 'Phone · iPhone 14' },
  { width: 568, label: 'Phone L · landscape' },
  { width: 768, label: 'Tablet · iPad' },
  { width: 1024, label: 'Laptop · iPad landscape' },
  { width: 1440, label: 'Desktop · desktop' }
];

const CUSTOM_PRESETS = {
  hd: { width: 1280, height: 720 },
  fhd: { width: 1920, height: 1080 },
  qhd: { width: 2560, height: 1440 },
  uhd: { width: 3840, height: 2160 }
};

const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 320;
const INSPECTOR_PROTOCOL_VERSION = 3;

const INSPECTOR_FIELDS = {
  size: [['width', 'W', 'text'], ['height', 'H', 'text'], ['minWidth', 'Min width', 'text'], ['maxWidth', 'Max width', 'text'], ['minHeight', 'Min height', 'text'], ['maxHeight', 'Max height', 'text']],
  margin: [['marginTop', 'M top', 'number'], ['marginRight', 'M right', 'number'], ['marginBottom', 'M bottom', 'number'], ['marginLeft', 'M left', 'number']],
  padding: [['paddingTop', 'P top', 'number'], ['paddingRight', 'P right', 'number'], ['paddingBottom', 'P bottom', 'number'], ['paddingLeft', 'P left', 'number']],
  gap: [['rowGap', 'Gap row', 'number'], ['columnGap', 'Gap col', 'number']],
  component: [
    ['display', 'Display', 'select', true, null, [['block', 'Block'], ['flex', 'Flex'], ['grid', 'Grid']]],
    ['flexDirection', 'Direction', 'select', null, 'flex', [['row', 'Row'], ['column', 'Column'], ['row-reverse', 'Row reverse'], ['column-reverse', 'Column reverse']]],
    ['flexWrap', 'Wrap', 'select', null, 'flex', [['nowrap', 'No wrap'], ['wrap', 'Wrap'], ['wrap-reverse', 'Wrap reverse']]],
    ['justifyContent', 'Justify content', 'select', null, 'flex', [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['space-between', 'Space between'], ['space-around', 'Space around'], ['space-evenly', 'Space evenly']]],
    ['alignItems', 'Align items', 'select', null, 'flex-grid', [['stretch', 'Stretch'], ['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['baseline', 'Baseline']]],
    ['alignContent', 'Align content', 'select', null, 'flex-grid', [['normal', 'Normal'], ['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['space-between', 'Space between'], ['space-around', 'Space around'], ['stretch', 'Stretch']]],
    ['flexGrow', 'Grow', 'number', null, 'flex'], ['flexShrink', 'Shrink', 'number', null, 'flex'], ['flexBasis', 'Basis', 'text', null, 'flex'], ['alignSelf', 'Align self', 'select', null, 'flex-grid', [['auto', 'Auto'], ['stretch', 'Stretch'], ['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['baseline', 'Baseline']]], ['order', 'Order', 'number', null, 'flex-grid'],
    ['gridTemplateColumns', 'Columns', 'text', true, 'grid'], ['gridTemplateRows', 'Rows', 'text', true, 'grid'], ['gridAutoColumns', 'Auto columns', 'text', true, 'grid'], ['gridAutoRows', 'Auto rows', 'text', true, 'grid'],
    ['gridAutoFlow', 'Auto flow', 'select', null, 'grid', [['row', 'Row'], ['column', 'Column'], ['row dense', 'Row dense'], ['column dense', 'Column dense']]],
    ['justifyItems', 'Justify items', 'select', null, 'grid', [['stretch', 'Stretch'], ['start', 'Start'], ['center', 'Center'], ['end', 'End']]],
    ['gridColumn', 'Column placement', 'text', true, 'grid'], ['gridRow', 'Row placement', 'text', true, 'grid'],
    ['rowGap', 'Gap row', 'number', null, 'flex-grid'], ['columnGap', 'Gap col', 'number', null, 'flex-grid'],
    ['width', 'W', 'text'], ['height', 'H', 'text'], ['minWidth', 'Min width', 'text'], ['maxWidth', 'Max width', 'text'], ['minHeight', 'Min height', 'text'], ['maxHeight', 'Max height', 'text'], ['marginTop', 'M top', 'number'], ['marginRight', 'M right', 'number'], ['marginBottom', 'M bottom', 'number'], ['marginLeft', 'M left', 'number'], ['paddingTop', 'P top', 'number'], ['paddingRight', 'P right', 'number'], ['paddingBottom', 'P bottom', 'number'], ['paddingLeft', 'P left', 'number'],
    ['backgroundColor', 'Background', 'text', true], ['color', 'Text color', 'text'], ['opacity', 'Opacity', 'number'], ['borderWidth', 'Border width', 'number'], ['borderStyle', 'Border style', 'select', null, null, [['none', 'None'], ['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']]], ['borderColor', 'Border color', 'text'], ['borderRadius', 'Radius', 'number'], ['boxShadow', 'Box shadow', 'text', true],
    ['fontFamily', 'Font family', 'text', true], ['fontStyle', 'Style', 'text'], ['fontSize', 'Size', 'number'], ['fontWeight', 'Weight', 'number'], ['fontStretch', 'Stretch', 'text'], ['lineHeight', 'Line height', 'text'], ['letterSpacing', 'Letter spacing', 'text'], ['wordSpacing', 'Word space', 'text'], ['textTransform', 'Transform', 'text'], ['textDecorationLine', 'Decoration', 'text'], ['textAlign', 'Align', 'text'], ['textIndent', 'Indent', 'number'], ['fontVariationSettings', 'Font variation', 'text', true], ['fontFeatureSettings', 'Font features', 'text', true]
  ],
  typography: [['fontFamily', 'Font family', 'text', true], ['fontStyle', 'Style', 'text'], ['fontSize', 'Size', 'number'], ['fontWeight', 'Weight', 'number'], ['fontStretch', 'Stretch', 'text'], ['lineHeight', 'Line height', 'text'], ['letterSpacing', 'Letter spacing', 'text'], ['wordSpacing', 'Word space', 'text'], ['textTransform', 'Transform', 'text'], ['textDecorationLine', 'Decoration', 'text'], ['textAlign', 'Align', 'text'], ['textIndent', 'Indent', 'number'], ['fontVariationSettings', 'Font variation', 'text', true], ['fontFeatureSettings', 'Font features', 'text', true], ['width', 'W', 'text'], ['height', 'H', 'text'], ['minWidth', 'Min width', 'text'], ['maxWidth', 'Max width', 'text'], ['minHeight', 'Min height', 'text'], ['maxHeight', 'Max height', 'text'], ['marginTop', 'M top', 'number'], ['marginRight', 'M right', 'number'], ['marginBottom', 'M bottom', 'number'], ['marginLeft', 'M left', 'number'], ['paddingTop', 'P top', 'number'], ['paddingRight', 'P right', 'number'], ['paddingBottom', 'P bottom', 'number'], ['paddingLeft', 'P left', 'number']]
};

urlInput.value = targetUrl;


function fallbackFavicon(url) {
  try {
    if (new URL(url).protocol === 'file:') return '';
    return new URL('/favicon.ico', url).href;
  } catch {
    return '';
  }
}

function googleFavicon(url) {
  try {
    if (new URL(url).protocol === 'file:') return '';
    return `https://www.google.com/s2/favicons?sz=32&domain_url=${encodeURIComponent(new URL(url).origin)}`;
  } catch {
    return '';
  }
}

function setFavicon(url) {
  document.body.dataset.hasUrl = String(Boolean(targetUrl));
  const hasUrl = Boolean(targetUrl);
  addressDisplay.hidden = !hasUrl;
  urlInput.hidden = hasUrl;
  if (hasUrl) addressDisplay.textContent = displayAddress(targetUrl);
  faviconCandidates = [url, fallbackFavicon(targetUrl), googleFavicon(targetUrl)].filter(Boolean);
  const src = faviconCandidates.shift();
  if (src) {
    favicon.src = src;
    favicon.hidden = false;
  } else {
    favicon.removeAttribute('src');
    favicon.hidden = true;
  }
}

function displayAddress(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return decodeURIComponent(parsed.pathname);
    return parsed.hostname;
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  }
}

favicon.addEventListener('error', () => {
  const next = faviconCandidates.shift();
  if (next) {
    favicon.src = next;
    favicon.hidden = false;
  } else {
    favicon.removeAttribute('src');
    favicon.hidden = true;
  }
});

setFavicon(params.get('favicon'));

addressDisplay.addEventListener('click', () => {
  addressDisplay.hidden = true;
  urlInput.hidden = false;
  urlInput.focus();
  urlInput.select();
});
urlInput.addEventListener('blur', () => {
  window.setTimeout(() => {
    if (!targetUrl || document.activeElement === urlInput) return;
    urlInput.value = targetUrl;
    urlInput.hidden = true;
    addressDisplay.hidden = false;
  }, 0);
});

function normalizeUrl(value) {
  const candidate = value.trim();
  if (!candidate) return '';
  if (candidate.startsWith('/')) return new URL(candidate, 'file:///').href;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:', 'file:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return /^[a-z][a-z\d+.-]*:/i.test(candidate) ? '' : `https://${candidate}`;
  }
}

function isLocalFileUrl(url) {
  try {
    return new URL(url).protocol === 'file:';
  } catch {
    return false;
  }
}

function showFileAccessNotice() {
  notice.querySelector('p').textContent = 'To preview a local project, enable “Allow access to file URLs”: right-click the extension icon → Manage extension.';
  notice.hidden = false;
}

function showPreviewError(card, heading, message) {
  const iframe = card.querySelector('iframe');
  const blockedMessage = card.querySelector('.embed-blocked');
  iframe.hidden = true;
  card.classList.add('is-embed-blocked');
  blockedMessage.querySelector('h2').textContent = heading;
  blockedMessage.querySelector('p').textContent = message;
  blockedMessage.hidden = false;
}

function waitForLocalPreview(card) {
  if (!isLocalFileUrl(targetUrl)) return;
  card.dataset.previewReady = 'false';
  clearTimeout(card.previewReadyTimer);
  card.previewReadyTimer = setTimeout(() => {
    if (card.dataset.previewReady === 'true') return;
    showPreviewError(
      card,
      'Local page did not open',
      'Reload the extension at chrome://extensions and enable “Allow access to file URLs.” Then open the page again.'
    );
    showFileAccessNotice();
  }, 2200);
}

async function checkFileSchemeAccess() {
  if (!isLocalFileUrl(targetUrl) || !window.chrome?.runtime?.sendMessage) return;
  const wasAllowed = fileAccessAllowed;
  try {
    const result = await window.chrome.runtime.sendMessage({ type: 'file-scheme-access' });
    fileAccessAllowed = result?.ok && result.allowed === true;
  } catch {
    fileAccessAllowed = false;
  }
  if (!fileAccessAllowed) showFileAccessNotice();
  if (wasAllowed !== fileAccessAllowed) render();
}

function openPreviewUrl(value, confirmExternal = false) {
  const nextUrl = normalizeUrl(value);
  if (!nextUrl) return;
  const external = targetUrl && targetUrl !== nextUrl && (new URL(nextUrl).origin !== new URL(targetUrl).origin || isLocalFileUrl(nextUrl));
  if (confirmExternal && external && !window.confirm(`Open ${displayAddress(nextUrl)} in every viewport?\n\nLocal inspector changes will be reset.`)) return;
  if (targetUrl !== nextUrl) localFileHandle = undefined;
  targetUrl = nextUrl;
  fileAccessAllowed = true;
  urlInput.value = targetUrl;
  setFavicon();
  const next = new URL(location.href);
  next.searchParams.set('url', targetUrl);
  history.replaceState({}, '', next);
  notice.hidden = false;
  speak('Loading the page in the selected viewports.');
  render();
  checkFileSchemeAccess();
}

function isEmbedBlocked(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com') || host === 'linkedin.com' || host.endsWith('.linkedin.com');
  } catch {
    return false;
  }
}

function deviceEntries() {
  return [...selected].map((id) => ({ id, ...DEVICES[id] })).sort((a, b) => a.width - b.width);
}

function speak(message) {
  status.textContent = '';
  requestAnimationFrame(() => { status.textContent = message; });
}

function notify(message, tone = 'default') {
  speak(message);
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
}

function escapeInlineCode(value) {
  return String(value).replace(/`/g, '\\`');
}

function changeKey(change) {
  return [change.url, change.viewport.width, change.viewport.height, change.element?.domPath || change.selector, change.property].join('\u0000');
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
    viewport: { width: Math.round(viewport.width), height: Math.round(viewport.height) },
    route: typeof change.route === 'string' ? change.route : '/',
    element: change.element && typeof change.element === 'object' ? change.element : null
  };
  const key = changeKey(normalized);
  const existing = changeLog.get(key);
  if (existing) {
    existing.to = normalized.to;
    if (existing.from === existing.to) changeLog.delete(key);
  } else if (normalized.from !== normalized.to) {
    changeLog.set(key, normalized);
  }
  syncChangeUi();
}

function syncChangeUi() {
  const pendingCount = changeLog.size + comments.length;
  handoffFab.hidden = pendingCount === 0;
  if (pendingCount === 0) setHandoffFabOpen(false);
  commentsCount.hidden = comments.length === 0;
  commentsCount.textContent = String(comments.length);
  commentsToggle.classList.toggle('has-comments', comments.length > 0);
  syncApplyButtons();
}

function activeCommentContext() {
  if (!commentSelection?.frame?.isConnected) return null;
  const card = cardForFrame(commentSelection.frame.contentWindow);
  if (!card) return null;
  return { url: canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl), route: commentSelection.route || '/', viewport: { width: Number(card.dataset.viewportWidth), height: Number(card.dataset.viewportHeight) }, element: commentSelection.element };
}

function renderComments() {
  const context = activeCommentContext();
  commentsContext.textContent = context?.element?.selector ? `Selected: ${context.element.selector}` : 'Page instruction for the active viewport';
  commentsList.replaceChildren(...comments.map((comment, index) => {
    const item = document.createElement('li');
    item.className = 'comment-item';
    const text = document.createElement('p');
    text.textContent = comment.comment;
    const meta = document.createElement('small');
    meta.textContent = comment.element?.selector ? `${comment.element.selector} · ${comment.viewport.width} × ${comment.viewport.height}` : `Page · ${comment.viewport.width} × ${comment.viewport.height}`;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'comment-remove tooltip-trigger'; remove.dataset.commentIndex = String(index);
    remove.setAttribute('aria-label', `Delete comment ${index + 1}`);
    remove.dataset.tooltip = 'Delete comment';
    remove.innerHTML = window.phosphorIcon('trash');
    item.append(text, meta, remove);
    return item;
  }));
  commentsEmpty.hidden = comments.length > 0;
}

function setCommentPicker(enabled) {
  if (!hasExtensionRuntime) return;
  if (enabled) {
    document.querySelectorAll('.viewport-card iframe').forEach((frame) => {
      const card = frame.closest('.viewport-card');
      if (!frame.contentWindow || card?.dataset.previewReady !== 'true' || commentPickerFrames.has(frame)) return;
      frame.contentWindow.postMessage({ source: 'viewport-parade', type: 'toggle-comment-picker', enabled: true }, '*');
      commentPickerFrames.add(frame);
    });
    speak('Select an element in any preview to attach the comment.');
  } else {
    commentPickerFrames.forEach((frame) => {
      frame.contentWindow?.postMessage({ source: 'viewport-parade', type: 'toggle-comment-picker', enabled: false }, '*');
    });
    commentPickerFrames.clear();
  }
}

function setCommentsOpen(open) {
  if (open) {
    setCursorModeActive(false);
    setLayersOpen(false);
    setInspectorMode(false);
  }
  commentsPanel.hidden = !open;
  commentsToggle.setAttribute('aria-pressed', String(open));
  if (open) { renderComments(); setCommentPicker(true); }
  else setCommentPicker(false);
}

function addComment(rawComment) {
  const comment = rawComment.trim();
  if (!comment) return;
  const context = activeCommentContext();
  const activeCard = cardForFrame(layersFrame) || document.querySelector('.viewport-card');
  const viewport = context?.viewport || (activeCard ? { width: Number(activeCard.dataset.viewportWidth), height: Number(activeCard.dataset.viewportHeight) } : { width: window.innerWidth, height: window.innerHeight });
  comments.push({ type: 'comment', url: context?.url || canonicalInspectorUrl(activeCard?.dataset.loadedUrl || targetUrl), route: context?.route || '/', viewport, ...(context?.element ? { element: context.element } : {}), comment });
  commentInput.value = '';
  renderComments(); syncChangeUi(); notify('Comment added to the pending handoff.', 'success');
}

function reconcilePendingChanges(card) {
  const iframe = card.querySelector('iframe');
  if (!iframe?.contentWindow || card.classList.contains('is-embed-blocked')) return;
  const changes = changesForViewport(card);
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

function changesForViewport(card) {
  const width = Number(card.dataset.viewportWidth);
  const height = Number(card.dataset.viewportHeight);
  const pageUrl = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
  return [...changeLog.values()].filter((change) => (
    canonicalInspectorUrl(change.url) === pageUrl
    && change.viewport.width === width
    && change.viewport.height === height
    // These selectors identify temporary nodes that exist only inside Studio.
    && !change.selector.includes('data-viewport-parade-')
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

function cssOverridesFor(changes) {
  const rules = new Map();
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
    notify('Your Chrome version does not support writing to the selected file.', 'error');
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
      if (expectedName && handle.name !== expectedName) throw new Error(`Select the source file “${expectedName}”.`);
      localFileHandle = handle;
    }
    if (await localFileHandle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
      throw new Error('Permission to write to the file was not granted.');
    }
    const file = await localFileHandle.getFile();
    const css = cssOverridesFor(changes);
    if (!css) throw new Error('There are no changes to write to CSS.');
    const writable = await localFileHandle.createWritable();
    await writable.write(insertOverrides(await file.text(), css));
    await writable.close();
    notify(`Changes applied to ${file.name}.`, 'success');
  } catch (error) {
    if (error.name !== 'AbortError') notify(`Unable to apply changes: ${error.message}`, 'error');
  } finally {
    syncApplyButtons();
  }
}

function formatChangeReport() {
  const createdAt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date());
  const byPage = new Map();
  changeLog.forEach((change) => {
    const page = byPage.get(change.url) || new Map();
    const viewportKey = `${change.viewport.width} × ${change.viewport.height}`;
    const viewportChanges = page.get(viewportKey) || [];
    viewportChanges.push(change);
    page.set(viewportKey, viewportChanges);
    byPage.set(change.url, page);
  });
  const viewportCount = [...byPage.values()].reduce((count, viewports) => count + viewports.size, 0);
  const lines = [
    '# PixelPrism — Changes report',
    '',
    `Created: ${createdAt}`,
    `Style changes: ${changeLog.size}`,
    `Comments: ${comments.length}`,
    `Viewports: ${viewportCount}`,
    '',
    'This file contains every saved inspector change across all pages and viewports in this session.'
  ];
  [...byPage.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([url, viewports]) => {
    lines.push('', '## Page', `<${url}>`);
    [...viewports.entries()].sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true })).forEach(([viewport, changes]) => {
      lines.push('', `### Viewport: ${viewport}`);
      const bySelector = new Map();
      changes.forEach((change) => {
        const properties = bySelector.get(change.selector) || [];
        properties.push(change);
        bySelector.set(change.selector, properties);
      });
      [...bySelector.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([selector, properties]) => {
        lines.push('', `- \`${escapeInlineCode(selector)}\``);
        properties.forEach((change) => {
          const from = change.from || 'removed';
          const to = change.to || 'removed';
          lines.push(`  - \`${escapeInlineCode(change.property)}\`: \`${escapeInlineCode(from)}\` → \`${escapeInlineCode(to)}\``);
        });
      });
    });
  });
  if (comments.length) {
    lines.push('', '## Comments');
    comments.forEach((comment) => {
      const target = comment.element?.selector ? ` · \`${escapeInlineCode(comment.element.selector)}\`` : ' · page-level';
      lines.push(`- ${comment.comment} (${comment.viewport.width} × ${comment.viewport.height}${target})`);
    });
  }
  return `${lines.join('\n')}\n`;
}

function reportFilename() {
  const now = new Date();
  const part = (value) => String(value).padStart(2, '0');
  return `pixelprism-changes-${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}.md`;
}

const CODEX_INSTRUCTION = 'Apply the visual changes from PixelPrism to the current source repository. PixelPrism values are visual targets, not instructions to hardcode pixels, colors, or font sizes. For every changed property: (1) locate the rendered element using route, DOM context, text, attributes, selector, surrounding markup, and parent context; (2) trace the current rendered value to its declaration and abstraction chain before editing: CSS custom property, design token/theme, parent/theme variable scope, Tailwind utility/config, preprocessor variable, mixin/helper, component prop, variant/state, shared component style, then local CSS/inline style only when truly local; (3) determine whether intent is global, component, variant, instance, or viewport/breakpoint, including responsive utilities, media/container queries, and responsive props; (4) reuse an existing appropriate token, utility, prop, variant, or scoped variable. Never replace an existing CSS variable, design token, theme value, component prop, Tailwind utility, or shared abstraction with a hardcoded value without evidence it is local. Before changing a token, inspect its usages: change it only for demonstrated global intent; otherwise use the narrowest existing abstraction. Do not create a token for a one-off unless it is semantically reusable and consistent with project conventions. sourceHint is optional browser evidence, not authoritative; verify it in source. Preserve the project’s styling architecture (Tailwind, CSS Modules, SCSS, styled-components, CSS variables, themes, or design system) and make the smallest source-level change. Apply only final beforeComputed/afterComputed values. Do not add generated CSS overrides, framework adapters, MCP, AST infrastructure, or unrelated refactors; report genuinely ambiguous matches rather than guessing.';

function codexChangeSet() {
  const groups = new Map();
  [...changeLog.values()].forEach((change) => {
    const element = change.element || {};
    const key = [change.url, change.route, change.viewport.width, change.viewport.height, element.domPath || change.selector].join('\u0000');
    let group = groups.get(key);
    if (!group) {
      const { parent, ...elementDetails } = element;
      group = {
        route: change.route || '/',
        pageUrl: change.url,
        viewport: change.viewport,
        element: {
          tag: elementDetails.tag || null,
          id: elementDetails.id || null,
          classes: elementDetails.classes || [],
          selector: elementDetails.selector || change.selector,
          domPath: elementDetails.domPath || null,
          text: elementDetails.text || '',
          attributes: elementDetails.attributes || {},
          htmlSnippet: elementDetails.htmlSnippet || ''
        },
        parent: parent || null,
        changes: []
      };
      groups.set(key, group);
    }
    group.changes.push({
      property: change.property,
      before: change.from,
      after: change.to,
      // The old names stay intact for existing consumers; the computed names
      // make their browser-side meaning explicit for source-tracing agents.
      beforeComputed: change.from,
      afterComputed: change.to,
      ...(change.sourceHint ? { sourceHint: change.sourceHint } : {})
    });
  });
  return [...groups.values()];
}

function codexHandoff() {
  return {
    source: 'PixelPrism',
    version: 2,
    instruction: CODEX_INSTRUCTION,
    changeSet: codexChangeSet(),
    comments: comments.map((comment) => ({ ...comment }))
  };
}

async function copyForCodex() {
  if (!changeLog.size && !comments.length) return;
  const payload = JSON.stringify(codexHandoff(), null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    notify('Codex handoff copied to the clipboard.', 'success');
  } catch {
    const area = document.createElement('textarea');
    area.value = payload;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (copied) notify('Codex handoff copied to the clipboard.', 'success');
    else notify('Unable to copy the Codex handoff.', 'error');
  }
}

function setHandoffFabOpen(open) {
  handoffFabToggle.setAttribute('aria-expanded', String(open));
  handoffFabMenu.hidden = !open;
}

async function downloadChangeReport() {
  if (!changeLog.size) return;
  if (!window.chrome?.runtime?.sendMessage) {
    notify('Downloads are available after the extension is loaded in Chrome.', 'error');
    return;
  }
  changeReportButton.disabled = true;
  try {
    const result = await window.chrome.runtime.sendMessage({
      type: 'save-change-report',
      markdown: formatChangeReport(),
      filename: reportFilename()
    });
    if (!result?.ok) throw new Error(result?.error || 'Unable to save the file.');
    notify('The Markdown changes report was downloaded.', 'success');
  } catch (error) {
    notify(`Changes report was not saved: ${error.message}`, 'error');
  } finally {
    changeReportButton.disabled = false;
  }
}

function setSelected(id, forceSingle = false) {
  if (forceSingle) {
    selected = new Set([id]);
    mode = 'single';
    singleWidth = DEVICES[id].width;
  } else if (selected.has(id)) {
    if (selected.size === 1) {
      speak('At least one viewport must remain selected.');
      return;
    }
    selected.delete(id);
  } else {
    selected.add(id);
  }
  if (!forceSingle) mode = 'multi';
  render();
}

function cardScale(device, count) {
  return zoom;
}

function nearestBreakpoint(width) {
  return MAIN_BREAKPOINTS.reduce((nearest, candidate) =>
    Math.abs(candidate.width - width) < Math.abs(nearest.width - width) ? candidate : nearest
  );
}

function deviceGlyph(id, width) {
  if (id === 'phone' || width <= 450) return 'phone';
  if (id === 'phoneWide' || width <= 620) return 'phone-wide';
  if (id === 'tablet' || width <= 900) return 'tablet';
  if (id === 'laptop' || width <= 1200) return 'laptop';
  return 'desktop';
}

function deviceIcon(kind) {
  const icons = {
    phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path>',
    'phone-wide': '<g transform="rotate(90 12 12)"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path></g>',
    tablet: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path>',
    laptop: '<path d="M20 16V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10"></path><path d="M2 16h20"></path><path d="M6 20h12"></path>',
    desktop: '<rect width="20" height="14" x="2" y="3" rx="2"></rect><path d="M8 21h8"></path><path d="M12 17v4"></path>'
  };
  return `<svg class="device-icon" aria-hidden="true" viewBox="0 0 24 24">${icons[kind]}</svg>`;
}

function renderDevicePicker() {
  devicePicker.replaceChildren();
  Object.entries(DEVICES)
    .sort(([, a], [, b]) => a.width - b.width)
    .forEach(([id, device]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'device-button';
      button.dataset.device = id;
      const tooltip = `${device.name} ${device.width}`;
      button.dataset.tooltip = tooltip;
      button.setAttribute('aria-label', tooltip);
      button.setAttribute('aria-pressed', String(selected.has(id)));
      const customMark = id.startsWith('custom-') ? '<span class="device-custom-mark" aria-hidden="true">*</span>' : '';
      button.innerHTML = `${deviceIcon(deviceGlyph(id, device.width))}${customMark}`;
      if (selected.has(id)) button.classList.add('is-selected');
      devicePicker.append(button);
    });
}

function updateCardDimensions(card, device, width, height, scale) {
  const visualWidth = Math.round(width * scale);
  const visualHeight = Math.round(height * scale);
  card.style.setProperty('--frame-width', `${visualWidth}px`);
  card.dataset.viewportWidth = String(width);
  card.dataset.viewportHeight = String(height);
  const frame = card.querySelector('.viewport-frame');
  const scaleNode = card.querySelector('.viewport-scale');
  frame.style.height = `${visualHeight}px`;
  scaleNode.style.width = `${width}px`;
  scaleNode.style.height = `${height}px`;
  scaleNode.style.transform = `scale(${scale})`;
  card.querySelector('.viewport-size').textContent = `${width} × ${height}`;

  const nearest = nearestBreakpoint(width);
  const widthEdge = card.querySelector('.resize-edge');
  widthEdge?.setAttribute('aria-valuenow', String(width));
  widthEdge?.setAttribute('aria-valuetext', `${width} pixels`);
  const widthCallout = card.querySelector('.breakpoint-callout');
  if (widthCallout) {
    widthCallout.querySelector('strong').textContent = `${width} px`;
    widthCallout.querySelector('span').textContent = `Nearest: ${nearest.label} · ${nearest.width}px`;
  }

  const heightEdge = card.querySelector('.resize-bottom');
  heightEdge?.setAttribute('aria-valuenow', String(height));
  heightEdge?.setAttribute('aria-valuetext', `${height} pixels`);
  const heightCallout = card.querySelector('.height-callout');
  if (heightCallout) heightCallout.textContent = `${height}px height`;
}

function promoteResizedCard(card, { deviceId, restoreWidth, restoreHeight }) {
  const width = Number(card.dataset.viewportWidth);
  const height = Number(card.dataset.viewportHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;

  let customId = deviceId;
  if (!deviceId.startsWith('custom-')) {
    // A stock breakpoint is a preset. A manual resize must create a separate
    // Custom breakpoint rather than silently mutating Laptop/Tablet globally.
    DEVICES[deviceId].width = restoreWidth;
    DEVICES[deviceId].height = restoreHeight;
    customId = `custom-${++customDeviceCount}`;
    DEVICES[customId] = { name: 'Custom', width, height };
    selected = new Set([...selected].map((id) => (id === deviceId ? customId : id)));
    card.dataset.device = customId;
  } else {
    DEVICES[customId].width = width;
    DEVICES[customId].height = height;
  }

  if (mode === 'single') singleWidth = width;
  const custom = DEVICES[customId];
  card.querySelector('.viewport-name').textContent = custom.name;
  card.querySelector('iframe').title = `${custom.name}, ${width} pixels`;
  updateCardDimensions(card, custom, width, height, Number(card.dataset.scale) || zoom);
  renderDevicePicker();
}

function createResizeEdge() {
  const edge = document.createElement('div');
  edge.className = 'resize-edge';
  edge.setAttribute('role', 'slider');
  edge.tabIndex = 0;
  edge.setAttribute('aria-label', 'Resize viewport width');
  edge.setAttribute('aria-valuemin', String(MIN_VIEWPORT_WIDTH));
  edge.setAttribute('aria-valuemax', '100000');
  edge.innerHTML = '<div class="breakpoint-callout"><strong></strong><span></span></div>';
  return edge;
}

function wireWidthResize(card, device) {
  let resizeEdge = card.querySelector('.resize-edge');
  if (!resizeEdge) {
    resizeEdge = createResizeEdge();
    card.append(resizeEdge);
  }
  if (resizeEdge.dataset.wired === 'true') return;
  resizeEdge.dataset.wired = 'true';
  resizeEdge.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const deviceId = card.dataset.device;
    const liveDevice = DEVICES[deviceId];
    const isSingleCard = grid.children.length === 1;
    if (isSingleCard) mode = 'single';
    const startWidth = Number(card.dataset.viewportWidth) || liveDevice.width;
    if (isSingleCard) singleWidth = startWidth;
    const scale = Number(card.dataset.scale) || zoom;
    dragState = {
      type: 'width', card, deviceId, startX: event.clientX, startWidth, scale, isSingleCard,
      restoreWidth: liveDevice.width, restoreHeight: liveDevice.height
    };
    document.body.classList.add('is-resizing');
    resizeEdge.setPointerCapture(event.pointerId);
    card.querySelector('.breakpoint-callout').classList.add('is-visible');
  });
  resizeEdge.addEventListener('keydown', (event) => {
    const steps = { ArrowLeft: -10, ArrowRight: 10, Home: -1680, End: 1680 };
    if (!(event.key in steps)) return;
    event.preventDefault();
    const liveDevice = DEVICES[card.dataset.device];
    const nextWidth = Math.max(MIN_VIEWPORT_WIDTH, (Number(card.dataset.viewportWidth) || liveDevice.width) + steps[event.key]);
    const restoreWidth = liveDevice.width;
    const restoreHeight = liveDevice.height;
    if (grid.children.length === 1) {
      mode = 'single';
      singleWidth = nextWidth;
    } else {
      liveDevice.width = nextWidth;
    }
    updateCardDimensions(card, liveDevice, nextWidth, liveDevice.height, Number(card.dataset.scale) || zoom);
    promoteResizedCard(card, { deviceId: card.dataset.device, restoreWidth, restoreHeight });
    speak(`Viewport width: ${nextWidth} pixels.`);
  });
}

function openSeparately(card, device) {
  const deviceId = card.dataset.device;
  const liveDevice = DEVICES[deviceId] || device;
  selected = new Set([deviceId]);
  mode = 'single';
  singleWidth = Number(card.dataset.viewportWidth) || liveDevice.width;
  document.body.dataset.mode = mode;
  renderDevicePicker();
  [...grid.children].forEach((item) => { if (item !== card) item.remove(); });
  card.querySelector('.solo-button').hidden = true;
  wireWidthResize(card, liveDevice);
  speak(`Opened ${liveDevice.name} without reloading the page.`);
}

async function getStudioTab() {
  if (!window.chrome?.tabs?.getCurrent) return undefined;
  return window.chrome.tabs.getCurrent();
}

async function saveCapture(card) {
  const captureButton = card.querySelector('.capture-button');
  if (!window.chrome?.runtime?.sendMessage) {
    notify('Screenshots are available after the extension is loaded in Chrome.', 'error');
    return;
  }
  captureButton.disabled = true;
  try {
    const studioTab = await getStudioTab();
    const response = await window.chrome.runtime.sendMessage({
      type: 'capture-viewport',
      url: targetUrl,
      width: Number(card.dataset.viewportWidth),
      height: Number(card.dataset.viewportHeight),
      returnWindowId: studioTab?.windowId
    });
    if (!response?.ok) throw new Error(response?.error || 'Unable to capture the image.');
    const result = await window.chrome.runtime.sendMessage({
      type: 'save-capture',
      dataUrl: response.dataUrl,
      filename: `viewport-${card.dataset.device}-${Date.now()}.png`
    });
    if (!result?.ok) throw new Error(result?.error || 'Unable to save the file.');
    notify('Visible-area screenshot saved.', 'success');
  } catch (error) {
    notify(`Screenshot was not saved: ${error.message}`, 'error');
  } finally {
    captureButton.disabled = false;
  }
}

function refreshPreview(card) {
  const iframe = card.querySelector('iframe');
  const refreshed = new URL(targetUrl);
  refreshed.searchParams.set('__viewport_parade_refresh', String(Date.now()));
  setInspectorState(card, false);
  setContrastState(card, false);
  iframe.src = refreshed.href;
}

function setInspectorState(card, enabled) {
  const button = card?.querySelector('.inspect-button');
  if (!button) return;
  button.setAttribute('aria-pressed', String(enabled));
}

function setInspectorMode(open) {
  inspectorModeActive = open;
  inspectorToggle.setAttribute('aria-pressed', String(open));
  if (open) {
    setCursorModeActive(false);
    setCommentsOpen(false);
  } else {
    hideInspectorPanel();
  }
  document.querySelectorAll('.viewport-card iframe').forEach((frame) => {
    frame.contentWindow?.postMessage({ source: 'viewport-parade', type: 'toggle-inspector', enabled: open }, '*');
  });
  speak(open ? 'Inspector enabled. Hover over an element and click it.' : 'Inspector disabled.');
}

function setCursorModeActive(active) {
  cursorToggle.setAttribute('aria-pressed', String(active));
}

function activateCursorMode() {
  setInspectorMode(false);
  setCommentsOpen(false);
  setLayersOpen(false);
  clearInspectorSelections();
  setCursorModeActive(true);
  speak('Cursor mode enabled. You can interact with the preview normally.');
}

function setContrastState(card, enabled) {
  const button = card.querySelector('.contrast-button');
  button.setAttribute('aria-pressed', String(enabled));
  button.setAttribute('aria-label', enabled ? 'Disable monochrome layout mode' : 'Enable monochrome layout mode');
  button.title = enabled ? 'Disable monochrome layout mode' : 'Monochrome layout mode';
}

function toggleLayoutContrast(card) {
  if (!hasExtensionRuntime) {
    notify('Visual editing is available in the PixelPrism Chrome extension, not this Codex preview.', 'error');
    return;
  }
  const iframe = card.querySelector('iframe');
  if (!iframe?.contentWindow) return;
  const enabled = card.querySelector('.contrast-button').getAttribute('aria-pressed') !== 'true';
  iframe.contentWindow.postMessage({ source: 'viewport-parade', type: 'toggle-layout-contrast', enabled }, '*');
  setContrastState(card, enabled);
  speak(enabled ? 'Layout grid enabled.' : 'Layout grid disabled.');
}

function cardForFrame(frame) {
  return [...document.querySelectorAll('.viewport-card')].find((card) => card.querySelector('iframe').contentWindow === frame);
}

function setLayersOpen(open) {
  if (open) {
    setCursorModeActive(false);
    setCommentsOpen(false);
  }
  layersPanel.hidden = !open;
  layersToggle.setAttribute('aria-pressed', String(open));
  if (open) requestLayersTree();
}

function setLayersFrame(frame) {
  if (!frame || layersFrame === frame) return;
  layersFrame = frame;
  layersTreeData = undefined;
  selectedLayerPath = undefined;
  hoveredLayerPath = undefined;
  if (!layersPanel.hidden) requestLayersTree();
}

function requestLayersTree() {
  if (!layersFrame) layersFrame = document.querySelector('.viewport-card iframe')?.contentWindow;
  const card = cardForFrame(layersFrame);
  layersViewport.textContent = card ? `${card.querySelector('.viewport-name').textContent} preview` : 'Active preview';
  layersTree.replaceChildren();
  layersEmpty.hidden = Boolean(layersFrame);
  if (!layersFrame) return;
  layersTree.setAttribute('aria-busy', 'true');
  layersFrame.postMessage({ source: 'viewport-parade', type: 'layers-request-tree' }, '*');
}

function layerPathKey(path) { return Array.isArray(path) ? path.join('.') : ''; }

function renderLayersTree() {
  layersTree.replaceChildren();
  layersTree.setAttribute('aria-busy', 'false');
  if (!layersTreeData) return;
  const makeNode = (node, depth) => {
    const item = document.createElement('div');
    item.className = 'layers-node';
    item.dataset.path = layerPathKey(node.path);
    item.setAttribute('role', 'treeitem');
    item.setAttribute('aria-level', String(depth));
    const hasChildren = node.children?.length > 0;
    const selectedDescendant = item.dataset.path === ''
      ? selectedLayerPath !== undefined
      : selectedLayerPath?.startsWith(`${item.dataset.path}.`);
    if (hasChildren) item.setAttribute('aria-expanded', String(!collapsedLayerPaths.has(item.dataset.path) && (depth < 3 || selectedDescendant || expandedLayerPaths.has(item.dataset.path))));
    const row = document.createElement('div');
    row.className = 'layers-row';
    row.style.setProperty('--layer-depth', depth - 1);
    if (item.dataset.path === selectedLayerPath) row.classList.add('is-selected');
    if (hasChildren) {
      const expand = document.createElement('button');
      expand.type = 'button';
      expand.className = 'layers-expand';
      expand.setAttribute('aria-label', `Toggle ${node.label}`);
      const direction = item.getAttribute('aria-expanded') === 'true' ? 'down' : 'right';
      expand.innerHTML = window.phosphorIcon(`caret-${direction}`);
      row.append(expand);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'layers-expand-spacer';
      row.append(spacer);
    }
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'layers-select';
    select.textContent = node.label;
    select.title = node.label;
    row.append(select);
    item.append(row);
    if (hasChildren && item.getAttribute('aria-expanded') === 'true') {
      const children = document.createElement('div');
      children.className = 'layers-children';
      node.children.forEach((child) => children.append(makeNode(child, depth + 1)));
      item.append(children);
    }
    return item;
  };
  layersTree.append(makeNode(layersTreeData, 1));
  revealSelectedLayer();
}

function revealSelectedLayer() {
  if (!selectedLayerPath) return;
  const row = layersTree.querySelector(`[data-path="${CSS.escape(selectedLayerPath)}"] > .layers-row`);
  row?.scrollIntoView({ block: 'nearest' });
}

function layerPathArray(path) { return path ? path.split('.').map(Number) : []; }
function expandLayerAncestors(path) {
  path.split('.').reduce((ancestor, _, index, parts) => {
    const next = parts.slice(0, index + 1).join('.');
    expandedLayerPaths.add(ancestor);
    collapsedLayerPaths.delete(ancestor);
    return next;
  }, '');
}

function selectLayer(path) {
  if (!layersFrame) return;
  selectedLayerPath = path;
  expandLayerAncestors(path);
  layersFrame.postMessage({ source: 'viewport-parade', type: 'layers-select', path: layerPathArray(path) }, '*');
  renderLayersTree();
}

function hoverLayer(path) {
  if (!layersFrame || hoveredLayerPath === path) return;
  hoveredLayerPath = path;
  layersFrame.postMessage({ source: 'viewport-parade', type: 'layers-hover', path: path === null ? null : layerPathArray(path) }, '*');
}

function clearInspectorSelections() {
  document.querySelectorAll('.viewport-card iframe').forEach((iframe) => {
    iframe.contentWindow?.postMessage({ source: 'viewport-parade', type: 'clear-inspector-selection' }, '*');
  });
}

function clearOtherInspectorSelections(activeFrame) {
  document.querySelectorAll('.viewport-card iframe').forEach((iframe) => {
    if (iframe.contentWindow === activeFrame) return;
    iframe.contentWindow?.postMessage({ source: 'viewport-parade', type: 'clear-inspector-selection' }, '*');
  });
}

function hideInspectorPanel() {
  inspectorPanel.hidden = true;
  inspectorPanelFields.replaceChildren();
  inspectorFrame = undefined;
}

function showInspectorPanel(editor, source) {
  // The right panel is a property editor for the selected layer, not a
  // readout of the zone that happened to be clicked. Normalise messages from
  // both current and previously injected inspectors to the complete editor.
  const editorMode = 'component';
  const fields = INSPECTOR_FIELDS[editorMode];
  const frame = [...document.querySelectorAll('.viewport-card iframe')].find((iframe) => iframe.contentWindow === source);
  if (!frame) return;
  inspectorFrame = frame;
  setLayersFrame(frame.contentWindow);
  inspectorModeActive = true;
  setCursorModeActive(false);
  inspectorToggle.setAttribute('aria-pressed', 'true');
  setCommentsOpen(false);
  const [, selector] = String(editor.title || '').split(' · all ');
  inspectorPanelTitle.textContent = 'Element';
  inspectorPanelSelector.textContent = selector ? `all ${selector}` : '';
  inspectorPanelSelector.hidden = !selector;
  const panelGroups = [];
  let currentGroup;
  const startGroup = (name, layoutFor) => {
    currentGroup = document.createElement('section');
    currentGroup.className = 'inspector-group';
    if (layoutFor) currentGroup.dataset.layoutFor = layoutFor;
    const heading = document.createElement('h3');
    heading.className = 'inspector-group-label';
    heading.textContent = name;
    heading.hidden = !name;
    const fields = document.createElement('div');
    fields.className = 'inspector-group-fields';
    currentGroup.append(heading, fields);
    panelGroups.push(currentGroup);
    return fields;
  };
  fields.forEach(([property, label, type, wide, layoutFor, options]) => {
    const groupStarts = {
      display: ['Layout'],
      width: ['Dimensions'],
      marginTop: ['Margin'],
      paddingTop: ['Padding'],
      backgroundColor: ['Appearance'],
      fontFamily: ['Typography']
    };
    const groupStart = groupStarts[property];
    const groupFields = groupStart ? startGroup(...groupStart) : currentGroup?.querySelector('.inspector-group-fields');
    if (!groupFields) return;
    const field = document.createElement('label');
    field.className = `inspector-field${wide ? ' is-wide' : ''}`;
    if (layoutFor) field.dataset.layoutFor = layoutFor;
    const isDimension = property === 'width' || property === 'height';
    const isTypography = editorMode === 'typography';
    const compactTypeControl = isTypography && ['fontStyle', 'fontSize'].includes(property);
    const edgePrefix = ({ marginTop: 'Top', marginRight: 'Right', marginBottom: 'Bottom', marginLeft: 'Left', paddingTop: 'Top', paddingRight: 'Right', paddingBottom: 'Bottom', paddingLeft: 'Left' })[property];
    const gapPrefix = ({ rowGap: 'Row', columnGap: 'Col' })[property];
    const inlinePrefix = edgePrefix || gapPrefix || (isTypography && ({ lineHeight: 'A', letterSpacing: '↔' })[property]);
    if (isDimension) field.classList.add('is-dimension');
    if (edgePrefix) field.classList.add('is-box-edge');
    if (gapPrefix) field.classList.add('is-gap');
    if (isTypography) field.classList.add(`is-type-${property}`);
    if (!isDimension && !compactTypeControl && !edgePrefix && !gapPrefix) field.textContent = label;
    if (compactTypeControl || isDimension || edgePrefix || gapPrefix) {
      const accessibleLabel = document.createElement('span');
      accessibleLabel.className = 'sr-only';
      accessibleLabel.textContent = label;
      field.append(accessibleLabel);
    }
    const input = type === 'select' ? document.createElement('select') : document.createElement('input');
    if (type !== 'select') input.type = type;
    input.name = property;
    input.dataset.property = property;
    // A preview can retain an older injected inspector script until its page is
    // reloaded. Keep CSS size defaults visible rather than rendering empty
    // controls while that preview catches up.
    const cssSizeDefaults = { width: 'auto', height: 'auto', minWidth: '0px', maxWidth: 'none', minHeight: '0px', maxHeight: 'none' };
    const currentValue = String(editor.values?.[property] ?? cssSizeDefaults[property] ?? '');
    input.value = currentValue;
    if (type === 'number') input.step = 'any';
    if (type === 'select') {
      (options || []).forEach(([value, text]) => input.add(new Option(text, value)));
      if (![...input.options].some((option) => option.value === currentValue)) input.add(new Option(currentValue, currentValue));
      input.value = currentValue;
    }
    input.dataset.previousValue = input.value;
    if (isDimension || inlinePrefix) {
      const shell = document.createElement('span');
      shell.className = 'inspector-input-shell';
      const prefix = document.createElement('span');
      prefix.className = 'inspector-input-prefix';
      prefix.setAttribute('aria-hidden', 'true');
      prefix.textContent = isDimension ? (property === 'width' ? 'W' : 'H') : inlinePrefix;
      shell.append(prefix, input);
      field.append(shell);
    } else {
      field.append(input);
    }
    groupFields.append(field);
  });
  inspectorPanelFields.replaceChildren(...panelGroups);
  updateLayoutFieldVisibility();
  inspectorPanel.hidden = false;
}

function updateLayoutFieldVisibility() {
  const display = inspectorPanelFields.querySelector('[data-property="display"]')?.value;
  inspectorPanelFields.querySelectorAll('[data-layout-for]').forEach((field) => {
    const applies = field.dataset.layoutFor === display || (field.dataset.layoutFor === 'flex-grid' && ['flex', 'grid'].includes(display));
    field.hidden = !applies;
  });
}

// Clicks inside a preview are handled by its own document. A click anywhere in
// Studio around the previews is an explicit way to leave the current edit.
document.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('iframe, #inspector-panel, #comments-panel, #layers-panel, .mode-dock, .toolbar, #custom-dialog')) return;
  clearInspectorSelections();
}, true);

function createViewportCard(device, width, scale) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector('.viewport-card');
  const iframe = node.querySelector('iframe');
  const blocked = isEmbedBlocked(targetUrl) || (isLocalFileUrl(targetUrl) && !fileAccessAllowed);
  card.dataset.device = device.id;
  card.dataset.loadedUrl = targetUrl;
  card.dataset.scale = String(scale);
  node.querySelector('.viewport-name').textContent = device.name;
  iframe.title = `${device.name}, ${width} pixels`;

  if (blocked) {
    card.classList.add('is-embed-blocked');
    iframe.hidden = true;
    const blockedMessage = node.querySelector('.embed-blocked');
    blockedMessage.hidden = false;
    if (isLocalFileUrl(targetUrl) && !fileAccessAllowed) {
      blockedMessage.querySelector('h2').textContent = 'No access to local files';
      blockedMessage.querySelector('p').textContent = 'Enable “Allow access to file URLs” in the extension settings and reload Studio.';
    }
  } else {
    iframe.src = targetUrl;
    waitForLocalPreview(card);
    iframe.addEventListener('load', () => {
      iframe.contentWindow?.postMessage({ source: 'viewport-parade', type: 'enable-navigation-sync' }, '*');
    });
    iframe.addEventListener('pointerenter', () => {
      setLayersFrame(iframe.contentWindow);
      iframe.contentWindow?.postMessage({ source: 'viewport-parade', type: 'inspector-pointer-entered' }, '*');
    });
    iframe.addEventListener('pointerleave', () => {
      iframe.contentWindow?.postMessage({ source: 'viewport-parade', type: 'inspector-pointer-left' }, '*');
    });
    iframe.addEventListener('load', () => {
      notice.hidden = true;
    }, { once: true });
  }

  node.querySelector('.contrast-button').addEventListener('click', () => toggleLayoutContrast(card));
  node.querySelector('.solo-button').addEventListener('click', () => openSeparately(card, DEVICES[device.id]));
  node.querySelector('.capture-button').addEventListener('click', () => saveCapture(card));
  node.querySelector('.apply-button').addEventListener('click', () => applyChangesToFile(card));
  node.querySelector('.refresh-button').addEventListener('click', () => refreshPreview(card));
  node.querySelectorAll('.more-actions-menu button').forEach((button) => {
    button.addEventListener('click', () => { button.closest('.more-actions').open = false; });
  });
  const resizeBottom = node.querySelector('.resize-bottom');
  resizeBottom.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const liveDevice = DEVICES[card.dataset.device];
    const activeWidth = Number(card.dataset.viewportWidth) || liveDevice.width;
    dragState = {
      type: 'height', card, deviceId: card.dataset.device, startY: event.clientY,
      startHeight: Number(card.dataset.viewportHeight) || liveDevice.height,
      scale: Number(card.dataset.scale) || zoom, width: activeWidth,
      restoreWidth: liveDevice.width, restoreHeight: liveDevice.height
    };
    document.body.classList.add('is-resizing');
    resizeBottom.setPointerCapture(event.pointerId);
    card.querySelector('.height-callout').classList.add('is-visible');
  });
  resizeBottom.addEventListener('keydown', (event) => {
    const steps = { ArrowUp: 10, ArrowDown: -10, Home: -2600, End: 2600 };
    if (!(event.key in steps)) return;
    event.preventDefault();
    const deviceId = card.dataset.device;
    const liveDevice = DEVICES[deviceId];
    const restoreWidth = liveDevice.width;
    const restoreHeight = liveDevice.height;
    liveDevice.height = Math.max(MIN_VIEWPORT_HEIGHT, liveDevice.height + steps[event.key]);
    const activeWidth = Number(card.dataset.viewportWidth) || liveDevice.width;
    updateCardDimensions(card, liveDevice, activeWidth, liveDevice.height, Number(card.dataset.scale) || zoom);
    promoteResizedCard(card, { deviceId, restoreWidth, restoreHeight });
    speak(`${liveDevice.name} height: ${liveDevice.height} pixels.`);
  });
  return card;
}

function updateViewportCard(card, device, width, scale, count) {
  card.dataset.scale = String(scale);
  // Flex order keeps smaller screens visually first without moving iframe nodes.
  // Moving an existing iframe can make Chromium navigate it again.
  card.style.order = String(width);
  card.querySelector('.viewport-name').textContent = device.name;
  card.querySelector('iframe').title = `${device.name}, ${width} pixels`;
  card.querySelector('.solo-button').hidden = count === 1;
  updateCardDimensions(card, device, width, device.height, scale);

  wireWidthResize(card, device);
}

function render() {
  const entries = deviceEntries();
  if (mode === 'single' && entries[0]) entries[0].width = singleWidth;
  document.body.dataset.mode = mode;
  zoomValue.value = `${Math.round(zoom * 100)}%`;
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  renderDevicePicker();

  emptyState.hidden = Boolean(targetUrl);
  grid.hidden = !targetUrl;
  if (!targetUrl) {
    grid.replaceChildren();
    return;
  }

  const currentCards = new Map([...grid.children].map((card) => [card.dataset.device, card]));
  const selectedIds = new Set(entries.map((device) => device.id));
  currentCards.forEach((card, id) => {
    if (!selectedIds.has(id)) card.remove();
  });

  entries.forEach((device) => {
    const width = mode === 'single' ? singleWidth : device.width;
    const scale = cardScale(device, entries.length);
    let card = currentCards.get(device.id);
    if (!card) {
      card = createViewportCard(device, width, scale);
    } else if (card.dataset.loadedUrl !== targetUrl) {
      card.dataset.loadedUrl = targetUrl;
      const iframe = card.querySelector('iframe');
      setInspectorState(card, false);
      setContrastState(card, false);
      iframe.src = targetUrl;
      waitForLocalPreview(card);
      iframe.addEventListener('load', () => {
        notice.hidden = true;
      }, { once: true });
    }
    updateViewportCard(card, DEVICES[device.id], width, scale, entries.length);
    // Do not re-append existing cards: moving an iframe node can reload it in
    // Chromium. Only a genuinely new viewport is appended.
    if (!card.isConnected) grid.append(card);
  });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const nextUrl = normalizeUrl(urlInput.value);
  if (!nextUrl) {
    targetUrl = '';
    history.replaceState({}, '', location.pathname);
    setFavicon();
    render();
    return;
  }
  openPreviewUrl(nextUrl);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'preview-ready') return;
  const card = [...document.querySelectorAll('.viewport-card')].find((candidate) => candidate.querySelector('iframe').contentWindow === event.source);
  if (!card) return;
  // Content scripts already injected into a preview survive an extension
  // reload. Reload that iframe once when it reports an older protocol, so the
  // page receives the same inspector code as the Studio shell.
  if (Number(event.data.inspectorProtocolVersion) !== INSPECTOR_PROTOCOL_VERSION && !card.dataset.inspectorProtocolReloaded) {
    card.dataset.inspectorProtocolReloaded = 'true';
    const iframe = card.querySelector('iframe');
    iframe.src = iframe.src;
    return;
  }
  card.dataset.previewReady = 'true';
  clearTimeout(card.previewReadyTimer);
  if (inspectorModeActive) {
    event.source.postMessage({ source: 'viewport-parade', type: 'toggle-inspector', enabled: true }, '*');
  }
  if (!layersFrame) setLayersFrame(event.source);
  if (!commentsPanel.hidden) setCommentPicker(true);
  reconcilePendingChanges(card);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'studio-shortcut') return;
  const isPreview = [...document.querySelectorAll('.viewport-card iframe')].some((iframe) => iframe.contentWindow === event.source);
  const shortcut = String(event.data.shortcut || '').toLowerCase();
  if (isPreview && ['i', 'c', 'l', 'v'].includes(shortcut)) handleStudioShortcut(shortcut);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'pending-changes-reconciled') return;
  const card = [...document.querySelectorAll('.viewport-card')].find((candidate) => (
    candidate.querySelector('iframe').contentWindow === event.source
  ));
  if (!card || card.dataset.reconciliationRequest !== event.data.requestId) return;
  const resolved = Array.isArray(event.data.resolved) ? event.data.resolved : [];
  if (!resolved.length) return;
  let removed = 0;
  resolved.forEach(({ key, after }) => {
    // Do not let a late answer clear a newer edit to the same property.
    if (changeLog.get(key)?.to === after && changeLog.delete(key)) removed += 1;
  });
  if (removed) syncChangeUi();
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'layers-tree') return;
  if (!layersFrame) setLayersFrame(event.source);
  if (event.source !== layersFrame) return;
  layersTreeData = event.data.tree;
  renderLayersTree();
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'layers-selected') return;
  setLayersFrame(event.source);
  selectedLayerPath = layerPathKey(event.data.path);
  expandLayerAncestors(selectedLayerPath);
  if (!layersPanel.hidden) renderLayersTree();
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'navigate-preview') return;
  const isPreview = [...document.querySelectorAll('.viewport-card iframe')].some((iframe) => iframe.contentWindow === event.source);
  if (isPreview) openPreviewUrl(event.data.url, true);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-style-change') return;
  const card = [...document.querySelectorAll('.viewport-card')].find((candidate) => (
    candidate.querySelector('iframe').contentWindow === event.source
  ));
  if (!card) return;

  // Do not rely on iframe location/innerWidth here. A local file can be
  // canonicalised by Chromium (or contain a hash), while its visual viewport
  // may be rounded after scaling. The card is the source of truth for the
  // change that should unlock its save button.
  recordInspectorChange({
    ...event.data.change,
    url: card.dataset.loadedUrl || targetUrl,
    viewport: {
      width: Number(card.dataset.viewportWidth),
      height: Number(card.dataset.viewportHeight)
    }
  });
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-editor-open') return;
  if (!commentsPanel.hidden && [...commentPickerFrames].some((frame) => frame.contentWindow === event.source)) {
    inspectorFrame = cardForFrame(event.source)?.querySelector('iframe');
    setLayersFrame(event.source);
    return;
  }
  showInspectorPanel(event.data.editor || {}, event.source);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-element-selected') return;
  const card = cardForFrame(event.source);
  if (!card || !event.data.element) return;
  clearOtherInspectorSelections(event.source);
  commentSelection = { frame: card.querySelector('iframe'), element: event.data.element, route: event.data.route || '/' };
  if (!commentsPanel.hidden) renderComments();
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-editor-close') return;
  if (inspectorFrame?.contentWindow === event.source) {
    hideInspectorPanel();
    selectedLayerPath = undefined;
    if (!layersPanel.hidden) renderLayersTree();
  }
});

function sendInspectorFieldChange(event) {
  const input = event.target.closest('input[data-property], select[data-property]');
  if (!input || !inspectorFrame?.contentWindow) return;
  inspectorFrame.contentWindow.postMessage({
    source: 'viewport-parade',
    type: 'inspector-editor-input',
    property: input.dataset.property,
    value: input.value,
    previousValue: input.dataset.previousValue ?? ''
  }, '*');
  input.dataset.previousValue = input.value;
  if (input.dataset.property === 'display') updateLayoutFieldVisibility();
}

inspectorPanelFields.addEventListener('input', sendInspectorFieldChange);
inspectorPanelFields.addEventListener('change', sendInspectorFieldChange);

inspectorPanelClose.addEventListener('click', () => {
  clearInspectorSelections();
  hideInspectorPanel();
});

cursorToggle.addEventListener('click', activateCursorMode);
inspectorToggle.addEventListener('click', () => {
  const nextOpen = !inspectorModeActive;
  setInspectorMode(nextOpen);
  if (!nextOpen) setCursorModeActive(true);
});
layersToggle.addEventListener('click', () => setLayersOpen(layersPanel.hidden));
layersPanelClose.addEventListener('click', () => setLayersOpen(false));
commentsToggle.addEventListener('click', () => setCommentsOpen(commentsPanel.hidden));
commentsPanelClose.addEventListener('click', () => setCommentsOpen(false));
commentsForm.addEventListener('submit', (event) => { event.preventDefault(); addComment(commentInput.value); });

function handleStudioShortcut(shortcut) {
  switch (shortcut) {
    case 'i':
      setInspectorMode(!inspectorModeActive);
      if (!inspectorModeActive) setCursorModeActive(true);
      break;
    case 'c':
      setCommentsOpen(commentsPanel.hidden);
      break;
    case 'l':
      setLayersOpen(layersPanel.hidden);
      break;
    case 'v':
      activateCursorMode();
      break;
    default:
      break;
  }
}

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)) return;
  const shortcut = ({ KeyI: 'i', KeyC: 'c', KeyL: 'l', KeyV: 'v' })[event.code];
  if (!shortcut) return;
  event.preventDefault();
  handleStudioShortcut(shortcut);
});

commentsList.addEventListener('click', (event) => {
  const button = event.target.closest('.comment-remove');
  const index = Number(button?.dataset.commentIndex);
  if (!Number.isInteger(index) || !comments[index]) return;
  comments.splice(index, 1);
  renderComments();
  syncChangeUi();
  notify('Comment removed from the pending handoff.');
});
layersTree.addEventListener('click', (event) => {
  const item = event.target.closest('.layers-node');
  if (!item) return;
  if (event.target.closest('.layers-expand')) {
    const expanded = item.getAttribute('aria-expanded') === 'true';
    if (expanded) collapsedLayerPaths.add(item.dataset.path);
    else collapsedLayerPaths.delete(item.dataset.path);
    if (!expanded) expandedLayerPaths.add(item.dataset.path);
    renderLayersTree();
    return;
  }
  if (event.target.closest('.layers-select')) selectLayer(item.dataset.path);
});
layersTree.addEventListener('pointerover', (event) => {
  const item = event.target.closest('.layers-node');
  if (item) hoverLayer(item.dataset.path);
});
layersTree.addEventListener('pointerleave', () => hoverLayer(null));
layersTree.addEventListener('focusin', (event) => {
  const item = event.target.closest('.layers-node');
  if (item) hoverLayer(item.dataset.path);
});
layersTree.addEventListener('focusout', () => hoverLayer(null));

handoffFabToggle.addEventListener('click', () => {
  setHandoffFabOpen(handoffFabToggle.getAttribute('aria-expanded') !== 'true');
});
handoffFabClose.addEventListener('click', () => setHandoffFabOpen(false));
changeReportButton.addEventListener('click', async () => {
  await downloadChangeReport();
  setHandoffFabOpen(false);
});
copyCodexButton.addEventListener('click', async () => {
  await copyForCodex();
  setHandoffFabOpen(false);
});

devicePicker.addEventListener('click', (event) => {
  const button = event.target.closest('[data-device]');
  if (!button) return;
  setSelected(button.dataset.device);
});
customTrigger.addEventListener('click', () => {
  customDialog.showPopover();
  const triggerRect = customTrigger.getBoundingClientRect();
  const dialogWidth = Math.min(360, window.innerWidth - 24);
  customDialog.style.left = `${Math.max(12, Math.min(triggerRect.left, window.innerWidth - dialogWidth - 12))}px`;
  customDialog.style.top = `${Math.min(triggerRect.bottom + 8, window.innerHeight - 320)}px`;
  requestAnimationFrame(() => customPreset.focus());
});
document.querySelector('.dialog-close').addEventListener('click', () => customDialog.hidePopover());
customForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(customForm);
  const width = Math.round(Number(formData.get('width')));
  const height = Math.round(Number(formData.get('height')));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < MIN_VIEWPORT_WIDTH || height < MIN_VIEWPORT_HEIGHT) {
    notify(`Minimum viewport size is ${MIN_VIEWPORT_WIDTH} × ${MIN_VIEWPORT_HEIGHT}px.`, 'error');
    return;
  }
  const id = `custom-${++customDeviceCount}`;
  DEVICES[id] = { name: 'Custom', width, height };
  selected.add(id);
  if (selected.size > 1) mode = 'multi';
  customDialog.hidePopover();
  speak(`Added viewport: ${width} × ${height} pixels.`);
  render();
});
document.querySelectorAll('[data-zoom]').forEach((button) => {
  button.addEventListener('click', () => {
    const direction = button.dataset.zoom === 'in' ? 1 : -1;
    const nextZoom = Math.min(2, Math.max(0.5, Number((zoom + direction * 0.1).toFixed(1))));
    if (nextZoom === zoom) return;
    zoom = nextZoom;
    zoomValue.value = `${Math.round(zoom * 100)}%`;
    zoomValue.textContent = `${Math.round(zoom * 100)}%`;
    document.querySelectorAll('.viewport-card').forEach((card) => {
      const device = DEVICES[card.dataset.device];
      const width = Number(card.dataset.viewportWidth) || device.width;
      const height = Number(card.dataset.viewportHeight) || device.height;
      card.dataset.scale = String(zoom);
      updateCardDimensions(card, device, width, height, zoom);
    });
    speak(`Overall zoom: ${Math.round(zoom * 100)}%.`);
  });
});
customPreset.addEventListener('change', () => {
  const preset = CUSTOM_PRESETS[customPreset.value];
  if (!preset) return;
  customWidth.value = preset.width;
  customHeight.value = preset.height;
});
[customWidth, customHeight].forEach((input) => {
  input.addEventListener('input', () => {
    customPreset.value = 'custom';
  });
});
window.addEventListener('pointermove', (event) => {
  if (!dragState) return;
  const device = DEVICES[dragState.deviceId];
  if (dragState.type === 'width') {
    const width = Math.max(MIN_VIEWPORT_WIDTH, Math.round(dragState.startWidth + (event.clientX - dragState.startX) / dragState.scale));
    if (dragState.isSingleCard) singleWidth = width;
    else device.width = width;
    updateCardDimensions(dragState.card, device, width, device.height, dragState.scale);
    dragState.card.querySelector('.breakpoint-callout')?.classList.add('is-visible');
  } else {
    const height = Math.max(MIN_VIEWPORT_HEIGHT, Math.round(dragState.startHeight + (event.clientY - dragState.startY) / dragState.scale));
    device.height = height;
    updateCardDimensions(dragState.card, device, dragState.width, height, dragState.scale);
    dragState.card.querySelector('.height-callout')?.classList.add('is-visible');
  }
});
window.addEventListener('pointerup', () => {
  if (!dragState) return;
  const state = dragState;
  const { type, card, deviceId } = state;
  const width = Number(card.dataset.viewportWidth);
  const height = Number(card.dataset.viewportHeight);
  const changed = type === 'width'
    ? width !== state.startWidth
    : height !== state.startHeight;
  if (changed) {
    promoteResizedCard(card, {
      deviceId,
      restoreWidth: state.restoreWidth,
      restoreHeight: state.restoreHeight
    });
  }
  dragState = null;
  document.body.classList.remove('is-resizing');
  card.querySelector('.breakpoint-callout')?.classList.remove('is-visible');
  card.querySelector('.height-callout')?.classList.remove('is-visible');
  speak(type === 'width'
    ? `Viewport width: ${width} pixels.`
    : `Viewport height: ${height} pixels.`);
});
window.addEventListener('resize', () => { if (mode === 'single') render(); });

render();
syncChangeUi();
checkFileSchemeAccess();
