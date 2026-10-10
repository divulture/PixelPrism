// Shared state, Studio elements, viewport presets, the address bar and small helpers.

// The stock presets. DEVICES holds the viewports of the workspace in use,
// starting with these (the Default workspace).
const STOCK_DEVICES = {
  phone: { name: 'Phone', width: 390, height: 844 },
  phoneWide: { name: 'Phone L', width: 568, height: 740 },
  tablet: { name: 'Tablet', width: 768, height: 1024 },
  laptop: { name: 'Laptop', width: 1024, height: 820 },
  desktop: { name: 'Desktop', width: 1440, height: 900 }
};
const DEVICES = Object.fromEntries(Object.entries(STOCK_DEVICES).map(([id, device]) => [id, { ...device }]));

// Keys as the viewer's system names them: symbols on macOS, words on Windows
// and Linux. Shortcut handlers take Cmd and Ctrl alike.
const IS_MAC = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform);
const KEY_NAMES = IS_MAC
  ? { shift: { label: '⇧', name: 'Shift' }, mod: { label: '⌘', name: 'Command' }, alt: { label: '⌥', name: 'Option' }, enter: { label: '↵', name: 'Enter' } }
  : { shift: { label: 'Shift' }, mod: { label: 'Ctrl' }, alt: { label: 'Alt' }, enter: { label: 'Enter' } };
document.documentElement.dataset.platform = IS_MAC ? 'mac' : 'other';

const params = new URLSearchParams(location.search);
const form = document.querySelector('#address-form');
const urlInput = document.querySelector('#page-url');
const addressDisplay = document.querySelector('#address-display');
const grid = document.querySelector('#viewport-grid');
const template = document.querySelector('#viewport-template');
const status = document.querySelector('#status');
const toast = document.querySelector('#toast');
const notice = document.querySelector('#embed-notice');
const zoomValue = document.querySelector('#zoom-value');
const devicePicker = document.querySelector('.device-picker');
const customDialog = document.querySelector('#custom-dialog');
const workspaceDialog = document.querySelector('#workspace-dialog');
const workspaceTrigger = document.querySelector('#workspace-trigger');
const workspaceList = document.querySelector('#workspace-list');
const customForm = document.querySelector('#custom-form');
const favicon = document.querySelector('#site-favicon');
const customSizeList = document.querySelector('#custom-size-list');
const customWidth = document.querySelector('#custom-width');
const customHeight = document.querySelector('#custom-height');
const customTrigger = document.querySelector('#custom-trigger');
const changeReportButton = document.querySelector('#change-report-button');
const copyCodexButton = document.querySelector('#copy-codex-button');
const reviewExportButton = document.querySelector('#review-export-button');
const reviewPdfExportButton = document.querySelector('#review-pdf-export-button');
const agentsHandoffButton = document.querySelector('#agents-handoff-button');
const exportReviewMenu = document.querySelector('#export-review-menu');
const inspectorPanel = document.querySelector('#inspector-panel');
const inspectorPanelTitle = document.querySelector('#inspector-title');
const inspectorPanelSelector = document.querySelector('#inspector-selector');
const inspectorPanelFields = document.querySelector('#inspector-panel-fields');
const inspectorPanelClose = document.querySelector('#inspector-panel-close');
const inspectorPanelMore = document.querySelector('#inspector-panel-more');
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
const commentsImportButton = document.querySelector('#comments-import');
const commentsMenuToggle = document.querySelector('#comments-menu-toggle');
const commentsMenu = document.querySelector('#comments-menu');
const commentsMenuDeleteAll = document.querySelector('#comments-delete-all');
const commentsImportInput = document.querySelector('#comments-import-input');
const commentAttachButton = document.querySelector('#comment-attach');
const commentAttachInput = document.querySelector('#comment-attach-input');
const commentDraftAttachments = document.querySelector('#comment-draft-attachments');
const imageViewer = document.querySelector('#image-viewer');
const imageViewerImage = document.querySelector('#image-viewer-image');
const imageViewerCaption = document.querySelector('#image-viewer-caption');
const imageViewerPrev = document.querySelector('#image-viewer-prev');
const imageViewerNext = document.querySelector('#image-viewer-next');

