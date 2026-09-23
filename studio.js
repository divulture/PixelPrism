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
const reviewExportButton = document.querySelector('#review-export-button');
const reviewPdfExportButton = document.querySelector('#review-pdf-export-button');
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
const INSPECTOR_PROTOCOL_VERSION = 6;

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

const CSS_LENGTH_FIELDS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'rowGap', 'columnGap', 'borderWidth', 'borderRadius',
  'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent'
]);
const COLOR_FIELDS = new Set(['backgroundColor', 'color', 'borderColor']);

urlInput.value = targetUrl;


function fallbackFavicon(url) {
  try {
    if (new URL(url).protocol === 'file:') return '';
    return new URL('/favicon.ico', url).href;
  } catch {
    return '';
  }
}

function cssColorToHex(value) {
  const raw = String(value || '').trim();
  const rgbToHex = (channels) => `#${channels.map((channel) => {
    const number = Math.max(0, Math.min(255, Math.round(Number(channel))));
    return number.toString(16).padStart(2, '0');
  }).join('')}`.toUpperCase();
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const digits = hex[1];
    if (digits.length === 3) return `#${[...digits].map((char) => char + char).join('')}`.toUpperCase();
    return `#${digits.slice(0, 6)}`.toUpperCase();
  }
  const rgb = raw.match(/^rgba?\(\s*([.\d]+)[,\s]+([.\d]+)[,\s]+([.\d]+)/i);
  if (rgb) return rgbToHex(rgb.slice(1, 4));
  if (!raw || !CSS.supports('color', raw)) return '';
  const probe = document.createElement('span');
  probe.style.color = raw;
  document.documentElement.append(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const computedRgb = computed.match(/^rgba?\(\s*([.\d]+)[,\s]+([.\d]+)[,\s]+([.\d]+)/i);
  return computedRgb ? rgbToHex(computedRgb.slice(1, 4)) : '';
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
  const external = targetUrl && targetUrl !== nextUrl && new URL(nextUrl).origin !== new URL(targetUrl).origin;
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
    notify('Review copied to the clipboard.', 'success');
  } catch {
    const area = document.createElement('textarea');
    area.value = payload;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (copied) notify('Review copied to the clipboard.', 'success');
    else notify('Unable to copy the review.', 'error');
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

function reviewElementKey(element, selector = '') {
  if (!element) return 'page';
  return element.domPath || (element.id ? `#${element.id}` : '') || element.selector || selector || 'element';
}

function reviewItems() {
  const groups = new Map();
  const getGroup = ({ url, route, viewport, element, selector }) => {
    const canonicalUrl = canonicalInspectorUrl(url || targetUrl);
    const safeViewport = {
      width: Math.round(Number(viewport?.width) || 0),
      height: Math.round(Number(viewport?.height) || 0)
    };
    const key = [canonicalUrl, safeViewport.width, safeViewport.height, reviewElementKey(element, selector)].join('\u0000');
    if (!groups.has(key)) {
      groups.set(key, {
        url: canonicalUrl,
        route: route || '/',
        viewport: safeViewport,
        element: element || null,
        selector: element?.selector || selector || '',
        comments: [],
        changes: []
      });
    }
    return groups.get(key);
  };

  changeLog.forEach((change) => getGroup(change).changes.push(change));
  comments.forEach((comment) => getGroup(comment).comments.push(comment.comment));

  return [...groups.values()].sort((left, right) => (
    left.url.localeCompare(right.url)
    || left.viewport.width - right.viewport.width
    || left.viewport.height - right.viewport.height
    || reviewElementKey(left.element, left.selector).localeCompare(reviewElementKey(right.element, right.selector))
  ));
}

function reviewChangesForContext(item) {
  return [...changeLog.values()].filter((change) => (
    canonicalInspectorUrl(change.url) === item.url
    && change.viewport.width === item.viewport.width
    && change.viewport.height === item.viewport.height
  ));
}

function reviewCaptureContexts(items) {
  const contexts = new Map();
  items.forEach((item, index) => {
    const key = [item.url, item.viewport.width, item.viewport.height].join('\u0000');
    if (!contexts.has(key)) {
      contexts.set(key, {
        url: item.url,
        viewport: item.viewport,
        changes: reviewChangesForContext(item),
        targets: []
      });
    }
    contexts.get(key).targets.push({
      id: index,
      marker: index + 1,
      target: item.element ? { element: item.element, selector: item.selector } : null
    });
  });
  return [...contexts.values()];
}

function promiseWithTimeout(promise, timeout, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeout);
    Promise.resolve(promise).then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });
}

function reviewFilename() {
  const now = new Date();
  const part = (value) => String(value).padStart(2, '0');
  return `pixelprism-review-${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}.pdf`;
}

function loadReviewImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A review screenshot could not be decoded.'));
    image.src = dataUrl;
  });
}

function wrappedCanvasLines(context, value, maxWidth) {
  const paragraphs = String(value ?? '').split(/\r?\n/);
  const lines = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!paragraph) {
      lines.push('');
      return;
    }
    const words = paragraph.split(/\s+/);
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        return;
      }
      if (line) lines.push(line);
      if (context.measureText(word).width <= maxWidth) {
        line = word;
        return;
      }
      let fragment = '';
      [...word].forEach((character) => {
        if (fragment && context.measureText(fragment + character).width > maxWidth) {
          lines.push(fragment);
          fragment = character;
        } else fragment += character;
      });
      line = fragment;
    });
    if (line) lines.push(line);
    if (paragraphIndex < paragraphs.length - 1 && paragraph) lines.push('');
  });
  return lines;
}

function drawReviewLines(context, lines, x, y, lineHeight, color = '#27272a') {
  context.fillStyle = color;
  lines.forEach((line, index) => context.fillText(line, x, y + (index * lineHeight)));
  return y + (lines.length * lineHeight);
}

function reviewPageLabel(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return decodeURIComponent(parsed.pathname.split('/').pop() || parsed.pathname);
    return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

function readableProperty(property) {
  return String(property || '')
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

function describeReviewChange(change) {
  const from = String(change.from || '').trim();
  const to = String(change.to || '').trim();
  if (!from) return `${readableProperty(change.property)}: set to ${to || 'empty'}`;
  if (!to) return `${readableProperty(change.property)}: removed (was ${from})`;
  return `${readableProperty(change.property)}: ${from} -> ${to}`;
}

const REVIEW_PAGE = { width: 1240, height: 1754, margin: 80 };

function createReviewCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = REVIEW_PAGE.width;
  canvas.height = REVIEW_PAGE.height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#f7f7f8';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = 'top';
  return { canvas, context };
}

function reviewSiteName(item) {
  const provided = String(item?.siteIdentity?.name || '').trim();
  if (provided) return provided;
  try {
    return new URL(item?.url || '').hostname.replace(/^www\./, '') || 'Website';
  } catch {
    return 'Website';
  }
}

function ellipsizeCanvasText(context, value, maxWidth) {
  const text = String(value || '');
  if (context.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened && context.measureText(`${shortened}...`).width > maxWidth) shortened = shortened.slice(0, -1);
  return shortened ? `${shortened}...` : '';
}

function drawReviewDocumentMark(context, item) {
  const logo = item?.reviewLogoImage;
  let textX = REVIEW_PAGE.margin;
  if (logo?.naturalWidth && logo?.naturalHeight) {
    const frameSize = 42;
    const scale = Math.min(frameSize / logo.naturalWidth, frameSize / logo.naturalHeight);
    const width = Math.max(1, Math.round(logo.naturalWidth * scale));
    const height = Math.max(1, Math.round(logo.naturalHeight * scale));
    context.drawImage(logo, REVIEW_PAGE.margin + ((frameSize - width) / 2), 72 + ((frameSize - height) / 2), width, height);
    textX += 58;
  }
  context.fillStyle = '#52525b';
  context.font = '600 18px Inter, sans-serif';
  context.fillText(ellipsizeCanvasText(context, reviewSiteName(item), 520), textX, 83);
}

function drawReviewCover(items) {
  const { canvas, context } = createReviewCanvas();
  canvas.reviewUrl = items[0]?.url || '';
  drawReviewDocumentMark(context, items[0]);
  context.fillStyle = '#18181b';
  context.font = '800 82px Inter, sans-serif';
  context.fillText('Design Review', REVIEW_PAGE.margin, 282);
  context.fillStyle = '#52525b';
  context.font = '500 28px Inter, sans-serif';
  context.fillText('A visual handoff of comments and design changes', REVIEW_PAGE.margin, 390);

  const pages = new Set(items.map((item) => item.url));
  const viewports = new Set(items.map((item) => `${item.url}\u0000${item.viewport.width}x${item.viewport.height}`));
  const commentCount = items.reduce((count, item) => count + item.comments.length, 0);
  const changeCount = items.reduce((count, item) => count + item.changes.length, 0);
  const metrics = [
    ['Review items', items.length],
    ['Pages', pages.size],
    ['Viewports', viewports.size],
    ['Comments', commentCount],
    ['Visual changes', changeCount]
  ];
  let metricY = 560;
  metrics.forEach(([label, value]) => {
    context.fillStyle = '#e4e4e7';
    context.fillRect(REVIEW_PAGE.margin, metricY + 53, REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2), 2);
    context.fillStyle = '#71717a';
    context.font = '600 22px Inter, sans-serif';
    context.fillText(label, REVIEW_PAGE.margin, metricY);
    context.fillStyle = '#18181b';
    context.font = '700 30px Inter, sans-serif';
    context.textAlign = 'end';
    context.fillText(String(value), REVIEW_PAGE.width - REVIEW_PAGE.margin, metricY - 5);
    context.textAlign = 'start';
    metricY += 100;
  });

  context.fillStyle = '#71717a';
  context.font = '500 20px Inter, sans-serif';
  context.fillText(new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short' }).format(new Date()), REVIEW_PAGE.margin, 1490);
  context.fillText('Powered by PixelPrism', REVIEW_PAGE.margin, 1530);
  return canvas;
}

function drawReviewItemHeader(context, item, index, total, continued = false) {
  drawReviewDocumentMark(context, item);
  context.fillStyle = '#71717a';
  context.font = '800 18px Inter, sans-serif';
  context.fillText(`DESIGN REVIEW ${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}${continued ? ' - CONTINUED' : ''}`, REVIEW_PAGE.margin, 170);
  context.fillStyle = '#18181b';
  context.font = '800 42px Inter, sans-serif';
  const titleLines = wrappedCanvasLines(context, reviewPageLabel(item.url), REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2));
  const visibleTitleLines = titleLines.slice(0, 2);
  drawReviewLines(context, visibleTitleLines, REVIEW_PAGE.margin, 210, 50, '#18181b');
  const resolutionY = 210 + (visibleTitleLines.length * 50) + 10;
  context.fillStyle = '#71717a';
  context.font = '600 19px Inter, sans-serif';
  context.fillText(`${item.viewport.width} x ${item.viewport.height}`, REVIEW_PAGE.margin, resolutionY);
  return Math.max(360, resolutionY + 58);
}