// Before a site is open the previews show the extension's demo page: every
// tool works on it, and nothing done there is stored (see storage.js).
const DEMO_URL = new URL('demo/index.html', location.href).href;
const DEMO_ORIGIN = new URL(DEMO_URL).origin;
const isDemoUrl = (url) => typeof url === 'string' && url.split('#')[0] === DEMO_URL;
let targetUrl = normalizeUrl(params.get('url') || '') || DEMO_URL;
let fileAccessAllowed = params.get('fileAccess') !== 'false';
let selected = new Set(['desktop']);
let mode = 'multi';
let zoom = 1;
let singleWidth = DEVICES.desktop.width;
let customDeviceCount = 0;
let dragState = null;
let faviconCandidates = [];
let toastTimer;
let inspectorFrame;
let inspectorModeActive = false;
let layersFrame;
let layersTreeData;
let selectedLayerPath;
// Text selected inside the element at selectedLayerPath: its index among the
// element's child nodes, or null when the element itself is selected.
let selectedLayerText = null;
let hoveredLayerPath;
const expandedLayerPaths = new Set();
const collapsedLayerPaths = new Set();
// The selected element's ancestors and children for the breadcrumbs; see
// renderBreadcrumbs.
let breadcrumbAncestors = [];
let breadcrumbChildren = [];
const breadcrumbs = document.querySelector('#breadcrumbs-path');
const changeLog = new Map();
// Style changes are kept per site, as comments are, so closing Studio or
// reloading the extension does not lose them.
const CHANGES_STORAGE_PREFIX = 'pixelprism-changes:';
const storedChangeOrigins = new Set();
// Changes whose control is hidden in the panel (flex settings after switching
// to Block, a gap that no longer applies) stay applied in the preview but are
// marked inactive: only what the panel shows goes to the agent.
// Comments and edits belong to their site: Studio shows, counts and hands off
// only those of the site open in the previews (other sites keep theirs).
const isCurrentSite = (url) => commentOrigin(url) === commentOrigin(targetUrl);
const activeChanges = () => [...changeLog.values()].filter((change) => !change.inactive && isCurrentSite(change.url));
const siteComments = () => comments.filter((comment) => isCurrentSite(comment.url));
// Comments are numbered within their site, as the list and markers show them.
const commentNumber = (comment) => siteComments().indexOf(comment) + 1;
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

const CUSTOM_PRESETS = [
  { name: 'HD', badge: 'HD', width: 1280, height: 720 },
  { name: 'Full HD', badge: 'FHD', width: 1920, height: 1080 },
  { name: 'QHD', badge: 'QHD', width: 2560, height: 1440 },
  { name: '4K', badge: '4K', width: 3840, height: 2160 }
];