function drawReviewScreenshot(context, image, y) {
  const availableWidth = REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2);
  const maxHeight = 700;
  const scale = Math.min(availableWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1.8);
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);
  const x = Math.round((REVIEW_PAGE.width - width) / 2);
  context.fillStyle = '#e4e4e7';
  context.beginPath();
  context.roundRect(x - 2, y - 2, width + 4, height + 4, 8);
  context.fill();
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, 6);
  context.clip();
  context.drawImage(image, x, y, width, height);
  context.restore();
  return y + height + 42;
}

function drawReviewScreenshotError(context, message, y) {
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.roundRect(REVIEW_PAGE.margin, y, REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2), 190, 10);
  context.fill();
  context.strokeStyle = '#d4d4d8';
  context.strokeRect(REVIEW_PAGE.margin, y, REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2), 190);
  context.fillStyle = '#18181b';
  context.font = '700 22px Inter, sans-serif';
  context.fillText('Screenshot unavailable', REVIEW_PAGE.margin + 28, y + 38);
  context.font = '500 18px Inter, sans-serif';
  const lines = wrappedCanvasLines(context, message, REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2) - 56);
  drawReviewLines(context, lines.slice(0, 3), REVIEW_PAGE.margin + 28, y + 82, 27, '#71717a');
  return y + 228;
}

function drawReviewTarget(context, item, y) {
  const target = item.element?.selector || item.selector;
  context.font = '700 17px Inter, sans-serif';
  context.fillStyle = '#71717a';
  context.fillText('TARGET', REVIEW_PAGE.margin, y);
  context.font = '600 19px Inter, sans-serif';
  const text = target ? `${target}${item.highlighted === false ? ' (could not be highlighted)' : ''}` : 'Page-level feedback';
  const lines = wrappedCanvasLines(context, text, REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2));
  return drawReviewLines(context, lines, REVIEW_PAGE.margin, y + 30, 28, '#18181b') + 28;
}

async function drawReviewItemPages(item, index, total) {
  const pages = [];
  const createItemCanvas = () => {
    const page = createReviewCanvas();
    page.canvas.reviewUrl = item.url;
    return page;
  };
  let current = createItemCanvas();
  let y = drawReviewItemHeader(current.context, item, index, total);
  if (item.screenshot) y = drawReviewScreenshot(current.context, await loadReviewImage(item.screenshot), y);
  else y = drawReviewScreenshotError(current.context, item.captureError || 'Chrome did not return an image.', y);
  y = drawReviewTarget(current.context, item, y);

  const continuation = () => {
    pages.push(current.canvas);
    current = createItemCanvas();
    y = drawReviewItemHeader(current.context, item, index, total, true);
  };
  const ensureSpace = (height) => {
    if (y + height <= REVIEW_PAGE.height - 100) return;
    continuation();
  };
  const sectionTitle = (title) => {
    ensureSpace(120);
    current.context.fillStyle = '#71717a';
    current.context.font = '800 17px Inter, sans-serif';
    current.context.fillText(title, REVIEW_PAGE.margin, y);
    y += 42;
  };
  const bodyBlock = (text, prefix = '') => {
    current.context.font = '500 21px Inter, sans-serif';
    const maxWidth = REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2) - (prefix ? 42 : 0);
    const lines = wrappedCanvasLines(current.context, text, maxWidth);
    let offset = 0;
    while (offset < lines.length) {
      const remainingLines = Math.max(1, Math.floor((REVIEW_PAGE.height - 110 - y) / 31));
      if (remainingLines < 1 || y > REVIEW_PAGE.height - 150) {
        continuation();
        continue;
      }
      const slice = lines.slice(offset, offset + remainingLines);
      if (prefix && offset === 0) {
        current.context.fillStyle = '#71717a';
        current.context.font = '800 20px Inter, sans-serif';
        current.context.fillText(prefix, REVIEW_PAGE.margin, y);
      }
      current.context.font = '500 21px Inter, sans-serif';
      y = drawReviewLines(current.context, slice, REVIEW_PAGE.margin + (prefix ? 42 : 0), y, 31, '#27272a') + 22;
      offset += slice.length;
      if (offset < lines.length) continuation();
    }
  };

  if (item.comments.length) {
    sectionTitle(item.comments.length === 1 ? 'COMMENT' : 'COMMENTS');
    item.comments.forEach((comment, commentIndex) => bodyBlock(comment, `${commentIndex + 1}.`));
  }
  if (item.changes.length) {
    sectionTitle(item.changes.length === 1 ? 'VISUAL CHANGE' : 'VISUAL CHANGES');
    item.changes.forEach((change) => bodyBlock(describeReviewChange(change), '-'));
  }
  pages.push(current.canvas);
  return pages;
}

function canvasToJpegPage(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('A PDF page could not be rendered.'));
        return;
      }
      resolve({
        width: canvas.width,
        height: canvas.height,
        url: canvas.reviewUrl || '',
        bytes: new Uint8Array(await blob.arrayBuffer())
      });
    }, 'image/jpeg', 0.9);
  });
}