// Ready-made sets of viewports. A viewport is a stock device by id, or a
// named size that becomes a device of its own while the workspace is in use.
// Breakpoint sets use each framework's breakpoints with a phone-sized base.
const breakpointViewport = (name, width) => ({ name, width, height: width < 600 ? 844 : width < 992 ? 1024 : 900 });
const WORKSPACES = [
  { name: 'Default', viewports: [{ device: 'phone' }, { device: 'phoneWide' }, { device: 'tablet' }, { device: 'laptop' }, { device: 'desktop' }] },
  { name: 'Device lab', viewports: [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'Galaxy S24', width: 360, height: 780 },
    { name: 'iPhone 15', width: 393, height: 852 },
    { name: 'Pixel 8', width: 412, height: 915 },
    { name: 'iPad mini', width: 744, height: 1133 },
    { name: 'iPad Pro 13″', width: 1032, height: 1376 }
  ] },
  { name: 'Most used sizes', viewports: [
    { name: 'Android', width: 360, height: 800 },
    { name: 'iPhone', width: 390, height: 844 },
    { name: 'iPhone Plus', width: 414, height: 896 },
    { name: 'Laptop HD', width: 1366, height: 768 },
    { name: 'Laptop', width: 1536, height: 864 },
    { name: 'Full HD', width: 1920, height: 1080 }
  ] },
  { name: 'iOS devices', viewports: [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 13 mini', width: 375, height: 812 },
    { name: 'iPhone 15', width: 393, height: 852 },
    { name: 'iPhone 15 Plus', width: 430, height: 932 },
    { name: 'iPhone 16 Pro Max', width: 440, height: 956 },
    { name: 'iPad mini', width: 744, height: 1133 },
    { name: 'iPad Air 11″', width: 820, height: 1180 },
    { name: 'iPad Pro 13″', width: 1032, height: 1376 }
  ] },
  { name: 'Android devices', viewports: [
    { name: 'Galaxy S24', width: 360, height: 780 },
    { name: 'Galaxy S24 Ultra', width: 384, height: 824 },
    { name: 'Pixel 8', width: 412, height: 915 },
    { name: 'Pixel 8 Pro', width: 448, height: 998 },
    { name: 'Galaxy Tab S9', width: 800, height: 1280 }
  ] },
  { name: 'Bootstrap 5', viewports: [
    breakpointViewport('Bootstrap xs', 375), breakpointViewport('Bootstrap sm', 576), breakpointViewport('Bootstrap md', 768),
    breakpointViewport('Bootstrap lg', 992), breakpointViewport('Bootstrap xl', 1200), breakpointViewport('Bootstrap xxl', 1400)
  ] },
  { name: 'Material UI', viewports: [
    breakpointViewport('MUI xs', 360), breakpointViewport('MUI sm', 600), breakpointViewport('MUI md', 900),
    breakpointViewport('MUI lg', 1200), breakpointViewport('MUI xl', 1536)
  ] },
  { name: 'Tailwind CSS', viewports: [
    breakpointViewport('Tailwind base', 375), breakpointViewport('Tailwind sm', 640), breakpointViewport('Tailwind md', 768),
    breakpointViewport('Tailwind lg', 1024), breakpointViewport('Tailwind xl', 1280), breakpointViewport('Tailwind 2xl', 1536)
  ] },
  { name: 'Bulma', viewports: [
    breakpointViewport('Bulma mobile', 375), breakpointViewport('Bulma tablet', 769), breakpointViewport('Bulma desktop', 1024),
    breakpointViewport('Bulma widescreen', 1216), breakpointViewport('Bulma fullhd', 1408)
  ] },
  // Filled from the open site's CSS each time it is chosen (detectSiteBreakpoints).
  { name: 'Site breakpoints', detected: true, viewports: [] }
];
// Workspaces do not mix: the picker and the previews show only the chosen
// workspace's viewports. Custom viewports added with + belong to the
// workspace they were added in and go away with it.
let activeWorkspace = 0;

// Where a change or comment was made: the workspace and device of its
// preview. Records made before workspaces existed (or imported without
// them) are placed in the first workspace that has their size.
function placeOfCard(card) {
  return { workspace: WORKSPACES[activeWorkspace].name, device: DEVICES[card?.dataset.device]?.name || '' };
}

function sameViewportSize(left, right) {
  return left.width === right.width && left.height === right.height;
}

function workspaceOf(item) {
  return WORKSPACES.find((workspace) => workspace.name === item.workspace)
    || WORKSPACES.find((workspace) => workspaceViewports(workspace).some((viewport) => sameViewportSize(viewport, item.viewport)))
    || null;
}