function joinByteArrays(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function pdfFromJpegPages(pages) {
  const encode = (value) => new TextEncoder().encode(value);
  const escapePdfString = (value) => String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, '');
  let nextObjectId = 3;
  const pageDefinitions = pages.map((page) => {
    const definition = {
      page,
      pageId: nextObjectId,
      imageId: nextObjectId + 1,
      contentId: nextObjectId + 2,
      annotationId: page.url ? nextObjectId + 3 : null
    };
    nextObjectId += page.url ? 4 : 3;
    return definition;
  });
  const objectCount = nextObjectId - 1;
  const objects = new Array(objectCount + 1);
  const pageIds = pageDefinitions.map(({ pageId }) => pageId);
  objects[1] = [encode('<< /Type /Catalog /Pages 2 0 R >>')];
  objects[2] = [encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)];
  pageDefinitions.forEach(({ page, pageId, imageId, contentId, annotationId }) => {
    const content = encode('q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n');
    const annotations = annotationId ? `/Annots [${annotationId} 0 R] ` : '';
    objects[pageId] = [encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ${annotations}/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)];
    objects[imageId] = [
      encode(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`),
      page.bytes,
      encode('\nendstream')
    ];
    objects[contentId] = [encode(`<< /Length ${content.length} >>\nstream\n`), content, encode('endstream')];
    if (annotationId) {
      objects[annotationId] = [encode(`<< /Type /Annot /Subtype /Link /Rect [38 12 500 34] /Border [0 0 0] /A << /S /URI /URI (${escapePdfString(page.url)}) >> >>`)];
    }
  });

  const parts = [encode('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n')];
  const offsets = new Array(objectCount + 1).fill(0);
  let length = parts[0].length;
  for (let id = 1; id <= objectCount; id += 1) {
    offsets[id] = length;
    const objectParts = [encode(`${id} 0 obj\n`), ...objects[id], encode('\nendobj\n')];
    parts.push(...objectParts);
    length += objectParts.reduce((total, part) => total + part.length, 0);
  }
  const xrefOffset = length;
  parts.push(encode(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`));
  for (let id = 1; id <= objectCount; id += 1) {
    parts.push(encode(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`));
  }
  parts.push(encode(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return new Blob([joinByteArrays(parts)], { type: 'application/pdf' });
}

async function downloadReviewPdf() {
  const items = reviewItems();
  if (!items.length) return;
  if (!window.chrome?.runtime?.sendMessage || !window.chrome?.downloads?.download) {
    notify('Review export is available after the extension is loaded in Chrome.', 'error');
    return;
  }
  const originalLabel = reviewPdfExportButton.textContent;
  reviewPdfExportButton.disabled = true;
  handoffFabMenu.setAttribute('aria-busy', 'true');
  try {
    await document.fonts?.ready;
    const contexts = reviewCaptureContexts(items);
    let nextContext = 0;
    let capturedItems = 0;
    reviewPdfExportButton.textContent = `Capturing 0/${items.length}...`;
    const captureNextContext = async () => {
      while (nextContext < contexts.length) {
        const context = contexts[nextContext];
        nextContext += 1;
        try {
          const response = await promiseWithTimeout(window.chrome.runtime.sendMessage({
            type: 'capture-review-context',
            url: context.url,
            width: context.viewport.width,
            height: context.viewport.height,
            // Screenshots show the live site as it is; edits are listed as before/after notes.
            changes: [],
            targets: context.targets
          }), 20000, 'The page took too long to prepare.');
          if (!response?.ok) throw new Error(response?.error || 'Unable to capture this page.');
          const captures = new Map((response.captures || []).map((capture) => [capture.id, capture]));
          context.targets.forEach(({ id }) => {
            if (response.identity) items[id].siteIdentity = response.identity;
            const capture = captures.get(id);
            if (!capture) {
              items[id].captureError = 'Chrome did not return this screenshot.';
              return;
            }
            items[id].screenshot = capture.dataUrl;
            items[id].highlighted = items[id].element ? capture.highlighted : undefined;
          });
        } catch (error) {
          context.targets.forEach(({ id }) => { items[id].captureError = error.message; });
        }
        capturedItems += context.targets.length;
        reviewPdfExportButton.textContent = `Captured ${Math.min(capturedItems, items.length)}/${items.length}...`;
        speak(`${Math.min(capturedItems, items.length)} of ${items.length} review screenshots prepared.`);
      }
    };
    const workerCount = Math.min(2, contexts.length);
    await Promise.all(Array.from({ length: workerCount }, () => captureNextContext()));

    const logoImages = new Map();
    await Promise.all(items.map(async (item) => {
      const logoDataUrl = item.siteIdentity?.logoDataUrl;
      if (!logoDataUrl) return;
      if (!logoImages.has(logoDataUrl)) {
        logoImages.set(logoDataUrl, loadReviewImage(logoDataUrl).catch(() => null));
      }
      item.reviewLogoImage = await logoImages.get(logoDataUrl);
    }));

    const canvases = [drawReviewCover(items)];
    for (let index = 0; index < items.length; index += 1) {
      canvases.push(...await drawReviewItemPages(items[index], index, items.length));
    }
    canvases.forEach((canvas, index) => {
      const context = canvas.getContext('2d');
      context.save();
      context.globalAlpha = 0.5;
      context.fillStyle = '#71717a';
      context.font = '500 16px Inter, sans-serif';
      context.textAlign = 'start';
      context.fillText(
        ellipsizeCanvasText(context, canvas.reviewUrl, REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2) - 150),
        REVIEW_PAGE.margin,
        REVIEW_PAGE.height - 58
      );
      context.restore();
      context.fillStyle = '#a1a1aa';
      context.font = '600 16px Inter, sans-serif';
      context.textAlign = 'end';
      context.fillText(`${index + 1} / ${canvases.length}`, REVIEW_PAGE.width - REVIEW_PAGE.margin, REVIEW_PAGE.height - 58);
      context.textAlign = 'start';
    });
    reviewPdfExportButton.textContent = 'Building PDF...';
    const jpegPages = [];
    for (const canvas of canvases) jpegPages.push(await canvasToJpegPage(canvas));
    const pdf = pdfFromJpegPages(jpegPages);
    const objectUrl = URL.createObjectURL(pdf);
    try {
      await window.chrome.downloads.download({ url: objectUrl, filename: reviewFilename(), saveAs: false });
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
    const missing = items.filter((item) => item.captureError).length;
    notify(missing
      ? `Review PDF downloaded. ${missing} screenshot${missing === 1 ? '' : 's'} could not be captured.`
      : 'Review PDF downloaded.', missing ? 'error' : 'success');
  } catch (error) {
    notify(`Review PDF was not saved: ${error.message}`, 'error');
  } finally {
    reviewPdfExportButton.disabled = false;
    reviewPdfExportButton.textContent = originalLabel;
    handoffFabMenu.removeAttribute('aria-busy');
  }
}

// HTML design review: one capture per page/viewport, with every comment and
// CSS change of that viewport placed on it as a numbered marker.
function reviewHtmlContexts() {
  const contexts = new Map();
  const contextFor = ({ url, viewport }) => {
    const canonicalUrl = canonicalInspectorUrl(url || targetUrl);
    const width = Math.round(Number(viewport?.width) || 0);
    const height = Math.round(Number(viewport?.height) || 0);
    const key = [canonicalUrl, width, height].join('\u0000');
    if (!contexts.has(key)) {
      contexts.set(key, { url: canonicalUrl, viewport: { width, height }, entries: [], targets: new Map() });
    }
    return contexts.get(key);
  };
  const addEntry = (source, entry) => {
    const context = contextFor(source);
    const element = source.element || null;
    const selector = element?.selector || source.selector || '';
    let targetId = null;
    if (element || selector) {
      targetId = reviewElementKey(element, selector);
      if (!context.targets.has(targetId)) context.targets.set(targetId, { element, selector });
    }
    context.entries.push({ ...entry, selector, targetId, order: context.entries.length });
  };

  comments.forEach((comment) => addEntry(comment, { kind: 'comment', text: comment.comment }));
  changeLog.forEach((change) => addEntry(change, {
    kind: 'change',
    property: change.property,
    from: String(change.from || '').trim(),
    to: String(change.to || '').trim(),
    text: describeReviewChange(change)
  }));

  return [...contexts.values()]
    .map((context) => ({
      ...context,
      targets: [...context.targets].map(([id, target]) => ({ id, target }))
    }))
    .sort((left, right) => (
      left.url.localeCompare(right.url)
      || left.viewport.width - right.viewport.width
      || left.viewport.height - right.viewport.height
    ));
}

function reviewHtmlViewport(context, pageIndex, viewportIndex, numberFrom) {
  const shots = [...(context.shots || [])].sort((left, right) => left.scrollY - right.scrollY);
  const placements = new Map();
  shots.forEach((shot, shotIndex) => shot.rects.forEach((rect) => {
    if (rect.found && rect.visible && !placements.has(rect.id)) placements.set(rect.id, { shot: shotIndex, rect });
  }));
  const unplaced = new Map((context.unplaced || []).map((rect) => [rect.id, rect]));
  const topShot = Math.max(0, shots.findIndex((shot) => shot.scrollY === 0));
  const placed = context.entries.map((entry) => {
    if (!entry.targetId) return { entry, target: 'page', shot: topShot };
    const placement = placements.get(entry.targetId);
    if (placement) {
      const { x, y, width, height } = placement.rect;
      return { entry, target: 'element', shot: placement.shot, rect: { x, y, width, height } };
    }
    return { entry, target: unplaced.get(entry.targetId)?.found ? 'hidden' : 'missing', shot: 0 };
  });
  const rank = { page: 0, element: 1, hidden: 2, missing: 3 };
  placed.sort((left, right) => (
    rank[left.target] - rank[right.target]
    || left.shot - right.shot
    || (left.rect && right.rect ? (left.rect.y - right.rect.y) || (left.rect.x - right.rect.x) : 0)
    || left.entry.order - right.entry.order
  ));
  const markersPerTarget = new Map();
  const entries = placed.map(({ entry, target, shot, rect }, index) => {
    const number = numberFrom + index;
    const result = {
      id: `${pageIndex}.${viewportIndex}.${number}`,
      number,
      kind: entry.kind,
      text: entry.text,
      selector: entry.selector,
      target,
      shot
    };
    if (entry.kind === 'change') Object.assign(result, { property: entry.property, from: entry.from, to: entry.to });
    if (rect) {
      const { width, height } = shots[shot];
      const offset = markersPerTarget.get(entry.targetId) || 0;
      markersPerTarget.set(entry.targetId, offset + 1);
      const inset = 13;
      result.rect = rect;
      result.marker = {
        x: Math.min(Math.max(rect.x, inset), Math.max(inset, width - inset - (offset * 24))),
        y: Math.min(Math.max(rect.y, inset), Math.max(inset, height - inset)),
        offset
      };
    }
    return result;
  });
  return {
    width: context.viewport.width,
    height: context.viewport.height,
    shots: shots.map((shot) => ({ src: shot.dataUrl, width: shot.width, height: shot.height, scrollY: shot.scrollY })),
    error: shots.length ? undefined : (context.captureError || 'Chrome did not return an image.'),
    entries
  };
}

function reviewHtmlData(contexts) {
  const pages = [];
  const pagesByUrl = new Map();
  contexts.forEach((context) => {
    if (!pagesByUrl.has(context.url)) {
      const page = { url: context.url, label: reviewPageLabel(context.url), contexts: [] };
      pagesByUrl.set(context.url, page);
      pages.push(page);
    }
    pagesByUrl.get(context.url).contexts.push(context);
  });
  const identity = contexts.find((context) => context.identity?.name || context.identity?.logoDataUrl)?.identity;
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    site: {
      name: reviewSiteName({ url: pages[0]?.url, siteIdentity: identity }),
      logo: identity?.logoDataUrl || ''
    },
    pages: pages.map((page, pageIndex) => {
      let number = 1;
      return {
        url: page.url,
        label: page.label,
        viewports: page.contexts.map((context, viewportIndex) => {
          const viewport = reviewHtmlViewport(context, pageIndex, viewportIndex, number);
          number += viewport.entries.length;
          return viewport;
        })
      };
    })
  };
}

async function buildReviewHtml(data) {
  const response = await fetch(chrome.runtime.getURL('review-viewer.html'));
  if (!response.ok) throw new Error('The review template could not be loaded.');
  const template = await response.text();
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
  // Keep the embedded JSON from closing its <script> element early.
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return template
    .replace('{{PIXELPRISM_REVIEW_TITLE}}', () => escapeHtml(`Design Review · ${data.site.name}`))
    .replace('{{PIXELPRISM_REVIEW_DATA}}', () => json);
}

function reviewHtmlFilename() {
  return reviewFilename().replace(/\.pdf$/, '.html');
}

async function downloadReviewHtml() {
  const contexts = reviewHtmlContexts();
  if (!contexts.length) return;
  if (!window.chrome?.runtime?.sendMessage || !window.chrome?.downloads?.download) {
    notify('Review export is available after the extension is loaded in Chrome.', 'error');
    return;
  }
  const originalLabel = reviewExportButton.textContent;
  reviewExportButton.disabled = true;
  handoffFabMenu.setAttribute('aria-busy', 'true');
  try {
    let nextContext = 0;
    let captured = 0;
    reviewExportButton.textContent = `Capturing 0/${contexts.length}...`;
    const captureNextContext = async () => {
      while (nextContext < contexts.length) {
        const context = contexts[nextContext];
        nextContext += 1;
        try {
          const response = await promiseWithTimeout(window.chrome.runtime.sendMessage({
            type: 'capture-review-page',
            url: context.url,
            width: context.viewport.width,
            height: context.viewport.height,
            // Screenshots show the live site as it is; edits are listed as before/after notes.
            changes: [],
            targets: context.targets
          }), 30000 + (context.targets.length * 12000), 'The page took too long to prepare.');
          if (!response?.ok) throw new Error(response?.error || 'Unable to capture this page.');
          context.shots = response.shots;
          context.unplaced = response.unplaced;
          context.identity = response.identity;
        } catch (error) {
          context.captureError = error.message;
        }
        captured += 1;
        reviewExportButton.textContent = `Captured ${captured}/${contexts.length}...`;
        speak(`${captured} of ${contexts.length} review screenshots prepared.`);
      }
    };
    const workerCount = Math.min(2, contexts.length);
    await Promise.all(Array.from({ length: workerCount }, () => captureNextContext()));

    reviewExportButton.textContent = 'Building review...';
    const html = await buildReviewHtml(reviewHtmlData(contexts));
    const objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    try {
      await window.chrome.downloads.download({ url: objectUrl, filename: reviewHtmlFilename(), saveAs: false });
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
    const missing = contexts.filter((context) => context.captureError).length;
    notify(missing
      ? `Design review downloaded. ${missing} screenshot${missing === 1 ? '' : 's'} could not be captured.`
      : 'Design review downloaded.', missing ? 'error' : 'success');
  } catch (error) {
    notify(`Design review was not saved: ${error.message}`, 'error');
  } finally {
    reviewExportButton.disabled = false;
    reviewExportButton.textContent = originalLabel;
    handoffFabMenu.removeAttribute('aria-busy');
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

function enableNavigationSync(card) {
  const iframe = card.querySelector('iframe');
  iframe?.contentWindow?.postMessage({
    source: 'viewport-parade',
    type: 'enable-navigation-sync',
    expectedUrl: card.dataset.loadedUrl || targetUrl
  }, '*');
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
  const layoutNoteFor = () => {
    const context = editor.context || {};
    const values = editor.values || {};
    const notes = [];
    const isFlex = values.display === 'flex';
    if (isFlex && values.width === 'auto' && values.height === 'auto') {
      notes.push('Flex is active, but this element is auto-sized, so alignment has little free space to move children.');
    }
    if (String(context.parentDisplay || '').includes('grid')) {
      notes.push('This element is positioned by its parent grid; use Column placement / Row placement or edit the parent grid to move it.');
    }
    if (isFlex && Number(context.childElementCount) < 2) {
      notes.push('Flex controls are most visible when the selected element has multiple child elements.');
    }
    return notes.join(' ');
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
    if (groupStart?.[0] === 'Layout') {
      const note = layoutNoteFor();
      if (note) {
        const noteNode = document.createElement('p');
        noteNode.className = 'inspector-note';
        noteNode.textContent = note;
        currentGroup.insertBefore(noteNode, groupFields);
      }
    }
    if (!groupFields) return;
    const field = document.createElement('label');
    field.className = `inspector-field${wide ? ' is-wide' : ''}`;
    if (layoutFor) field.dataset.layoutFor = layoutFor;
    const isDimension = property === 'width' || property === 'height';
    const isTypography = editorMode === 'typography';
    const isColorField = COLOR_FIELDS.has(property);
    const compactTypeControl = isTypography && ['fontStyle', 'fontSize'].includes(property);
    const edgePrefix = ({ marginTop: 'Top', marginRight: 'Right', marginBottom: 'Bottom', marginLeft: 'Left', paddingTop: 'Top', paddingRight: 'Right', paddingBottom: 'Bottom', paddingLeft: 'Left' })[property];
    const gapPrefix = ({ rowGap: 'Row', columnGap: 'Col' })[property];
    const inlinePrefix = edgePrefix || gapPrefix || (isTypography && ({ lineHeight: 'A', letterSpacing: '↔' })[property]);
    if (isDimension) field.classList.add('is-dimension');
    if (edgePrefix) field.classList.add('is-box-edge');
    if (gapPrefix) field.classList.add('is-gap');
    if (isColorField) field.classList.add('is-color');
    if (isTypography) field.classList.add(`is-type-${property}`);
    if (!isDimension && !compactTypeControl && !edgePrefix && !gapPrefix) field.textContent = label;
    if (compactTypeControl || isDimension || edgePrefix || gapPrefix) {
      const accessibleLabel = document.createElement('span');
      accessibleLabel.className = 'sr-only';
      accessibleLabel.textContent = label;
      field.append(accessibleLabel);
    }
    const input = type === 'select' ? document.createElement('select') : document.createElement('input');
    if (type !== 'select') {
      input.type = CSS_LENGTH_FIELDS.has(property) ? 'text' : type;
      if (CSS_LENGTH_FIELDS.has(property)) input.inputMode = 'decimal';
    }
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
    let colorPicker;
    if (input instanceof HTMLInputElement) {
      input.addEventListener('pointerdown', () => {
        input.dataset.selectOnFocus = String(document.activeElement !== input);
      });
      input.addEventListener('pointerup', () => {
        if (input.dataset.selectOnFocus !== 'true' || document.activeElement !== input) return;
        delete input.dataset.selectOnFocus;
        input.select();
      });
      input.addEventListener('focus', () => {
        if (input.dataset.selectOnFocus === 'false') return;
        requestAnimationFrame(() => {
          if (document.activeElement === input) input.select();
        });
      });
      input.addEventListener('blur', () => {
        delete input.dataset.selectOnFocus;
      });
      if (isColorField) {
        colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.className = 'inspector-color-picker';
        colorPicker.value = cssColorToHex(currentValue) || '#000000';
        colorPicker.setAttribute('aria-label', `${label} picker`);
        colorPicker.dataset.colorPickerFor = property;
        colorPicker.addEventListener('input', () => {
          input.value = colorPicker.value.toUpperCase();
          input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        });
        colorPicker.addEventListener('change', () => {
          input.value = colorPicker.value.toUpperCase();
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        input.addEventListener('input', () => {
          const nextColor = cssColorToHex(input.value);
          if (nextColor) colorPicker.value = nextColor;
        });
      }
    }
    if (isDimension || inlinePrefix) {
      const shell = document.createElement('span');
      shell.className = 'inspector-input-shell';
      const prefix = document.createElement('span');
      prefix.className = 'inspector-input-prefix';
      prefix.setAttribute('aria-hidden', 'true');
      prefix.textContent = isDimension ? (property === 'width' ? 'W' : 'H') : inlinePrefix;
      shell.append(prefix, input);
      field.append(shell);
    } else if (colorPicker) {
      const shell = document.createElement('span');
      shell.className = 'inspector-color-shell';
      shell.append(input, colorPicker);
      field.append(shell);
    } else {
      field.append(input);
    }
    const source = editor.valueSources?.[property];
    if (source?.kind === 'declared' && ['gridTemplateColumns', 'gridTemplateRows', 'gridAutoColumns', 'gridAutoRows', 'gridAutoFlow', 'gridColumn', 'gridRow'].includes(property)) {
      const sourceNode = document.createElement('span');
      sourceNode.className = `inspector-source is-${source.kind}`;
      sourceNode.textContent = `declared${source.selector ? ` · ${source.selector}` : ''}`;
      field.append(sourceNode);
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
      enableNavigationSync(card);
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
  enableNavigationSync(card);
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
  const previousValue = input.dataset.previousValue ?? '';
  if (event.type === 'change' && input.value === previousValue) return;
  inspectorFrame.contentWindow.postMessage({
    source: 'viewport-parade',
    type: 'inspector-editor-input',
    property: input.dataset.property,
    value: input.value,
    previousValue
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
reviewExportButton.addEventListener('click', async () => {
  await downloadReviewHtml();
  setHandoffFabOpen(false);
});
reviewPdfExportButton.addEventListener('click', async () => {
  await downloadReviewPdf();
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