function deviceOf(item) {
  if (item.device) return item.device;
  if (item.viewport?.device) return item.viewport.device;
  const workspace = workspaceOf(item);
  return (workspace && workspaceViewports(workspace).find((viewport) => sameViewportSize(viewport, item.viewport))?.name) || '';
}

// "iOS devices · iPhone SE · 375 × 667"; the agent's report leaves out the
// workspace, which says nothing about the code.
function viewportLabel(item, { workspace = true } = {}) {
  return [workspace ? workspaceOf(item)?.name : '', deviceOf(item), `${item.viewport.width} × ${item.viewport.height}`].filter(Boolean).join(' · ');
}

const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 320;
const INSPECTOR_PROTOCOL_VERSION = 65;

// The Inspector's states.
const INSPECTOR_STATE_LABELS = { default: 'Default', hover: 'Hover', focus: 'Focus', active: 'Pressed' };
// The rule an edit made in each state goes to, as the page script writes it.
const INSPECTOR_STATE_SUFFIXES = { hover: ':hover', focus: ':focus-visible', active: ':active' };

urlInput.value = isDemoUrl(targetUrl) ? '' : targetUrl;


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
  // The demo page is no address of the user's: the field stays empty.
  const hasUrl = Boolean(targetUrl) && !isDemoUrl(targetUrl);
  document.body.dataset.hasUrl = String(hasUrl);
  addressDisplay.hidden = !hasUrl;
  urlInput.hidden = hasUrl;
  if (hasUrl) addressDisplay.textContent = displayAddress(targetUrl);
  faviconCandidates = hasUrl ? [url, fallbackFavicon(targetUrl), googleFavicon(targetUrl)].filter(Boolean) : [];
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
    if (isDemoUrl(targetUrl) || document.activeElement === urlInput) return;
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
  restoreComments();
  restoreChanges();
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

// A message about a button (the dock's handoff tools) shows above that
// button; any other one above the middle of the dock.
function placeToast(anchor) {
  toast.style.left = '';
  toast.style.bottom = '';
  if (!anchor?.isConnected) return;
  const box = anchor.getBoundingClientRect();
  const half = toast.offsetWidth / 2;
  toast.style.left = `${Math.min(Math.max(box.left + box.width / 2, half + 12), window.innerWidth - half - 12)}px`;
  toast.style.bottom = `${window.innerHeight - box.top + 14}px`;
}

function notify(message, tone = 'default', anchor = null) {
  speak(message);
  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  placeToast(anchor);
  clearTimeout(toastTimer);
  // Longer messages say what to do next: they stay long enough to read.
  toastTimer = setTimeout(() => { toast.hidden = true; }, Math.max(4200, message.length * 65));
}

// A toast that stays while a long task runs; the next notify replaces it.
function showProgress(message, anchor = null) {
  toast.textContent = message;
  toast.dataset.tone = 'default';
  toast.hidden = false;
  placeToast(anchor);
  clearTimeout(toastTimer);
}

function escapeInlineCode(value) {
  return String(value).replace(/`/g, '\\`');
}

// Places a fixed menu by the field that opens it: below it, or above it when
// that is where it fits, and never higher than minTop (under the toolbar). A
// menu taller than both sides takes the larger one and scrolls.
function placeMenuBy(menu, box, minTop = 8) {
  menu.style.maxBlockSize = '';
  const below = box.bottom + 4;
  const spaceBelow = innerHeight - 8 - below;
  const spaceAbove = box.top - 4 - minTop;
  const height = menu.offsetHeight;
  if (height <= spaceBelow || spaceBelow >= spaceAbove) {
    if (height > spaceBelow) menu.style.maxBlockSize = `${spaceBelow}px`;
    menu.style.top = `${below}px`;
  } else {
    if (height > spaceAbove) menu.style.maxBlockSize = `${spaceAbove}px`;
    menu.style.top = `${box.top - 4 - Math.min(height, spaceAbove)}px`;
  }
}
