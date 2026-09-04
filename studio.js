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
const handoffFab = document.querySelector('#handoff-fab');
const handoffFabToggle = document.querySelector('#handoff-fab-toggle');
const handoffFabMenu = document.querySelector('#handoff-fab-menu');
const handoffFabClose = document.querySelector('#handoff-fab-close');
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

let targetUrl = normalizeUrl(params.get('url') || '');
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
const breadcrumbs = document.createElement('nav');
breadcrumbs.className = 'breadcrumbs';
breadcrumbs.setAttribute('aria-label', 'Selected element path');
breadcrumbs.hidden = true;
document.body.append(breadcrumbs);
const changeLog = new Map();
// Style changes are kept per site, as comments are, so closing Studio or
// reloading the extension does not lose them.
const CHANGES_STORAGE_PREFIX = 'pixelprism-changes:';
const storedChangeOrigins = new Set();
// Changes whose control is hidden in the panel (flex settings after switching
// to Block, a gap that no longer applies) stay applied in the preview but are
// marked inactive: only what the panel shows goes to the agent.
const activeChanges = () => [...changeLog.values()].filter((change) => !change.inactive);
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
const INSPECTOR_PROTOCOL_VERSION = 54;

const INSPECTOR_FIELDS = {
  size: [['width', 'W', 'text'], ['height', 'H', 'text'], ['minWidth', 'Min W', 'text'], ['minHeight', 'Min H', 'text'], ['maxWidth', 'Max W', 'text'], ['maxHeight', 'Max H', 'text']],
  margin: [['marginTop', 'M top', 'number'], ['marginRight', 'M right', 'number'], ['marginBottom', 'M bottom', 'number'], ['marginLeft', 'M left', 'number']],
  padding: [['paddingTop', 'P top', 'number'], ['paddingRight', 'P right', 'number'], ['paddingBottom', 'P bottom', 'number'], ['paddingLeft', 'P left', 'number']],
  gap: [['rowGap', 'Gap row', 'number'], ['columnGap', 'Gap col', 'number']],
  component: [
    ['display', 'Display', 'select', true, null, [['block', 'Block'], ['flex', 'Flex'], ['grid', 'Grid']]],
    ['flexDirection', 'Direction', 'select', null, 'flex', [['row', 'Row'], ['column', 'Column'], ['row-reverse', 'Row reverse'], ['column-reverse', 'Column reverse']]],
    ['flexWrap', 'Wrap', 'select', null, 'flex', [['nowrap', 'No wrap'], ['wrap', 'Wrap'], ['wrap-reverse', 'Wrap reverse']]],
    ['justifyContent', 'Justify content', 'select', null, 'flex', [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['space-between', 'Space between'], ['space-around', 'Space around'], ['space-evenly', 'Space evenly']]],
    ['alignContent', 'Align content', 'select', null, 'flex', [['normal', 'Normal'], ['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['space-between', 'Space between'], ['space-around', 'Space around'], ['stretch', 'Stretch']]],
    // Grid: track counts (templates behind the wrench), flow, item alignment.
    ['gridTracks', 'Grid', 'custom', true, 'grid'],
    ['gridAutoFlow', 'Direction', 'custom', true, 'grid'],
    ['gridAlign', 'Align', 'custom', true, 'grid'],
    ['columnGap', 'Gap', 'custom', true, 'flex-grid'],
    // Grid content alignment, folded away.
    ['gridMoreAlign', 'More alignment', 'custom', true, 'grid'],
    // How this element sits in a flex or grid parent; see childLayoutFields.
    ['childLayout', 'Child', 'custom'],
    ['width', 'W', 'text'], ['height', 'H', 'text'], ['minWidth', 'Min W', 'text'], ['minHeight', 'Min H', 'text'], ['maxWidth', 'Max W', 'text'], ['maxHeight', 'Max H', 'text'],
    // What happens to content that doesn't fit; see overflowField.
    ['overflow', 'Overflow', 'custom'],
    ['marginTop', 'M top', 'number'], ['marginRight', 'M right', 'number'], ['marginBottom', 'M bottom', 'number'], ['marginLeft', 'M left', 'number'], ['paddingTop', 'P top', 'number'], ['paddingRight', 'P right', 'number'], ['paddingBottom', 'P bottom', 'number'], ['paddingLeft', 'P left', 'number'],
    // Position scheme, offsets and stacking; see positionFields.
    ['position', 'Position', 'custom'],
    ['backgroundColor', 'Background', 'text', true],
    // Picture settings for an img / video or a background image.
    ['imageSettings', 'Image', 'custom'],
    ['borderWidth', 'Border width', 'number'], ['borderColor', 'Border color', 'text'], ['borderStyle', 'Border style', 'select', true, null, [['none', 'None'], ['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']]], ['borderRadius', 'Radius', 'number'],
    // Weight also carries font-style; see fontWeightStyleControl.
    ['fontFamily', 'Font family', 'text', true], ['fontWeight', 'Weight', 'text'], ['fontSize', 'Size', 'number'],
    ['lineHeight', 'Line height', 'text'], ['letterSpacing', 'Letter spacing', 'text'],
    ['color', 'Text color', 'text'], ['opacity', 'Opacity', 'number'],
    ['textAlign', 'Align', 'select', true, null, [['start', 'Left'], ['center', 'Center'], ['end', 'Right'], ['justify', 'Justify']]],
    ['textDecorationLine', 'Decoration', 'select', true, null, [['none', 'None'], ['underline', 'Underline'], ['overline', 'Overline'], ['line-through', 'Strike']]],
    ['textTransform', 'Transform', 'select', true, null, [['none', 'None'], ['uppercase', 'Uppercase'], ['lowercase', 'Lowercase'], ['capitalize', 'Capitalize']]],
    ['fontStretch', 'Stretch', 'text'],
    ['wordSpacing', 'Word space', 'text'], ['textIndent', 'Indent', 'number'],
    // Fields built by TYPE_MORE_CONTROLS, in pairs for the two columns; Word
    // break brings Line break (white-space), and Stroke width its color.
    ['columnCount', 'Columns', 'custom'], ['direction', 'Direction', 'custom'], ['overflowWrap', 'Wrap', 'custom'], ['wordBreak', 'Word break', 'custom'],
    ['webkitTextStrokeWidth', 'Stroke', 'custom'], ['textOverflow', 'Truncate', 'custom'], ['textShadow', 'Text shadows', 'custom'],
    ['fontVariationSettings', 'Font variation', 'text', true], ['fontFeatureSettings', 'Font features', 'text', true],
    // A list of shadows; see shadowListField.
    ['boxShadow', 'Box shadows', 'custom'],
    ['filter', 'Filters', 'custom'],
    ['cursor', 'Cursor', 'custom']
  ],
  typography: [['fontFamily', 'Font family', 'text', true], ['fontStyle', 'Style', 'text'], ['fontSize', 'Size', 'number'], ['fontWeight', 'Weight', 'number'], ['fontStretch', 'Stretch', 'text'], ['lineHeight', 'Line height', 'text'], ['letterSpacing', 'Letter spacing', 'text'], ['wordSpacing', 'Word space', 'text'], ['textTransform', 'Transform', 'text'], ['textDecorationLine', 'Decoration', 'text'], ['textAlign', 'Align', 'text'], ['textIndent', 'Indent', 'number'], ['fontVariationSettings', 'Font variation', 'text', true], ['fontFeatureSettings', 'Font features', 'text', true], ['width', 'W', 'text'], ['height', 'H', 'text'], ['minWidth', 'Min W', 'text'], ['minHeight', 'Min H', 'text'], ['maxWidth', 'Max W', 'text'], ['maxHeight', 'Max H', 'text'], ['marginTop', 'M top', 'number'], ['marginRight', 'M right', 'number'], ['marginBottom', 'M bottom', 'number'], ['marginLeft', 'M left', 'number'], ['paddingTop', 'P top', 'number'], ['paddingRight', 'P right', 'number'], ['paddingBottom', 'P bottom', 'number'], ['paddingLeft', 'P left', 'number']]
};

// Typography fields whose value or tabs say what they are; their label is
// kept for screen readers and the hover title only.
const UNLABELED_FIELDS = new Set(['fontFamily', 'fontWeight', 'fontSize', 'textAlign', 'textDecorationLine', 'textTransform', 'color', 'opacity', 'borderWidth', 'borderColor', 'borderStyle', 'backgroundColor', 'display']);

// Fields shown as tabs instead of a dropdown.
const INSPECTOR_TAB_FIELDS = new Set(['display', 'textAlign', 'textDecorationLine', 'textTransform', 'borderStyle']);

// 16px line icons: tab faces for text alignment, and prefixes that tell the
// label-less line height, letter spacing, opacity and border width inputs apart.
const INSPECTOR_ICON_PATHS = {
  textAlign: {
    start: 'M2 4h12M2 8h8M2 12h10',
    center: 'M2 4h12M4 8h8M3 12h10',
    end: 'M2 4h12M6 8h8M4 12h10',
    justify: 'M2 4h12M2 8h12M2 12h12'
  },
  // None stays a word; the other border styles draw their line.
  borderStyle: {
    solid: 'M2 8h12',
    dashed: 'M2 8h3M6.5 8h3M11 8h3',
    dotted: 'M2 8h.01M5 8h.01M8 8h.01M11 8h.01M14 8h.01',
    double: 'M2 6h12M2 10h12'
  },
  // One line of items, and items wrapping onto a next line; flexFlowIcon
  // turns them for each direction.
  flexFlow: {
    line: 'M2.5 8h11M10 4.5 13.5 8 10 11.5',
    wrap: 'M2.5 4h11L2.5 12h11M11 9.5 13.5 12 11 14.5'
  },
  check: 'M3.5 8.5 6.5 11.5 12.5 4.5',
  // Overflow tabs: an eye (open or crossed out), a crop frame, and lines
  // scrolling down.
  overflow: {
    visible: 'M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8zM8 6a2 2 0 1 0 0 4A2 2 0 0 0 8 6z',
    hidden: 'M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8zM8 6a2 2 0 1 0 0 4A2 2 0 0 0 8 6zM2.5 2.5l11 11',
    clip: 'M4.5 1.5v10h10M1.5 4.5h10v10',
    scroll: 'M2.5 4h7M2.5 8h7M2.5 12h7M12.5 3.5v9M10.5 10.5l2 2 2-2'
  },
  // More type options: two columns of text, and a paragraph mark with the
  // way text runs.
  type: {
    columns: 'M2.5 3.5h4.5M2.5 6.5h4.5M2.5 9.5h4.5M2.5 12.5h4.5M9 3.5h4.5M9 6.5h4.5M9 9.5h4.5M9 12.5h3',
    ltr: 'M7 2.5v7M10 2.5v7M11.5 2.5h-5a2.25 2.25 0 0 0 0 4.5H7M2.5 13h11M11.5 11l2 2-2 2',
    rtl: 'M7 2.5v7M10 2.5v7M11.5 2.5h-5a2.25 2.25 0 0 0 0 4.5H7M13.5 13h-11M4.5 11l-2 2 2 2',
    add: 'M8 3v10M3 8h10',
    remove: 'M3 8h10'
  },
  // Sliders: each border side set on its own.
  borderSides: {
    custom: 'M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6M10 3.5v3M6 9.5v3'
  },
  // Chevrons apart and together, for the panel menu's Expand / Collapse all.
  sections: {
    expand: 'M5 6l3-3 3 3M5 10l3 3 3-3',
    collapse: 'M5 3l3 3 3-3M5 13l3-3 3 3',
    // A viewfinder around one point.
    focus: 'M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M8 6.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5z'
  },
  // A rounded box and its single corners.
  radius: {
    all: 'M6 2.5h4A3.5 3.5 0 0 1 13.5 6v4a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 10V6A3.5 3.5 0 0 1 6 2.5z',
    TopLeft: 'M3 13V7a4 4 0 0 1 4-4h6',
    TopRight: 'M3 3h6a4 4 0 0 1 4 4v6',
    BottomRight: 'M13 3v6a4 4 0 0 1-4 4H3',
    BottomLeft: 'M13 13H7a4 4 0 0 1-4-4V3'
  },
  lineHeight: 'M3 2.5v11M1.75 2.5h2.5M1.75 13.5h2.5M7 13l3.25-9.5L13.5 13M8.1 10h4.3',
  letterSpacing: 'M5 10.5 8 2.5l3 8M6 8h4M2 13.5h12M3.5 12 2 13.5 3.5 15M12.5 12l1.5 1.5-1.5 1.5',
  // Lines of growing weight.
  borderWidth: 'M2 3h12M2 6.5h12V8H2zM2 11h12v3H2z',
  opacity: 'M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8zM8 6a2 2 0 1 0 0 4A2 2 0 0 0 8 6z',
  // A box with the edge (or edges) a spacing field sets.
  spacing: {
    x: 'M2.5 3v10M13.5 3v10M6 6h4v4H6z',
    y: 'M3 2.5h10M3 13.5h10M6 6h4v4H6z',
    Left: 'M2.5 3v10M6 6h4v4H6z',
    Right: 'M13.5 3v10M6 6h4v4H6z',
    Top: 'M3 2.5h10M6 6h4v4H6z',
    Bottom: 'M3 13.5h10M6 6h4v4H6z',
    sides: 'M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M6 6h4v4H6z'
  }
};
const inspectorIcon = (path) => `<svg class="inspector-line-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="${path}"></path></svg>`;

// Inspector sections the user folded, by name; kept while switching elements.
const collapsedInspectorGroups = new Set();
// Focus mode keeps one section open: opening another folds the rest.
const INSPECTOR_FOCUS_KEY = 'pixelprism-inspector-focus';
let inspectorFocusMode = false;
try { inspectorFocusMode = localStorage.getItem(INSPECTOR_FOCUS_KEY) === 'true'; } catch { /* Off by default. */ }
// Margin / padding the user split into four sides; kept while switching elements.
const expandedSpacingControls = new Set();
// Same for the radius split into four corners.
let radiusCornersOpen = false;
// Properties the user changed, per preview and selector, so the marks survive
// the panel being rebuilt.
const changedInspectorProperties = new Map();
let inspectorChangeKey = '';
// The element the panel edits, in the terms changes are logged by.
let inspectorChangeTarget;
// Rarely used typography fields wait behind "More options"; the first one
// places the toggle.
const MORE_OPTIONS_FIELDS = new Set(['fontStretch', 'wordSpacing', 'textIndent', 'columnCount', 'direction', 'wordBreak', 'overflowWrap', 'textOverflow', 'webkitTextStrokeWidth', 'textShadow', 'fontVariationSettings', 'fontFeatureSettings']);
// Sections whose More options the user opened; kept while switching elements.
const openMoreOptions = new Set();

const CSS_LENGTH_FIELDS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'rowGap', 'columnGap', 'borderWidth', 'borderRadius', 'flexBasis',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'top', 'right', 'bottom', 'left',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'webkitTextStrokeWidth'
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

// An edit to a state (".button:hover") is its own change, beside the same
// property's edit in the default state.
function changeKey(change) {
  const selector = String(change.selector || '');
  const state = Object.values(INSPECTOR_STATE_SUFFIXES).find((suffix) => selector.endsWith(suffix)) || '';
  return [change.url, change.viewport.width, change.viewport.height, `${change.element?.domPath || selector}${state}`, change.property].join('\u0000');
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
    viewport: { width: Math.round(viewport.width), height: Math.round(viewport.height) },
    route: typeof change.route === 'string' ? change.route : '/',
    element: change.element && typeof change.element === 'object' ? change.element : null,
    // Text with no element in the source: the span the agent adds around it.
    ...(change.wrapText && typeof change.wrapText === 'object' ? { wrapText: change.wrapText } : {}),
    // The tab, open menu or state (Hover) the edit was made in.
    ...(Array.isArray(change.steps) && change.steps.length ? { steps: change.steps } : {}),
    ...(typeof change.workspace === 'string' ? { workspace: change.workspace } : {}),
    ...(change.device ? { device: String(change.device) } : {})
  };
  const key = changeKey(normalized);
  const existing = changeLog.get(key);
  // An empty value means the override was dropped: the page is as it was.
  if (existing) {
    existing.to = normalized.to;
    if (existing.from === existing.to || normalized.to === '') changeLog.delete(key);
  } else if (normalized.from !== normalized.to && normalized.to !== '') {
    changeLog.set(key, normalized);
  }
  syncChangeUi();
}

function syncChangeUi() {
  saveChanges();
  const pendingCount = activeChanges().length + comments.length;
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
  return { url: canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl), route: commentSelection.route || '/', viewport: { width: Number(card.dataset.viewportWidth), height: Number(card.dataset.viewportHeight) }, element: commentSelection.element, steps: commentSelection.steps || [], snapshot: commentSelection.snapshot || null };
}

// Comments have no stored id; this one only has to stay stable while the
// studio is open, so markers in the previews can refer to their comment.
const commentIds = new WeakMap();
let commentIdSeed = 0;
let selectedCommentId = null;
// The one comment shown in full instead of clamped to three lines; opening
// another one collapses it, like an accordion.
let expandedCommentId = null;
let placingCommentId = null;
// A comment from another page that was clicked: shown once that page loads.
let pendingFocusCommentId = null;
let openCommentMenuId = null;
// The comment being edited in the list, and its unsaved text.
let editingCommentId = null;
let editingCommentDraft = '';
// Page URL -> expanded, for groups the user opened or closed by hand.
const commentGroupExpanded = new Map();
// The group whose display name is being edited (a page URL), and its draft.
let editingGroupTitleUrl = null;
let editingGroupTitleDraft = '';
let commentsMenuOpen = false;
// Per card: comment id -> 'placed' | 'hidden' | 'missing', as its preview
// reported after looking for the commented elements.
const cardMarkerStatuses = new WeakMap();

function commentId(comment) {
  if (!commentIds.has(comment)) commentIds.set(comment, `comment-${commentIdSeed += 1}`);
  return commentIds.get(comment);
}

function commentById(id) {
  return comments.find((comment) => commentId(comment) === id);
}

function isCommentAnchored(comment) {
  return Boolean(comment.element || comment.pin);
}

// A comment belongs to the page and viewport it was written in, so its
// marker is shown only in a preview of the same page at the same width.
function commentShownOnCard(comment, card) {
  return !card.classList.contains('is-embed-blocked')
    && canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl) === canonicalInspectorUrl(comment.url)
    && Number(card.dataset.viewportWidth) === comment.viewport.width;
}

function commentPlacement(comment) {
  if (!isCommentAnchored(comment)) return 'page';
  const cards = [...document.querySelectorAll('.viewport-card')];
  const showing = cards.filter((card) => commentShownOnCard(comment, card));
  if (!showing.length) {
    const url = canonicalInspectorUrl(comment.url);
    return cards.some((card) => canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl) === url) ? 'other-viewport' : 'other-page';
  }
  const id = commentId(comment);
  const states = showing.map((card) => cardMarkerStatuses.get(card)?.get(id));
  if (states.includes('placed')) return 'placed';
  if (states.includes('other-view')) return 'other-view';
  if (states.includes('approx')) return 'approx';
  if (states.includes('hidden')) return 'hidden';
  if (states.includes('missing')) return 'missing';
  return 'loading';
}

// The browser draws a native select's open list outside the page, so no
// screenshot shows it; the comment stays on the select itself.
const NATIVE_SELECT_NOTE = ' · A native select’s open list can’t be captured; the comment goes on the select';

// The tabs and panels switched to before a comment was left: Archive › Week.
function viewStepsLabel(steps) {
  return (Array.isArray(steps) ? steps : []).map((step) => step.label).filter(Boolean).join(' › ') || 'another view';
}

function commentViewLabel(comment) {
  return viewStepsLabel(comment.steps);
}

function commentPlacementLabel(comment, placement) {
  switch (placement) {
    case 'hidden': return 'Hidden';
    case 'missing': return 'Not found';
    case 'approx': return 'Not found · by position';
    case 'other-view': return `In “${commentViewLabel(comment)}”`;
    default: return '';
  }
}

function renderComments() {
  const context = activeCommentContext();
  const placing = placingCommentId && commentById(placingCommentId);
  const contextText = placing
    ? `Moving comment ${comments.indexOf(placing) + 1}: click an element in a preview`
    : context?.element?.selector ? `Selected: ${context.element.selector}${context.steps.some((step) => step.kind === 'state') ? ` · ${viewStepsLabel(context.steps.filter((step) => step.kind === 'state'))}` : ''}${['select', 'option'].includes(context.element.tag) ? NATIVE_SELECT_NOTE : ''}` : '';
  commentsContext.textContent = contextText;
  commentsContext.hidden = !contextText;
  // Status updates re-render the list while a comment is being edited;
  // keep the caret where it was.
  const activeEditor = document.activeElement?.classList.contains('comment-edit-input') ? document.activeElement : null;
  const selection = activeEditor ? [activeEditor.selectionStart, activeEditor.selectionEnd, activeEditor.scrollTop] : null;
  commentsList.replaceChildren(...commentGroups().map((group) => renderCommentGroup(group)));
  const editor = commentsList.querySelector('.comment-edit-input');
  if (editor && selection) {
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(selection[0], selection[1]);
    editor.scrollTop = selection[2];
  }
  commentsEmpty.hidden = comments.length > 0;
  commentsMenuDeleteAll.disabled = comments.length === 0;
  // Near the bottom of the list the menu opens upwards to stay visible.
  const openMenu = commentsList.querySelector('.comment-menu:not([hidden])');
  if (openMenu) {
    const listBottom = commentsList.closest('.comments-list-wrap').getBoundingClientRect().bottom;
    openMenu.classList.toggle('is-up', openMenu.getBoundingClientRect().bottom > listBottom);
  }
}

// Comments grouped by page: the page open in the previews comes first and
// is expanded; other pages start collapsed so they do not bury it.
// A group is one page at one viewport size, so notes left at another width
// on the same page are told apart at a glance.
function commentGroupKey(comment) {
  return [canonicalInspectorUrl(comment.url), comment.viewport.width, comment.viewport.height].join('\u0000');
}

function commentGroups() {
  const current = canonicalInspectorUrl(targetUrl);
  const cards = [...document.querySelectorAll('.viewport-card')];
  const groups = new Map();
  comments.forEach((comment, index) => {
    const url = canonicalInspectorUrl(comment.url);
    const key = commentGroupKey(comment);
    if (!groups.has(key)) {
      const isCurrent = url === current;
      groups.set(key, { key, url, viewport: comment.viewport, isCurrent, isShown: isCurrent && cards.some((card) => commentShownOnCard(comment, card)), entries: [] });
    }
    groups.get(key).entries.push({ comment, index });
  });
  // A fixed order, so opening a page never reshuffles the list: pages
  // alphabetically, sizes of one page narrowest first like the preview cards.
  return [...groups.values()].sort((left, right) => (
    left.url.localeCompare(right.url, undefined, { numeric: true })
    || left.viewport.width - right.viewport.width
    || left.viewport.height - right.viewport.height
  ));
}

// The page's real path/host, ignoring any name the user typed in for it.
function commentGroupRealLabel(url) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}` || '/';
    let currentOrigin = '';
    try { currentOrigin = new URL(targetUrl).origin; } catch { /* No page open. */ }
    return parsed.origin === currentOrigin || parsed.protocol === 'file:' ? path : `${parsed.host}${path}`;
  } catch {
    return url;
  }
}

// What the group actually shows: a short name the user typed in, if any,
// otherwise the real path/host.
function commentGroupLabel(url) {
  restorePageTitles(commentOrigin(url));
  return pageTitleOverrides.get(url) || commentGroupRealLabel(url);
}

function isCommentGroupExpanded(group) {
  return commentGroupExpanded.get(group.key) ?? group.isShown;
}

function renderCommentGroup(group) {
  const expanded = isCommentGroupExpanded(group);
  const node = document.createElement('li');
  node.className = 'comment-group';
  node.classList.toggle('is-current', group.isCurrent);
  node.dataset.groupKey = group.key;
  const header = document.createElement('div');
  header.className = 'comment-group-header';
  // The title can turn into a text input to rename the page, so it can't
  // live inside a <button> (invalid nesting) — the toggle is split around it.
  const toggleStart = document.createElement('button');
  toggleStart.type = 'button'; toggleStart.className = 'comment-group-toggle'; toggleStart.dataset.action = 'toggle-group';
  toggleStart.setAttribute('aria-expanded', String(expanded));
  toggleStart.innerHTML = window.phosphorIcon(expanded ? 'caret-down' : 'caret-right');
  const size = document.createElement('span');
  size.className = 'comment-group-size tooltip-trigger';
  size.dataset.tooltip = viewportLabel(group.entries[0].comment);
  size.innerHTML = deviceIcon(deviceGlyph('', group.viewport.width));
  toggleStart.append(size);
  const isEditingTitle = editingGroupTitleUrl === group.url;
  let title;
  if (isEditingTitle) {
    title = document.createElement('input');
    title.type = 'text';
    title.className = 'comment-group-title comment-group-title-input';
    title.maxLength = 200;
    title.setAttribute('aria-label', `Rename ${commentGroupRealLabel(group.url)}`);
    title.value = editingGroupTitleDraft;
  } else {
    title = document.createElement('span');
    title.className = 'comment-group-title';
    title.textContent = commentGroupLabel(group.url);
    // The real path/URL always shows on hover, even once the page has a
    // typed-in display name.
    title.title = commentGroupRealLabel(group.url);
    title.tabIndex = 0;
    title.dataset.action = 'rename-group';
  }
  const toggleEnd = document.createElement('button');
  toggleEnd.type = 'button'; toggleEnd.className = 'comment-group-toggle comment-group-toggle-end'; toggleEnd.dataset.action = 'toggle-group';
  const count = document.createElement('span');
  count.className = 'comment-group-count';
  count.textContent = String(group.entries.length);
  toggleEnd.append(count);
  // Marks what the previews show right now: this page at this width. It
  // sits right next to the title, not off by the count.
  let shown = null;
  if (group.isShown) {
    shown = document.createElement('span');
    shown.className = 'comment-group-shown';
    shown.title = 'Shown in the previews';
    shown.innerHTML = window.phosphorIcon('eye');
  }
  header.append(toggleStart, title, ...(shown ? [shown] : []), toggleEnd);
  const list = document.createElement('ol');
  list.className = 'comment-group-list';
  list.hidden = !expanded;
  if (expanded) list.append(...group.entries.map(({ comment, index }) => renderCommentItem(comment, index)));
  node.append(header, list);
  return node;
}

function renderCommentItem(comment, index) {
  const id = commentId(comment);
  const placement = commentPlacement(comment);
  const isPlacing = placingCommentId === id;
  const item = document.createElement('li');
  item.className = `comment-item is-${placement}`;
  item.classList.toggle('is-selected', selectedCommentId === id);
  item.classList.toggle('is-placing', isPlacing);
  item.classList.toggle('is-text-expanded', expandedCommentId === id);
  item.dataset.commentId = id;
  const number = document.createElement('span');
  number.className = 'comment-number';
  number.textContent = String(index + 1);
  const isEditing = editingCommentId === id;
  item.classList.toggle('is-editing', isEditing);
  let text;
  if (isEditing) {
    text = document.createElement('div');
    text.className = 'comment-edit';
    const field = document.createElement('textarea');
    field.className = 'comment-edit-input';
    field.maxLength = 2000;
    field.setAttribute('aria-label', `Edit comment ${index + 1}`);
    field.value = editingCommentDraft;
    const actions = document.createElement('div');
    actions.className = 'comment-edit-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.dataset.action = 'edit-cancel'; cancel.textContent = 'Cancel';
    const save = document.createElement('button');
    save.type = 'button'; save.dataset.action = 'edit-save'; save.textContent = 'Save';
    save.title = 'Save (⌘ Enter)';
    save.disabled = !editingCommentDraft.trim() && !commentAttachments(comment).length;
    const attach = document.createElement('button');
    attach.type = 'button'; attach.className = 'comment-attach tooltip-trigger'; attach.dataset.action = 'add-image';
    attach.setAttribute('aria-label', 'Attach images');
    attach.dataset.tooltip = 'Attach images';
    attach.innerHTML = window.phosphorIcon('paperclip');
    actions.append(attach, cancel, save);
    text.append(field, actions);
  } else if (comment.comment) {
    text = document.createElement('p');
    text.textContent = comment.comment;
  }
  // The last image of a comment without text goes with the comment itself.
  const attachments = commentAttachments(comment);
  let tiles = attachments.length ? renderAttachmentTiles(attachments, { removable: attachments.length > 1 || Boolean(comment.comment.trim()) }) : null;
  // While editing, the images sit between the text and its buttons.
  if (isEditing && tiles) {
    text.insertBefore(tiles, text.querySelector('.comment-edit-actions'));
    tiles = null;
  }
  // Text first, then the meta row: number, element, whether it was found, actions.
  const meta = document.createElement('div');
  meta.className = 'comment-meta';
  meta.append(number);
  const target = document.createElement('span');
  target.className = 'comment-target';
  target.textContent = comment.pin ? 'Pinned point' : comment.element?.selector || 'Page';
  target.title = target.textContent;
  // While moving, the hint takes the selector's place.
  const state = isPlacing ? 'Click an element · Esc cancels' : commentPlacementLabel(comment, placement);
  if (!isPlacing) meta.append(target);
  if (state) {
    const stateText = document.createElement('span');
    stateText.className = 'comment-state';
    stateText.textContent = isPlacing ? state : `· ${state}`;
    if (placement === 'approx' && !isPlacing) stateText.title = 'The element is gone; the marker shows where it was when the comment was left.';
    meta.append(stateText);
  }
  const actions = document.createElement('div');
  actions.className = 'comment-actions';
  const menuOpen = openCommentMenuId === id;
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'comment-more tooltip-trigger'; more.dataset.action = 'menu';
  more.setAttribute('aria-label', `Actions for comment ${index + 1}`);
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', String(menuOpen));
  more.dataset.tooltip = 'Actions';
  more.classList.toggle('is-placing', isPlacing);
  more.innerHTML = window.phosphorIcon('dots-three');
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'comment-delete tooltip-trigger'; remove.dataset.action = 'delete';
  remove.setAttribute('aria-label', `Delete comment ${index + 1}`);
  remove.dataset.tooltip = 'Delete comment';
  remove.innerHTML = window.phosphorIcon('trash');
  actions.append(remove, more);
  const menu = document.createElement('div');
  menu.className = 'comment-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = !menuOpen;
  const menuItem = (action, label) => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.action = action;
    button.setAttribute('role', 'menuitem');
    button.append(label);
    menu.append(button);
  };
  menuItem('edit', 'Edit');
  if (attachments.length < ATTACHMENTS_PER_COMMENT) menuItem('add-image', 'Attach images');
  menuItem('move', isPlacing ? 'Cancel reattaching' : 'Reattach comment');
  // The menu lives inside actions so it tracks that row regardless of how
  // tall the comment text above it is.
  actions.append(menu);
  if (!isEditing) meta.append(actions);
  item.append(...[text, tiles, meta].filter(Boolean));
  return item;
}

// Sends each preview the markers of its page and width. Previews that never
// showed markers are left alone, so closing the panel installs nothing.
function syncCommentMarkers() {
  if (!hasExtensionRuntime) return;
  const enabled = !commentsPanel.hidden;
  document.querySelectorAll('.viewport-card').forEach((card) => {
    const frame = card.querySelector('iframe');
    if (!frame?.contentWindow || card.dataset.previewReady !== 'true') return;
    if (!enabled && !card.commentMarkersPayload) return;
    const markers = enabled ? comments.flatMap((comment, index) => (
      isCommentAnchored(comment) && commentShownOnCard(comment, card)
        ? [{ id: commentId(comment), number: index + 1, text: commentSummary(comment), element: comment.element || null, selector: comment.element?.selector || '', pin: comment.pin || null, offset: comment.offset || null, steps: comment.steps || [] }]
        : []
    )) : [];
    const message = { source: 'viewport-parade', type: 'comment-markers', enabled, markers, selectedId: enabled ? selectedCommentId : null, scale: Number(card.dataset.scale) || 1 };
    const payload = enabled ? JSON.stringify(message) : '';
    if (payload === (card.commentMarkersPayload || '')) return;
    card.commentMarkersPayload = payload;
    frame.contentWindow.postMessage(message, '*');
  });
}

function selectComment(id, { focus = false, reveal = false } = {}) {
  const comment = commentById(id);
  if (!comment) return;
  selectedCommentId = id;
  if (reveal) commentGroupExpanded.set(commentGroupKey(comment), true);
  renderComments();
  syncCommentMarkers();
  if (focus) {
    document.querySelectorAll('.viewport-card').forEach((card) => {
      if (!commentShownOnCard(comment, card)) return;
      card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'comment-marker-focus', id }, '*');
    });
  }
  if (reveal) commentsList.querySelector(`[data-comment-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setCommentPlacing(id) {
  placingCommentId = id && placingCommentId !== id ? id : null;
  if (placingCommentId) {
    selectedCommentId = placingCommentId;
    clearInspectorSelections();
    speak(`Click an element in any preview to reattach comment ${comments.indexOf(commentById(placingCommentId)) + 1}.`);
  }
  renderComments();
  syncCommentMarkers();
}

// Re-binds a comment to an element or point in a preview. The comment then
// belongs to that preview's page and width, like a newly written one.
function moveComment(id, card, { element, pin, route, offset, same = false, steps, snapshot }) {
  const comment = commentById(id);
  if (!comment || !card) return;
  // A new target lives in the view the preview shows now.
  if (!same && Array.isArray(steps)) {
    if (steps.length) comment.steps = steps;
    else delete comment.steps;
  }
  // Picked again by a click: the copy of the view it was picked in, if any.
  if (snapshot !== undefined) {
    if (snapshot) {
      storeViewSnapshot(snapshot);
      comment.snapshot = snapshot.id;
    } else delete comment.snapshot;
  }
  comment.url = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
  if (typeof route === 'string') comment.route = route;
  comment.viewport = { width: Number(card.dataset.viewportWidth), height: Number(card.dataset.viewportHeight) };
  Object.assign(comment, placeOfCard(card));
  if (pin) {
    comment.pin = { x: Math.round(pin.x), y: Math.round(pin.y) };
    delete comment.element;
    delete comment.offset;
  } else if (element && typeof element === 'object') {
    comment.element = element;
    delete comment.pin;
    // A marker dragged into place keeps its spot in the element; a comment
    // attached by clicking starts at the element's corner again.
    if (offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)) comment.offset = { x: Math.round(offset.x), y: Math.round(offset.y) };
    else delete comment.offset;
  } else {
    return;
  }
  placingCommentId = null;
  selectedCommentId = id;
  saveComments();
  renderComments();
  syncCommentMarkers();
  const number = comments.indexOf(comment) + 1;
  if (same) notify(`Marker ${number} moved within ${element.selector || 'its element'}.`, 'success');
  else notify(`Comment ${number} moved to ${pin ? 'the pinned point' : element.selector || 'the element'}.`, 'success');
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
  if (!open) { placingCommentId = null; pendingFocusCommentId = null; openCommentMenuId = null; editingCommentId = null; setCommentsMenuOpen(false); }
  if (open) { renderComments(); setCommentPicker(true); }
  else setCommentPicker(false);
  syncCommentMarkers();
}

function addComment(rawComment) {
  const comment = rawComment.trim();
  if (!comment && !draftAttachments.length) return;
  const context = activeCommentContext();
  const activeCard = cardForFrame(layersFrame) || document.querySelector('.viewport-card');
  const place = placeOfCard((context && cardForFrame(commentSelection.frame.contentWindow)) || activeCard);
  const viewport = context?.viewport || (activeCard ? { width: Number(activeCard.dataset.viewportWidth), height: Number(activeCard.dataset.viewportHeight) } : { width: window.innerWidth, height: window.innerHeight });
  if (context?.snapshot) storeViewSnapshot(context.snapshot);
  comments.push({ type: 'comment', url: context?.url || canonicalInspectorUrl(activeCard?.dataset.loadedUrl || targetUrl), route: context?.route || '/', viewport, ...place, ...(context?.element ? { element: context.element } : {}), ...(context?.steps?.length ? { steps: context.steps } : {}), ...(context?.snapshot ? { snapshot: context.snapshot.id } : {}), comment, ...(draftAttachments.length ? { attachments: draftAttachments } : {}) });
  commentInput.value = '';
  draftAttachments = [];
  renderDraftAttachments();
  saveComments();
  renderComments(); syncChangeUi(); syncCommentMarkers(); notify('Comment added to the pending handoff.', 'success');
}

// Images attached to comments. A comment keeps a small record per image
// ({ id, name, type, size, width, height }); the file itself lives in
// IndexedDB, since localStorage only fits a few screenshots.
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ATTACHMENTS_PER_COMMENT = 10;
const attachmentUrls = new Map();
const attachmentLoads = new Map();
// Images attached to the comment being written, before it is added.
let draftAttachments = [];
// Stored this session: never pruned while a comment may be about to take them.
const sessionAttachmentIds = new Set();
// A database with one object store; the store function runs `action` on it
// in a transaction and resolves with the request's result.
function indexedDbStore(name, storeName) {
  let dbPromise = null;
  return (mode, action) => {
    dbPromise ||= new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
    return dbPromise.then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  };
}

const attachmentStore = indexedDbStore('pixelprism-attachments', 'images');

function newAttachmentId() {
  return `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function commentAttachments(comment) {
  return Array.isArray(comment?.attachments) ? comment.attachments : [];
}

// What a comment says in one line, also when it is only images.
function commentSummary(comment) {
  const count = commentAttachments(comment).length;
  return comment.comment || (count === 1 ? 'Image' : `${count} images`);
}

function loadAttachmentUrl(id) {
  if (attachmentUrls.has(id)) return Promise.resolve(attachmentUrls.get(id));
  if (!attachmentLoads.has(id)) {
    attachmentLoads.set(id, attachmentStore('readonly', (store) => store.get(id))
      .then((blob) => {
        if (blob instanceof Blob) attachmentUrls.set(id, URL.createObjectURL(blob));
        return attachmentUrls.get(id) || '';
      })
      .catch(() => '')
      .finally(() => attachmentLoads.delete(id)));
  }
  return attachmentLoads.get(id);
}

function attachmentBlob(id) {
  return attachmentStore('readonly', (store) => store.get(id)).then((blob) => (blob instanceof Blob ? blob : null), () => null);
}

// Stores picked, pasted or dropped images; returns the records of the ones kept.
async function storeImageFiles(files, room) {
  const skipped = { type: 0, size: 0, count: 0, failed: 0 };
  const added = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) { skipped.type += 1; continue; }
    if (added.length >= room) { skipped.count += 1; continue; }
    if (file.size > ATTACHMENT_MAX_BYTES) { skipped.size += 1; continue; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      skipped.type += 1;
      continue;
    }
    const attachment = {
      id: newAttachmentId(),
      name: file.name || 'image.png',
      type: file.type,
      size: file.size,
      width: image.naturalWidth,
      height: image.naturalHeight
    };
    sessionAttachmentIds.add(attachment.id);
    try {
      await attachmentStore('readwrite', (store) => store.put(file, attachment.id));
    } catch {
      URL.revokeObjectURL(url);
      skipped.failed += 1;
      continue;
    }
    attachmentUrls.set(attachment.id, url);
    added.push(attachment);
  }
  const notes = [];
  if (skipped.type) notes.push(`${skipped.type} not an image`);
  if (skipped.size) notes.push(`${skipped.size} larger than ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`);
  if (skipped.count) notes.push(`${skipped.count} over the limit of ${ATTACHMENTS_PER_COMMENT} per comment`);
  if (skipped.failed) notes.push(`${skipped.failed} could not be stored`);
  if (notes.length) notify(`Some files were not attached: ${notes.join(', ')}.`, 'error');
  return added;
}

function forgetAttachments(attachments) {
  const ids = attachments.map((attachment) => attachment.id).filter(Boolean);
  if (!ids.length) return;
  ids.forEach((id) => {
    const url = attachmentUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    attachmentUrls.delete(id);
  });
  attachmentStore('readwrite', (store) => ids.forEach((id) => store.delete(id))).catch(() => { /* Pruned on the next start. */ });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// The HTML review carries its images inline, so it stays one file.
async function embeddedAttachments(attachments) {
  const embedded = await Promise.all(attachments.map(async ({ id, ...details }) => {
    const blob = await attachmentBlob(id);
    return blob ? { ...details, src: await blobToDataUrl(blob) } : null;
  }));
  return embedded.filter(Boolean);
}

// Images of an imported review are stored again under new ids.
async function importedAttachments(sources) {
  const stored = await Promise.all(sources.map(async (source) => {
    if (typeof source?.src !== 'string' || !source.src.startsWith('data:image/')) return null;
    try {
      const blob = await (await fetch(source.src)).blob();
      const attachment = {
        id: newAttachmentId(),
        name: String(source.name || 'image.png'),
        type: blob.type,
        size: blob.size,
        width: Math.round(Number(source.width) || 0),
        height: Math.round(Number(source.height) || 0)
      };
      sessionAttachmentIds.add(attachment.id);
      await attachmentStore('readwrite', (store) => store.put(blob, attachment.id));
      return attachment;
    } catch {
      return null;
    }
  }));
  return stored.filter(Boolean);
}

// Drops stored images no saved comment refers to: drafts of a closed studio,
// or images of comments removed while storage was unavailable.
async function pruneAttachments() {
  let keys;
  try {
    keys = await attachmentStore('readonly', (store) => store.getAllKeys());
  } catch {
    return;
  }
  if (!keys?.length) return;
  const stored = storedComments();
  // Unreadable storage: better to keep every image than lose one in use.
  if (!stored) return;
  const used = new Set([...sessionAttachmentIds, ...[...comments, ...stored, { attachments: draftAttachments }].flatMap(commentAttachments).map((attachment) => attachment.id)]);
  deleteStaleKeys(attachmentStore, keys, used);
}

// Every comment kept for any site, or null when the storage cannot be read.
function storedComments() {
  try {
    const all = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(COMMENTS_STORAGE_PREFIX)) continue;
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(stored)) all.push(...stored);
    }
    return all;
  } catch {
    return null;
  }
}

// Another studio tab may hold drafts not saved anywhere yet, so only
// records more than a day old (the id starts with its time) are dropped.
function deleteStaleKeys(store, keys, used) {
  const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const stale = keys.filter((key) => !used.has(key) && parseInt(String(key).split('-')[1], 36) < dayAgo);
  if (stale.length) store('readwrite', (objects) => stale.forEach((key) => objects.delete(key))).catch(() => {});
}

// Copies of the views comments were left in (pageSnapshot in inspector.js),
// which the HTML review captures instead of opening the view again. A copy
// holds a whole page, so it lives in IndexedDB; a comment keeps its id, and
// comments left on one view share it.
const viewSnapshotStore = indexedDbStore('pixelprism-snapshots', 'views');
const sessionSnapshotIds = new Set();

function storeViewSnapshot(snapshot) {
  if (typeof snapshot?.id !== 'string' || typeof snapshot.html !== 'string' || sessionSnapshotIds.has(snapshot.id)) return;
  sessionSnapshotIds.add(snapshot.id);
  viewSnapshotStore('readwrite', (store) => store.put(snapshot, snapshot.id)).catch(() => sessionSnapshotIds.delete(snapshot.id));
}

function loadViewSnapshot(id) {
  return viewSnapshotStore('readonly', (store) => store.get(id)).then((snapshot) => (typeof snapshot?.html === 'string' ? snapshot : null), () => null);
}

async function pruneViewSnapshots() {
  let keys;
  try {
    keys = await viewSnapshotStore('readonly', (store) => store.getAllKeys());
  } catch {
    return;
  }
  const stored = storedComments();
  if (!keys?.length || !stored) return;
  deleteStaleKeys(viewSnapshotStore, keys, new Set([...sessionSnapshotIds, ...[...comments, ...stored].map((comment) => comment.snapshot).filter(Boolean)]));
}

// A row of image tiles. Clicking a tile opens the image; the cross removes it.
function renderAttachmentTiles(attachments, { removable = false } = {}) {
  const list = document.createElement('div');
  list.className = 'comment-attachments';
  attachments.forEach((attachment, index) => {
    const tile = document.createElement('div');
    tile.className = 'comment-attachment';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'comment-attachment-open';
    open.dataset.action = 'open-image';
    open.dataset.index = String(index);
    open.title = attachment.name;
    open.setAttribute('aria-label', `Open ${attachment.name}`);
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    const url = attachmentUrls.get(attachment.id);
    if (url) image.src = url;
    else loadAttachmentUrl(attachment.id).then((loaded) => {
      if (loaded) image.src = loaded;
      else tile.classList.add('is-missing');
    });
    open.append(image);
    tile.append(open);
    if (removable) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'comment-attachment-remove';
      remove.dataset.action = 'remove-image';
      remove.dataset.index = String(index);
      remove.title = 'Remove image';
      remove.setAttribute('aria-label', `Remove ${attachment.name}`);
      remove.innerHTML = window.phosphorIcon('x');
      tile.append(remove);
    }
    list.append(tile);
  });
  return list;
}

function renderDraftAttachments() {
  commentDraftAttachments.hidden = !draftAttachments.length;
  commentDraftAttachments.replaceChildren(...(draftAttachments.length ? renderAttachmentTiles(draftAttachments, { removable: true }).childNodes : []));
}

async function attachToDraft(files) {
  const added = await storeImageFiles(files, ATTACHMENTS_PER_COMMENT - draftAttachments.length);
  if (!added.length) return;
  draftAttachments = [...draftAttachments, ...added];
  renderDraftAttachments();
}

async function attachToComment(id, files) {
  const comment = commentById(id);
  if (!comment) return;
  const added = await storeImageFiles(files, ATTACHMENTS_PER_COMMENT - commentAttachments(comment).length);
  // The comment may have been deleted while the files were read.
  if (!added.length || !comments.includes(comment)) {
    forgetAttachments(added);
    return;
  }
  comment.attachments = [...commentAttachments(comment), ...added];
  saveComments();
  renderComments();
  syncCommentMarkers();
  notify(`${added.length === 1 ? 'Image' : `${added.length} images`} attached to comment ${comments.indexOf(comment) + 1}.`, 'success');
}

function removeCommentAttachment(id, index) {
  const comment = commentById(id);
  const attachments = commentAttachments(comment);
  if (!attachments[index]) return;
  const [removed] = attachments.splice(index, 1);
  if (!attachments.length) delete comment.attachments;
  forgetAttachments([removed]);
  saveComments();
  renderComments();
  syncCommentMarkers();
  notify(`Image removed from comment ${comments.indexOf(comment) + 1}.`);
}

function imageFilesFrom(dataTransfer) {
  return [...(dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'));
}

// Full-size preview of a comment's images, with arrows between them.
let imageViewerItems = [];
let imageViewerIndex = 0;

function showImageViewerItem(index) {
  imageViewerIndex = (index + imageViewerItems.length) % imageViewerItems.length;
  const attachment = imageViewerItems[imageViewerIndex];
  imageViewerImage.removeAttribute('src');
  imageViewerImage.alt = attachment.name;
  loadAttachmentUrl(attachment.id).then((url) => {
    if (imageViewerItems[imageViewerIndex] !== attachment) return;
    if (url) imageViewerImage.src = url;
  });
  const size = attachment.width && attachment.height ? ` · ${attachment.width} × ${attachment.height}` : '';
  const position = imageViewerItems.length > 1 ? ` · ${imageViewerIndex + 1} / ${imageViewerItems.length}` : '';
  imageViewerCaption.textContent = `${attachment.name}${size}${position}`;
  imageViewerPrev.hidden = imageViewerNext.hidden = imageViewerItems.length < 2;
}

function openImageViewer(attachments, index) {
  if (!attachments[index]) return;
  imageViewerItems = attachments.slice();
  showImageViewerItem(index);
  if (!imageViewer.open) imageViewer.showModal();
}

// Comments survive a closed studio tab or an extension reload. They are kept
// per site, so a studio opened for another site starts with its own notes.
const COMMENTS_STORAGE_PREFIX = 'pixelprism-comments:';
const storedCommentOrigins = new Set();

function commentOrigin(url) {
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? 'file://' : origin;
  } catch {
    return '';
  }
}

function commentIdentity(comment) {
  const target = comment.pin
    ? `pin:${Math.round(comment.pin.x)},${Math.round(comment.pin.y)}`
    : comment.element ? reviewElementKey(comment.element, comment.element.selector) : 'page';
  const images = commentAttachments(comment).map((attachment) => `${attachment.name}:${attachment.size}`).join('|');
  return [canonicalInspectorUrl(comment.url), comment.viewport.width, comment.viewport.height, target, comment.comment, images].join('\u0000');
}

function isValidComment(comment) {
  return comment && typeof comment === 'object'
    && typeof comment.url === 'string'
    && typeof comment.comment === 'string'
    && (!comment.attachments || (Array.isArray(comment.attachments) && comment.attachments.every((attachment) => attachment && typeof attachment.name === 'string')))
    && (comment.comment.trim() || commentAttachments(comment).length)
    && Number.isFinite(comment.viewport?.width) && Number.isFinite(comment.viewport?.height)
    && (!comment.pin || (Number.isFinite(comment.pin.x) && Number.isFinite(comment.pin.y)));
}

function saveComments() {
  // A comment on a site not seen yet this session (a preview followed a
  // link) must not overwrite the notes already stored for that site.
  new Set(comments.map((comment) => commentOrigin(comment.url))).forEach((origin) => restoreComments(origin));
  const byOrigin = new Map([...storedCommentOrigins].map((origin) => [origin, []]));
  comments.forEach((comment) => {
    const origin = commentOrigin(comment.url);
    if (!origin) return;
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    byOrigin.get(origin).push(comment);
  });
  byOrigin.forEach((list, origin) => {
    storedCommentOrigins.add(origin);
    try {
      if (list.length) localStorage.setItem(COMMENTS_STORAGE_PREFIX + origin, JSON.stringify(list));
      else localStorage.removeItem(COMMENTS_STORAGE_PREFIX + origin);
    } catch {
      // Storage full or unavailable: comments still live for this session.
    }
  });
}

function saveChanges() {
  // Changes on a site not seen yet this session must not overwrite the
  // changes already stored for that site.
  new Set([...changeLog.values()].map((change) => commentOrigin(change.url))).forEach((origin) => restoreChanges(origin));
  const byOrigin = new Map([...storedChangeOrigins].map((origin) => [origin, []]));
  changeLog.forEach((change) => {
    const origin = commentOrigin(change.url);
    if (!origin) return;
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    byOrigin.get(origin).push(change);
  });
  byOrigin.forEach((list, origin) => {
    storedChangeOrigins.add(origin);
    try {
      if (list.length) localStorage.setItem(CHANGES_STORAGE_PREFIX + origin, JSON.stringify(list));
      else localStorage.removeItem(CHANGES_STORAGE_PREFIX + origin);
    } catch {
      // Storage full or unavailable: changes still live for this session.
    }
  });
}

// Adds the style changes saved for a site, once per site and session. The
// previews get them back when they load.
function restoreChanges(origin = commentOrigin(targetUrl)) {
  if (!origin || storedChangeOrigins.has(origin)) return;
  storedChangeOrigins.add(origin);
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(CHANGES_STORAGE_PREFIX + origin) || '[]');
  } catch {
    return;
  }
  if (!Array.isArray(stored)) return;
  let restored = 0;
  stored.forEach((change) => {
    if (!change || typeof change.url !== 'string' || typeof change.selector !== 'string' || typeof change.property !== 'string') return;
    if (!Number.isFinite(change.viewport?.width) || !Number.isFinite(change.viewport?.height)) return;
    const key = changeKey(change);
    if (changeLog.has(key)) return;
    changeLog.set(key, change);
    restored += 1;
  });
  if (restored) syncChangeUi();
}

// Adds the comments saved for a site, once per site and session.
function restoreComments(origin = commentOrigin(targetUrl)) {
  if (!origin || storedCommentOrigins.has(origin)) return;
  storedCommentOrigins.add(origin);
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(COMMENTS_STORAGE_PREFIX + origin) || '[]');
  } catch {
    return;
  }
  if (!Array.isArray(stored)) return;
  const known = new Set(comments.map(commentIdentity));
  const restored = stored.filter((comment) => isValidComment(comment) && !known.has(commentIdentity(comment)));
  if (!restored.length) return;
  comments.push(...restored);
  syncChangeUi();
  if (!commentsPanel.hidden) renderComments();
  syncCommentMarkers();
  notify(`${restored.length} saved comment${restored.length === 1 ? '' : 's'} restored.`);
}

// A short display name the user typed in for a page, in place of its path.
// Purely cosmetic and local: it survives a refresh but never touches the
// real page, so the group's real path/URL still shows up on hover.
const PAGE_TITLE_STORAGE_PREFIX = 'pixelprism-page-titles:';
const storedPageTitleOrigins = new Set();
const pageTitleOverrides = new Map();

function restorePageTitles(origin) {
  if (!origin || storedPageTitleOrigins.has(origin)) return;
  storedPageTitleOrigins.add(origin);
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(PAGE_TITLE_STORAGE_PREFIX + origin) || '{}');
  } catch {
    return;
  }
  if (!stored || typeof stored !== 'object') return;
  Object.entries(stored).forEach(([url, name]) => {
    if (typeof name === 'string' && name.trim()) pageTitleOverrides.set(url, name.trim());
  });
}

function savePageTitles(origin) {
  if (!origin) return;
  storedPageTitleOrigins.add(origin);
  const entries = {};
  pageTitleOverrides.forEach((name, url) => { if (commentOrigin(url) === origin) entries[url] = name; });
  try {
    if (Object.keys(entries).length) localStorage.setItem(PAGE_TITLE_STORAGE_PREFIX + origin, JSON.stringify(entries));
    else localStorage.removeItem(PAGE_TITLE_STORAGE_PREFIX + origin);
  } catch {
    // Storage full or unavailable: the rename still lives for this session.
  }
}

function setPageTitleOverride(url, name) {
  const trimmed = (name || '').trim();
  if (trimmed) pageTitleOverrides.set(url, trimmed);
  else pageTitleOverrides.delete(url);
  savePageTitles(commentOrigin(url));
}

function reviewDataFromHtml(text) {
  const parsed = new DOMParser().parseFromString(text, 'text/html');
  const raw = parsed.getElementById('pixelprism-review-data')?.textContent;
  if (!raw || raw.includes('{{PIXELPRISM_REVIEW_DATA}}')) throw new Error('This file is not a PixelPrism HTML review.');
  const data = JSON.parse(raw);
  if (!Array.isArray(data?.pages)) throw new Error('This review has no pages.');
  return data;
}

// Brings comments back from an exported HTML review. Older exports only
// carry the element selector; newer ones carry the full element record and
// points placed by hand in the review. Entries checked off in the review and
// saved into the file (data.resolved) are finished work and stay behind.
async function importReviewFile(file) {
  const data = reviewDataFromHtml(await file.text());
  const known = new Set(comments.map(commentIdentity));
  const resolved = new Set(Array.isArray(data.resolved) ? data.resolved.map(String) : []);
  let added = 0;
  let duplicates = 0;
  let changes = 0;
  let done = 0;
  // Comments whose images still have to be stored, with those images.
  const withImages = [];
  data.pages.forEach((page) => {
    const url = canonicalInspectorUrl(String(page.url || ''));
    let route = '/';
    try { route = new URL(url).pathname || '/'; } catch { /* Keep the default route. */ }
    (page.viewports || []).forEach((viewport) => {
      (viewport.entries || []).forEach((entry) => {
        if (entry.kind === 'change') {
          changes += 1;
          return;
        }
        if (entry.id != null && resolved.has(String(entry.id))) {
          done += 1;
          return;
        }
        let element = null;
        if (entry.element && typeof entry.element === 'object') element = entry.element;
        else if (entry.target !== 'page' && entry.selector) element = { selector: String(entry.selector) };
        const pin = entry.pin && Number.isFinite(entry.pin.x) && Number.isFinite(entry.pin.y)
          ? { x: Math.round(entry.pin.x), y: Math.round(entry.pin.y) }
          : null;
        const images = Array.isArray(entry.attachments) ? entry.attachments.filter((image) => typeof image?.src === 'string') : [];
        const comment = {
          type: 'comment',
          url,
          route,
          viewport: { width: Math.round(Number(viewport.width) || 0), height: Math.round(Number(viewport.height) || 0) },
          ...(typeof viewport.workspace === 'string' && viewport.workspace ? { workspace: viewport.workspace } : {}),
          ...(typeof viewport.device === 'string' && viewport.device ? { device: viewport.device } : {}),
          ...(element ? { element } : {}),
          ...(pin ? { pin } : {}),
          ...(Array.isArray(viewport.steps) && viewport.steps.length ? { steps: viewport.steps } : {}),
          ...(!pin && element && entry.offset && Number.isFinite(entry.offset.x) && Number.isFinite(entry.offset.y) ? { offset: { x: Math.round(entry.offset.x), y: Math.round(entry.offset.y) } } : {}),
          comment: String(entry.text || ''),
          // Names and sizes only for now: enough to tell duplicates apart.
          ...(images.length ? { attachments: images.map((image) => ({ name: String(image.name || 'image.png'), size: Math.round(Number(image.size) || 0) })) } : {})
        };
        if (!isValidComment(comment)) return;
        const identity = commentIdentity(comment);
        if (known.has(identity)) {
          duplicates += 1;
          return;
        }
        known.add(identity);
        comments.push(comment);
        if (images.length) withImages.push([comment, images]);
        added += 1;
      });
    });
  });
  let lostImages = 0;
  for (const [comment, images] of withImages) {
    const stored = await importedAttachments(images);
    lostImages += images.length - stored.length;
    if (stored.length) comment.attachments = stored;
    else delete comment.attachments;
    // An image-only comment whose images could not be kept is dropped.
    if (!comment.comment.trim() && !stored.length) {
      comments.splice(comments.indexOf(comment), 1);
      added -= 1;
    }
  }
  saveComments();
  renderComments();
  syncChangeUi();
  syncCommentMarkers();
  const notes = [];
  if (done) notes.push(`${done} resolved skipped`);
  if (duplicates) notes.push(`${duplicates} already in the list`);
  if (changes) notes.push(`${changes} CSS change${changes === 1 ? '' : 's'} skipped`);
  if (lostImages) notes.push(`${lostImages} image${lostImages === 1 ? '' : 's'} could not be stored`);
  notify(`Imported ${added} comment${added === 1 ? '' : 's'}${notes.length ? ` (${notes.join(', ')})` : ''}.`, added ? 'success' : undefined);
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

// The edits already made for this page and size, back in a preview that
// loaded again (after a workspace switch, a refresh or a link).
function applyRecordedChanges(card) {
  const changes = changesForViewport(card);
  if (!changes.length) return;
  card.querySelector('iframe')?.contentWindow?.postMessage({
    source: 'viewport-parade',
    type: 'apply-recorded-changes',
    changes: changes.map((change) => ({ selector: change.selector, property: change.property, value: change.to, ...(change.wrapText ? { wrapText: change.wrapText } : {}) }))
  }, '*');
}

function changesForViewport(card) {
  const width = Number(card.dataset.viewportWidth);
  const height = Number(card.dataset.viewportHeight);
  const pageUrl = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
  return activeChanges().filter((change) => (
    canonicalInspectorUrl(change.url) === pageUrl
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

// What agents get: comments with text, without their images. An image-only
// comment is for the people reading the review; it says nothing to an agent.
// The device name rides along with the size; the workspace stays out.
function agentComments() {
  return comments
    .filter((comment) => comment.comment.trim())
    .map(({ attachments, workspace, device, ...comment }) => ({
      ...comment,
      viewport: { ...comment.viewport, ...(deviceOf({ ...comment, workspace, device }) ? { device: deviceOf({ ...comment, workspace, device }) } : {}) }
    }));
}

function formatChangeReport() {
  const notes = agentComments();
  const createdAt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date());
  const byPage = new Map();
  activeChanges().forEach((change) => {
    const page = byPage.get(change.url) || new Map();
    const viewportKey = viewportLabel(change, { workspace: false });
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
    `Style changes: ${activeChanges().length}`,
    `Comments: ${notes.length}`,
    `Viewports: ${viewportCount}`,
    '',
    'This file contains every saved inspector change across all pages and viewports in this session.'
  ];
  [...byPage.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([url, viewports]) => {
    lines.push('', '## Page', `<${url}>`);
    [...viewports.entries()].sort(([, [left]], [, [right]]) => left.viewport.width - right.viewport.width || left.viewport.height - right.viewport.height).forEach(([viewport, changes]) => {
      lines.push('', `### Viewport: ${viewport}`);
      const bySelector = new Map();
      changes.forEach((change) => {
        const properties = bySelector.get(change.selector) || [];
        properties.push(change);
        bySelector.set(change.selector, properties);
      });
      [...bySelector.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([selector, properties]) => {
        const wrap = properties[0]?.wrapText;
        lines.push('', wrap
          ? `- text “${wrap.text}” in \`${escapeInlineCode(wrap.parent || '')}\`: wrap it in a span and style the span`
          : `- \`${escapeInlineCode(selector)}\``);
        properties.forEach((change) => {
          const from = change.from || 'removed';
          const to = change.to || 'removed';
          lines.push(`  - \`${escapeInlineCode(change.property)}\`: \`${escapeInlineCode(from)}\` → \`${escapeInlineCode(to)}\`${change.newDeclaration ? ' (new declaration: not in the project CSS yet)' : ''}`);
        });
      });
    });
  });
  if (notes.length) {
    lines.push('', '## Comments');
    notes.forEach((comment) => {
      const target = comment.element?.selector ? ` · \`${escapeInlineCode(comment.element.selector)}\`` : ' · page-level';
      const rect = comment.pin ? { x: comment.pin.x, y: comment.pin.y } : comment.element?.rect;
      const position = rect ? ` · at ${rect.x}, ${rect.y}${Number.isFinite(rect.width) ? `, ${rect.width} × ${rect.height}` : ''}` : '';
      lines.push(`- ${comment.comment} (${viewportLabel(comment, { workspace: false })}${target}${position})`);
    });
  }
  return `${lines.join('\n')}\n`;
}

function reportFilename() {
  const now = new Date();
  const part = (value) => String(value).padStart(2, '0');
  return `pixelprism-changes-${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}.md`;
}

const CODEX_INSTRUCTION = 'Apply the visual changes from PixelPrism to the current source repository. PixelPrism values are visual targets, not instructions to hardcode pixels, colors, or font sizes. For every changed property: (1) locate the rendered element using route, DOM context, text, attributes, selector, surrounding markup, and parent context; (2) trace the current rendered value to its declaration and abstraction chain before editing: CSS custom property, design token/theme, parent/theme variable scope, Tailwind utility/config, preprocessor variable, mixin/helper, component prop, variant/state, shared component style, then local CSS/inline style only when truly local; (3) determine whether intent is global, component, variant, instance, or viewport/breakpoint, including responsive utilities, media/container queries, and responsive props; (4) reuse an existing appropriate token, utility, prop, variant, or scoped variable. Never replace an existing CSS variable, design token, theme value, component prop, Tailwind utility, or shared abstraction with a hardcoded value without evidence it is local. Before changing a token, inspect its usages: change it only for demonstrated global intent; otherwise use the narrowest existing abstraction. Do not create a token for a one-off unless it is semantically reusable and consistent with project conventions. sourceHint is optional browser evidence, not authoritative; verify it in source. A change with newDeclaration: true has no declaration in the project CSS for this element yet: add one in the narrowest place that styles this element (its component, class, or utility), instead of searching for an existing rule to edit; its before value is only the browser default. An element with wrapText does not exist in the source: it is text that sits directly inside the element at wrapText.parentSelector, beside other children. Wrap exactly that text (wrapText.text) in a span there, give it a class that fits the project’s naming, and apply the changes to that span; the selector PixelPrism used for it is temporary. Preserve the project’s styling architecture (Tailwind, CSS Modules, SCSS, styled-components, CSS variables, themes, or design system) and make the smallest source-level change. Apply only final beforeComputed/afterComputed values. Do not add generated CSS overrides, framework adapters, MCP, AST infrastructure, or unrelated refactors; report genuinely ambiguous matches rather than guessing.';

function codexChangeSet() {
  const groups = new Map();
  activeChanges().forEach((change) => {
    const element = change.element || {};
    const key = [change.url, change.route, change.viewport.width, change.viewport.height, element.domPath || change.selector].join('\u0000');
    let group = groups.get(key);
    if (!group) {
      const { parent, ...elementDetails } = element;
      group = {
        route: change.route || '/',
        pageUrl: change.url,
        viewport: { ...change.viewport, ...(deviceOf(change) ? { device: deviceOf(change) } : {}) },
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
        ...(change.wrapText ? { wrapText: { text: change.wrapText.text, parentSelector: change.wrapText.parent, parentDomPath: change.wrapText.parentDomPath } } : {}),
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
      ...(change.sourceHint ? { sourceHint: change.sourceHint } : {}),
      ...(change.newDeclaration ? { newDeclaration: true } : {})
    });
  });
  groups.forEach((group) => { group.changes = collapseShorthandChanges(group.changes); });
  return [...groups.values()];
}

// Controls that set several longhands at once (flex sizing, all corners,
// all sides) would hand over one line per longhand. When every part of a
// shorthand changed, they go as that one shorthand, the way source writes it.
const HANDOFF_SHORTHANDS = [
  ['flex', ['flex-grow', 'flex-shrink', 'flex-basis']],
  ['border-radius', ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']],
  ['margin', ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']],
  ['padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']],
  ['gap', ['row-gap', 'column-gap']]
];

function collapseShorthandChanges(changes) {
  let result = changes;
  HANDOFF_SHORTHANDS.forEach(([shorthand, longhands]) => {
    const parts = longhands.map((longhand) => result.find((change) => change.property === longhand));
    if (parts.some((part) => !part)) return;
    // "8px 8px 8px 8px" is written "8px"; flex keeps its three parts.
    const joined = (key) => {
      const values = parts.map((part) => part[key]);
      return shorthand !== 'flex' && values.every((value) => value === values[0]) ? values[0] : values.join(' ');
    };
    const sourceHint = parts.find((part) => part.sourceHint)?.sourceHint;
    const merged = {
      property: shorthand,
      before: joined('before'),
      after: joined('after'),
      beforeComputed: joined('beforeComputed'),
      afterComputed: joined('afterComputed'),
      ...(sourceHint ? { sourceHint } : {}),
      ...(parts.every((part) => part.newDeclaration) ? { newDeclaration: true } : {})
    };
    const at = result.indexOf(parts[0]);
    result = result.filter((change) => !parts.includes(change));
    result.splice(Math.min(at, result.length), 0, merged);
  });
  return result;
}

function codexHandoff() {
  return {
    source: 'PixelPrism',
    version: 2,
    instruction: CODEX_INSTRUCTION,
    changeSet: codexChangeSet(),
    comments: agentComments()
  };
}

async function copyForCodex() {
  if (!activeChanges().length && !agentComments().length) {
    if (comments.length) notify('Nothing to copy: comments with only images are left out of the agent review.');
    return;
  }
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
  if (!activeChanges().length) return;
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

// Web addresses in a comment are links, by the HTML review's rule:
// punctuation that ends a sentence stays outside the link, as does a
// closing bracket the address never opened: "(see https://a.b/c)".
const REVIEW_URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi;

function reviewTextLinks(text) {
  const links = [];
  for (const match of text.matchAll(REVIEW_URL_PATTERN)) {
    let end = match[0].length;
    while (end > 0) {
      const character = match[0][end - 1];
      if ('.,;:!?\'"'.includes(character)) { end -= 1; continue; }
      const pair = { ')': '(', ']': '[', '}': '{' }[character];
      if (pair) {
        const head = match[0].slice(0, end);
        if (head.split(pair).length < head.split(character).length) { end -= 1; continue; }
      }
      break;
    }
    const url = match[0].slice(0, end);
    if (url) links.push({ start: match.index, end: match.index + end, href: /^www\./i.test(url) ? `https://${url}` : url });
  }
  return links;
}

// Wraps a comment the way the HTML review shows it (its own line breaks
// kept) and notes where its web addresses fall on each line.
function richCanvasLines(context, value, maxWidth) {
  const lines = [];
  String(value ?? '').split(/\r?\n/).forEach((paragraph) => {
    const links = reviewTextLinks(paragraph);
    let line = null;
    const push = () => {
      if (line) lines.push(line);
      line = null;
    };
    const append = (text, start) => {
      if (!line) line = { text: '', links: [] };
      const offset = line.text ? line.text.length + 1 : 0;
      line.text = line.text ? `${line.text} ${text}` : text;
      links.forEach((link) => {
        const from = Math.max(link.start, start);
        const to = Math.min(link.end, start + text.length);
        if (from < to) line.links.push({ start: offset + from - start, end: offset + to - start, href: link.href });
      });
    };
    for (const word of paragraph.matchAll(/\S+/g)) {
      const candidate = line ? `${line.text} ${word[0]}` : word[0];
      if (context.measureText(candidate).width <= maxWidth) {
        append(word[0], word.index);
        continue;
      }
      push();
      if (context.measureText(word[0]).width <= maxWidth) {
        append(word[0], word.index);
        continue;
      }
      let fragment = '';
      let fragmentStart = word.index;
      for (const character of word[0]) {
        if (fragment && context.measureText(fragment + character).width > maxWidth) {
          append(fragment, fragmentStart);
          push();
          fragmentStart += fragment.length;
          fragment = '';
        }
        fragment += character;
      }
      append(fragment, fragmentStart);
    }
    // An empty line of the comment stays an empty line.
    if (!line) line = { text: '', links: [] };
    push();
  });
  return lines;
}

// Draws one wrapped line; its links are blue, underlined and clickable.
function drawRichLine(page, line, x, y, lineHeight, fontSize, color) {
  const { context } = page;
  const segments = [];
  let cursor = 0;
  line.links.forEach((link) => {
    if (link.start > cursor) segments.push({ start: cursor, end: link.start });
    segments.push(link);
    cursor = link.end;
  });
  if (cursor < line.text.length) segments.push({ start: cursor, end: line.text.length });
  segments.forEach((segment) => {
    const text = line.text.slice(segment.start, segment.end);
    const left = x + context.measureText(line.text.slice(0, segment.start)).width;
    context.fillStyle = segment.href ? '#5367d9' : color;
    context.fillText(text, left, y);
    if (!segment.href) return;
    const width = context.measureText(text).width;
    context.fillRect(left, y + fontSize + 2, width, 1.5);
    page.links.push({ x: left, y: y - 4, width, height: lineHeight, href: segment.href });
  });
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

// PDF pages are laid out on an A4 sheet of 1240 × 1754 and drawn at twice
// that, so screenshots keep their own pixels.
const REVIEW_PAGE = { width: 1240, height: 1754, margin: 80, scale: 2, bottom: 1644 };
const REVIEW_CONTENT_WIDTH = REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2);
const PDF_PAGE = { width: 595, height: 842 };

function createReviewCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = REVIEW_PAGE.width * REVIEW_PAGE.scale;
  canvas.height = REVIEW_PAGE.height * REVIEW_PAGE.scale;
  const context = canvas.getContext('2d', { alpha: false });
  context.scale(REVIEW_PAGE.scale, REVIEW_PAGE.scale);
  context.fillStyle = '#f7f7f8';
  context.fillRect(0, 0, REVIEW_PAGE.width, REVIEW_PAGE.height);
  context.textBaseline = 'top';
  return { canvas, context };
}

// A page keeps the links drawn on it; the PDF makes them clickable.
function createReviewPage(url = '') {
  return { ...createReviewCanvas(), url, links: [] };
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

// "iOS devices · iPhone SE · 375 × 667 · Archive", as the HTML review names a size.
function reviewViewportName(viewport) {
  return [viewport.workspace, viewport.device, `${viewport.width} × ${viewport.height}`, viewport.state].filter(Boolean).join(' · ');
}

function ellipsizeCanvasText(context, value, maxWidth) {
  const text = String(value || '');
  if (context.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened && context.measureText(`${shortened}...`).width > maxWidth) shortened = shortened.slice(0, -1);
  return shortened ? `${shortened}...` : '';
}

function drawReviewDocumentMark(context, site) {
  const logo = site.logo;
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
  context.fillText(ellipsizeCanvasText(context, site.name, 520), textX, 83);
}

function drawReviewCover(data, site) {
  const page = createReviewPage(data.pages[0]?.url || '');
  const { context } = page;
  drawReviewDocumentMark(context, site);
  context.fillStyle = '#18181b';
  context.font = '800 82px Inter, sans-serif';
  context.fillText('Design Review', REVIEW_PAGE.margin, 282);
  context.fillStyle = '#52525b';
  context.font = '500 28px Inter, sans-serif';
  context.fillText('A visual handoff of comments and design changes', REVIEW_PAGE.margin, 390);

  const viewports = data.pages.flatMap((reviewPage) => reviewPage.viewports);
  const entries = viewports.flatMap((viewport) => viewport.entries);
  const metrics = [
    ['Pages', data.pages.length],
    ['Screenshots', viewports.length],
    ['Comments', entries.filter((entry) => entry.kind !== 'change').length],
    ['CSS changes', entries.filter((entry) => entry.kind === 'change').length]
  ];
  let metricY = 560;
  metrics.forEach(([label, value]) => {
    context.fillStyle = '#e4e4e7';
    context.fillRect(REVIEW_PAGE.margin, metricY + 53, REVIEW_CONTENT_WIDTH, 2);
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
  context.fillText(new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(data.createdAt)), REVIEW_PAGE.margin, 1490);
  context.fillText('Powered by PixelPrism', REVIEW_PAGE.margin, 1530);
  return page;
}

// Every page of a screenshot opens with its page, size and view.
function drawReviewViewportHeader(page, section, continued) {
  const { context } = page;
  drawReviewDocumentMark(context, section.site);
  const count = (index, total) => `${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
  context.fillStyle = '#71717a';
  context.font = '800 18px Inter, sans-serif';
  context.fillText([
    `PAGE ${count(section.pageIndex, section.pageCount)}`,
    `SCREENSHOT ${count(section.viewportIndex, section.page.viewports.length)}`,
    continued ? 'CONTINUED' : ''
  ].filter(Boolean).join(' · '), REVIEW_PAGE.margin, 170);
  context.font = '800 42px Inter, sans-serif';
  const titleLines = wrappedCanvasLines(context, section.page.label, REVIEW_CONTENT_WIDTH).slice(0, 2);
  drawReviewLines(context, titleLines, REVIEW_PAGE.margin, 210, 50, '#18181b');
  page.links.push({
    x: REVIEW_PAGE.margin,
    y: 206,
    width: Math.max(...titleLines.map((line) => context.measureText(line).width)),
    height: titleLines.length * 50,
    href: section.page.url
  });
  let y = 210 + (titleLines.length * 50) + 10;
  context.fillStyle = '#71717a';
  context.font = '600 19px Inter, sans-serif';
  context.fillText(ellipsizeCanvasText(context, reviewViewportName(section.viewport), REVIEW_CONTENT_WIDTH), REVIEW_PAGE.margin, y);
  // A tab, menu or popup the capture could not open.
  if (section.viewport.warning) {
    y += 30;
    context.fillStyle = '#b91c1c';
    context.fillText(ellipsizeCanvasText(context, section.viewport.warning, REVIEW_CONTENT_WIDTH), REVIEW_PAGE.margin, y);
  }
  return Math.max(360, y + 58);
}

function drawReviewScreenshotError(context, message, y) {
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.roundRect(REVIEW_PAGE.margin, y, REVIEW_CONTENT_WIDTH, 190, 10);
  context.fill();
  context.strokeStyle = '#d4d4d8';
  context.strokeRect(REVIEW_PAGE.margin, y, REVIEW_CONTENT_WIDTH, 190);
  context.fillStyle = '#18181b';
  context.font = '700 22px Inter, sans-serif';
  context.fillText('Screenshot unavailable', REVIEW_PAGE.margin + 28, y + 38);
  context.font = '500 18px Inter, sans-serif';
  const lines = wrappedCanvasLines(context, message, REVIEW_CONTENT_WIDTH - 56);
  drawReviewLines(context, lines.slice(0, 3), REVIEW_PAGE.margin + 28, y + 82, 27, '#71717a');
  return y + 228;
}

// The numbered marker of the HTML review: red where it sits on the
// screenshot, grey for a comment whose element is not on it.
function drawReviewBadge(context, x, y, number, placed) {
  context.save();
  context.font = '600 15px Inter, sans-serif';
  const radius = Math.max(15, (context.measureText(String(number)).width / 2) + 7);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.shadowColor = 'rgba(24, 24, 27, .3)';
  context.shadowBlur = 4;
  context.shadowOffsetY = 1;
  context.fillStyle = placed ? '#ef4444' : '#a1a1aa';
  context.fill();
  context.shadowColor = 'transparent';
  context.lineWidth = 3;
  context.strokeStyle = '#ffffff';
  context.stroke();
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(number), x, y + 1);
  context.restore();
}

const REVIEW_SHOT_MAX_HEIGHT = 900;

function reviewShotScale(shot) {
  return Math.min(REVIEW_CONTENT_WIDTH / shot.width, REVIEW_SHOT_MAX_HEIGHT / shot.height, 2);
}

// A screenshot with its elements outlined and its comments' markers on it.
function drawReviewShot(context, image, shot, entries, y) {
  const scale = reviewShotScale(shot);
  const width = Math.round(shot.width * scale);
  const height = Math.round(shot.height * scale);
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
  const outlined = new Set();
  context.strokeStyle = 'rgba(239, 68, 68, .85)';
  context.lineWidth = 2;
  entries.forEach(({ target, rect }) => {
    if (target !== 'element' || !rect?.width || !rect?.height) return;
    const key = [rect.x, rect.y, rect.width, rect.height].join();
    if (outlined.has(key)) return;
    outlined.add(key);
    context.strokeRect(x + (rect.x * scale), y + (rect.y * scale), rect.width * scale, rect.height * scale);
  });
  context.restore();
  entries.forEach(({ marker, number }) => {
    if (!marker) return;
    const markerX = Math.min(x + width - 16, Math.max(x + 16, x + (marker.x * scale) + ((marker.offset || 0) * 32)));
    const markerY = Math.min(y + height - 16, Math.max(y + 16, y + (marker.y * scale)));
    drawReviewBadge(context, markerX, markerY, number, true);
  });
  return y + height;
}

function reviewEntryTarget(entry) {
  if (entry.target === 'page') return 'Whole page';
  if (entry.target === 'pin') return 'Point placed by hand';
  const status = { missing: 'Not found', hidden: 'Hidden' }[entry.target];
  return [entry.selector || 'Element', status].filter(Boolean).join(' · ');
}

// One page, size and view of the review: each of its screens with the
// comments placed on it listed below, under the same numbers.
async function drawReviewViewportPages(section, finish) {
  let page = null;
  let top = 0;
  let y = 0;
  const open = async (continued) => {
    if (page) await finish(page);
    page = createReviewPage(section.page.url);
    top = drawReviewViewportHeader(page, section, continued);
    y = top;
  };
  const ensure = async (height) => {
    if (y > top && y + height > REVIEW_PAGE.bottom) await open(true);
  };

  const entryX = REVIEW_PAGE.margin + 48;
  const entryWidth = REVIEW_CONTENT_WIDTH - 48;
  const drawEntry = async (entry) => {
    const change = entry.kind === 'change';
    const font = change ? '500 19px ui-monospace, SFMono-Regular, Menlo, monospace' : '500 21px Inter, sans-serif';
    const fontSize = change ? 19 : 21;
    const lineHeight = 31;
    const gap = 12;
    page.context.font = font;
    const text = change ? `${entry.property}: ${entry.from || 'none'} → ${entry.to || 'removed'}` : entry.text || '';
    const lines = text ? richCanvasLines(page.context, text, entryWidth) : [];

    // Images attached to the comment sit under its text, in rows.
    const images = (await Promise.all((entry.attachments || [])
      .filter((attachment) => attachment?.src)
      .map((attachment) => loadReviewImage(attachment.src).catch(() => null))))
      .filter(Boolean);
    const rows = [];
    const maxHeight = images.length === 1 ? 560 : 300;
    images.forEach((image) => {
      const scale = Math.min(entryWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
      const tile = { image, width: Math.max(1, image.naturalWidth * scale), height: Math.max(1, image.naturalHeight * scale) };
      const row = rows[rows.length - 1];
      if (row && row.width + gap + tile.width <= entryWidth) {
        row.tiles.push(tile);
        row.width += gap + tile.width;
        row.height = Math.max(row.height, tile.height);
      } else rows.push({ tiles: [tile], width: tile.width, height: tile.height });
    });

    // A comment that fits on a page is not split: its images stay with
    // its text. One that does not fit repeats its number where it goes on.
    const height = (change ? 26 : 0) + (lines.length * lineHeight) + (rows.length && lines.length ? 8 : 0)
      + rows.reduce((total, row) => total + row.height + gap, 0) + 30;
    if (height <= REVIEW_PAGE.bottom - top) await ensure(height);
    const badge = () => drawReviewBadge(page.context, REVIEW_PAGE.margin + 16, y + (change ? 9 : 12), entry.number, Boolean(entry.marker));
    const room = async (needed) => {
      const before = page;
      await ensure(needed);
      if (page !== before) badge();
    };
    await ensure((change ? 26 : 0) + (lines.length ? lineHeight : 0) + 60);
    badge();
    if (change) {
      page.context.fillStyle = '#71717a';
      page.context.font = '700 15px Inter, sans-serif';
      page.context.fillText(entry.state ? `CSS CHANGE · ${entry.state.toUpperCase()}` : 'CSS CHANGE', entryX, y);
      y += 26;
    }
    for (const line of lines) {
      await room(lineHeight);
      page.context.font = font;
      drawRichLine(page, line, entryX, y, lineHeight, fontSize, '#27272a');
      y += lineHeight;
    }
    y += rows.length && lines.length ? 8 : 0;
    for (const row of rows) {
      await room(row.height + gap);
      let x = entryX;
      row.tiles.forEach(({ image, width, height: tileHeight }) => {
        const { context } = page;
        context.fillStyle = '#e4e4e7';
        context.beginPath();
        context.roundRect(x - 1, y - 1, width + 2, tileHeight + 2, 7);
        context.fill();
        context.save();
        context.beginPath();
        context.roundRect(x, y, width, tileHeight, 6);
        context.clip();
        context.fillStyle = '#ffffff';
        context.fillRect(x, y, width, tileHeight);
        context.drawImage(image, x, y, width, tileHeight);
        context.restore();
        x += width + gap;
      });
      y += row.height + gap;
    }

    await room(26);
    page.context.fillStyle = '#71717a';
    page.context.font = '500 17px Inter, sans-serif';
    page.context.fillText(ellipsizeCanvasText(page.context, reviewEntryTarget(entry), entryWidth), entryX, y + 4);
    y += 62;
  };

  await open(false);
  const { viewport } = section;
  const byNumber = (left, right) => left.number - right.number;
  if (!viewport.shots.length) {
    y = drawReviewScreenshotError(page.context, viewport.error || 'Chrome did not return an image.', y);
    for (const entry of [...viewport.entries].sort(byNumber)) await drawEntry(entry);
  }
  for (const [index, shot] of viewport.shots.entries()) {
    const entries = viewport.entries.filter((entry) => entry.shot === index).sort(byNumber);
    if (!entries.length) continue;
    const label = viewport.shots.length > 1 ? `SCREEN ${index + 1}/${viewport.shots.length}` : '';
    // A screen starts a new PDF page unless it fits whole with a comment under it.
    await ensure((label ? 34 : 0) + Math.round(shot.height * reviewShotScale(shot)) + 140);
    if (label) {
      page.context.fillStyle = '#71717a';
      page.context.font = '800 17px Inter, sans-serif';
      page.context.fillText(label, REVIEW_PAGE.margin, y);
      y += 34;
    }
    const image = await loadReviewImage(shot.src).catch(() => null);
    y = image
      ? drawReviewShot(page.context, image, shot, entries, y) + 44
      : drawReviewScreenshotError(page.context, 'The screenshot could not be decoded.', y);
    for (const entry of entries) await drawEntry(entry);
  }
  await finish(page);
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
        bytes: new Uint8Array(await blob.arrayBuffer())
      });
    }, 'image/jpeg', 0.88);
  });
}

// A finished page gets its footer and leaves only its JPEG behind: pages
// drawn at twice the size would not all fit in memory as canvases.
async function finishReviewPage(page) {
  const { canvas, context } = page;
  if (page.url) {
    context.save();
    context.globalAlpha = 0.5;
    context.fillStyle = '#71717a';
    context.font = '500 16px Inter, sans-serif';
    const text = ellipsizeCanvasText(context, page.url, REVIEW_CONTENT_WIDTH - 150);
    context.fillText(text, REVIEW_PAGE.margin, REVIEW_PAGE.height - 58);
    page.links.push({ x: REVIEW_PAGE.margin, y: REVIEW_PAGE.height - 62, width: context.measureText(text).width, height: 26, href: page.url });
    context.restore();
  }
  const jpeg = await canvasToJpegPage(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return { ...jpeg, links: page.links };
}

function joinByteArrays(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function pdfFromJpegPages(pages, { title = '', outline = [] } = {}) {
  const encode = (value) => new TextEncoder().encode(value);
  // Titles can be in any script: UTF-16 with a byte order mark.
  const pdfText = (value) => {
    const text = String(value || '');
    let hex = 'FEFF';
    for (let index = 0; index < text.length; index += 1) hex += text.charCodeAt(index).toString(16).padStart(4, '0');
    return `<${hex}>`;
  };
  const pdfUri = (value) => {
    let uri;
    try { uri = new URL(value).href; } catch { uri = encodeURI(String(value || '')); }
    return `(${uri.replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '\\$&')})`;
  };
  const toPdfX = (x) => (x * PDF_PAGE.width) / REVIEW_PAGE.width;
  const toPdfY = (y) => PDF_PAGE.height - ((y * PDF_PAGE.height) / REVIEW_PAGE.height);
  const objects = [];
  const reserve = () => objects.push(null);
  const define = (id, ...parts) => { objects[id - 1] = parts.map((part) => (typeof part === 'string' ? encode(part) : part)); };

  const catalogId = reserve();
  const pagesId = reserve();
  const fontId = reserve();
  const infoId = reserve();
  define(fontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  define(infoId, `<< /Title ${pdfText(title)} /Producer (PixelPrism) >>`);
  const pageIds = pages.map((page, index) => {
    const pageId = reserve();
    const imageId = reserve();
    const contentId = reserve();
    const annotationIds = page.links.map((link) => {
      const id = reserve();
      const rect = [toPdfX(link.x), toPdfY(link.y + link.height), toPdfX(link.x + link.width), toPdfY(link.y)].map((value) => value.toFixed(2));
      define(id, `<< /Type /Annot /Subtype /Link /Rect [${rect.join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${pdfUri(link.href)} >> >>`);
      return id;
    });
    // The page number is PDF text: the page count is known only once
    // every page is drawn. Helvetica Bold widths: digits 556, space and slash 278.
    const number = `${index + 1} / ${pages.length}`;
    const size = (16 * PDF_PAGE.width) / REVIEW_PAGE.width;
    const numberWidth = ([...number].reduce((total, character) => total + (/\d/.test(character) ? 556 : 278), 0) * size) / 1000;
    const numberX = toPdfX(REVIEW_PAGE.width - REVIEW_PAGE.margin) - numberWidth;
    const content = encode(`q\n${PDF_PAGE.width} 0 0 ${PDF_PAGE.height} 0 0 cm\n/Im0 Do\nQ\nBT\n/F1 ${size.toFixed(2)} Tf\n0.631 0.631 0.667 rg\n${numberX.toFixed(2)} ${toPdfY(REVIEW_PAGE.height - 46).toFixed(2)} Td\n(${number}) Tj\nET\n`);
    const annotations = annotationIds.length ? `/Annots [${annotationIds.map((id) => `${id} 0 R`).join(' ')}] ` : '';
    define(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PDF_PAGE.width} ${PDF_PAGE.height}] ${annotations}/Resources << /XObject << /Im0 ${imageId} 0 R >> /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    define(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
      page.bytes,
      '\nendstream'
    );
    define(contentId, `<< /Length ${content.length} >>\nstream\n`, content, 'endstream');
    return pageId;
  });
  define(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

  // The outline is the PDF viewer's sidebar, like the HTML review's pages
  // list: each page, and each size of a page captured at several.
  let outlineEntry = '';
  if (outline.length) {
    const outlineId = reserve();
    let visible = 0;
    const defineItems = (items, parentId) => {
      const ids = items.map(() => reserve());
      visible += items.length;
      items.forEach((item, index) => {
        const children = item.children?.length ? defineItems(item.children, ids[index]) : [];
        define(ids[index], [
          `<< /Title ${pdfText(item.title)} /Parent ${parentId} 0 R`,
          index ? `/Prev ${ids[index - 1]} 0 R` : '',
          index < ids.length - 1 ? `/Next ${ids[index + 1]} 0 R` : '',
          children.length ? `/First ${children[0]} 0 R /Last ${children[children.length - 1]} 0 R /Count ${children.length}` : '',
          `/Dest [${pageIds[item.page]} 0 R /Fit] >>`
        ].filter(Boolean).join(' '));
      });
      return ids;
    };
    const ids = defineItems(outline, outlineId);
    define(outlineId, `<< /Type /Outlines /First ${ids[0]} 0 R /Last ${ids[ids.length - 1]} 0 R /Count ${visible} >>`);
    outlineEntry = ` /Outlines ${outlineId} 0 R /PageMode /UseOutlines`;
  }
  define(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R${outlineEntry} >>`);

  const parts = [encode('%PDF-1.4\n%âãÏÓ\n')];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((objectParts, index) => {
    offsets.push(length);
    const wrapped = [encode(`${index + 1} 0 obj\n`), ...objectParts, encode('\nendobj\n')];
    parts.push(...wrapped);
    length += wrapped.reduce((total, part) => total + part.length, 0);
  });
  const xrefOffset = length;
  parts.push(encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  offsets.slice(1).forEach((offset) => parts.push(encode(`${String(offset).padStart(10, '0')} 00000 n \n`)));
  parts.push(encode(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return new Blob([joinByteArrays(parts)], { type: 'application/pdf' });
}

async function buildReviewPdf(data) {
  // Canvas text draws with whatever font is loaded at that moment.
  await Promise.all(['500', '600', '700', '800'].map((weight) => document.fonts?.load(`${weight} 20px Inter`)));
  const site = {
    name: data.site.name,
    logo: data.site.logo ? await loadReviewImage(data.site.logo).catch(() => null) : null
  };
  const pages = [];
  const finish = async (page) => { pages.push(await finishReviewPage(page)); };
  await finish(drawReviewCover(data, site));
  const outline = [];
  for (const [pageIndex, reviewPage] of data.pages.entries()) {
    const item = { title: reviewPage.label, page: pages.length, children: [] };
    for (const [viewportIndex, viewport] of reviewPage.viewports.entries()) {
      if (reviewPage.viewports.length > 1) item.children.push({ title: reviewViewportName(viewport), page: pages.length });
      await drawReviewViewportPages({ site, page: reviewPage, pageIndex, pageCount: data.pages.length, viewport, viewportIndex }, finish);
    }
    outline.push(item);
  }
  return pdfFromJpegPages(pages, { title: `Design Review · ${data.site.name}`, outline });
}

async function downloadReviewPdf() {
  const contexts = reviewHtmlContexts();
  if (!contexts.length) return;
  if (!window.chrome?.runtime?.sendMessage || !window.chrome?.downloads?.download) {
    notify('Review export is available after the extension is loaded in Chrome.', 'error');
    return;
  }
  const originalLabel = reviewPdfExportButton.textContent;
  reviewPdfExportButton.disabled = true;
  handoffFabMenu.setAttribute('aria-busy', 'true');
  try {
    const data = await captureReviewData(contexts, reviewPdfExportButton);
    reviewPdfExportButton.textContent = 'Building PDF...';
    const pdf = await buildReviewPdf(data);
    const objectUrl = URL.createObjectURL(pdf);
    try {
      await window.chrome.downloads.download({ url: objectUrl, filename: reviewFilename(), saveAs: false });
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
    const missing = contexts.filter((context) => context.captureError).length;
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

// Design review (HTML and PDF): one capture per page/viewport, with every
// comment and CSS change of that viewport placed on it as a numbered marker.
function reviewHtmlContexts() {
  const contexts = new Map();
  const contextFor = (item) => {
    const { url, viewport, steps } = item;
    const canonicalUrl = canonicalInspectorUrl(url || targetUrl);
    const width = Math.round(Number(viewport?.width) || 0);
    const height = Math.round(Number(viewport?.height) || 0);
    // Each tab or panel of a page is captured on its own: from the copy of
    // the view the comment was left in, or after its recorded switches are
    // clicked again. Comments left on one view share its copy.
    const viewSteps = Array.isArray(steps) ? steps : [];
    const snapshot = typeof item.snapshot === 'string' ? item.snapshot : '';
    const key = [canonicalUrl, width, height, snapshot || JSON.stringify(viewSteps.map((step) => `${step.kind === 'state' ? `${step.state}@` : ''}${step.element?.domPath || step.element?.selector || ''}`))].join('\u0000');
    if (!contexts.has(key)) {
      const state = viewSteps.length ? viewStepsLabel(viewSteps) : '';
      // A size shared by several workspaces is named after the one the
      // first note on it was made in.
      const source = { workspace: item.workspace, device: item.device, viewport: { width, height } };
      contexts.set(key, {
        url: canonicalUrl, viewport: { width, height }, workspace: workspaceOf(source)?.name || '', device: deviceOf(source),
        steps: viewSteps, snapshot, state, entries: [], targets: new Map()
      });
    }
    return contexts.get(key);
  };
  const addEntry = (source, entry) => {
    const context = contextFor(source);
    const element = source.element || null;
    const selector = element?.selector || source.selector || '';
    // A point placed by hand in a review wins over the recorded element,
    // which may be missing or the wrong one of several look-alikes.
    const pin = source.pin ? { x: Math.round(source.pin.x), y: Math.round(source.pin.y) } : null;
    let targetId = null;
    if (pin) {
      targetId = `pin:${pin.x},${pin.y}`;
      if (!context.targets.has(targetId)) context.targets.set(targetId, { element: null, selector: '', pin });
    } else if (element || selector) {
      targetId = reviewElementKey(element, selector);
      if (!context.targets.has(targetId)) context.targets.set(targetId, { element, selector });
    }
    const offset = !pin && source.offset && Number.isFinite(source.offset.x) && Number.isFinite(source.offset.y) ? source.offset : null;
    context.entries.push({ ...entry, selector: entry.ruleSelector || selector, element, pin, offset, targetId, order: context.entries.length });
  };

  comments.forEach((comment) => addEntry(comment, {
    kind: 'comment',
    text: comment.comment,
    ...(commentAttachments(comment).length ? { attachments: commentAttachments(comment) } : {})
  }));
  // An edit to a state (".button:hover") goes on a capture in that state.
  // Edits recorded before they kept their view get the state from the rule.
  const withStateStep = (change) => {
    const steps = Array.isArray(change.steps) ? change.steps : [];
    const state = Object.keys(INSPECTOR_STATE_SUFFIXES).find((name) => String(change.selector || '').endsWith(INSPECTOR_STATE_SUFFIXES[name]));
    return state && change.element && !steps.some((step) => step.kind === 'state')
      ? { ...change, steps: [...steps, { kind: 'state', state, element: change.element, label: INSPECTOR_STATE_LABELS[state] }] }
      : change;
  };
  activeChanges().map(withStateStep).forEach((change) => addEntry(change, {
    kind: 'change',
    // The rule the edit goes to (".button:hover"), and its state by name.
    ruleSelector: change.selector,
    ...(change.steps?.find((step) => step.kind === 'state') ? { state: change.steps.find((step) => step.kind === 'state').label } : {}),
    property: change.property,
    from: String(change.from || '').trim(),
    to: String(change.to || '').trim(),
    text: change.wrapText ? `${describeReviewChange(change)} (text “${change.wrapText.text}”: wrap it in a span)` : describeReviewChange(change)
  }));

  return [...contexts.values()]
    .map((context) => ({
      ...context,
      targets: [...context.targets].map(([id, target]) => ({ id, target }))
    }))
    .sort((left, right) => (
      left.url.localeCompare(right.url)
      || workspaceRank(left) - workspaceRank(right)
      || left.viewport.width - right.viewport.width
      || left.viewport.height - right.viewport.height
    ));
}

// Review sizes follow the workspaces' order; sizes of no workspace go last.
function workspaceRank({ workspace }) {
  const index = WORKSPACES.findIndex((candidate) => candidate.name === workspace);
  return index === -1 ? WORKSPACES.length : index;
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
    if (entry.kind === 'change') Object.assign(result, { property: entry.property, from: entry.from, to: entry.to, ...(entry.state ? { state: entry.state } : {}) });
    if (entry.attachments?.length) result.attachments = entry.attachments;
    // Kept so the review can be imported back without losing the binding.
    if (entry.element) result.element = entry.element;
    if (entry.pin) {
      result.pin = entry.pin;
      if (target === 'element') result.target = 'pin';
    }
    if (entry.offset) result.offset = entry.offset;
    if (rect) {
      const { width, height } = shots[shot];
      // A marker moved within its element keeps that spot; others stack
      // side by side on the element's corner.
      const offset = entry.offset ? 0 : markersPerTarget.get(entry.targetId) || 0;
      if (!entry.offset) markersPerTarget.set(entry.targetId, offset + 1);
      const x = rect.x + (entry.offset ? Math.min(Math.max(entry.offset.x, 0), rect.width) : 0);
      const y = rect.y + (entry.offset ? Math.min(Math.max(entry.offset.y, 0), rect.height) : 0);
      const inset = 13;
      result.rect = rect;
      result.marker = {
        x: Math.min(Math.max(x, inset), Math.max(inset, width - inset - (offset * 24))),
        y: Math.min(Math.max(y, inset), Math.max(inset, height - inset)),
        offset
      };
    }
    return result;
  });
  return {
    width: context.viewport.width,
    height: context.viewport.height,
    ...(context.workspace ? { workspace: context.workspace } : {}),
    ...(context.device ? { device: context.device } : {}),
    ...(context.state ? { state: context.state, steps: context.steps } : {}),
    // A tab, menu or popup the capture could not open: its comments are not on the screen.
    ...(context.failedSteps?.length ? { warning: `Could not open ${context.failedSteps.map((label) => `“${label}”`).join(', ')}` } : {}),
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

// Both review files are built from the same captures and data.
async function captureReviewData(contexts, button) {
  let nextContext = 0;
  let captured = 0;
  button.textContent = `Capturing 0/${contexts.length}...`;
  const captureNextContext = async () => {
    while (nextContext < contexts.length) {
      const context = contexts[nextContext];
      nextContext += 1;
      try {
        // A copy lost from storage leaves the recorded steps to replay.
        const snapshot = context.snapshot ? await loadViewSnapshot(context.snapshot) : null;
        const response = await promiseWithTimeout(window.chrome.runtime.sendMessage({
          type: 'capture-review-page',
          url: context.url,
          width: context.viewport.width,
          height: context.viewport.height,
          // Screenshots show the live site as it is; edits are listed as before/after notes.
          changes: [],
          targets: context.targets,
          steps: context.steps,
          snapshot
        }), 45000 + (context.targets.length * 12000), 'The page took too long to prepare.');
        if (!response?.ok) throw new Error(response?.error || 'Unable to capture this page.');
        context.shots = response.shots;
        context.unplaced = response.unplaced;
        context.identity = response.identity;
        context.failedSteps = Array.isArray(response.failedSteps) ? response.failedSteps : [];
      } catch (error) {
        context.captureError = error.message;
      }
      captured += 1;
      button.textContent = `Captured ${captured}/${contexts.length}...`;
      speak(`${captured} of ${contexts.length} review screenshots prepared.`);
    }
  };
  const workerCount = Math.min(2, contexts.length);
  await Promise.all(Array.from({ length: workerCount }, () => captureNextContext()));

  button.textContent = 'Building review...';
  for (const context of contexts) {
    for (const entry of context.entries) {
      if (entry.attachments?.length) entry.attachments = await embeddedAttachments(entry.attachments);
    }
  }
  return reviewHtmlData(contexts);
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
    const html = await buildReviewHtml(await captureReviewData(contexts, reviewExportButton));
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

function syncDevicePickerOverflow() {
  const controlbar = devicePicker.closest('.controlbar');
  const scroller = devicePicker.parentElement;
  controlbar.classList.remove('is-overflowing');
  // The buttons' own width: scrollWidth would also count their tooltips.
  controlbar.classList.toggle('is-overflowing', devicePicker.offsetWidth > scroller.clientWidth + 1);
}
window.addEventListener('resize', syncDevicePickerOverflow);

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
  syncDevicePickerOverflow();
}

function updateCardDimensions(card, device, width, height, scale) {
  const visualWidth = Math.round(width * scale);
  const visualHeight = Math.round(height * scale);
  const ruler = rulerOffset(card);
  card.style.setProperty('--frame-width', `${visualWidth + ruler}px`);
  card.dataset.viewportWidth = String(width);
  card.dataset.viewportHeight = String(height);
  const frame = card.querySelector('.viewport-frame');
  const scaleNode = card.querySelector('.viewport-scale');
  frame.style.height = `${visualHeight + ruler}px`;
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
  renderRulers(card);
  renderGridOverlay(card);
  if (gridDialogCard === card) syncGridDialog();
}

// The page in a preview keeps running until the next one replaces it, and
// what it reports meanwhile (a router rewriting history on beforeunload) is
// about a page that is going away. Until the frame loads, it is ignored.
// A new fragment alone keeps the document and fires no load event.
function loadPreviewFrame(iframe, url) {
  const withoutHash = (value) => value.split('#')[0];
  if (!url.includes('#') || withoutHash(url) !== withoutHash(iframe.src)) iframe.dataset.navigating = 'true';
  iframe.src = url;
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

// Screenshots are taken in a temporary tab at the card's size: the visible
// area at the top of the page, the full page, or one picked element.
const CAPTURE_KINDS = {
  visible: { type: 'capture-viewport', file: 'viewport', saved: 'Visible-area screenshot saved.' },
  full: { type: 'capture-full-page', file: 'fullpage', saved: 'Full-page screenshot saved.' },
  element: { type: 'capture-element', file: 'element', saved: 'Element screenshot saved.' }
};

async function saveCapture(card, kind = 'visible', details = {}) {
  const menu = card.querySelector('.capture-actions');
  const capture = CAPTURE_KINDS[kind];
  if (!window.chrome?.runtime?.sendMessage) {
    notify('Screenshots are available after the extension is loaded in Chrome.', 'error');
    return;
  }
  if (menu.getAttribute('aria-busy') === 'true') return;
  menu.setAttribute('aria-busy', 'true');
  if (kind !== 'visible') notify(kind === 'full' ? 'Capturing the full page…' : 'Capturing the element…');
  // Lets the background tell this capture's countdown apart from another card's.
  const requestId = `${card.dataset.device}-${Date.now()}`;
  try {
    const studioTab = await getStudioTab();
    const response = await window.chrome.runtime.sendMessage({
      type: capture.type,
      url: kind === 'visible' ? targetUrl : canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl),
      width: Number(card.dataset.viewportWidth),
      height: Number(card.dataset.viewportHeight),
      ...details,
      requestId,
      returnWindowId: studioTab?.windowId
    });
    if (!response?.ok) throw new Error(response?.error || 'Unable to capture the image.');
    const result = await window.chrome.runtime.sendMessage({
      type: 'save-capture',
      dataUrl: response.dataUrl,
      filename: `${capture.file}-${card.dataset.device}-${Date.now()}.png`
    });
    if (!result?.ok) throw new Error(result?.error || 'Unable to save the file.');
    if (response.truncated) notify(`Full-page screenshot saved: the page is cut at ${response.height} px, the longest image Chrome renders.`, 'success');
    else notify(capture.saved, 'success');
  } catch (error) {
    notify(`Screenshot was not saved: ${error.message}`, 'error');
  } finally {
    stopCaptureCountdown(requestId);
    menu.removeAttribute('aria-busy');
  }
}

// A delayed full-page screenshot counts down once the page has loaded in the
// temporary tab; the background says when the wait starts.
let captureCountdown = null;

function stopCaptureCountdown(requestId) {
  if (!captureCountdown || (requestId && captureCountdown.requestId !== requestId)) return;
  clearInterval(captureCountdown.timer);
  captureCountdown = null;
}

function startCaptureCountdown(requestId, seconds) {
  stopCaptureCountdown();
  let left = Math.round(seconds);
  const tick = () => {
    if (left <= 0) {
      stopCaptureCountdown(requestId);
      notify('Capturing the full page…');
      return;
    }
    notify(`Full-page screenshot in ${left} s…`);
    left -= 1;
  };
  captureCountdown = { requestId, timer: setInterval(tick, 1000) };
  tick();
}

window.chrome?.runtime?.onMessage?.addListener((message) => {
  if (message?.type !== 'capture-countdown' || typeof message.requestId !== 'string') return;
  startCaptureCountdown(message.requestId, Number(message.seconds) || 0);
});

// Card menus (screenshot, more actions) open one at a time, in any card, and
// close on a press outside them or in a preview.
function closeCardMenus(except) {
  document.querySelectorAll('.viewport-card .more-actions[open]').forEach((menu) => {
    if (menu !== except) menu.open = false;
  });
}

document.addEventListener('toggle', (event) => {
  if (event.target instanceof HTMLDetailsElement && event.target.matches('.viewport-card .more-actions') && event.target.open) closeCardMenus(event.target);
}, true);
document.addEventListener('pointerdown', (event) => {
  closeCardMenus(event.target instanceof Element ? event.target.closest('.more-actions') : null);
}, true);
// A press in a preview reaches only the iframe; the studio sees its focus leave.
window.addEventListener('blur', () => closeCardMenus());

// The card waiting for an element to be picked for a screenshot.
let capturePickCard = null;

function setCapturePicking(card) {
  const previous = capturePickCard;
  capturePickCard = card;
  if (previous && previous !== card) {
    previous.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'toggle-capture-picker', enabled: false }, '*');
  }
  [previous, card].filter(Boolean).forEach((item) => {
    const picking = item === capturePickCard;
    item.querySelector('.capture-actions').classList.toggle('is-picking', picking);
    item.querySelector('.capture-element-button').setAttribute('aria-pressed', String(picking));
  });
  if (!card) return;
  card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'toggle-capture-picker', enabled: true }, '*');
  notify('Click an element in the preview to capture it. Esc cancels.');
}

function startElementCapture(card) {
  if (!hasExtensionRuntime) {
    notify('Screenshots are available after the extension is loaded in Chrome.', 'error');
    return;
  }
  if (card.dataset.previewReady !== 'true') {
    notify('Wait for the preview to load, then pick the element.', 'error');
    return;
  }
  setCapturePicking(capturePickCard === card ? null : card);
}

function cancelElementCapture() {
  if (!capturePickCard) return;
  setCapturePicking(null);
  speak('Element screenshot cancelled.');
}

function refreshPreview(card) {
  const iframe = card.querySelector('iframe');
  const refreshed = new URL(targetUrl);
  refreshed.searchParams.set('__viewport_parade_refresh', String(Date.now()));
  setInspectorState(card, false);
  setContrastState(card, false);
  loadPreviewFrame(iframe, refreshed.href);
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

function isLayoutContrastOn(card) {
  return card.querySelector('.contrast-button').getAttribute('aria-pressed') === 'true';
}

function toggleLayoutContrast(card, enabled = !isLayoutContrastOn(card)) {
  if (!hasExtensionRuntime) {
    notify('Visual editing is available in the PixelPrism Chrome extension, not this Codex preview.', 'error');
    return;
  }
  const iframe = card.querySelector('iframe');
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage({ source: 'viewport-parade', type: 'toggle-layout-contrast', enabled }, '*');
  setContrastState(card, enabled);
  speak(enabled ? 'Layout grid enabled.' : 'Layout grid disabled.');
}

// Rulers and guides belong to one preview card and live only in the studio:
// they are drawn over the preview, never inside the page, and stay out of
// the reports and reviews. A guide keeps its position in page pixels, so it
// moves with the page when the page scrolls.
const RULER_SIZE = 20;
const RULER_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

function rulerState(card) {
  card.rulers ||= { shown: false, guides: [], scrollX: 0, scrollY: 0, activeGuide: null };
  return card.rulers;
}

function rulerOffset(card) {
  return card.rulers?.shown ? RULER_SIZE : 0;
}

function ensureRulerLayer(card) {
  let layer = card.querySelector('.ruler-layer');
  if (layer) return layer;
  layer = document.createElement('div');
  layer.className = 'ruler-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<div class="ruler-guides"></div><canvas class="ruler ruler-top"></canvas><canvas class="ruler ruler-left"></canvas><span class="ruler-corner"></span>';
  card.querySelector('.viewport-frame').append(layer);
  // A drag from the top ruler pulls out a horizontal guide, from the left
  // ruler a vertical one; every drag adds a new guide.
  layer.querySelector('.ruler-top').addEventListener('pointerdown', (event) => pullGuide(card, 'y', event));
  layer.querySelector('.ruler-left').addEventListener('pointerdown', (event) => pullGuide(card, 'x', event));
  layer.querySelector('.ruler-guides').addEventListener('pointerdown', (event) => {
    const element = event.target.closest('.ruler-guide');
    const guide = element && rulerState(card).guides[Number(element.dataset.index)];
    if (guide) dragGuide(card, guide, event);
  });
  return layer;
}

function pullGuide(card, axis, event) {
  if (event.button !== 0) return;
  const guide = { axis, position: 0 };
  rulerState(card).guides.push(guide);
  dragGuide(card, guide, event);
}

// The guide follows the pointer in whole page pixels. Dropped back on its
// ruler, it is removed.
function dragGuide(card, guide, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const state = rulerState(card);
  const target = event.currentTarget;
  const scale = Number(card.dataset.scale) || zoom;
  const area = card.querySelector('.ruler-guides');
  const move = (pointer) => {
    const rect = area.getBoundingClientRect();
    const vertical = guide.axis === 'x';
    const offset = vertical ? pointer.clientX - rect.left : pointer.clientY - rect.top;
    const length = vertical ? rect.width : rect.height;
    guide.overRuler = offset < 0;
    const scroll = vertical ? state.scrollX : state.scrollY;
    guide.position = Math.round(scroll + Math.min(Math.max(offset, 0), length) / scale);
    renderRulers(card);
  };
  const finish = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', finish);
    target.removeEventListener('pointercancel', finish);
    document.body.classList.remove('is-dragging-guide', `is-dragging-guide-${guide.axis}`);
    if (guide.overRuler) state.guides.splice(state.guides.indexOf(guide), 1);
    delete guide.overRuler;
    state.activeGuide = null;
    renderRulers(card);
  };
  state.activeGuide = guide;
  document.body.classList.add('is-dragging-guide', `is-dragging-guide-${guide.axis}`);
  target.setPointerCapture(event.pointerId);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
  move(event);
}

function rulerStep(scale) {
  return RULER_STEPS.find((step) => step * scale >= 50) || RULER_STEPS.at(-1);
}

function drawRuler(canvas, { vertical, length, scroll, scale, active }) {
  const ratio = window.devicePixelRatio || 1;
  const width = vertical ? RULER_SIZE : length;
  const height = vertical ? length : RULER_SIZE;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const theme = getComputedStyle(document.documentElement);
  const color = (token) => theme.getPropertyValue(token).trim();
  context.fillStyle = color('--line');
  if (vertical) context.fillRect(RULER_SIZE - 1, 0, 1, length);
  else context.fillRect(0, RULER_SIZE - 1, length, 1);
  context.font = '500 9px Inter, ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const label = (text, at, color) => {
    context.fillStyle = color;
    if (vertical) {
      context.save();
      context.translate(8, at);
      context.rotate(-Math.PI / 2);
      context.fillText(text, 0, 0);
      context.restore();
    } else {
      context.fillText(text, at, 8);
    }
  };
  const step = rulerStep(scale);
  for (let value = Math.floor(scroll / step) * step; (value - scroll) * scale <= length; value += step) {
    const at = Math.round((value - scroll) * scale);
    if (at < 0) continue;
    context.fillStyle = color('--fg-a1a1aa');
    if (vertical) context.fillRect(RULER_SIZE - 5, at, 4, 1);
    else context.fillRect(at, RULER_SIZE - 5, 1, 4);
    // A number cut by the ruler's start is left out; its tick stays.
    const half = context.measureText(String(value)).width / 2;
    if (at - half >= 0 && at + half <= length) label(String(value), at + 0.5, color('--muted'));
  }
  if (!active) return;
  // The dragged guide's value, over the numbers it covers.
  const at = Math.round((active.position - scroll) * scale) + 0.5;
  const text = String(active.position);
  const size = Math.ceil(context.measureText(text).width) + 8;
  context.fillStyle = '#ef4444';
  if (vertical) context.fillRect(1, at - size / 2, RULER_SIZE - 3, size);
  else context.fillRect(at - size / 2, 1, size, RULER_SIZE - 3);
  label(text, at, '#fff');
}

function renderRulers(card) {
  const state = card.rulers;
  if (!state?.shown) return;
  const layer = ensureRulerLayer(card);
  const scale = Number(card.dataset.scale) || zoom;
  const area = layer.querySelector('.ruler-guides');
  const width = area.clientWidth;
  const height = area.clientHeight;
  const active = state.activeGuide && !state.activeGuide.overRuler ? state.activeGuide : null;
  drawRuler(layer.querySelector('.ruler-top'), {
    vertical: false, length: width, scroll: state.scrollX, scale, active: active?.axis === 'x' ? active : null
  });
  drawRuler(layer.querySelector('.ruler-left'), {
    vertical: true, length: height, scroll: state.scrollY, scale, active: active?.axis === 'y' ? active : null
  });
  const elements = [...area.children];
  state.guides.forEach((guide, index) => {
    let element = elements[index];
    if (!element) {
      element = document.createElement('div');
      area.append(element);
    }
    const vertical = guide.axis === 'x';
    const at = (guide.position - (vertical ? state.scrollX : state.scrollY)) * scale;
    element.className = `ruler-guide is-${guide.axis}`;
    element.classList.toggle('is-dragging', guide === state.activeGuide);
    element.dataset.index = String(index);
    element.hidden = guide.overRuler || at < 0 || at > (vertical ? width : height);
    element.style.left = vertical ? `${Math.round(at)}px` : '';
    element.style.top = vertical ? '' : `${Math.round(at)}px`;
  });
  elements.slice(state.guides.length).forEach((element) => element.remove());
}

// Hiding the rulers hides their guides too; showing them brings both back.
function setRulersShown(card, shown) {
  const state = rulerState(card);
  state.shown = shown;
  card.classList.toggle('has-rulers', shown);
  card.querySelector('.ruler-button').setAttribute('aria-pressed', String(shown));
  if (shown) ensureRulerLayer(card);
  card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'watch-ruler-scroll', enabled: shown }, '*');
  const width = Number(card.dataset.viewportWidth);
  const height = Number(card.dataset.viewportHeight);
  updateCardDimensions(card, DEVICES[card.dataset.device], width, height, Number(card.dataset.scale) || zoom);
}

// Shift+G turns off every shown layout grid, or turns them all on when none
// is shown.
function toggleAllLayoutContrast() {
  const cards = [...grid.querySelectorAll('.viewport-card')];
  const enabled = !cards.some(isLayoutContrastOn);
  cards.filter((card) => isLayoutContrastOn(card) !== enabled).forEach((card) => toggleLayoutContrast(card, enabled));
}

// Shift+R hides every shown ruler, or shows them all when none is shown.
function toggleAllRulers() {
  const cards = [...grid.querySelectorAll('.viewport-card')];
  const shown = !cards.some((card) => card.rulers?.shown);
  cards.forEach((card) => setRulersShown(card, shown));
  speak(shown ? 'Rulers shown.' : 'Rulers hidden.');
}

// Grid overlay: columns or rows over one card's preview, as in Figma's
// layout grids. Each card size keeps its own settings (remembered across
// sessions); like rulers, the grid is drawn by the studio over the preview,
// stays put while the page scrolls and never reaches screenshots or reports.
const GRID_STORAGE_KEY = 'pixelprism-grid-overlays';
const GRID_DEFAULTS = { shown: false, type: 'columns', count: 12, color: '#FF0000', opacity: 10, align: 'stretch', width: 60, margin: 24, gutter: 24 };
const GRID_ALIGN_LABELS = {
  columns: { stretch: 'Stretch', left: 'Left', center: 'Center', right: 'Right' },
  rows: { stretch: 'Stretch', left: 'Top', center: 'Center', right: 'Bottom' }
};
const gridDialog = document.querySelector('#grid-dialog');
let gridDialogCard = null;

function readGridSettings() {
  try { return JSON.parse(localStorage.getItem(GRID_STORAGE_KEY)) || {}; } catch { return {}; }
}

function gridSettingsFor(card) {
  return { ...GRID_DEFAULTS, ...readGridSettings()[card.dataset.device] };
}

function updateGridSettings(card, patch) {
  const all = readGridSettings();
  all[card.dataset.device] = { ...gridSettingsFor(card), ...patch };
  try { localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(all)); } catch { /* Kept for this render only. */ }
  renderGridOverlay(card, all[card.dataset.device]);
}

// Where each column (or row) starts and how long it is, in page pixels, as
// Figma lays them out: stretched between the margins, or a fixed width
// placed at the start, the end or the centre.
function gridBands(settings, length) {
  const count = Math.max(1, Math.round(settings.count));
  const gutter = Math.max(0, settings.gutter);
  const margin = Math.max(0, settings.margin);
  const size = settings.align === 'stretch' ? (length - margin * 2 - gutter * (count - 1)) / count : Math.max(0, settings.width);
  if (!(size > 0)) return [];
  const total = size * count + gutter * (count - 1);
  const start = { stretch: margin, left: margin, right: length - margin - total, center: (length - total) / 2 }[settings.align] ?? margin;
  return Array.from({ length: count }, (_, index) => ({ start: start + index * (size + gutter), size }));
}

function gridColor(settings) {
  const hex = /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : GRID_DEFAULTS.color;
  const channel = (index) => Number.parseInt(hex.slice(index, index + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${Math.min(100, Math.max(0, settings.opacity)) / 100})`;
}

function renderGridOverlay(card, settings = gridSettingsFor(card)) {
  card.querySelector('.grid-overlay-button')?.setAttribute('aria-pressed', String(settings.shown));
  let layer = card.querySelector('.grid-overlay');
  if (!settings.shown) {
    if (layer) layer.hidden = true;
    return;
  }
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'grid-overlay';
    layer.setAttribute('aria-hidden', 'true');
    card.querySelector('.viewport-scale').append(layer);
  }
  layer.hidden = false;
  const columns = settings.type !== 'rows';
  const length = Number(columns ? card.dataset.viewportWidth : card.dataset.viewportHeight) || 0;
  const color = gridColor(settings);
  layer.replaceChildren(...gridBands(settings, length).map(({ start, size }) => {
    const band = document.createElement('span');
    band.style.background = color;
    if (columns) Object.assign(band.style, { left: `${start}px`, width: `${size}px`, top: '0', bottom: '0' });
    else Object.assign(band.style, { top: `${start}px`, height: `${size}px`, left: '0', right: '0' });
    return band;
  }));
}

function setGridOverlayShown(card, shown) {
  updateGridSettings(card, { shown });
  if (gridDialogCard === card) syncGridDialog();
}

// Shift+C hides every shown grid, or shows them all when none is shown.
function toggleAllGridOverlays() {
  const cards = [...grid.querySelectorAll('.viewport-card')];
  const shown = !cards.some((card) => gridSettingsFor(card).shown);
  cards.forEach((card) => setGridOverlayShown(card, shown));
  speak(shown ? 'Grid overlay shown.' : 'Grid overlay hidden.');
}

function syncGridDialog() {
  const card = gridDialogCard;
  if (!card) return;
  const settings = gridSettingsFor(card);
  const device = DEVICES[card.dataset.device];
  gridDialog.querySelector('.grid-dialog-device').textContent = `${device?.name || ''} · ${card.dataset.viewportWidth} × ${card.dataset.viewportHeight}`;
  const visibility = gridDialog.querySelector('.grid-visibility');
  visibility.setAttribute('aria-pressed', String(settings.shown));
  visibility.setAttribute('aria-label', settings.shown ? 'Hide grid' : 'Show grid');
  visibility.title = settings.shown ? 'Hide grid' : 'Show grid';
  gridDialog.querySelectorAll('[data-grid-type]').forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.gridType === settings.type)));
  const align = gridDialog.querySelector('[name="align"]');
  align.replaceChildren(...Object.entries(GRID_ALIGN_LABELS[settings.type === 'rows' ? 'rows' : 'columns']).map(([value, text]) => new Option(text, value)));
  align.value = settings.align;
  const fields = gridDialog.querySelector('.grid-dialog-fields');
  ['count', 'width', 'margin', 'gutter', 'opacity'].forEach((name) => {
    const input = fields.querySelector(`[name="${name}"]`);
    if (document.activeElement !== input) input.value = String(settings[name]);
  });
  const colorInput = fields.querySelector('[name="color"]');
  if (document.activeElement !== colorInput) colorInput.value = settings.color.toUpperCase();
  fields.querySelector('[name="picker"]').value = settings.color.toLowerCase();
  // Only the settings that take effect are shown: a stretched grid has no
  // width of its own, and a centred one no margin.
  fields.querySelector('[data-grid-field="width"]').hidden = settings.align === 'stretch';
  fields.querySelector('[data-grid-field="margin"]').hidden = settings.align === 'center';
}

function placeGridDialog() {
  if (!gridDialogCard || !gridDialog.matches(':popover-open')) return;
  const trigger = gridDialogCard.querySelector('.grid-overlay-button').getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = gridDialog;
  gridDialog.style.left = `${Math.max(12, Math.min(trigger.left + trigger.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
  gridDialog.style.top = `${Math.max(12, Math.min(trigger.bottom + 8, window.innerHeight - height - 12))}px`;
}

function openGridDialog(card) {
  gridDialogCard = card;
  // An open dialog takes the place of its button's tooltip.
  card.querySelector('.grid-overlay-button').setAttribute('aria-expanded', 'true');
  syncGridDialog();
  gridDialog.showPopover();
  placeGridDialog();
}

window.addEventListener('resize', placeGridDialog);
gridDialog.addEventListener('toggle', (event) => {
  if (event.newState !== 'closed') return;
  gridDialogCard?.querySelector('.grid-overlay-button').setAttribute('aria-expanded', 'false');
  gridDialogCard = null;
});
gridDialog.querySelector('.dialog-close').addEventListener('click', () => gridDialog.hidePopover());
gridDialog.querySelector('.grid-visibility').addEventListener('click', () => {
  if (gridDialogCard) setGridOverlayShown(gridDialogCard, !gridSettingsFor(gridDialogCard).shown);
});

// Any change shows the grid: a setting is changed to be seen.
function changeGridSetting(patch) {
  if (!gridDialogCard) return;
  updateGridSettings(gridDialogCard, { ...patch, shown: true });
  syncGridDialog();
}

gridDialog.querySelectorAll('[data-grid-type]').forEach((tab) => {
  tab.addEventListener('click', () => changeGridSetting({ type: tab.dataset.gridType }));
});
gridDialog.querySelector('[name="align"]').addEventListener('change', (event) => changeGridSetting({ align: event.target.value }));

const GRID_NUMBER_LIMITS = { count: [1, 100], width: [1, 10000], margin: [0, 10000], gutter: [0, 10000], opacity: [0, 100] };
Object.entries(GRID_NUMBER_LIMITS).forEach(([name, [min, max]]) => {
  const input = gridDialog.querySelector(`[name="${name}"]`);
  const commit = (value) => {
    if (!Number.isFinite(value)) return;
    const clamped = Math.min(max, Math.max(min, Math.round(value)));
    changeGridSetting({ [name]: clamped });
    return clamped;
  };
  input.addEventListener('input', () => {
    if (input.value.trim() !== '') commit(Number(input.value));
  });
  // Arrow keys step by 1, or by 10 with Shift, as in the Inspector.
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
    const value = commit((Number(input.value) || 0) + step);
    if (value !== undefined) input.value = String(value);
  });
  input.addEventListener('blur', syncGridDialog);
  input.addEventListener('focus', () => requestAnimationFrame(() => input.select()));
});

const gridColorInput = gridDialog.querySelector('[name="color"]');
gridColorInput.addEventListener('input', () => {
  const value = gridColorInput.value.trim().replace(/^#?/, '#');
  const full = /^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((digit) => digit + digit).join('')}` : value;
  if (/^#[0-9a-f]{6}$/i.test(full)) changeGridSetting({ color: full.toUpperCase() });
});
gridColorInput.addEventListener('blur', syncGridDialog);
gridColorInput.addEventListener('focus', () => requestAnimationFrame(() => gridColorInput.select()));
gridDialog.querySelector('[name="picker"]').addEventListener('input', (event) => changeGridSetting({ color: event.target.value.toUpperCase() }));

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'ruler-scroll') return;
  const card = cardForFrame(event.source);
  if (!card?.rulers) return;
  card.rulers.scrollX = Number(event.data.x) || 0;
  card.rulers.scrollY = Number(event.data.y) || 0;
  renderRulers(card);
});

// Code panel: the inspected page's live markup (HTML) and its stylesheets as
// written (CSS), read from one preview. It only shows code: nothing in it is
// editable, and nothing goes to the reports or reviews.
const codePanel = document.querySelector('#code-panel');
const codeToggle = document.querySelector('#code-toggle');
const codeHtml = document.querySelector('#code-html');
const codeCss = document.querySelector('#code-css');
const codeMedia = document.querySelector('#code-media');
const codeResize = document.querySelector('#code-panel-resize');
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

// The panel's left edge resizes it; the width is remembered.
function setCodePanelWidth(width) {
  const clamped = Math.round(Math.min(Math.max(width, 280), Math.max(280, window.innerWidth - 360)));
  document.documentElement.style.setProperty('--code-panel-width', `${clamped}px`);
  try { localStorage.setItem(CODE_WIDTH_KEY, String(clamped)); } catch { /* Not remembered this time. */ }
}
try {
  const stored = Number(localStorage.getItem(CODE_WIDTH_KEY));
  if (stored) document.documentElement.style.setProperty('--code-panel-width', `${stored}px`);
} catch { /* The default width. */ }
codeResize.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  const right = codePanel.getBoundingClientRect().right;
  const move = (pointer) => setCodePanelWidth(right - pointer.clientX);
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
  setCodePanelWidth(codePanel.getBoundingClientRect().width + step);
});

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
  syncCodeFrame();
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

// Layer icons by kind, as the page script names them; a page script that
// predates kinds draws every layer as a box.
const LAYER_ICONS = {
  box: 'M3 3h10v10H3z',
  section: 'M2.5 3h11v10h-11zM2.5 6h11',
  body: 'M3.5 2.5h6l3 3v8h-9zM9.5 2.5v3h3',
  text: 'M3.5 4.5V3h9v1.5M8 3v10M6.5 13h3',
  heading: 'M4 3v10M12 3v10M4 8h8',
  image: 'M2.5 3h11v10h-11zM2.5 11l3.5-3.5 3 3 2-2 2.5 2.5M10.5 5.5h.01',
  vector: 'M3.5 12.5c1.5-6 7.5-3.5 9-9M2 11.5h3v3H2zM11 1.5h3v3h-3z',
  video: 'M2.5 3.5h11v9h-11zM6.5 6v4l3.5-2z',
  embed: 'M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3M9 3.5 7 12.5',
  button: 'M6 8.5V3a1 1 0 0 1 2 0v4.5M8 7V6a1 1 0 0 1 2 0v1.5M10 7.5a1 1 0 0 1 2 0V10a4 4 0 0 1-4 4H7.5a3.5 3.5 0 0 1-2.8-1.4L3 10.2a1 1 0 0 1 1.5-1.3L6 10.5',
  link: 'M7 9a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.5.5M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.5-.5',
  input: 'M2.5 5h11v6h-11zM5 7v2',
  textarea: 'M2.5 3h11v10h-11zM5 5.5v3M10.5 11l1.5-1.5',
  select: 'M2.5 3h11v10h-11zM6 7l2 2 2-2',
  checkbox: 'M3 3h10v10H3zM5.5 8l2 2 3-4',
  form: 'M3 2.5h10v11H3zM5.5 5.5h5M5.5 8h5M5.5 10.5h3',
  list: 'M6 4h7.5M6 8h7.5M6 12h7.5M3 4h.01M3 8h.01M3 12h.01',
  'list-item': 'M6 8h7.5M3 8h.01',
  table: 'M2.5 3h11v10h-11zM2.5 6.5h11M2.5 10h11M7 3v10'
};

function renderLayersTree() {
  layersTree.replaceChildren();
  layersTree.setAttribute('aria-busy', 'false');
  if (!layersTreeData) return;
  const makeNode = (node, depth) => {
    const item = document.createElement('div');
    item.className = `layers-node${node.text || node.textWrapper ? ' is-text' : ''}`;
    // Bare text carries its parent's path and its index among the parent's
    // child nodes.
    item.dataset.path = layerPathKey(node.path);
    if (node.text && Number.isInteger(node.textIndex)) item.dataset.textIndex = String(node.textIndex);
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
    if (item.dataset.path === selectedLayerPath && (node.text ? node.textIndex === selectedLayerText : selectedLayerText === null)) row.classList.add('is-selected');
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
    const icon = document.createElement('span');
    icon.className = 'layers-icon';
    icon.innerHTML = inspectorIcon(LAYER_ICONS[node.kind] || LAYER_ICONS.box);
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'layers-select';
    select.textContent = node.label;
    select.title = node.label;
    row.append(icon, select);
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

function selectLayer(path, textIndex = null) {
  if (!layersFrame) return;
  selectedLayerPath = path;
  selectedLayerText = textIndex;
  expandLayerAncestors(path);
  layersFrame.postMessage({ source: 'viewport-parade', type: 'layers-select', path: layerPathArray(path), ...(textIndex === null ? {} : { textIndex }) }, '*');
  renderLayersTree();
}

// Breadcrumbs of the selected element, at the bottom while one is selected:
// body down to the element. Each crumb selects that level, hovering it
// highlights it on the page; a long middle folds into "···" with a menu.
// "+" after the element lists its children, to step one level down when a
// click on the page lands on the parent.
function renderBreadcrumbs() {
  const chain = breadcrumbAncestors;
  breadcrumbs.hidden = inspectorPanel.hidden || !chain.length;
  if (breadcrumbs.hidden) {
    breadcrumbs.replaceChildren();
    return;
  }
  const folded = chain.length > 5 ? chain.slice(1, -3) : [];
  const shown = folded.length ? [chain[0], null, ...chain.slice(-3)] : chain;
  const items = [];
  let foldCrumb;
  shown.forEach((ancestor, index) => {
    if (index) {
      const separator = document.createElement('span');
      separator.className = 'breadcrumbs-separator';
      separator.setAttribute('aria-hidden', 'true');
      separator.innerHTML = inspectorIcon('M6 4l4 4-4 4');
      items.push(separator);
    }
    const crumb = document.createElement('button');
    crumb.type = 'button';
    if (!ancestor) {
      crumb.textContent = '···';
      crumb.title = `${folded.length} more levels`;
      crumb.setAttribute('aria-label', crumb.title);
      foldCrumb = crumb;
      items.push(crumb);
      return;
    }
    const key = layerPathKey(ancestor.path);
    crumb.textContent = ancestor.label;
    crumb.title = ancestor.label;
    if (index === shown.length - 1) crumb.setAttribute('aria-current', 'location');
    else crumb.addEventListener('click', () => selectLayer(key));
    crumb.addEventListener('pointerenter', () => hoverLayer(key));
    crumb.addEventListener('pointerleave', () => hoverLayer(null));
    items.push(crumb);
  });
  let stepDown;
  if (breadcrumbChildren.length) {
    stepDown = document.createElement('button');
    stepDown.type = 'button';
    stepDown.className = 'breadcrumbs-step-down';
    stepDown.title = `${breadcrumbChildren.length} nested element${breadcrumbChildren.length === 1 ? '' : 's'}`;
    stepDown.setAttribute('aria-label', `Select a nested element (${breadcrumbChildren.length})`);
    stepDown.innerHTML = inspectorIcon('M8 3.5v9M3.5 8h9');
    items.push(stepDown);
  }
  breadcrumbs.replaceChildren(...items);
  // Menus join the bar after it is filled, or the refill would drop them.
  if (stepDown) {
    inspectorMenu(stepDown, breadcrumbs, () => ({
      groups: [{ items: breadcrumbChildren.map(({ path, label }) => ({ text: label, pick: () => selectLayer(layerPathKey(path)), preview: () => hoverLayer(layerPathKey(path)) })) }],
      previewEnd: () => hoverLayer(null)
    }));
  }
  if (foldCrumb) {
    inspectorMenu(foldCrumb, breadcrumbs, () => ({
      groups: [{ items: folded.map(({ path, label }) => ({ text: label, pick: () => selectLayer(layerPathKey(path)), preview: () => hoverLayer(layerPathKey(path)) })) }],
      previewEnd: () => hoverLayer(null)
    }));
  }
  breadcrumbs.scrollLeft = breadcrumbs.scrollWidth;
}

function hoverLayer(path, textIndex = null) {
  const key = path === null ? null : `${path}~${textIndex ?? ''}`;
  if (!layersFrame || hoveredLayerPath === key) return;
  hoveredLayerPath = key;
  layersFrame.postMessage({ source: 'viewport-parade', type: 'layers-hover', path: path === null ? null : layerPathArray(path), ...(textIndex === null ? {} : { textIndex }) }, '*');
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
  breadcrumbAncestors = [];
  breadcrumbChildren = [];
  renderBreadcrumbs();
  inspectorPanelFields.replaceChildren();
  inspectorFrame = undefined;
}

const INSPECTOR_STATE_LABELS = { default: 'Default', hover: 'Hover', focus: 'Focus', active: 'Pressed' };
// The rule an edit made in each state goes to, as the page script writes it.
const INSPECTOR_STATE_SUFFIXES = { hover: ':hover', focus: ':focus-visible', active: ':active' };

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
  inspectorPanelTitle.textContent = editor.context?.textOf ? 'Text' : 'Element';
  inspectorPanelSelector.textContent = selector ? `all ${selector}` : '';
  inspectorPanelSelector.hidden = !selector;
  const panelGroups = [];
  let currentGroup;
  const startGroup = (name, layoutFor) => {
    currentGroup = document.createElement('section');
    currentGroup.className = 'inspector-group';
    currentGroup.dataset.name = name;
    if (layoutFor) currentGroup.dataset.layoutFor = layoutFor;
    const group = currentGroup;
    const heading = document.createElement('h3');
    heading.className = 'inspector-group-label';
    heading.hidden = !name;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'inspector-group-toggle';
    const setCollapsed = (collapsed) => {
      group.classList.toggle('is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.innerHTML = window.phosphorIcon(collapsed ? 'caret-right' : 'caret-down');
      // Shown by CSS while the section is folded with changes inside.
      const dot = document.createElement('span');
      dot.className = 'inspector-group-dot';
      dot.title = 'Reset changes in this section';
      toggle.append(name, dot);
    };
    group.setCollapsed = (collapsed) => {
      if (collapsed) collapsedInspectorGroups.add(name);
      else collapsedInspectorGroups.delete(name);
      setCollapsed(collapsed);
    };
    toggle.addEventListener('click', (event) => {
      if (event.target.closest('.inspector-group-dot')) {
        resetInspectorProperties([...new Set([...fields.querySelectorAll('[data-property]')].map((input) => input.dataset.property))]);
        return;
      }
      const collapsed = !group.classList.contains('is-collapsed');
      group.setCollapsed(collapsed);
      if (!collapsed && inspectorFocusMode) inspectorGroups().forEach((other) => { if (other !== group) other.setCollapsed(true); });
    });
    setCollapsed(collapsedInspectorGroups.has(name));
    heading.append(toggle);
    const fields = document.createElement('div');
    fields.className = 'inspector-group-fields';
    currentGroup.append(heading, fields);
    panelGroups.push(currentGroup);
    return fields;
  };
  // Written for the display the panel shows now, so switching Display
  // doesn't leave a note about the old one.
  const layoutNoteFor = (display = editor.values?.display) => {
    const context = editor.context || {};
    const values = editor.values || {};
    const notes = [];
    const isFlex = display === 'flex';
    if (isFlex && values.width === 'auto' && values.height === 'auto') {
      notes.push('Flex is active, but this element is auto-sized, so alignment has little free space to move children.');
    }
    if (String(context.parentDisplay || '').includes('grid')) {
      notes.push('This element is positioned by its parent grid; use Grid Child below or edit the parent grid to move it.');
    }
    if (isFlex && Number(context.childElementCount) < 2) {
      notes.push('Flex controls are most visible when the selected element has multiple child elements.');
    }
    return notes.join(' ');
  };
  const parentDisplay = String(editor.context?.parentDisplay || '');
  const parentKind = parentDisplay.includes('grid') ? 'grid' : parentDisplay.includes('flex') ? 'flex' : null;
  // The element's interaction states: the preview shows the chosen one, and
  // the panel reads and edits its rule (".button:hover"). A dot marks a
  // state with edits.
  if (Array.isArray(editor.states) && editor.states.length) {
    const stateFields = startGroup('State');
    const field = document.createElement('div');
    field.className = 'inspector-field is-wide is-tabs';
    const tabs = document.createElement('span');
    tabs.className = 'inspector-tabs inspector-state-tabs';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'State');
    const current = editor.state || 'default';
    ['default', ...editor.states].filter((state) => INSPECTOR_STATE_LABELS[state]).forEach((state) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'inspector-tab';
      tab.textContent = INSPECTOR_STATE_LABELS[state];
      tab.setAttribute('aria-pressed', String(state === current));
      if (editor.stateChanges?.includes(state)) {
        const dot = document.createElement('span');
        dot.className = 'inspector-change-dot inspector-state-dot';
        dot.setAttribute('aria-hidden', 'true');
        tab.append(dot);
        tab.title = `${INSPECTOR_STATE_LABELS[state]}: changed`;
      }
      tab.addEventListener('click', () => {
        if (tab.getAttribute('aria-pressed') === 'true') return;
        tabs.querySelectorAll('.inspector-tab').forEach((other) => other.setAttribute('aria-pressed', String(other === tab)));
        frame.contentWindow?.postMessage({ source: 'viewport-parade', type: 'inspector-set-state', state }, '*');
      });
      tabs.append(tab);
    });
    field.append(tabs);
    stateFields.append(field);
    currentGroup = undefined;
  }
  let borderSideFields;
  fields.forEach(([property, label, type, wide, layoutFor, options]) => {
    if (property === 'childLayout') {
      if (!parentKind) return;
      const childFields = startGroup(parentKind === 'grid' ? 'Grid Child' : 'Flex Child');
      childFields.append(...childLayoutFields(parentKind, editor.values, editor.context, currentGroup));
      // Fields after this belong to the next section only.
      currentGroup = undefined;
      return;
    }
    const groupStarts = {
      display: ['Layout'],
      width: ['Dimensions'],
      marginTop: ['Spacing'],
      position: ['Position'],
      backgroundColor: ['Background'],
      borderWidth: ['Border'],
      fontFamily: ['Typography'],
      boxShadow: ['Effects']
    };
    const groupStart = groupStarts[property];
    const groupFields = groupStart ? startGroup(...groupStart) : currentGroup?.querySelector('.inspector-group-fields');
    if (groupStart?.[0] === 'Layout') {
      const noteNode = document.createElement('p');
      noteNode.className = 'inspector-note is-layout-note';
      noteNode.refreshNote = (display) => {
        noteNode.textContent = layoutNoteFor(display);
        noteNode.hidden = !noteNode.textContent;
      };
      noteNode.refreshNote();
      currentGroup.insertBefore(noteNode, groupFields);
    }
    if (!groupFields) return;
    // Margin and padding share the Spacing section, each under its own caption.
    const subgroupLabel = ({ marginTop: 'Margin', paddingTop: 'Padding' })[property];
    if (subgroupLabel) {
      const caption = document.createElement('p');
      caption.className = 'inspector-subgroup-label';
      caption.textContent = subgroupLabel;
      groupFields.append(caption);
    }
    // The four sides of margin and padding render as one control at Top.
    const spacingSide = /^(margin|padding)(Top|Right|Bottom|Left)$/.exec(property);
    if (spacingSide) {
      if (spacingSide[2] === 'Top') groupFields.append(spacingControl(spacingSide[1], editor.values));
      return;
    }
    if (property === 'borderRadius') {
      groupFields.append(radiusControl(editor.values));
      return;
    }
    // Width and its side menu take the width's place; the side fields go
    // under the width and color row.
    if (property === 'borderWidth') {
      const [width, sides] = borderWidthControls(editor.values);
      groupFields.append(width);
      borderSideFields = sides;
      return;
    }
    const gridControls = { gridTracks: gridTracksControl, gridAutoFlow: gridFlowControl, gridAlign: gridAlignControl, columnGap: gapControl, gridMoreAlign: gridMoreAlignControl };
    if (gridControls[property]) {
      const control = gridControls[property](editor.values);
      control.dataset.layoutFor = layoutFor;
      groupFields.append(control);
      return;
    }
    if (property === 'alignContent') {
      const control = alignContentField(editor.values);
      control.dataset.layoutFor = layoutFor;
      groupFields.append(control);
      return;
    }
    // Justify content and align items render as the alignment control.
    if (property === 'justifyContent') {
      const control = flexAlignControl(editor.values);
      control.dataset.layoutFor = layoutFor;
      groupFields.append(control);
      return;
    }
    if (property === 'imageSettings') {
      groupFields.append(...imageSettingsFields(editor.values, editor.context));
      return;
    }
    if (property === 'position') {
      groupFields.append(...positionFields(editor.values));
      return;
    }
    if (property === 'overflow') {
      groupFields.append(overflowField(editor.values));
      return;
    }
    if (property === 'cursor') {
      groupFields.append(cursorField(editor.values));
      return;
    }
    if (property === 'boxShadow') {
      groupFields.append(boxShadowsField(editor.values));
      return;
    }
    if (property === 'filter') {
      groupFields.append(filtersField(editor.values));
      return;
    }
    // Direction and wrap render as one control at Direction.
    if (property === 'flexWrap') return;
    if (property === 'flexDirection') {
      const control = flexFlowControl(editor.values);
      control.dataset.layoutFor = layoutFor;
      groupFields.append(control);
      return;
    }
    if (MORE_OPTIONS_FIELDS.has(property) && !groupFields.querySelector('.inspector-more-toggle')) {
      const group = currentGroup;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'inspector-group-toggle inspector-more-toggle';
      const setOpen = (open) => {
        group.classList.toggle('is-showing-more', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.innerHTML = window.phosphorIcon(open ? 'caret-down' : 'caret-right');
        toggle.append('More options');
      };
      toggle.addEventListener('click', () => {
        const open = !group.classList.contains('is-showing-more');
        if (open) openMoreOptions.add(group.dataset.name);
        else openMoreOptions.delete(group.dataset.name);
        setOpen(open);
      });
      setOpen(openMoreOptions.has(group.dataset.name));
      groupFields.append(toggle);
    }
    if (TYPE_MORE_CONTROLS[property]) {
      const typeFields = [].concat(TYPE_MORE_CONTROLS[property](editor.values));
      typeFields.forEach((typeFieldNode) => typeFieldNode.classList.add('is-more'));
      groupFields.append(...typeFields);
      return;
    }
    // A few exclusive choices read better as tabs than as a dropdown.
    const asTabs = INSPECTOR_TAB_FIELDS.has(property);
    const field = document.createElement(asTabs ? 'div' : 'label');
    field.className = `inspector-field${wide ? ' is-wide' : ''}`;
    if (layoutFor) field.dataset.layoutFor = layoutFor;
    const dimensionPrefix = ({ width: 'W', height: 'H', minWidth: 'W min', maxWidth: 'W max', minHeight: 'H min', maxHeight: 'H max' })[property];
    const isDimension = Boolean(dimensionPrefix);
    const isTypography = editorMode === 'typography';
    const isColorField = COLOR_FIELDS.has(property);
    const compactTypeControl = isTypography && ['fontStyle', 'fontSize'].includes(property);
    const typeIcon = ['lineHeight', 'letterSpacing', 'opacity', 'borderWidth'].includes(property) ? INSPECTOR_ICON_PATHS[property] : '';
    const unlabeled = UNLABELED_FIELDS.has(property);
    const inlinePrefix = typeIcon;
    if (isDimension) field.classList.add('is-dimension');
    if (isColorField) field.classList.add('is-color');
    if (isTypography) field.classList.add(`is-type-${property}`);
    if (typeIcon) field.classList.add('is-type-icon');
    if (MORE_OPTIONS_FIELDS.has(property)) field.classList.add('is-more');
    if (typeIcon || (unlabeled && !asTabs)) field.title = label;
    if (!isDimension && !compactTypeControl && !typeIcon && !unlabeled) field.textContent = label;
    if (compactTypeControl || isDimension || typeIcon || unlabeled) {
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
      if (typeIcon) prefix.innerHTML = inspectorIcon(typeIcon);
      else prefix.textContent = dimensionPrefix || inlinePrefix;
      shell.append(prefix, input);
      field.append(shell);
      if (property === 'letterSpacing') field.append(lengthUnitControl(shell, input, LENGTH_UNITS));
      if (property === 'lineHeight') field.append(lengthUnitControl(shell, input, LINE_HEIGHT_UNITS));
      if (isDimension) field.append(lengthUnitControl(shell, input, SIZE_UNITS));
      if (property === 'borderWidth') field.append(lengthUnitControl(shell, input, LENGTH_UNITS));
    } else if (colorPicker) {
      const shell = document.createElement('span');
      shell.className = 'inspector-color-shell';
      shell.append(input, colorPicker);
      field.append(shell);
    } else if (property === 'fontWeight') {
      field.append(...fontWeightStyleControl(input, editor.values));
    } else if (asTabs) {
      // The hidden select keeps the value, so the change pipeline and the
      // layout visibility check read it as before.
      field.classList.add('is-tabs');
      input.hidden = true;
      const tabs = document.createElement('span');
      tabs.className = 'inspector-tabs';
      tabs.setAttribute('role', 'group');
      tabs.setAttribute('aria-label', label);
      // A value outside the options (a border style that differs per side,
      // "none none solid none") gets no tab of its own: none is pressed, and
      // the field's tooltip says what it is.
      if (![...input.options].slice(0, (options || []).length).some((option) => option.value === input.value)) field.title = `${label}: ${input.value}`;
      [...input.options].slice(0, (options || []).length).forEach((option) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'inspector-tab';
        const iconPath = INSPECTOR_ICON_PATHS[property]?.[option.value];
        if (iconPath) {
          tab.classList.add('is-icon');
          tab.innerHTML = inspectorIcon(iconPath);
          tab.title = option.text;
          tab.setAttribute('aria-label', option.text);
        } else {
          tab.textContent = option.text;
        }
        tab.setAttribute('aria-pressed', String(option.value === input.value));
        tab.dataset.value = option.value;
        tab.addEventListener('click', () => {
          if (input.value === option.value) return;
          input.value = option.value;
          tabs.querySelectorAll('.inspector-tab').forEach((other) => other.setAttribute('aria-pressed', String(other === tab)));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        tabs.append(tab);
      });
      // Another control can set the value (border sides set a style).
      field.classList.add('inspector-syncs');
      field.refreshFromPanel = () => {
        const tabList = [...tabs.querySelectorAll('.inspector-tab')];
        tabList.forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.value === input.value)));
        field.title = tabList.some((tab) => tab.dataset.value === input.value) ? '' : `${label}: ${input.value}`;
      };
      field.append(input, tabs);
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
    if (property === 'borderColor' && borderSideFields) groupFields.append(borderSideFields);
  });
  if (frame.closest('.viewport-card')?.dataset.inspectorOutdated === 'true') {
    const outdated = document.createElement('p');
    outdated.className = 'inspector-note';
    outdated.textContent = 'This preview runs an older PixelPrism page script, so some controls won\'t reach the page. Reload PixelPrism in chrome://extensions, then reopen Studio.';
    panelGroups.unshift(outdated);
  }
  // Text without a tag or class of its own shows its parent's values; the
  // first edit wraps it in a span that takes the change.
  if (editor.context?.textOf) {
    const note = document.createElement('p');
    note.className = 'inspector-note';
    note.textContent = `This text has no tag or class of its own: its values come from ${editor.context.textOf}. A change wraps it in a span, which the agent adds to the source.`;
    panelGroups.unshift(note);
  }
  inspectorPanelFields.replaceChildren(...panelGroups);
  if (inspectorFocusMode) focusInspectorGroups();
  // The page script knows what it overrides; one that predates editor.changed
  // falls back to what this Studio sent for the same preview and selector.
  inspectorChangeKey = `${frame.closest('.viewport-card')?.dataset.device}|${editor.title}`;
  const card = frame.closest('.viewport-card');
  inspectorChangeTarget = {
    selector: editor.selector || String(editor.title || '').replace(/^[^·]*·\s*(all\s+)?/, ''),
    url: canonicalInspectorUrl(card?.dataset.loadedUrl || targetUrl),
    width: Math.round(Number(card?.dataset.viewportWidth)),
    height: Math.round(Number(card?.dataset.viewportHeight))
  };
  const changed = new Set(Array.isArray(editor.changed) ? editor.changed : changedInspectorProperties.get(inspectorChangeKey) || []);
  changedInspectorProperties.set(inspectorChangeKey, changed);
  changeDotResizeObserver.disconnect();
  updateLayoutFieldVisibility();
  inspectorPanel.hidden = false;
  changed.forEach(markInspectorFieldChanged);
}

// Weight and style are one typed value here, written the way CSS declares
// them: "700", "700 italic". Hidden inputs carry each property through the
// usual change pipeline, so font-weight and font-style are sent separately.
const FONT_WEIGHT_NAMES = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Normal', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };

function parseFontWeightStyle(text) {
  const tokens = String(text).trim().toLowerCase().split(/\s+/).filter(Boolean);
  let weight = '';
  const style = [];
  tokens.forEach((token) => {
    const number = Number(token);
    if (!weight && ((Number.isFinite(number) && number >= 1 && number <= 1000) || ['bold', 'bolder', 'lighter'].includes(token))) weight = token;
    else if (['italic', 'oblique'].includes(token) || (style[0] === 'oblique' && /deg$/.test(token))) style.push(token);
    else if (token !== 'normal') weight = 'invalid';
  });
  if (weight === 'invalid' || !tokens.length) return null;
  return { weight: weight || 'normal', style: style.join(' ') || 'normal' };
}

// "700 italic" → "Bold Italic"; empty for weights without a common name.
function fontWeightStyleName(text) {
  const parsed = parseFontWeightStyle(text);
  const weight = { normal: '400', bold: '700' }[parsed?.weight] || parsed?.weight;
  const name = FONT_WEIGHT_NAMES[weight];
  if (!name) return '';
  return parsed.style === 'italic' ? `${name} Italic` : name;
}

function fontWeightStyleControl(input, values) {
  const combined = (weight, style) => (style === 'normal' ? weight : `${weight} ${style}`);
  const [weightInput, styleInput] = [['fontWeight', String(values?.fontWeight ?? '')], ['fontStyle', String(values?.fontStyle || 'normal')]].map(([property, value]) => {
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = property;
    hidden.dataset.property = property;
    hidden.value = value;
    hidden.dataset.previousValue = value;
    return hidden;
  });
  const current = () => combined(weightInput.value, styleInput.value);
  input.removeAttribute('name');
  delete input.dataset.property;
  delete input.dataset.previousValue;
  const nameLabel = document.createElement('span');
  nameLabel.className = 'inspector-weight-name';
  nameLabel.setAttribute('aria-hidden', 'true');
  const show = () => {
    input.value = current();
    nameLabel.textContent = fontWeightStyleName(input.value);
  };
  show();
  const apply = (text) => {
    const parsed = parseFontWeightStyle(text);
    if (parsed) {
      [[weightInput, parsed.weight], [styleInput, parsed.style]].forEach(([hidden, value]) => {
        if (hidden.value === value) return;
        hidden.value = value;
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    show();
  };
  input.addEventListener('change', () => apply(input.value));

  const shell = document.createElement('span');
  shell.className = 'inspector-input-shell is-weight';
  shell.append(input, nameLabel);
  return [shell, weightInput, styleInput];
}

// While a control is hovered or focused, its zone of the selected element
// (margin, padding, rowGap, columnGap) is highlighted on the page.
function highlightZoneWhileActive(control, zone) {
  let hovered = false;
  let focused = false;
  const send = () => {
    inspectorFrame?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'inspector-highlight-zone', zone: hovered || focused ? zone : null }, '*');
  };
  control.addEventListener('pointerenter', () => { hovered = true; send(); });
  control.addEventListener('pointerleave', () => { hovered = false; send(); });
  control.addEventListener('focusin', () => { focused = true; send(); });
  control.addEventListener('focusout', (event) => {
    focused = control.contains(event.relatedTarget);
    send();
  });
}

// Margin or padding as two fields, left & right and top & bottom, or as all
// four sides once expanded. A pair shows one value when both sides match and
// "0, 48" when they differ; typing one value sets both sides, two set each.
// Hidden inputs carry each side through the usual change pipeline.
function spacingControl(kind, values) {
  const title = kind === 'margin' ? 'Margin' : 'Padding';
  const control = document.createElement('div');
  control.className = 'inspector-field inspector-spacing';
  const hidden = {};
  ['Top', 'Right', 'Bottom', 'Left'].forEach((side) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = `${kind}${side}`;
    input.dataset.property = `${kind}${side}`;
    input.value = String(values?.[`${kind}${side}`] ?? '');
    input.dataset.previousValue = input.value;
    hidden[side] = input;
  });
  const setSide = (side, value, type) => {
    hidden[side].value = value;
    hidden[side].dispatchEvent(new Event(type, { bubbles: true }));
  };
  const field = (icon, label, properties, read, write) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = label;
    shell.dataset.properties = properties.join(' ');
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.innerHTML = inspectorIcon(icon);
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', label);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => write(input.value, 'input'));
    input.addEventListener('change', () => {
      write(input.value, 'change');
      sync();
    });
    shell.append(prefix, input);
    return { shell, input, read };
  };
  const pair = (sides, icon, label) => field(icon, `${title} ${label}`, sides.map((side) => `${kind}${side}`), () => {
    const [a, b] = sides.map((side) => hidden[side].value);
    return a === b ? a : `${a}, ${b}`;
  }, (text, type) => {
    const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.length || parts.length > 2) return;
    sides.forEach((side, index) => setSide(side, parts[index] ?? parts[0], type));
  });
  const single = (side) => field(INSPECTOR_ICON_PATHS.spacing[side], `${title} ${side.toLowerCase()}`, [`${kind}${side}`], () => hidden[side].value, (text, type) => {
    if (text.trim()) setSide(side, text.trim(), type);
  });
  const collapsed = [pair(['Left', 'Right'], INSPECTOR_ICON_PATHS.spacing.x, 'left and right'), pair(['Top', 'Bottom'], INSPECTOR_ICON_PATHS.spacing.y, 'top and bottom')];
  const expanded = ['Left', 'Top', 'Right', 'Bottom'].map(single);
  const fields = [...collapsed, ...expanded];
  const sync = () => fields.forEach(({ input, read }) => { input.value = read(); });
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inspector-spacing-toggle';
  toggle.title = `${title} for each side`;
  toggle.setAttribute('aria-label', toggle.title);
  toggle.innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.spacing.sides);
  const setExpanded = (open) => {
    control.classList.toggle('is-expanded', open);
    toggle.setAttribute('aria-pressed', String(open));
    collapsed.forEach(({ shell }) => { shell.hidden = open; });
    expanded.forEach(({ shell }) => { shell.hidden = !open; });
  };
  toggle.addEventListener('click', () => {
    const open = !control.classList.contains('is-expanded');
    if (open) expandedSpacingControls.add(kind);
    else expandedSpacingControls.delete(kind);
    setExpanded(open);
  });
  highlightZoneWhileActive(control, kind);
  // Grid order: the toggle closes the first row in both layouts.
  control.append(collapsed[0].shell, collapsed[1].shell, expanded[0].shell, expanded[1].shell, toggle, expanded[2].shell, expanded[3].shell, ...Object.values(hidden));
  sync();
  setExpanded(expandedSpacingControls.has(kind));
  return control;
}

// Flex direction and wrap as one control. The two single-line flows are
// tabs; every other pair sits in the third tab's menu, grouped by the way
// items run, with the CSS it sets shown on hover.
const FLEX_FLOW_MENU = [
  ['Left to right', [['row', 'wrap', 'Wrap down'], ['row', 'wrap-reverse', 'Wrap up']]],
  ['Right to left', [['row-reverse', 'nowrap', 'Single row'], ['row-reverse', 'wrap', 'Wrap down'], ['row-reverse', 'wrap-reverse', 'Wrap up']]],
  ['Top to bottom', [['column', 'wrap', 'Wrap right'], ['column', 'wrap-reverse', 'Wrap left']]],
  ['Bottom to top', [['column-reverse', 'nowrap', 'Single column'], ['column-reverse', 'wrap', 'Wrap right'], ['column-reverse', 'wrap-reverse', 'Wrap left']]]
];
const FLEX_FLOW_HINT = 'Hover an option to see direction and wrap values.';
// The left-to-right icons mirrored or transposed into each direction; the
// second entry also flips wrap-reverse to the other side.
const FLEX_FLOW_TRANSFORMS = {
  row: ['', 'matrix(1 0 0 -1 0 16)'],
  'row-reverse': ['matrix(-1 0 0 1 16 0)', 'matrix(-1 0 0 -1 16 16)'],
  column: ['matrix(0 1 1 0 0 0)', 'matrix(0 1 -1 0 16 0)'],
  'column-reverse': ['matrix(0 -1 1 0 0 16)', 'matrix(0 -1 -1 0 16 16)']
};

function flexFlowIcon(direction, wrap) {
  const path = wrap === 'nowrap' ? INSPECTOR_ICON_PATHS.flexFlow.line : INSPECTOR_ICON_PATHS.flexFlow.wrap;
  const transform = FLEX_FLOW_TRANSFORMS[direction]?.[wrap === 'wrap-reverse' ? 1 : 0];
  return `<svg class="inspector-line-icon" aria-hidden="true" viewBox="0 0 16 16"><path${transform ? ` transform="${transform}"` : ''} d="${path}"></path></svg>`;
}

function flexFlowControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-tabs is-wide inspector-flex-flow';
  const [directionInput, wrapInput] = [['flexDirection', values?.flexDirection || 'row'], ['flexWrap', values?.flexWrap || 'nowrap']].map(([property, value]) => hiddenInspectorInput(property, value));
  const tabs = document.createElement('span');
  tabs.className = 'inspector-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Direction and wrap');
  const tab = (title) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inspector-tab is-icon';
    if (title) button.title = title;
    button.setAttribute('aria-label', title);
    tabs.append(button);
    return button;
  };
  const rowTab = tab('Row');
  const columnTab = tab('Column');
  const flowTab = tab('Wrap and reverse');
  rowTab.innerHTML = flexFlowIcon('row', 'nowrap');
  columnTab.innerHTML = flexFlowIcon('column', 'nowrap');

  const sync = () => {
    const direction = directionInput.value;
    const wrap = wrapInput.value;
    const isRow = direction === 'row' && wrap === 'nowrap';
    const isColumn = direction === 'column' && wrap === 'nowrap';
    rowTab.setAttribute('aria-pressed', String(isRow));
    columnTab.setAttribute('aria-pressed', String(isColumn));
    flowTab.setAttribute('aria-pressed', String(!isRow && !isColumn));
    flowTab.innerHTML = `${isRow || isColumn ? flexFlowIcon('row', 'wrap') : flexFlowIcon(direction, wrap)}${INSPECTOR_MENU_CARET}`;
  };
  const set = (direction, wrap) => {
    [[directionInput, direction], [wrapInput, wrap]].forEach(([input, value]) => {
      if (input.value === value) return;
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    sync();
  };
  inspectorMenu(flowTab, control, () => ({
    hint: FLEX_FLOW_HINT,
    groups: FLEX_FLOW_MENU.map(([label, options]) => ({
      label,
      items: options.map(([direction, wrap, text]) => ({
        icon: flexFlowIcon(direction, wrap),
        text,
        hint: `flex-direction: ${direction}; flex-wrap: ${wrap}`,
        checked: directionInput.value === direction && wrapInput.value === wrap,
        pick: () => set(direction, wrap)
      }))
    }))
  }));

  rowTab.addEventListener('click', () => set('row', 'nowrap'));
  columnTab.addEventListener('click', () => set('column', 'nowrap'));
  sync();
  control.append(tabs, directionInput, wrapInput);
  return control;
}

function hiddenInspectorInput(property, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = property;
  input.dataset.property = property;
  input.value = value;
  input.dataset.previousValue = value;
  return input;
}

const INSPECTOR_MENU_CARET = '<svg class="inspector-menu-caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"></path></svg>';

// A popover of controls under trigger, framed as the menus are: a click on
// trigger opens or closes it, as do a click outside container, Escape and the
// panel scrolling. content is kept between openings.
function inspectorPopover(trigger, container, content) {
  const popover = document.createElement('div');
  popover.className = 'inspector-popover';
  popover.setAttribute('role', 'dialog');
  popover.hidden = true;
  popover.append(content);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const closeOnOutside = (event) => {
    if (!container.contains(event.target)) close();
  };
  const closeOnEscape = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
    trigger.focus();
  };
  const close = () => {
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', closeOnOutside, true);
    document.removeEventListener('keydown', closeOnEscape, true);
    inspectorPanel.removeEventListener('scroll', close);
  };
  // As wide as the panel's content, inside its side paddings: the wide field
  // that holds container. Placed again when its content changes size.
  const place = () => {
    const box = trigger.getBoundingClientRect();
    const panel = (container.closest('.inspector-field') || container).getBoundingClientRect();
    popover.style.inlineSize = `${panel.width}px`;
    const below = box.bottom + 4;
    const top = below + popover.offsetHeight > innerHeight - 8 ? Math.max(8, box.top - 4 - popover.offsetHeight) : below;
    popover.style.top = `${top}px`;
    popover.style.left = `${panel.left}px`;
  };
  new ResizeObserver(() => {
    if (!popover.hidden) place();
  }).observe(popover);
  const open = () => {
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    place();
    document.addEventListener('pointerdown', closeOnOutside, true);
    document.addEventListener('keydown', closeOnEscape, true);
    inspectorPanel.addEventListener('scroll', close);
  };
  trigger.addEventListener('click', () => (popover.hidden ? open() : close()));
  container.append(popover);
}

// A dropdown of options in the comments menu's style, opened by trigger.
// build() runs on every open and returns { hint, groups: [{ label, items:
// [{ icon, text, hint, checked, disabled, cursor, pick, preview }] }], previewEnd,
// compact }; compact gives items one icon column and the check at the row's
// end, and keeps the menu as narrow as its items. The footer
// shows the hovered item's hint, or the default one. preview runs while an
// item is hovered or focused, previewEnd when the pointer leaves or it closes. The menu is fixed to the viewport so the
// panel's scroll box can't clip it, and opens upward when there's no room.
function inspectorMenu(trigger, container, build) {
  const menu = document.createElement('div');
  menu.className = 'comment-menu inspector-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  const hint = document.createElement('p');
  hint.className = 'inspector-menu-hint';
  let defaultHint = '';
  let previewEnd;
  const render = () => {
    const { hint: text, groups, previewEnd: end, compact } = build();
    defaultHint = text || '';
    previewEnd = end;
    menu.replaceChildren();
    menu.classList.toggle('is-compact', Boolean(compact));
    // A menu of plain names (no icons, nothing checked) leaves out the space
    // for them.
    const plain = groups.every(({ items }) => items.every((option) => !option.icon && !option.checked));
    groups.forEach(({ label, items }, index) => {
      if (label) {
        const heading = document.createElement('p');
        heading.className = 'inspector-menu-group';
        heading.textContent = label;
        menu.append(heading);
      } else if (index) {
        const separator = document.createElement('hr');
        separator.className = 'inspector-menu-separator';
        menu.append(separator);
      }
      items.forEach((option) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(Boolean(option.checked)));
        item.disabled = Boolean(option.disabled);
        if (option.cursor) item.style.cursor = option.cursor;
        if (compact) item.innerHTML = option.icon || inspectorIcon('');
        else if (!plain) item.innerHTML = `${inspectorIcon(INSPECTOR_ICON_PATHS.check)}${option.icon || ''}`;
        item.append(option.text);
        if (compact && option.checked) item.insertAdjacentHTML('beforeend', inspectorIcon(INSPECTOR_ICON_PATHS.check).replace('class="', 'class="inspector-menu-check '));
        ['pointerenter', 'focus'].forEach((type) => item.addEventListener(type, () => {
          hint.textContent = option.hint || defaultHint;
          option.preview?.();
        }));
        item.addEventListener('click', () => {
          option.pick();
          close();
          trigger.focus();
        });
        menu.append(item);
      });
    });
    hint.textContent = defaultHint;
    hint.hidden = !defaultHint;
    menu.append(hint);
  };
  const closeOnOutside = (event) => {
    if (!container.contains(event.target)) close();
  };
  const closeOnEscape = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
    trigger.focus();
  };
  const close = () => {
    if (!menu.hidden) previewEnd?.();
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', closeOnOutside, true);
    document.removeEventListener('keydown', closeOnEscape, true);
    inspectorPanel.removeEventListener('scroll', close);
  };
  const open = () => {
    render();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const box = trigger.getBoundingClientRect();
    const below = box.bottom + 4;
    const top = below + menu.offsetHeight > innerHeight - 8 ? Math.max(8, box.top - 4 - menu.offsetHeight) : below;
    menu.style.top = `${top}px`;
    menu.style.left = `${Math.max(8, Math.min(box.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
    document.addEventListener('pointerdown', closeOnOutside, true);
    document.addEventListener('keydown', closeOnEscape, true);
    inspectorPanel.addEventListener('scroll', close);
  };
  menu.addEventListener('pointerleave', () => {
    hint.textContent = defaultHint;
    previewEnd?.();
  });
  trigger.addEventListener('click', () => (menu.hidden ? open() : close()));
  container.append(menu);
}

// Flex alignment as a 3 × 3 matrix plus an X and a Y menu. The matrix sets
// both axes in one click; the menus also reach space-between/around (main
// axis) and stretch/baseline (cross axis). X and Y are screen axes: which of
// justify-content and align-items each one drives follows flex-direction, and
// flex-start/flex-end are flipped for -reverse directions and wrap-reverse,
// so "Left" always means left.
const ALIGN_EDGE_LABELS = { x: { start: 'Left', center: 'Center', end: 'Right' }, y: { start: 'Top', center: 'Center', end: 'Bottom' } };
const ALIGN_OTHER_LABELS = { 'space-between': 'Space between', 'space-around': 'Space around', 'space-evenly': 'Space evenly', stretch: 'Stretch', baseline: 'Baseline' };

// Visual position of a justify-content / align-items value: start, center,
// end, or the value itself (space-between, stretch, …).
function alignVisual(value, role, flips) {
  let keyword = String(value || '').trim();
  if (keyword === 'normal') keyword = role === 'main' ? 'flex-start' : 'stretch';
  if (keyword === 'flex-start') return flips ? 'end' : 'start';
  if (keyword === 'flex-end') return flips ? 'start' : 'end';
  if (['start', 'self-start', 'left'].includes(keyword)) return 'start';
  if (['end', 'self-end', 'right'].includes(keyword)) return 'end';
  if (keyword.endsWith('baseline')) return 'baseline';
  return keyword;
}

function alignCssValue(visual, flips) {
  if (visual === 'start') return flips ? 'flex-end' : 'flex-start';
  if (visual === 'end') return flips ? 'flex-start' : 'flex-end';
  return visual;
}

// The matrix and the X / Y menus, shared by flex and grid. config gives:
//   inputs: the hidden inputs the control owns,
//   state(): whatever the mapping needs from the rest of the panel,
//   inputFor(axis, state): the input that axis drives right now,
//   visual(axis, state): start | center | end | stretch | baseline | space-…,
//   options(axis, state): [positions, extras] for the axis menu,
//   set(axis, visual, state), hint(axis, visual, state),
//   children(x, y, state, className): SVG for the matrix drawing.
function alignMatrixControl(config) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide inspector-align';
  const state = () => config.state(control);
  const positions = ['start', 'center', 'end'];

  const matrix = document.createElement('div');
  matrix.className = 'inspector-align-matrix';
  const drawing = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  drawing.setAttribute('viewBox', '0 0 60 60');
  drawing.setAttribute('aria-hidden', 'true');
  const cells = document.createElement('div');
  cells.className = 'inspector-align-cells';
  cells.setAttribute('role', 'group');
  cells.setAttribute('aria-label', 'Alignment');
  const cellButtons = [];
  positions.forEach((y) => positions.forEach((x) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.title = `${ALIGN_EDGE_LABELS.y[y]} ${ALIGN_EDGE_LABELS.x[x].toLowerCase()}`.replace('Center center', 'Center');
    cell.setAttribute('aria-label', cell.title);
    cell.addEventListener('click', () => {
      const current = state();
      config.set('x', x, current);
      config.set('y', y, current);
      sync();
    });
    cell.addEventListener('pointerenter', () => draw({ x, y }));
    cell.addEventListener('pointerleave', () => draw());
    cellButtons.push({ cell, x, y });
    cells.append(cell);
  }));
  matrix.append(drawing, cells);

  const draw = (preview) => {
    const current = state();
    const centres = { start: 10, center: 30, end: 50 };
    const dots = positions.flatMap((y) => positions.map((x) => `<circle cx="${centres[x]}" cy="${centres[y]}" r="1.3" class="inspector-align-dot"></circle>`)).join('');
    const now = config.children(config.visual('x', current), config.visual('y', current), current, 'inspector-align-child');
    const ghost = preview ? config.children(preview.x, preview.y, current, 'inspector-align-child is-preview') : '';
    drawing.innerHTML = `${dots}${now}${ghost}`;
  };

  const selects = document.createElement('div');
  selects.className = 'inspector-align-selects';
  const axisSelect = (axis) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inspector-input-shell inspector-menu-select';
    button.title = `${axis.toUpperCase()} alignment`;
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = axis.toUpperCase();
    const value = document.createElement('span');
    value.className = 'inspector-menu-value';
    button.append(prefix, value);
    button.insertAdjacentHTML('beforeend', INSPECTOR_MENU_CARET);
    inspectorMenu(button, control, () => {
      const current = state();
      const visual = config.visual(axis, current);
      return {
        hint: config.hint(axis, visual, current),
        groups: config.options(axis, current).map((options) => ({
          items: options.map((option) => ({
            icon: alignOptionIcon(axis, option),
            text: ALIGN_EDGE_LABELS[axis][option] || ALIGN_OTHER_LABELS[option],
            hint: config.hint(axis, option, current),
            checked: visual === option,
            pick: () => {
              config.set(axis, option, current);
              sync();
            }
          }))
        }))
      };
    });
    selects.append(button);
    return { button, value };
  };
  const axes = { x: axisSelect('x'), y: axisSelect('y') };

  const sync = () => {
    const current = state();
    const visual = {};
    Object.entries(axes).forEach(([axis, { button, value }]) => {
      const input = config.inputFor(axis, current);
      visual[axis] = config.visual(axis, current);
      value.textContent = ALIGN_EDGE_LABELS[axis][visual[axis]] || ALIGN_OTHER_LABELS[visual[axis]] || input.value;
      // The change dot follows the property this menu drives right now.
      button.dataset.properties = input.dataset.property;
    });
    cellButtons.forEach(({ cell, x, y }) => cell.setAttribute('aria-pressed', String(visual.x === x && visual.y === y)));
    draw();
  };
  // Something it depends on changed elsewhere in the panel: re-read it and
  // move the change dots to the right menu.
  control.classList.add('inspector-syncs');
  control.refreshFromPanel = () => {
    sync();
    control.querySelectorAll('.inspector-change-dot').forEach((dot) => {
      dot.parentElement.classList.remove('has-change-dot');
      dot.remove();
    });
    const changed = changedInspectorProperties.get(inspectorChangeKey);
    config.inputs.forEach(({ dataset }) => { if (changed?.has(dataset.property)) markInspectorFieldChanged(dataset.property); });
  };
  sync();
  control.append(matrix, selects, ...config.inputs);
  return control;
}

// The current value of another control in the panel, or the opening value
// while the control isn't in the panel yet.
function panelValue(control, property, fallback) {
  return (control.isConnected ? inspectorPanelFields.querySelector(`[data-property="${property}"]`)?.value : null) || fallback;
}

function setInputValue(input, value) {
  if (input.value === value) return;
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Flex: X and Y are screen axes; which of justify-content and align-items
// each one drives follows flex-direction, and flex-start/flex-end are flipped
// for -reverse directions and wrap-reverse, so "Left" always means left.
function flexAlignControl(values) {
  const inputs = {
    main: hiddenInspectorInput('justifyContent', values?.justifyContent || 'normal'),
    cross: hiddenInspectorInput('alignItems', values?.alignItems || 'normal')
  };
  const roleOf = (axis, state) => ((axis === 'x') !== state.isColumn ? 'main' : 'cross');
  return alignMatrixControl({
    inputs: Object.values(inputs),
    state: (control) => {
      const direction = panelValue(control, 'flexDirection', values?.flexDirection || 'row');
      return {
        isColumn: direction.startsWith('column'),
        flips: { main: direction.endsWith('-reverse'), cross: panelValue(control, 'flexWrap', values?.flexWrap || 'nowrap') === 'wrap-reverse' }
      };
    },
    inputFor: (axis, state) => inputs[roleOf(axis, state)],
    visual: (axis, state) => {
      const role = roleOf(axis, state);
      return alignVisual(inputs[role].value, role, state.flips[role]);
    },
    options: (axis, state) => [['start', 'center', 'end'], roleOf(axis, state) === 'main' ? ['space-between', 'space-around'] : ['stretch', 'baseline']],
    set: (axis, visual, state) => {
      const role = roleOf(axis, state);
      setInputValue(inputs[role], alignCssValue(visual, state.flips[role]));
    },
    hint: (axis, visual, state) => {
      const line = state.isColumn ? 'column' : 'row';
      if (ALIGN_EDGE_LABELS[axis][visual]) return `Align children to the ${ALIGN_EDGE_LABELS[axis][visual].toLowerCase()} of the ${line}.`;
      if (visual === 'space-between') return `Spread children along the ${line}, the first and last at its ends.`;
      if (visual === 'space-around') return `Spread children along the ${line} with equal space around each.`;
      if (visual === 'stretch') return `Stretch children to fill the ${line}'s ${state.isColumn ? 'width' : 'height'}.`;
      if (visual === 'baseline') return 'Line children up along their text baseline.';
      return '';
    },
    // Three children of different lengths, placed the way the values put them.
    children: (x, y, state, className) => {
      const [main, cross] = state.isColumn ? [y, x] : [x, y];
      const along = { start: [4.5, 10, 15.5], center: [24.5, 30, 35.5], end: [44.5, 50, 55.5], 'space-between': [4.5, 30, 55.5], 'space-around': [12, 30, 48], 'space-evenly': [15, 30, 45] }[main] || [24.5, 30, 35.5];
      return [12, 17, 8].map((length, index) => {
        const [from, to] = {
          start: [3, 3 + length],
          center: [30 - length / 2, 30 + length / 2],
          end: [57 - length, 57],
          stretch: [3, 57],
          baseline: [19 - length, 19]
        }[cross] || [30 - length / 2, 30 + length / 2];
        const [left, top, width, height] = state.isColumn
          ? [from, along[index] - 1.5, to - from, 3]
          : [along[index] - 1.5, from, 3, to - from];
        return `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="1" class="${className}"></rect>`;
      }).join('');
    }
  });
}

// Grid: X is justify-items and Y is align-items, the place of each child in
// its cell; start and end are the writing-mode edges, so no flipping.
function gridAlignControl(values) {
  const inputs = {
    x: hiddenInspectorInput('justifyItems', values?.justifyItems || 'normal'),
    y: hiddenInspectorInput('alignItems', values?.alignItems || 'normal')
  };
  const visualOf = (value) => {
    const keyword = String(value || '').trim().replace(/^legacy\s*/, '') || 'normal';
    if (['normal', 'legacy'].includes(keyword)) return 'stretch';
    return alignVisual(keyword, 'cross', false);
  };
  return alignMatrixControl({
    inputs: Object.values(inputs),
    state: () => ({}),
    inputFor: (axis) => inputs[axis],
    visual: (axis) => visualOf(inputs[axis].value),
    options: () => [['start', 'center', 'end'], ['stretch', 'baseline']],
    set: (axis, visual) => setInputValue(inputs[axis], visual),
    hint: (axis, visual) => {
      if (ALIGN_EDGE_LABELS[axis][visual]) return `Align children to the ${ALIGN_EDGE_LABELS[axis][visual].toLowerCase()} of their cell.`;
      if (visual === 'stretch') return `Stretch children to fill their cell's ${axis === 'x' ? 'width' : 'height'}.`;
      if (visual === 'baseline') return 'Line children up along their text baseline.';
      return '';
    },
    // One child in its cell: a short bar, or the full side when stretched.
    children: (x, y, state, className) => {
      const span = (visual, size) => ({ start: [4, 4 + size], center: [30 - size / 2, 30 + size / 2], end: [56 - size, 56], stretch: [4, 56], baseline: [4, 4 + size] })[visual] || [4, 56];
      const [left, right] = span(x, 18);
      const [top, bottom] = span(y, 10);
      return `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" rx="1.5" class="${className} is-cell"></rect>`;
    }
  });
}

// Track counts for columns and rows. A count change keeps the template's own
// tracks: repeat(n, …) changes n, a list adds copies of its last track or
// drops tracks from the end, an empty template becomes repeat(n, 1fr). The
// wrench shows the templates and the implicit track sizes as written.
let gridTemplatesOpen = false;
function gridTracksControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide inspector-grid-tracks';
  const template = (property, prefixText) => {
    const field = childInput(property, prefixText, String(values?.[property] || 'none'));
    field.input.inputMode = 'text';
    field.shell.classList.add('is-full');
    return field;
  };
  const templates = {
    columns: template('gridTemplateColumns', 'Columns'),
    rows: template('gridTemplateRows', 'Rows'),
    autoColumns: template('gridAutoColumns', 'Auto cols'),
    autoRows: template('gridAutoRows', 'Auto rows')
  };
  const tracks = (text) => {
    const value = String(text || '').trim();
    if (!value || value === 'none') return { list: [] };
    const repeat = /^repeat\(\s*(\d+)\s*,\s*(.+)\)$/.exec(value);
    if (repeat) return { repeat: repeat[2].trim(), count: Number(repeat[1]) };
    const list = [];
    let depth = 0;
    let token = '';
    [...`${value} `].forEach((char) => {
      if ('(['.includes(char)) depth += 1;
      if (')]'.includes(char)) depth -= 1;
      if (char === ' ' && depth === 0) {
        if (token && !token.startsWith('[')) list.push(token);
        token = '';
      } else {
        token += char;
      }
    });
    // repeat(auto-fill, …) and friends have no fixed count.
    return list.some((track) => /^repeat\(\s*auto/.test(track)) ? { auto: true } : { list };
  };
  const countOf = (text) => {
    const parsed = tracks(text);
    if (parsed.auto) return '';
    return String(parsed.count ?? parsed.list.length);
  };
  const withCount = (text, count) => {
    const parsed = tracks(text);
    if (parsed.repeat) return `repeat(${count}, ${parsed.repeat})`;
    if (!parsed.list?.length) return `repeat(${count}, 1fr)`;
    const list = parsed.list.slice(0, count);
    while (list.length < count) list.push(list.at(-1));
    return list.join(' ');
  };
  const counter = (axis, prefixText) => {
    const { shell, input } = childInput(null, prefixText, countOf(templates[axis].dataInput.value));
    input.type = 'number';
    input.min = '1';
    input.placeholder = 'auto';
    input.addEventListener('change', () => {
      const count = Math.max(1, Math.round(Number(input.value)) || 1);
      input.value = String(count);
      setInputValue(templates[axis].dataInput, withCount(templates[axis].dataInput.value, count));
    });
    return { shell, input };
  };
  const counts = { columns: counter('columns', 'Columns'), rows: counter('rows', 'Rows') };
  const wrench = document.createElement('button');
  wrench.type = 'button';
  wrench.className = 'inspector-spacing-toggle';
  wrench.title = 'Edit grid templates';
  wrench.setAttribute('aria-label', wrench.title);
  wrench.innerHTML = inspectorIcon('M10.5 2.5a3 3 0 0 0-2.8 4.1L2.5 11.8l1.7 1.7 5.2-5.2a3 3 0 0 0 4.1-2.8l-1.8 1.8-1.8-.4-.4-1.8z');
  const raw = document.createElement('div');
  raw.className = 'inspector-child-inputs inspector-grid-templates';
  raw.append(...Object.values(templates).map(({ shell }) => shell));
  const setOpen = (open) => {
    raw.hidden = !open;
    wrench.setAttribute('aria-pressed', String(open));
  };
  wrench.addEventListener('click', () => {
    gridTemplatesOpen = raw.hidden;
    setOpen(gridTemplatesOpen);
  });
  // A template typed by hand updates its count.
  raw.addEventListener('change', () => {
    counts.columns.input.value = countOf(templates.columns.dataInput.value);
    counts.rows.input.value = countOf(templates.rows.dataInput.value);
  });
  setOpen(gridTemplatesOpen);
  control.append(counts.columns.shell, counts.rows.shell, wrench, raw);
  return control;
}

// grid-auto-flow: rows or columns as tabs, dense as a toggle beside them.
function gridFlowControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide is-tabs inspector-grid-flow';
  const input = hiddenInspectorInput('gridAutoFlow', String(values?.gridAutoFlow || 'row'));
  const parse = () => {
    const words = input.value.split(/\s+/);
    return { direction: words.includes('column') ? 'column' : 'row', dense: words.includes('dense') };
  };
  const write = (direction, dense) => setInputValue(input, dense ? `${direction} dense` : direction);
  const { tabs, press } = childTabs('Direction', [
    { key: 'row', icon: flexFlowIcon('row', 'wrap'), title: 'Rows: fill each row, then the next' },
    { key: 'column', icon: flexFlowIcon('column', 'wrap'), title: 'Columns: fill each column, then the next' }
  ], (key) => {
    write(key, parse().dense);
    sync();
  });
  const dense = document.createElement('button');
  dense.type = 'button';
  dense.className = 'inspector-spacing-toggle';
  dense.title = 'Dense: fill earlier gaps with later children';
  dense.setAttribute('aria-label', dense.title);
  dense.innerHTML = inspectorIcon('M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM11.5 9v5M9.5 12l2 2 2-2');
  dense.addEventListener('click', () => {
    const { direction, dense: on } = parse();
    write(direction, !on);
    sync();
  });
  const sync = () => {
    const { direction, dense: on } = parse();
    press(direction);
    dense.setAttribute('aria-pressed', String(on));
  };
  control.classList.add('inspector-syncs');
  control.refreshFromPanel = sync;
  sync();
  control.append(tabs, dense, input);
  return control;
}

// Column and row gaps. Where only one applies (flex that doesn't wrap) it is
// a single "Gap". Where both do, one field sets both until the split toggle
// shows them apart; it starts split when the two differ.
function gapControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide inspector-gap';
  const gap = (property) => {
    const field = childInput(property, '', String(values?.[property] ?? '0'), SIZE_UNITS);
    highlightZoneWhileActive(field.shell, property);
    return field;
  };
  const column = gap('columnGap');
  const row = gap('rowGap');
  let linked = String(column.dataInput.value) === String(row.dataInput.value);
  // The same split toggle as margin, padding and radius.
  const split = document.createElement('button');
  split.type = 'button';
  split.className = 'inspector-spacing-toggle';
  split.title = 'Gap for each axis';
  split.setAttribute('aria-label', split.title);
  split.innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.spacing.sides);
  split.addEventListener('click', () => {
    linked = !linked;
    if (linked) setInputValue(row.dataInput, column.dataInput.value);
    row.dataInput.showValue?.(row.dataInput.value);
    sync();
  });
  // While linked, the one field sets both.
  column.dataInput.addEventListener('change', () => {
    if (!linked || row.shell.dataset.irrelevant === 'true') return;
    setInputValue(row.dataInput, column.dataInput.value);
    row.dataInput.showValue?.(row.dataInput.value);
  });
  const prefixOf = (field) => field.shell.querySelector('.inspector-input-prefix');
  const sync = () => {
    const display = panelValue(control, 'display', values?.display);
    const singleLine = display === 'flex' && panelValue(control, 'flexWrap', values?.flexWrap || 'nowrap') === 'nowrap';
    const only = singleLine ? (panelValue(control, 'flexDirection', values?.flexDirection || 'row').startsWith('column') ? row : column) : null;
    // A gap that doesn't apply is marked so its change isn't handed over.
    column.shell.dataset.irrelevant = String(Boolean(only) && only !== column);
    row.shell.dataset.irrelevant = String(Boolean(only) && only !== row);
    const one = only || (linked ? column : null);
    column.shell.hidden = Boolean(one) && one !== column;
    row.shell.hidden = Boolean(one) && one !== row;
    control.classList.toggle('is-single', Boolean(one));
    prefixOf(column).textContent = one ? 'Gap' : 'Gap col';
    prefixOf(row).textContent = one ? 'Gap' : 'Gap row';
    column.shell.dataset.properties = one === column && !only ? 'columnGap rowGap' : 'columnGap';
    row.shell.dataset.properties = 'rowGap';
    split.hidden = Boolean(only);
    split.setAttribute('aria-pressed', String(!linked));
  };
  control.classList.add('inspector-syncs');
  control.refreshFromPanel = () => {
    sync();
    control.querySelectorAll('.inspector-change-dot').forEach((dot) => {
      dot.parentElement.classList.remove('has-change-dot');
      dot.remove();
    });
    const changed = changedInspectorProperties.get(inspectorChangeKey);
    ['columnGap', 'rowGap'].forEach((property) => { if (changed?.has(property)) markInspectorFieldChanged(property); });
  };
  sync();
  control.append(column.shell, row.shell, split);
  return control;
}

// Grid content alignment, folded away: justify-content places the columns
// and align-content the rows when the grid is smaller than the element.
let gridMoreAlignmentOpen = false;
let gridContentNoteDismissed = false;
function gridMoreAlignControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide inspector-grid-more';
  const options = ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'];
  const titles = { start: 'Start', center: 'Center', end: 'End', 'space-between': 'Space between', 'space-around': 'Space around', 'space-evenly': 'Space evenly' };
  const contentRow = (property, label, axis) => {
    const row = childRow(label);
    const input = hiddenInspectorInput(property, String(values?.[property] || 'normal'));
    const keyOf = (value) => ({ 'flex-start': 'start', 'flex-end': 'end', left: 'start', right: 'end' })[value] || value;
    const { tabs, press } = childTabs(label, options.map((key) => ({ key, icon: alignOptionIcon(axis, key), title: titles[key] })), (key) => {
      setInputValue(input, key);
      press(key);
    });
    const sync = () => press(keyOf(input.value));
    row.classList.add('inspector-syncs');
    row.refreshFromPanel = sync;
    sync();
    row.append(tabs, input);
    return row;
  };
  const rows = [contentRow('justifyContent', 'Columns', 'x'), contentRow('alignContent', 'Rows', 'y')];
  const note = document.createElement('p');
  note.className = 'inspector-note inspector-dismissible-note';
  note.textContent = 'Aligning columns and rows only shows when the element is larger than all the columns or rows it contains.';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'inspector-note-close';
  close.title = 'Dismiss';
  close.setAttribute('aria-label', close.title);
  close.textContent = '×';
  close.addEventListener('click', () => {
    gridContentNoteDismissed = true;
    note.hidden = true;
  });
  note.append(close);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inspector-group-toggle inspector-more-toggle';
  if (['justifyContent', 'alignContent'].some((property) => !['normal', '', undefined].includes(values?.[property]))) gridMoreAlignmentOpen = true;
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = window.phosphorIcon(open ? 'caret-down' : 'caret-right');
    toggle.append('More alignment options');
    rows.forEach((row) => { row.hidden = !open; });
    note.hidden = !open || gridContentNoteDismissed;
  };
  toggle.addEventListener('click', () => {
    gridMoreAlignmentOpen = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(gridMoreAlignmentOpen);
  });
  setOpen(gridMoreAlignmentOpen);
  control.append(toggle, ...rows, note);
  return control;
}

// Menu icons for alignment options, drawn for the X axis and turned for Y.
function alignOptionIcon(axis, visual) {
  const path = {
    start: 'M2.5 2v12M5 4h5v3H5zM5 9h8v3H5z',
    center: 'M8 2v12M5.5 4h5v3h-5zM4 9h8v3H4z',
    end: 'M13.5 2v12M6 4h5v3H6zM3 9h8v3H3z',
    'space-between': 'M2.5 2v12M13.5 2v12M4.5 5h2v6h-2zM9.5 5h2v6h-2z',
    'space-around': 'M2.5 2v12M13.5 2v12M5.5 5h1.5v6H5.5zM9 5h1.5v6H9z',
    'space-evenly': 'M2.5 2v12M13.5 2v12M5 5h1.5v6H5zM9.5 5h1.5v6H9.5z',
    stretch: 'M2.5 2v12M13.5 2v12M4.5 4h7v3h-7zM4.5 9h7v3h-7z',
    baseline: 'M11.5 2v12M4 4h7.5v3H4zM7 9h4.5v3H7z'
  }[visual];
  const transform = axis === 'y' ? ' transform="matrix(0 1 1 0 0 0)"' : '';
  return `<svg class="inspector-line-icon" aria-hidden="true" viewBox="0 0 16 16"><path${transform} d="${path}"></path></svg>`;
}

// How the element sits in its flex or grid parent, shown when the parent is
// one: a Flex Child or Grid Child section after Layout.
let childAlignmentOpen = false;
const CHILD_ICONS = {
  auto: 'M5 5l6 6M11 5l-6 6',
  shrink: 'M8 3v10M2 8h4.5M4.5 6l2 2-2 2M14 8H9.5M11.5 6l-2 2 2 2',
  grow: 'M2.5 3v10M13.5 3v10M4.5 8h7M6.5 6l-2 2 2 2M9.5 6l2 2-2 2',
  none: 'M2.5 3v10M13.5 3v10M6 6l4 4M10 6l-4 4',
  parent: 'M3 9V3h6M3 3l6 6M6 13h7V6'
};

function childLayoutFields(kind, values, context, group) {
  const fields = [];
  const selectParent = () => {
    if (selectedLayerPath === undefined) return;
    selectLayer(selectedLayerPath.includes('.') ? selectedLayerPath.slice(0, selectedLayerPath.lastIndexOf('.')) : '');
  };
  if (kind === 'flex') {
    const parentButton = document.createElement('button');
    parentButton.type = 'button';
    parentButton.className = 'inspector-group-action';
    parentButton.title = 'Select parent';
    parentButton.setAttribute('aria-label', parentButton.title);
    parentButton.innerHTML = inspectorIcon(CHILD_ICONS.parent);
    parentButton.addEventListener('click', selectParent);
    group.querySelector('.inspector-group-label').append(parentButton);
    fields.push(flexSizingField(values));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'inspector-group-toggle inspector-more-toggle inspector-child-toggle';
    const order = Number(values?.order) || 0;
    if ((values?.alignSelf && values.alignSelf !== 'auto') || order) childAlignmentOpen = true;
    const rows = [childAlignField('alignSelf', 'Align', context?.parentFlexDirection?.startsWith('column') ? 'x' : 'y', values, ['flex-start', 'center', 'flex-end', 'stretch', 'baseline']), childOrderField(values)];
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.innerHTML = window.phosphorIcon(open ? 'caret-down' : 'caret-right');
      toggle.append('Alignment and order');
      rows.forEach((row) => { row.hidden = !open; });
    };
    toggle.addEventListener('click', () => {
      childAlignmentOpen = toggle.getAttribute('aria-expanded') !== 'true';
      setOpen(childAlignmentOpen);
    });
    setOpen(childAlignmentOpen);
    fields.push(toggle, ...rows);
    return fields;
  }
  const parentButton = document.createElement('button');
  parentButton.type = 'button';
  parentButton.className = 'inspector-wide-button';
  parentButton.innerHTML = inspectorIcon(CHILD_ICONS.parent);
  parentButton.append('Edit parent grid');
  parentButton.addEventListener('click', selectParent);
  fields.push(
    parentButton,
    gridPositionField(values),
    childAlignField('alignSelf', 'Align', 'y', values, ['start', 'center', 'end', 'stretch', 'baseline']),
    childAlignField('justifySelf', 'Justify', 'x', values, ['start', 'center', 'end', 'stretch']),
    childOrderField(values)
  );
  return fields;
}

// A row with its caption on the left, as in the child sections.
function childRow(label) {
  const row = document.createElement('div');
  row.className = 'inspector-field is-wide inspector-child-row';
  const caption = document.createElement('span');
  caption.className = 'inspector-child-caption';
  caption.textContent = label;
  row.append(caption);
  return row;
}

// Tabs that each stand for a value; current() tells which one is pressed.
function childTabs(label, options, onPick) {
  const tabs = document.createElement('span');
  tabs.className = 'inspector-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', label);
  const buttons = options.map((option) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `inspector-tab${option.icon ? ' is-icon' : ''}`;
    tab.title = option.title;
    tab.setAttribute('aria-label', option.title);
    if (option.icon) tab.innerHTML = option.icon;
    else tab.textContent = option.text;
    tab.addEventListener('click', () => onPick(option.key));
    tabs.append(tab);
    return { tab, key: option.key };
  });
  const press = (key) => buttons.forEach(({ tab, key: own }) => tab.setAttribute('aria-pressed', String(own === key)));
  return { tabs, press };
}

function setChildValue(input, value) {
  if (input.value === value) return;
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.showValue?.(value);
}

// A small labelled input inside a child row; returns its data-property input.
function childInput(property, prefixText, value, units) {
  const shell = document.createElement('label');
  shell.className = 'inspector-input-shell';
  const prefix = document.createElement('span');
  prefix.className = 'inspector-input-prefix';
  prefix.textContent = prefixText;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.setAttribute('aria-label', prefixText);
  input.value = value;
  if (property) {
    input.name = property;
    input.dataset.property = property;
    input.dataset.previousValue = value;
  }
  shell.append(prefix, input);
  const dataInput = units ? lengthUnitControl(shell, input, units) : input;
  if (units) shell.append(dataInput);
  return { shell, input, dataInput };
}

// Shrink if needed (0 1 auto), grow if possible (1 1 0%), neither (0 0 auto),
// or any other grow / shrink / basis behind "···".
function flexSizingField(values) {
  const row = childRow('Sizing');
  const grow = childInput('flexGrow', 'Grow', String(values?.flexGrow ?? '0'));
  const shrink = childInput('flexShrink', 'Shrink', String(values?.flexShrink ?? '1'));
  const basis = childInput('flexBasis', 'Basis', String(values?.flexBasis || 'auto'), SIZE_UNITS);
  const presets = { shrink: ['0', '1', 'auto'], grow: ['1', '1', '0%'], none: ['0', '0', 'auto'] };
  const inputs = [grow.dataInput, shrink.dataInput, basis.dataInput];
  const custom = document.createElement('div');
  custom.className = 'inspector-child-inputs';
  basis.shell.classList.add('is-full');
  custom.append(grow.shell, shrink.shell, basis.shell);
  let customOpen = false;
  const presetNow = () => Object.keys(presets).find((key) => presets[key].every((value, index) => {
    const current = inputs[index].value.trim();
    return current === value || (value === '0%' && ['0', '0px'].includes(current));
  }));
  const { tabs, press } = childTabs('Sizing', [
    { key: 'shrink', icon: inspectorIcon(CHILD_ICONS.shrink), title: 'Shrink if needed' },
    { key: 'grow', icon: inspectorIcon(CHILD_ICONS.grow), title: 'Grow if possible' },
    { key: 'none', icon: inspectorIcon(CHILD_ICONS.none), title: "Don't shrink or grow" },
    { key: 'custom', text: '···', title: 'Customize' }
  ], (key) => {
    customOpen = key === 'custom';
    if (!customOpen) presets[key].forEach((value, index) => setChildValue(inputs[index], value));
    sync();
  });
  const sync = () => {
    const preset = presetNow();
    const key = customOpen || !preset ? 'custom' : preset;
    press(key);
    custom.hidden = key !== 'custom';
  };
  row.classList.add('inspector-syncs');
  row.refreshFromPanel = sync;
  row.addEventListener('change', () => requestAnimationFrame(sync));
  sync();
  row.append(tabs, custom);
  return row;
}

// align-self or justify-self: auto (×) and the edge, centre, stretch and
// baseline icons turned to the axis it works on.
function childAlignField(property, label, axis, values, options) {
  const row = childRow(label);
  const input = hiddenInspectorInput(property, String(values?.[property] || 'auto'));
  const visualOf = (value) => ({ 'flex-start': 'start', 'self-start': 'start', 'flex-end': 'end', 'self-end': 'end', normal: 'auto' })[value] || (String(value).endsWith('baseline') ? 'baseline' : value);
  const titles = { start: axis === 'x' ? 'Left' : 'Top', center: 'Center', end: axis === 'x' ? 'Right' : 'Bottom', stretch: 'Stretch', baseline: 'Baseline' };
  const { tabs, press } = childTabs(label, [
    { key: 'auto', icon: inspectorIcon(CHILD_ICONS.auto), title: 'Auto' },
    ...options.map((value) => ({ key: value, icon: alignOptionIcon(axis, visualOf(value)), title: titles[visualOf(value)] }))
  ], (key) => {
    setChildValue(input, key);
    press(key);
  });
  const sync = () => {
    const current = input.value;
    press(options.find((value) => visualOf(value) === visualOf(current)) || (visualOf(current) === 'auto' ? 'auto' : current));
  };
  row.classList.add('inspector-syncs');
  row.refreshFromPanel = sync;
  sync();
  row.append(tabs, input);
  return row;
}

// align-content as icon tabs, drawn on the axis it spreads lines along:
// across flex rows (vertical; horizontal for columns) or down the grid.
function alignContentField(values) {
  const field = document.createElement('div');
  field.className = 'inspector-field is-tabs is-wide';
  const input = hiddenInspectorInput('alignContent', String(values?.alignContent || 'normal'));
  const titles = { start: 'Start', center: 'Center', end: 'End', 'space-between': 'Space between', 'space-around': 'Space around', stretch: 'Stretch' };
  const keyOf = (value) => ({ 'flex-start': 'start', 'flex-end': 'end' })[value] || value;
  const axis = () => {
    const current = (property, fallback) => (field.isConnected ? inspectorPanelFields.querySelector(`[data-property="${property}"]`)?.value : null) || fallback;
    return current('display', values?.display) === 'flex' && current('flexDirection', values?.flexDirection || 'row').startsWith('column') ? 'x' : 'y';
  };
  let built;
  const build = () => {
    const drawnAxis = axis();
    const { tabs, press } = childTabs('Align content', [
      { key: 'normal', icon: inspectorIcon(CHILD_ICONS.auto), title: 'Normal' },
      ...Object.keys(titles).map((key) => ({ key, icon: alignOptionIcon(drawnAxis, key), title: titles[key] }))
    ], (key) => {
      setChildValue(input, key);
      press(key);
    });
    if (built) built.tabs.replaceWith(tabs);
    else field.prepend(tabs);
    built = { tabs, press, axis: drawnAxis };
    press(keyOf(input.value));
  };
  // Direction changed: turn the icons, and put back the change dot the old
  // tabs carried.
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => {
    if (axis() === built.axis) {
      built.press(keyOf(input.value));
      return;
    }
    build();
    if (changedInspectorProperties.get(inspectorChangeKey)?.has('alignContent')) markInspectorFieldChanged('alignContent');
  };
  build();
  field.append(input);
  return field;
}

// order: × is 0, First and Last put the element before or after siblings
// left at 0, ··· takes any number.
function childOrderField(values) {
  const row = childRow('Order');
  const order = childInput('order', 'Order', String(values?.order ?? '0'));
  const custom = document.createElement('div');
  custom.className = 'inspector-child-inputs';
  custom.append(order.shell);
  const presets = { auto: '0', first: '-1', last: '1' };
  let customOpen = false;
  const { tabs, press } = childTabs('Order', [
    { key: 'auto', icon: inspectorIcon(CHILD_ICONS.auto), title: 'Auto' },
    { key: 'first', text: 'First', title: 'First' },
    { key: 'last', text: 'Last', title: 'Last' },
    { key: 'custom', text: '···', title: 'Custom order' }
  ], (key) => {
    customOpen = key === 'custom';
    if (!customOpen) setChildValue(order.dataInput, presets[key]);
    sync();
  });
  const sync = () => {
    const preset = Object.keys(presets).find((key) => presets[key] === order.dataInput.value.trim());
    const key = customOpen || !preset ? 'custom' : preset;
    press(key);
    custom.hidden = key !== 'custom';
  };
  row.classList.add('inspector-syncs');
  row.refreshFromPanel = sync;
  row.addEventListener('change', () => requestAnimationFrame(sync));
  sync();
  row.append(tabs, custom);
  return row;
}

// Where a grid child goes: Auto (span counts), Area (a named grid area) or
// Manual (start / end lines). Area sets grid-area and drops the column and
// row overrides; the other two do the reverse.
function gridPositionField(values) {
  const row = childRow('Position');
  const [columnInput, rowInput, areaInput] = [['gridColumn', values?.gridColumn], ['gridRow', values?.gridRow], ['gridArea', values?.gridArea]]
    .map(([property, value]) => hiddenInspectorInput(property, String(value || 'auto')));
  const span = (value) => (/^span\s+(\d+)$/.exec(String(value).trim())?.[1]) || (String(value).trim() === 'auto' ? '1' : '');
  const lines = (value) => String(value).split('/').map((part) => part.trim());
  const isArea = (value) => /^[a-z_-][\w-]*$/i.test(String(value).trim()) && String(value).trim() !== 'auto';
  const modeOf = () => {
    if (isArea(columnInput.value) || isArea(areaInput.value.split('/')[0])) return 'area';
    return [columnInput.value, rowInput.value].every((value) => span(value)) ? 'auto' : 'manual';
  };
  let mode = modeOf();
  const panes = {};
  const field = (prefixText, value, write) => {
    const { shell, input } = childInput(null, prefixText, value);
    input.addEventListener('change', () => write(input.value.trim()));
    return { shell, input };
  };
  const columnSpan = field('Col span', span(columnInput.value) || '1', (value) => setChildValue(columnInput, `span ${value || 1}`));
  const rowSpan = field('Row span', span(rowInput.value) || '1', (value) => setChildValue(rowInput, `span ${value || 1}`));
  panes.auto = [columnSpan.shell, rowSpan.shell];
  const area = field('Area', isArea(areaInput.value.split('/')[0]) ? areaInput.value.split('/')[0].trim() : '', (value) => {
    if (!value) return;
    setChildValue(columnInput, '');
    setChildValue(rowInput, '');
    setChildValue(areaInput, value);
  });
  panes.area = [area.shell];
  // Manual starts from the current lines, or from line 1 across the span.
  const startEnd = (value) => {
    const count = span(value);
    if (count) return ['1', String(1 + Number(count))];
    const [start, end] = lines(value);
    return [start || '1', end || String(Number(start) + 1 || 2)];
  };
  const manualField = (prefixText, target, index) => field(prefixText, startEnd(target.value)[index], () => {
    const [start, end] = target === columnInput ? [columnStart, columnEnd] : [rowStart, rowEnd];
    setChildValue(target, `${start.input.value.trim() || 'auto'} / ${end.input.value.trim() || 'auto'}`);
  });
  const columnStart = manualField('Col start', columnInput, 0);
  const columnEnd = manualField('Col end', columnInput, 1);
  const rowStart = manualField('Row start', rowInput, 0);
  const rowEnd = manualField('Row end', rowInput, 1);
  panes.manual = [columnStart.shell, columnEnd.shell, rowStart.shell, rowEnd.shell];
  const inputs = document.createElement('div');
  inputs.className = 'inspector-child-inputs';
  inputs.append(...Object.values(panes).flat());
  const { tabs, press } = childTabs('Position', [
    { key: 'auto', text: 'Auto', title: 'Auto' },
    { key: 'area', text: 'Area', title: 'Area' },
    { key: 'manual', text: 'Manual', title: 'Manual' }
  ], (key) => {
    mode = key;
    if (key !== 'area' && areaInput.value && areaInput.value !== 'auto' && isArea(areaInput.value.split('/')[0])) setChildValue(areaInput, '');
    if (key === 'auto') {
      setChildValue(columnInput, `span ${columnSpan.input.value.trim() || 1}`);
      setChildValue(rowInput, `span ${rowSpan.input.value.trim() || 1}`);
    }
    if (key === 'manual') {
      setChildValue(columnInput, `${columnStart.input.value.trim()} / ${columnEnd.input.value.trim()}`);
      setChildValue(rowInput, `${rowStart.input.value.trim()} / ${rowEnd.input.value.trim()}`);
    }
    sync();
  });
  const sync = () => {
    press(mode);
    Object.entries(panes).forEach(([key, shells]) => shells.forEach((shell) => { shell.hidden = key !== mode; }));
  };
  sync();
  row.append(tabs, inputs, columnInput, rowInput, areaInput);
  return row;
}

// Picture settings in Background, each where it works: object-fit and
// object-position for an img or video (position not while it fills the box),
// and size, position and repeat for a background image. A line above names
// the picture: its own size and file.
function imageSettingsFields(values, context) {
  const fields = [];
  const fileName = (url) => {
    try {
      return decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()) || url;
    } catch {
      return url;
    }
  };
  const info = (text, title) => {
    const line = document.createElement('p');
    line.className = 'inspector-image-info';
    line.textContent = text;
    line.title = title;
    return line;
  };
  const media = context?.media;
  if (media) {
    const size = media.naturalWidth && media.naturalHeight ? `${media.naturalWidth} × ${media.naturalHeight}` : 'Not loaded';
    const name = media.src ? fileName(media.src) : 'no source';
    const alt = media.kind === 'image' ? (media.alt === null ? 'no alt attribute' : media.alt ? `alt: ${media.alt}` : 'empty alt') : '';
    fields.push(info([size, name, alt].filter(Boolean).join(' · '), [media.src, alt].filter(Boolean).join('\n')));
    const fit = menuSelectField('objectFit', 'Fit', [
      ['fill', 'Fill', 'Stretch the picture to the box, ignoring its proportions.'],
      ['contain', 'Contain', 'Fit the whole picture inside the box; empty bands may remain.'],
      ['cover', 'Cover', 'Fill the box and crop what does not fit.'],
      ['none', 'None', 'Keep the picture at its own size, cropped by the box.'],
      ['scale-down', 'Scale down', 'Like None, or Contain when the picture is larger than the box.']
    ], String(values?.objectFit || 'fill'));
    const position = positionMatrixField('objectPosition', String(values?.objectPosition || '50% 50%'), 'picture');
    // With Fill the picture covers the whole box, so it has no position.
    const relevance = () => {
      const off = panelValue(position, 'objectFit', values?.objectFit || 'fill') === 'fill';
      position.hidden = off;
      position.dataset.irrelevant = String(off);
    };
    const refresh = position.refreshFromPanel;
    position.refreshFromPanel = () => {
      refresh();
      relevance();
    };
    relevance();
    fields.push(fit, position);
  }
  const backgroundImage = String(values?.backgroundImage || 'none');
  if (backgroundImage !== 'none') {
    const layers = backgroundImage.split(/,(?![^(]*\))/).map((layer) => layer.trim());
    const describe = (layer) => {
      const url = /^url\(\s*["']?(.*?)["']?\s*\)$/.exec(layer)?.[1];
      return url ? fileName(url) : layer.split('(')[0];
    };
    fields.push(info(`Background image · ${layers.map(describe).join(', ')}`, backgroundImage));
    fields.push(menuSelectField('backgroundSize', 'Size', [
      ['auto', 'Auto', 'Keep the image at its own size.'],
      ['cover', 'Cover', 'Fill the element and crop what does not fit.'],
      ['contain', 'Contain', 'Fit the whole image inside the element.']
    ], String(values?.backgroundSize || 'auto')));
    fields.push(positionMatrixField('backgroundPosition', String(values?.backgroundPosition || '0% 0%'), 'image'));
    const repeatRow = document.createElement('div');
    repeatRow.className = 'inspector-field is-wide is-tabs';
    const repeat = hiddenInspectorInput('backgroundRepeat', String(values?.backgroundRepeat || 'repeat'));
    const { tabs, press } = childTabs('Repeat', [
      { key: 'repeat', text: 'Repeat', title: 'Tile in both directions' },
      { key: 'repeat-x', text: 'X', title: 'Tile across only' },
      { key: 'repeat-y', text: 'Y', title: 'Tile down only' },
      { key: 'no-repeat', text: 'None', title: 'Show the image once' }
    ], (key) => {
      setInputValue(repeat, key);
      press(key);
    });
    repeatRow.classList.add('inspector-syncs');
    repeatRow.refreshFromPanel = () => press(repeat.value);
    press(repeat.value);
    repeatRow.append(tabs, repeat);
    fields.push(repeatRow);
  }
  return fields;
}

// overflow as tabs. A value that differs per axis ("hidden auto") presses
// none and shows in the tooltip.
function overflowField(values) {
  const row = childRow('Overflow');
  const input = hiddenInspectorInput('overflow', String(values?.overflow || 'visible'));
  const { tabs, press } = childTabs('Overflow', [
    ...['visible', 'hidden', 'clip', 'scroll'].map((key) => ({ key, icon: inspectorIcon(INSPECTOR_ICON_PATHS.overflow[key]), title: key[0].toUpperCase() + key.slice(1) })),
    { key: 'auto', text: 'Auto', title: 'Auto' }
  ], (key) => {
    setChildValue(input, key);
    sync();
  });
  const sync = () => {
    press(input.value);
    row.title = ['visible', 'hidden', 'clip', 'scroll', 'auto'].includes(input.value) ? '' : `Overflow: ${input.value}`;
  };
  row.classList.add('inspector-syncs');
  row.refreshFromPanel = sync;
  sync();
  row.append(tabs, input);
  return row;
}

// More type options, labelled on top like the other More options fields and
// paired in the section's two columns. Each builder returns its fields; the
// render loop puts them behind Typography's More options.
const TYPE_MORE_CONTROLS = {
  columnCount: typeColumnsField,
  direction: typeDirectionField,
  overflowWrap: typeWrapField,
  wordBreak: typeBreakingFields,
  webkitTextStrokeWidth: typeStrokeFields,
  textOverflow: typeTruncateField,
  textShadow: textShadowsField
};

function typeField(label, wide) {
  const field = document.createElement('div');
  field.className = `inspector-field${wide ? ' is-wide' : ''}`;
  const caption = document.createElement('span');
  caption.className = 'inspector-type-label';
  caption.textContent = label;
  field.append(caption);
  return field;
}

// A menu field with the label on top instead of a prefix.
function typeMenuField(label, property, options, value, extra, wide) {
  const field = menuSelectField(property, '', options, value, extra);
  if (!wide) field.classList.remove('is-wide');
  field.querySelector('button').title = label;
  const caption = document.createElement('span');
  caption.className = 'inspector-type-label';
  caption.textContent = label;
  field.prepend(caption);
  return field;
}

// A color as text with a picker, as the panel's color fields are. With a
// property it carries that property; otherwise onChange gets the value.
function colorShell(property, label, value, onChange) {
  const shell = document.createElement('span');
  shell.className = 'inspector-color-shell';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.setAttribute('aria-label', label);
  if (property) {
    input.name = property;
    input.dataset.property = property;
    input.dataset.previousValue = value;
  }
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'inspector-color-picker';
  picker.setAttribute('aria-label', `${label} picker`);
  const showPicker = () => { picker.value = (cssColorToHex(input.value) || '#000000').slice(0, 7); };
  showPicker();
  const send = (type) => {
    if (property) input.dispatchEvent(new Event(type, { bubbles: true }));
    else if (type === 'change') onChange(input.value.trim());
  };
  picker.addEventListener('input', () => {
    input.value = picker.value.toUpperCase();
    send('input');
  });
  picker.addEventListener('change', () => {
    input.value = picker.value.toUpperCase();
    send('change');
  });
  input.addEventListener('input', showPicker);
  if (!property) input.addEventListener('change', () => send('change'));
  shell.append(input, picker);
  return { shell, input, showPicker };
}

// column-count: auto or a number of columns.
function typeColumnsField(values) {
  const field = typeField('Columns');
  const { shell } = childInput('columnCount', 'Columns', String(values?.columnCount || 'auto'));
  shell.title = 'Columns';
  shell.querySelector('.inspector-input-prefix').innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.type.columns);
  field.append(shell);
  return field;
}

function typeDirectionField(values) {
  const field = typeField('Direction');
  const input = hiddenInspectorInput('direction', String(values?.direction || 'ltr'));
  const { tabs, press } = childTabs('Direction', [
    { key: 'ltr', icon: inspectorIcon(INSPECTOR_ICON_PATHS.type.ltr), title: 'Left to right' },
    { key: 'rtl', icon: inspectorIcon(INSPECTOR_ICON_PATHS.type.rtl), title: 'Right to left' }
  ], (key) => {
    setChildValue(input, key);
    press(key);
  });
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => press(input.value);
  press(input.value);
  field.append(tabs, input);
  return field;
}

function typeWrapField(values) {
  return typeMenuField('Wrap', 'overflowWrap', [
    ['normal', 'Normal', 'Breaks words only at allowed break points.'],
    ['anywhere', 'Anywhere', 'Breaks a long word anywhere so it fits; the box can also shrink below it.'],
    ['break-word', 'Break word', 'Breaks a long word only when it would otherwise overflow.']
  ], String(values?.overflowWrap || 'normal'));
}

// Where words may break (word-break) and how spaces and line breaks are
// kept (white-space).
function typeBreakingFields(values) {
  return [
    typeMenuField('Word break', 'wordBreak', [
      ['normal', 'Normal', 'Use the default rules for word breaking.'],
      ['break-all', 'Break all', 'Break words between any two letters so they do not overflow.'],
      ['keep-all', 'Keep all', 'Do not break words in Chinese, Japanese or Korean text.']
    ], String(values?.wordBreak || 'normal')),
    typeMenuField('Line break', 'whiteSpace', [
      ['normal', 'Normal', 'Text wraps when needed, and extra spaces collapse into one.'],
      ['nowrap', 'No wrap', 'Text stays on one line; extra spaces collapse into one.'],
      ['pre', 'Pre', 'Spaces and line breaks stay as written; text does not wrap.'],
      ['pre-wrap', 'Pre wrap', 'Spaces and line breaks stay as written, and text wraps when needed.'],
      ['pre-line', 'Pre line', 'Line breaks stay, extra spaces collapse, and text wraps when needed.'],
      ['break-spaces', 'Break spaces', 'Like Pre wrap, and spaces at the end of a line can wrap too.']
    ], String(values?.whiteSpace || 'normal'))
  ];
}

// -webkit-text-stroke as a width and a color.
function typeStrokeFields(values) {
  const width = typeField('Stroke width');
  const widthInput = childInput('webkitTextStrokeWidth', 'Stroke width', String(values?.webkitTextStrokeWidth || '0px'), LENGTH_UNITS);
  widthInput.shell.querySelector('.inspector-input-prefix').innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.borderWidth);
  width.append(widthInput.shell);
  const color = typeField('Stroke color');
  color.append(colorShell('webkitTextStrokeColor', 'Stroke color', String(values?.webkitTextStrokeColor || '#000000')).shell);
  return [width, color];
}

// filter as a list: + opens a menu of filter functions, and each one added
// is a line that opens its settings in a popover; − removes it. Functions
// the panel has no fields for (url(), opacity()) keep their text.
const FILTER_TYPES = {
  blur: { label: 'Blur', fresh: '5px', field: 'Radius', units: 'length' },
  'drop-shadow': { label: 'Drop shadow', fresh: '0px 2px 5px rgba(0, 0, 0, 0.2)' },
  brightness: { label: 'Brightness', fresh: '100%', field: 'Amount', units: 'amount' },
  contrast: { label: 'Contrast', fresh: '100%', field: 'Amount', units: 'amount' },
  'hue-rotate': { label: 'Hue rotate', fresh: '0deg', field: 'Angle', units: 'angle' },
  saturate: { label: 'Saturation', fresh: '100%', field: 'Amount', units: 'amount' },
  grayscale: { label: 'Grayscale', fresh: '100%', field: 'Amount', units: 'amount' },
  invert: { label: 'Invert', fresh: '100%', field: 'Amount', units: 'amount' },
  sepia: { label: 'Sepia', fresh: '100%', field: 'Amount', units: 'amount' }
};
const FILTER_GROUPS = [
  ['General', ['blur', 'drop-shadow']],
  ['Color adjustments', ['brightness', 'contrast', 'hue-rotate', 'saturate']],
  ['Color effects', ['grayscale', 'invert', 'sepia']]
];
const filterUnits = (kind) => ({ length: LENGTH_UNITS, amount: ['%', ''], angle: ['deg', 'turn', 'rad', 'grad'] })[kind];

function parseFilters(value) {
  if (String(value).trim() === 'none') return [];
  return [...String(value).matchAll(/([a-z-]+)\(((?:[^()]|\([^()]*\))*)\)/gi)].map(([, name, args]) => ({ name: name.toLowerCase(), args: args.trim() }));
}

function filtersField(values) {
  const field = typeField('Filters', true);
  const input = hiddenInspectorInput('filter', String(values?.filter || 'none'));
  let filters = parseFilters(input.value);
  const compose = () => filters.map(({ name, args }) => `${name}(${args})`).join(' ') || 'none';
  const commit = () => setChildValue(input, compose());
  const lineButton = (path, title) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inspector-group-action';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = inspectorIcon(path);
    return button;
  };
  const shadowOf = (filter) => parseShadows(filter.args, 3)[0] || parseShadows(FILTER_TYPES['drop-shadow'].fresh, 3)[0];
  const summary = (filter) => {
    const type = FILTER_TYPES[filter.name];
    if (!type) return `${filter.name}(${filter.args})`;
    return `${type.label}: ${filter.name === 'drop-shadow' ? shadowOf(filter).lengths.join(' ') : filter.args}`;
  };
  // The menu of filter functions, for + and for a filter's type.
  const filterMenu = (trigger, container, current, pick) => inspectorMenu(trigger, container, () => ({
    groups: FILTER_GROUPS.map(([label, names]) => ({
      label,
      items: names.map((name) => ({ text: FILTER_TYPES[name].label, checked: current() === name, pick: () => pick(name) }))
    }))
  }));
  // A value with its unit, prefixed by what it is.
  const valueField = (prefixText, units, read, write) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = prefixText;
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = prefixText;
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.inputMode = 'decimal';
    valueInput.setAttribute('aria-label', prefixText);
    shell.append(prefix, valueInput);
    const show = units
      ? attachUnitSelect(shell, valueInput, units, (value, type) => {
        if (type === 'change' && value.trim()) write(value.trim());
        return read();
      })
      : (value) => { valueInput.value = value; };
    if (!units) valueInput.addEventListener('change', () => write(valueInput.value.trim()));
    show(read());
    return shell;
  };
  // A filter's settings: its type, then its value (or the drop shadow's).
  const renderSettings = (filter, settings, showSummary) => {
    const update = () => {
      showSummary();
      commit();
    };
    const typeButton = document.createElement('button');
    typeButton.type = 'button';
    typeButton.className = 'inspector-input-shell inspector-menu-select is-full';
    typeButton.title = 'Filter';
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = 'Filter';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'inspector-menu-value';
    typeLabel.textContent = FILTER_TYPES[filter.name]?.label || filter.name;
    typeButton.append(prefix, typeLabel);
    typeButton.insertAdjacentHTML('beforeend', INSPECTOR_MENU_CARET);
    settings.replaceChildren(typeButton);
    filterMenu(typeButton, settings, () => filter.name, (name) => {
      if (name === filter.name) return;
      filter.name = name;
      filter.args = FILTER_TYPES[name].fresh;
      renderSettings(filter, settings, showSummary);
      update();
    });
    const type = FILTER_TYPES[filter.name];
    if (filter.name === 'drop-shadow') {
      const lengthNames = [['X', 'X offset'], ['Y', 'Y offset'], ['Blur', 'Blur']];
      const write = (shadow) => {
        filter.args = `${shadow.lengths.join(' ')} ${shadow.color}`;
        update();
      };
      lengthNames.forEach(([prefixText], index) => settings.append(valueField(prefixText, LENGTH_UNITS, () => shadowOf(filter).lengths[index], (value) => {
        const shadow = shadowOf(filter);
        shadow.lengths[index] = value;
        write(shadow);
      })));
      const color = colorShell(null, 'Drop shadow color', shadowOf(filter).color, (value) => {
        if (!value) return;
        const shadow = shadowOf(filter);
        shadow.color = value;
        write(shadow);
      });
      settings.append(color.shell);
      return;
    }
    const value = valueField(type?.field || 'Value', type ? filterUnits(type.units) : null, () => filter.args, (text) => {
      filter.args = text;
      update();
    });
    value.classList.add('is-full');
    settings.append(value);
  };
  // The header carries the change dot, so it shows with no filter left too.
  const header = document.createElement('div');
  header.className = 'inspector-type-header';
  header.dataset.properties = 'filter';
  const add = lineButton(INSPECTOR_ICON_PATHS.type.add, 'Add filter');
  header.append(field.querySelector('.inspector-type-label'), add);
  filterMenu(add, header, () => null, (name) => {
    filters.push({ name, args: FILTER_TYPES[name].fresh });
    commit();
    render();
  });
  const list = document.createElement('div');
  list.className = 'inspector-shadow-list';
  const render = () => {
    list.replaceChildren(...filters.map((filter, position) => {
      const row = document.createElement('div');
      row.className = 'inspector-shadow-row';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'inspector-input-shell inspector-shadow-summary';
      trigger.title = 'Edit filter';
      const text = document.createElement('span');
      text.className = 'inspector-menu-value';
      trigger.append(text);
      const showSummary = () => { text.textContent = summary(filter); };
      showSummary();
      const settings = document.createElement('div');
      settings.className = 'inspector-shadow-fields';
      renderSettings(filter, settings, showSummary);
      inspectorPopover(trigger, row, settings);
      const remove = lineButton(INSPECTOR_ICON_PATHS.type.remove, 'Remove filter');
      remove.addEventListener('click', () => {
        filters.splice(position, 1);
        commit();
        render();
      });
      row.prepend(trigger, remove);
      return row;
    }));
    list.hidden = !filters.length;
  };
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => {
    if (input.value === compose()) return;
    filters = parseFilters(input.value);
    render();
  };
  render();
  field.append(header, list, input);
  return field;
}

// cursor, in groups by what the pointer means; hovering an option shows it.
const CURSOR_GROUPS = [
  ['General', ['auto', 'default', 'none']],
  ['Links & Status', ['pointer', 'not-allowed', 'wait', 'progress', 'help', 'context-menu']],
  ['Selection', ['cell', 'crosshair', 'text', 'vertical-text']],
  ['Drag & Drop', ['grab', 'grabbing', 'alias', 'copy', 'move']],
  ['Zoom', ['zoom-in', 'zoom-out']],
  ['Resize', ['col-resize', 'row-resize', 'nesw-resize', 'nwse-resize', 'ew-resize', 'ns-resize', 'n-resize', 'w-resize', 's-resize', 'e-resize', 'nw-resize', 'ne-resize', 'sw-resize', 'se-resize']]
];

// Line drawings of the cursors, for the menu and the field. The small arrow
// is the pointer the composite cursors (progress, copy…) carry.
const CURSOR_ARROW = 'M4 2.5v10.2l2.7-2.5 1.8 3.8 1.7-.8-1.8-3.7h3.6z';
const CURSOR_SMALL_ARROW = 'M3 2v8l2.1-2 1.4 3 1.3-.6-1.4-2.9H9.3z';
const CURSOR_ICONS = {
  auto: CURSOR_ARROW,
  default: CURSOR_ARROW,
  none: `${CURSOR_ARROW}M2.5 2.5l11 11`,
  pointer: 'M6 8.5V3a1 1 0 0 1 2 0v4.5M8 7V6a1 1 0 0 1 2 0v1.5M10 7.5a1 1 0 0 1 2 0V10a4 4 0 0 1-4 4H7.5a3.5 3.5 0 0 1-2.8-1.4L3 10.2a1 1 0 0 1 1.5-1.3L6 10.5',
  'not-allowed': 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM4.1 4.1l7.8 7.8',
  wait: 'M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14M3.8 3.8l1.8 1.8M10.4 10.4l1.8 1.8M3.8 12.2l1.8-1.8M10.4 5.6l1.8-1.8',
  progress: `${CURSOR_SMALL_ARROW}M11.5 8.5v1M11.5 13v1M9 11.25h1M13 11.25h1M9.7 9.5l.6.6M12.7 12.5l.6.6M9.7 13.1l.6-.6M12.7 10.1l.6-.6`,
  help: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM6.5 6.5a1.5 1.5 0 1 1 2.2 1.3c-.5.3-.7.6-.7 1.2M8 11h.01',
  'context-menu': `${CURSOR_SMALL_ARROW}M9.5 8.5h4.5v5.5H9.5zM11 10.25h1.5M11 12.25h1.5`,
  cell: 'M6 2.5h4v3.5h3.5v4H10v3.5H6V10H2.5V6H6z',
  crosshair: 'M8 2v12M2 8h12',
  text: 'M6 3h4M6 13h4M8 3v10',
  'vertical-text': 'M3 6v4M13 6v4M3 8h10',
  grab: 'M5.5 8V4.5a1 1 0 0 1 2 0v3M7.5 7V3.5a1 1 0 0 1 2 0v4M9.5 7.5V4.5a1 1 0 0 1 2 0V9M5.5 8a1 1 0 0 0-2 0v1.5a4.5 4.5 0 0 0 4.5 4.5h.5a3.5 3.5 0 0 0 3.5-3.5V9',
  grabbing: 'M4.5 7h7a1 1 0 0 1 1 1v2a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V8a1 1 0 0 1 1-1zM6.5 7V5.5M8.5 7V5M10.5 7V5.5',
  alias: `${CURSOR_SMALL_ARROW}M9.5 14c0-2.5 1.5-4 4-4M12 8.5l1.5 1.5-1.5 1.5`,
  copy: `${CURSOR_SMALL_ARROW}M11.5 9.5v4M9.5 11.5h4`,
  move: 'M8 2v12M2 8h12M6.5 3.5 8 2l1.5 1.5M6.5 12.5 8 14l1.5-1.5M3.5 6.5 2 8l1.5 1.5M12.5 6.5 14 8l-1.5 1.5',
  'zoom-in': 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.2 10.2l3.3 3.3M5 7h4M7 5v4',
  'zoom-out': 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.2 10.2l3.3 3.3M5 7h4',
  'col-resize': 'M7 3v10M9 3v10M2.5 8h3M10.5 8h3M4 6.5 2.5 8 4 9.5M12 6.5l1.5 1.5-1.5 1.5',
  'row-resize': 'M3 7h10M3 9h10M8 2.5v3M8 10.5v3M6.5 4 8 2.5 9.5 4M6.5 12 8 13.5 9.5 12',
  'nesw-resize': 'M3.5 12.5l9-9M8.5 3.5h4v4M3.5 8.5v4h4',
  'nwse-resize': 'M3.5 3.5l9 9M3.5 7.5v-4h4M12.5 8.5v4h-4',
  'ew-resize': 'M2.5 8h11M4.5 6 2.5 8l2 2M11.5 6l2 2-2 2',
  'ns-resize': 'M8 2.5v11M6 4.5l2-2 2 2M6 11.5l2 2 2-2',
  'n-resize': 'M8 13.5V3M4.5 6.5 8 3l3.5 3.5',
  'w-resize': 'M13.5 8H3M6.5 4.5 3 8l3.5 3.5',
  's-resize': 'M8 2.5V13M4.5 9.5 8 13l3.5-3.5',
  'e-resize': 'M2.5 8H13M9.5 4.5 13 8l-3.5 3.5',
  'nw-resize': 'M12.5 12.5 3.5 3.5M3.5 8.5v-5h5',
  'ne-resize': 'M3.5 12.5l9-9M7.5 3.5h5v5',
  'sw-resize': 'M12.5 3.5l-9 9M3.5 7.5v5h5',
  'se-resize': 'M3.5 3.5l9 9M12.5 7.5v5h-5'
};

function cursorField(values) {
  const groups = CURSOR_GROUPS.map(([label, keys]) => ({ label, options: keys.map((key) => [key, key]) }));
  const icons = Object.fromEntries(Object.entries(CURSOR_ICONS).map(([key, path]) => [key, inspectorIcon(path)]));
  return typeMenuField('Cursor', 'cursor', groups, String(values?.cursor || 'auto'), { cursor: true, icons, hint: 'Hover an option to see its cursor.' }, true);
}

// text-overflow works on a box that clips (overflow other than visible) and
// keeps its text on one line (No wrap or Pre), so it shows only then.
function typeTruncateField(values) {
  const field = typeField('Truncate');
  const input = hiddenInspectorInput('textOverflow', String(values?.textOverflow || 'clip'));
  const { tabs, press } = childTabs('Truncate', [
    { key: 'clip', text: 'Clip', title: 'Clip' },
    { key: 'ellipsis', text: 'Ellipsis', title: 'Ellipsis' }
  ], (key) => {
    setChildValue(input, key);
    press(key);
  });
  const relevance = () => {
    const overflow = panelValue(field, 'overflow', values?.overflow || 'visible').split(/\s+/)[0];
    const off = overflow === 'visible' || !['nowrap', 'pre'].includes(panelValue(field, 'whiteSpace', values?.whiteSpace || 'normal'));
    field.hidden = off;
    field.dataset.irrelevant = String(off);
  };
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => {
    press(input.value);
    relevance();
  };
  press(input.value);
  relevance();
  field.append(tabs, input);
  return field;
}

// text-shadow and box-shadow as lists: + adds a shadow, and each one has
// its fields and a button that removes it. A box shadow also has Outside /
// Inside (inset) and a size (spread).
const SHADOW_COLOR = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)|#[0-9a-f]{3,8}\b/i;

function parseShadows(value, lengthCount) {
  if (String(value).trim() === 'none') return [];
  return String(value).split(/,(?![^(]*\))/).map((shadow) => shadow.trim()).filter(Boolean).map((shadow) => {
    const color = SHADOW_COLOR.exec(shadow)?.[0];
    const tokens = shadow.replace(SHADOW_COLOR, ' ').trim().split(/\s+/).filter(Boolean);
    const inset = tokens.includes('inset');
    const words = tokens.filter((token) => token !== 'inset');
    const lengths = words.filter((token) => /^[-+.\d]/.test(token));
    return {
      inset,
      lengths: Array.from({ length: lengthCount }, (_, index) => lengths[index] || '0px'),
      color: color || words.find((token) => !/^[-+.\d]/.test(token)) || 'currentcolor'
    };
  });
}

function textShadowsField(values) {
  return shadowListField({
    property: 'textShadow', label: 'Text shadows', noun: 'text shadow',
    value: String(values?.textShadow || 'none'),
    fresh: '0px 1px 2px rgba(0, 0, 0, 0.25)',
    lengths: [['X', 'X offset'], ['Y', 'Y offset'], ['Blur', 'blur']]
  });
}

function boxShadowsField(values) {
  return shadowListField({
    property: 'boxShadow', label: 'Box shadows', noun: 'box shadow',
    value: String(values?.boxShadow || 'none'),
    fresh: '0px 2px 5px 0px rgba(0, 0, 0, 0.2)',
    lengths: [['X', 'X offset'], ['Y', 'Y offset'], ['Blur', 'blur'], ['Size', 'size']],
    inset: true
  });
}

function shadowListField({ property, label, noun, value, fresh, lengths: lengthFields, inset }) {
  const field = typeField(label, true);
  const input = hiddenInspectorInput(property, value);
  const parse = (text) => parseShadows(text, lengthFields.length);
  let shadows = parse(input.value);
  const compose = () => shadows.map((shadow) => `${shadow.inset ? 'inset ' : ''}${shadow.lengths.join(' ')} ${shadow.color}`).join(', ') || 'none';
  const commit = () => setChildValue(input, compose());
  const lineButton = (path, title, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inspector-group-action';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = inspectorIcon(path);
    button.addEventListener('click', onClick);
    return button;
  };
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  // The header carries the change dot, so it shows with no shadow left too.
  const header = document.createElement('div');
  header.className = 'inspector-type-header';
  header.dataset.properties = property;
  header.append(field.querySelector('.inspector-type-label'), lineButton(INSPECTOR_ICON_PATHS.type.add, `Add ${noun}`, () => {
    shadows.push(parse(fresh)[0]);
    commit();
    render();
  }));
  const list = document.createElement('div');
  list.className = 'inspector-shadow-list';
  const lengthField = (shadow, index, prefixText, title, changed) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = title;
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = prefixText;
    const lengthInput = document.createElement('input');
    lengthInput.type = 'text';
    lengthInput.inputMode = 'decimal';
    lengthInput.setAttribute('aria-label', title);
    shell.append(prefix, lengthInput);
    const show = attachUnitSelect(shell, lengthInput, LENGTH_UNITS, (text, type) => {
      if (type === 'change' && text.trim()) {
        shadow.lengths[index] = text.trim();
        changed();
        commit();
      }
      return shadow.lengths[index];
    });
    show(shadow.lengths[index]);
    return shell;
  };
  // Each shadow is one line, swatch and values, that opens its fields in a
  // popover; − removes it.
  const summary = (shadow) => `${inset ? `${shadow.inset ? 'Inside' : 'Outside'}: ` : ''}${shadow.lengths.join(' ')}`;
  const render = () => {
    list.replaceChildren(...shadows.map((shadow, position) => {
      const row = document.createElement('div');
      row.className = 'inspector-shadow-row';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'inspector-input-shell inspector-shadow-summary';
      trigger.title = `Edit ${noun}`;
      const swatch = document.createElement('span');
      swatch.className = 'inspector-shadow-swatch';
      const text = document.createElement('span');
      text.className = 'inspector-menu-value';
      trigger.append(swatch, text);
      const showSummary = () => {
        swatch.style.setProperty('--swatch', shadow.color);
        text.textContent = summary(shadow);
      };
      showSummary();
      const fields = document.createElement('div');
      fields.className = 'inspector-shadow-fields';
      const update = () => {
        showSummary();
        commit();
      };
      if (inset) {
        const { tabs, press } = childTabs('Shadow type', [
          { key: 'outside', text: 'Outside', title: 'Outside' },
          { key: 'inside', text: 'Inside', title: 'Inside' }
        ], (key) => {
          shadow.inset = key === 'inside';
          press(key);
          update();
        });
        tabs.classList.add('is-full');
        press(shadow.inset ? 'inside' : 'outside');
        fields.append(tabs);
      }
      lengthFields.forEach(([prefixText, title], index) => fields.append(lengthField(shadow, index, prefixText, `${Noun} ${title}`, showSummary)));
      const color = colorShell(null, `${Noun} color`, shadow.color, (value) => {
        if (!value) return;
        shadow.color = value;
        update();
      });
      // With an even count of lengths the color takes a row of its own.
      if (lengthFields.length % 2 === 0) color.shell.classList.add('is-full');
      fields.append(color.shell);
      inspectorPopover(trigger, row, fields);
      row.prepend(trigger, lineButton(INSPECTOR_ICON_PATHS.type.remove, `Remove ${noun}`, () => {
        shadows.splice(position, 1);
        commit();
        render();
      }));
      return row;
    }));
    list.hidden = !shadows.length;
  };
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => {
    if (input.value === compose()) return;
    shadows = parse(input.value);
    render();
  };
  render();
  field.append(header, list, input);
  return field;
}

// position as a menu; the offsets and z-index show only for a positioned
// element, since a static one ignores them.
function positionFields(values) {
  const scheme = menuSelectField('position', 'Position', [
    ['static', 'Static', 'Static is the default: the element follows the normal flow and ignores offsets.'],
    ['relative', 'Relative', 'Stays in the flow; offsets shift it from where it would be. Absolute children are placed inside it.'],
    ['absolute', 'Absolute', 'Leaves the flow; offsets place it inside the nearest positioned ancestor.'],
    ['fixed', 'Fixed', 'Leaves the flow; offsets place it on the viewport, so it stays put while the page scrolls.'],
    ['sticky', 'Sticky', 'Scrolls with the flow until it reaches an offset, then sticks within its parent.']
  ], String(values?.position || 'static'));
  const field = (shell, wide) => {
    const node = document.createElement('div');
    node.className = `inspector-field${wide ? ' is-wide' : ''}`;
    node.append(shell);
    return node;
  };
  // Side order as in the spacing control's four fields.
  const offsets = ['Left', 'Top', 'Right', 'Bottom'].map((side) => {
    const property = side.toLowerCase();
    const { shell } = childInput(property, side, String(values?.[property] || 'auto'), SIZE_UNITS);
    shell.title = side;
    shell.querySelector('.inspector-input-prefix').innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.spacing[side]);
    return field(shell);
  });
  const zIndex = childInput('zIndex', 'Z index', String(values?.zIndex || 'auto'));
  zIndex.shell.title = 'Z index: higher numbers sit on top';
  const dependents = [...offsets, field(zIndex.shell, true)];
  const relevance = () => {
    const off = panelValue(scheme, 'position', values?.position || 'static') === 'static';
    dependents.forEach((node) => {
      node.hidden = off;
      node.dataset.irrelevant = String(off);
    });
  };
  const refresh = scheme.refreshFromPanel;
  scheme.refreshFromPanel = () => {
    refresh();
    relevance();
  };
  scheme.addEventListener('change', relevance);
  relevance();
  return [scheme, ...dependents];
}

// A field that opens a menu of fixed options for one property, in the style
// of the alignment X / Y menus. options: [[value, label, hint]], or groups of
// them: [{ label, options }]. extra: { hint } for the footer when the option
// has none, { cursor: true } to show each option's cursor on hover, and
// { icons: { value: svg } } drawn by each option and the chosen one, with
// the check at the end of the row as in the compact menu.
function menuSelectField(property, prefixText, options, value, extra = {}) {
  const groups = Array.isArray(options[0]) ? [{ options }] : options;
  options = groups.flatMap((group) => group.options);
  const field = document.createElement('div');
  field.className = 'inspector-field is-wide';
  const input = hiddenInspectorInput(property, value);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inspector-input-shell inspector-menu-select';
  button.title = prefixText;
  button.dataset.properties = property;
  const label = document.createElement('span');
  label.className = 'inspector-menu-value';
  // A row caption can name the menu instead of a prefix.
  if (prefixText) {
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = prefixText;
    button.append(prefix);
  }
  const icon = document.createElement('span');
  icon.className = 'inspector-input-prefix';
  if (extra.icons) button.append(icon);
  button.append(label);
  button.insertAdjacentHTML('beforeend', INSPECTOR_MENU_CARET);
  const sync = () => {
    label.textContent = options.find(([key]) => key === input.value)?.[1] || input.value;
    icon.innerHTML = extra.icons?.[input.value] || '';
  };
  inspectorMenu(button, field, () => ({
    hint: options.find(([key]) => key === input.value)?.[2] || extra.hint || '',
    compact: Boolean(extra.icons),
    groups: groups.map((group) => ({
      label: group.label,
      items: group.options.map(([key, text, hint]) => ({
        text,
        hint,
        icon: extra.icons?.[key],
        cursor: extra.cursor ? key : undefined,
        checked: input.value === key,
        pick: () => {
          setInputValue(input, key);
          sync();
        }
      }))
    }))
  }));
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = sync;
  sync();
  field.append(button, input);
  return field;
}

// object-position or background-position as the alignment matrix: X and Y
// pick left / center / right and top / center / bottom; a value that isn't
// one of those shows as written.
function positionMatrixField(property, value, noun) {
  const input = hiddenInspectorInput(property, value);
  const keywords = { x: { start: 'left', center: 'center', end: 'right' }, y: { start: 'top', center: 'center', end: 'bottom' } };
  const visualOf = (token) => ({ 0: 'start', '0%': 'start', '0px': 'start', '50%': 'center', '100%': 'end', left: 'start', top: 'start', center: 'center', right: 'end', bottom: 'end' })[token] || token;
  const parts = () => {
    const [x = 'center', y = 'center'] = input.value.trim().split(/\s+/);
    return { x, y };
  };
  return alignMatrixControl({
    inputs: [input],
    state: () => ({}),
    inputFor: () => input,
    visual: (axis) => visualOf(parts()[axis]),
    options: () => [['start', 'center', 'end']],
    set: (axis, visual) => {
      const current = parts();
      current[axis] = keywords[axis][visual];
      const written = (side) => keywords[side][visualOf(current[side])] || current[side];
      setInputValue(input, `${written('x')} ${written('y')}`);
    },
    hint: (axis, visual) => (visual === 'center'
      ? `Center the ${noun} ${axis === 'x' ? 'across' : 'down'} its box.`
      : `Pin the ${noun} to the ${ALIGN_EDGE_LABELS[axis][visual]?.toLowerCase() || visual} of its box.`),
    // The picture as a small box placed in the frame.
    children: (x, y, state, className) => {
      const [left, top] = [{ start: 4, center: 17, end: 30 }[x] ?? 17, { start: 4, center: 20, end: 36 }[y] ?? 20];
      return `<rect x="${left}" y="${top}" width="26" height="20" rx="1.5" class="${className} is-cell"></rect>`;
    }
  });
}

// One radius for all corners, or one per corner behind the toggle, the way
// spacingControl splits margin and padding.
function radiusControl(values) {
  const corners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
  const control = document.createElement('div');
  control.className = 'inspector-field inspector-spacing inspector-radius';
  const hidden = {};
  corners.forEach((corner) => {
    const property = `border${corner}Radius`;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = property;
    input.dataset.property = property;
    // An older injected inspector reports only the shorthand.
    input.value = String(values?.[property] ?? values?.borderRadius ?? '');
    input.dataset.previousValue = input.value;
    hidden[corner] = input;
  });
  const setCorner = (corner, value, type) => {
    hidden[corner].value = value;
    hidden[corner].dispatchEvent(new Event(type, { bubbles: true }));
  };
  const field = (icon, label, properties, read, write) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = label;
    shell.dataset.properties = properties.join(' ');
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.innerHTML = inspectorIcon(icon);
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', label);
    input.addEventListener('focus', () => input.select());
    shell.append(prefix, input);
    const show = attachUnitSelect(shell, input, SIZE_UNITS, (value, type) => {
      write(value, type);
      if (type === 'change') sync();
      return read();
    });
    return { shell, show, read };
  };
  // "4, 8" style lists follow the corner order of the border-radius shorthand.
  const all = field(INSPECTOR_ICON_PATHS.radius.all, 'Radius', corners.map((corner) => hidden[corner].name), () => {
    const list = corners.map((corner) => hidden[corner].value);
    return list.every((value) => value === list[0]) ? list[0] : list.join(', ');
  }, (text, type) => {
    const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.length || parts.length > 4) return;
    corners.forEach((corner, index) => setCorner(corner, parts[index] ?? parts[0], type));
  });
  all.shell.classList.add('inspector-radius-all');
  const single = (corner) => field(INSPECTOR_ICON_PATHS.radius[corner], `Radius ${corner.replace(/(?=[A-Z])/g, ' ').trim().toLowerCase()}`, [hidden[corner].name], () => hidden[corner].value, (text, type) => {
    if (text.trim()) setCorner(corner, text.trim(), type);
  });
  const [topLeft, topRight, bottomRight, bottomLeft] = corners.map(single);
  const fields = [all, topLeft, topRight, bottomRight, bottomLeft];
  const sync = () => fields.forEach(({ show, read }) => show(read()));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inspector-spacing-toggle';
  toggle.title = 'Radius for each corner';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.spacing.sides);
  const setExpanded = (open) => {
    control.classList.toggle('is-expanded', open);
    toggle.setAttribute('aria-pressed', String(open));
    all.shell.hidden = open;
    [topLeft, topRight, bottomRight, bottomLeft].forEach(({ shell }) => { shell.hidden = !open; });
  };
  toggle.addEventListener('click', () => {
    radiusCornersOpen = !control.classList.contains('is-expanded');
    setExpanded(radiusCornersOpen);
  });
  // Grid order: the toggle closes the first row in both layouts.
  control.append(all.shell, topLeft.shell, topRight.shell, toggle, bottomLeft.shell, bottomRight.shell, ...Object.values(hidden));
  sync();
  setExpanded(radiusCornersOpen);
  return control;
}

// Border width on all sides, on one side only (the others 0), or on each side
// (Custom), picked in the menu next to the field. Hidden inputs carry each
// side through the usual change pipeline; color and style stay shared.
const BORDER_SIDES = ['Top', 'Right', 'Bottom', 'Left'];
// Custom stays picked across elements, as the radius corners do.
let borderSidesCustom = false;

// A box with the side the border goes on drawn solid.
function borderSideIcon(side) {
  const box = 'M3 3h10v10H3z';
  const line = { Top: 'M3 3h10', Right: 'M13 3v10', Bottom: 'M3 13h10', Left: 'M3 3v10' }[side];
  if (!line) return inspectorIcon(box);
  return `<svg class="inspector-line-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="${box}" opacity=".35"></path><path d="${line}"></path></svg>`;
}

function borderWidthControls(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field inspector-border-width';
  const hidden = Object.fromEntries(BORDER_SIDES.map((side) => {
    // An older injected inspector reports only the shorthand.
    const value = String(values?.[`border${side}Width`] ?? values?.borderWidth ?? '0px');
    return [side, hiddenInspectorInput(`border${side}Width`, value)];
  }));
  const width = (side) => hidden[side].value;
  const isZero = (value) => /^[-+]?0*\.?0*([a-z]+|%)?$/i.test(String(value).trim());
  const naturalMode = () => {
    const list = BORDER_SIDES.map(width);
    if (list.every((value) => value === list[0])) return 'all';
    const drawn = BORDER_SIDES.filter((side) => !isZero(width(side)));
    return drawn.length === 1 ? drawn[0] : 'custom';
  };
  let mode = borderSidesCustom && naturalMode() === 'all' ? 'custom' : naturalMode();
  const setSide = (side, value, type) => {
    if (type === 'change' && hidden[side].value === value && hidden[side].dataset.previousValue === value) return;
    hidden[side].value = value;
    hidden[side].dispatchEvent(new Event(type, { bubbles: true }));
  };
  // A side with style none draws no border at any width: give the sides the
  // style drawn on another side, or solid. The other sides that had none now
  // draw their default medium width, so they are set to 0.
  const drawStyle = (targets) => {
    const styleInput = inspectorPanelFields.querySelector('[data-property="borderStyle"]');
    if (!styleInput) return;
    const [top, right = top, bottom = top, left = right] = styleInput.value.trim().split(/\s+/);
    const styles = { Top: top, Right: right, Bottom: bottom, Left: left };
    const off = (side) => ['none', 'hidden'].includes(styles[side]);
    if (!targets.some(off)) return;
    setInputValue(styleInput, BORDER_SIDES.map((side) => styles[side]).find((style) => !['none', 'hidden'].includes(style)) || 'solid');
    styleInput.closest('.inspector-field')?.refreshFromPanel?.();
    BORDER_SIDES.filter((side) => off(side) && !targets.includes(side)).forEach((side) => {
      hidden[side].dataset.previousValue = 'medium';
      setSide(side, '0px', 'change');
    });
  };
  const field = (icon, label, properties, read, write) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = label;
    shell.dataset.properties = properties.join(' ');
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.innerHTML = icon;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', label);
    input.addEventListener('focus', () => input.select());
    shell.append(prefix, input);
    const show = attachUnitSelect(shell, input, LENGTH_UNITS, (value, type) => {
      if (value.trim()) write(value.trim(), type);
      if (type === 'change') sync();
      return read();
    });
    return { shell, prefix, show, read };
  };
  // All sides, or the one side the menu picked; Custom shows the sides below
  // and here "Mixed", which a typed value turns back into All.
  const main = field(inspectorIcon(INSPECTOR_ICON_PATHS.borderWidth), 'Border width', BORDER_SIDES.map((side) => hidden[side].name), () => {
    if (mode === 'custom') return 'Mixed';
    return width(mode === 'all' ? 'Top' : mode);
  }, (value, type) => {
    if (mode === 'custom') mode = 'all';
    if (type === 'change' && !isZero(value)) drawStyle(mode === 'all' ? BORDER_SIDES : [mode]);
    BORDER_SIDES.forEach((side) => setSide(side, mode === 'all' || mode === side ? value : '0px', type));
  });
  const sides = document.createElement('div');
  sides.className = 'inspector-field is-wide inspector-border-sides';
  const sideFields = ['Left', 'Top', 'Right', 'Bottom'].map((side) => field(borderSideIcon(side), `Border ${side.toLowerCase()} width`, [hidden[side].name], () => width(side), (value, type) => {
    if (type === 'change' && !isZero(value)) drawStyle([side]);
    setSide(side, value, type);
  }));
  sides.append(...sideFields.map(({ shell }) => shell));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inspector-spacing-toggle';
  toggle.title = 'Border sides';
  toggle.setAttribute('aria-label', toggle.title);
  const MODE_ICONS = { custom: inspectorIcon(INSPECTOR_ICON_PATHS.borderSides.custom) };
  const sync = () => {
    [main, ...sideFields].forEach(({ show, read }) => show(read()));
    toggle.innerHTML = MODE_ICONS[mode] || borderSideIcon(mode);
    toggle.setAttribute('aria-pressed', String(mode !== 'all'));
    sides.hidden = mode !== 'custom';
  };
  // Switching keeps the width already drawn: the picked side's, else any
  // side's, else 1px.
  const pickMode = (next) => {
    const drawn = BORDER_SIDES.map(width).find((value) => !isZero(value));
    const value = (next !== 'all' && next !== 'custom' && !isZero(width(next)) ? width(next) : drawn) || '1px';
    mode = next;
    borderSidesCustom = next === 'custom';
    if (next !== 'custom') {
      drawStyle(next === 'all' ? BORDER_SIDES : [next]);
      BORDER_SIDES.forEach((side) => setSide(side, next === 'all' || next === side ? value : '0px', 'change'));
    }
    sync();
  };
  inspectorMenu(toggle, control, () => ({
    compact: true,
    groups: [{
      items: ['all', 'Top', 'Bottom', 'Left', 'Right'].map((key) => ({
        icon: borderSideIcon(key),
        text: key === 'all' ? 'All' : key,
        checked: mode === key,
        pick: () => pickMode(key)
      }))
    }, {
      items: [{ icon: MODE_ICONS.custom, text: 'Custom', checked: mode === 'custom', pick: () => pickMode('custom') }]
    }]
  }));
  control.append(main.shell, toggle, ...Object.values(hidden));
  sync();
  return [control, sides];
}

function updateLayoutFieldVisibility() {
  const valueOf = (property) => inspectorPanelFields.querySelector(`[data-property="${property}"]`)?.value;
  const display = valueOf('display');
  inspectorPanelFields.querySelector('.is-layout-note')?.refreshNote(display);
  const singleLine = display === 'flex' && valueOf('flexWrap') === 'nowrap';
  inspectorPanelFields.querySelectorAll('[data-layout-for]').forEach((field) => {
    let applies = field.dataset.layoutFor === display || (field.dataset.layoutFor === 'flex-grid' && ['flex', 'grid'].includes(display));
    // align-content spreads lines; one flex line that doesn't wrap has none.
    if (applies && singleLine && field.matches('[data-layout-for="flex"]') && field.querySelector('[data-property="alignContent"]')) applies = false;
    field.hidden = !applies;
  });
  markHiddenChangesInactive();
}

// A change whose layout field the panel hides doesn't go to the agent; it
// comes back with the field (Flex again, wrapping again).
function markHiddenChangesInactive() {
  const target = inspectorChangeTarget;
  if (!target) return;
  const shown = new Set();
  const hidden = new Set();
  const cssName = (input) => input.dataset.property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  // Hidden because it doesn't apply: a layout field for another display, or
  // a part a control marks irrelevant. Folded-away parts still count.
  inspectorPanelFields.querySelectorAll('[data-property]').forEach((input) => {
    const irrelevant = input.closest('[data-layout-for][hidden], [data-irrelevant="true"]');
    (irrelevant ? hidden : shown).add(cssName(input));
  });
  changeLog.forEach((change) => {
    if (change.selector !== target.selector
      || canonicalInspectorUrl(change.url) !== target.url
      || change.viewport.width !== target.width
      || change.viewport.height !== target.height) return;
    change.inactive = hidden.has(change.property) && !shown.has(change.property);
  });
  syncChangeUi();
}

// Clicks inside a preview are handled by its own document. A click anywhere in
// Studio around the previews is an explicit way to leave the current edit.
document.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('iframe, #inspector-panel, #code-panel, #comments-panel, #layers-panel, .mode-dock, .toolbar, #custom-dialog, .breadcrumbs')) return;
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
    loadPreviewFrame(iframe, targetUrl);
    waitForLocalPreview(card);
    iframe.addEventListener('load', () => {
      delete iframe.dataset.navigating;
      enableNavigationSync(card);
      // A reloaded page starts without the pick it was waiting for.
      if (capturePickCard === card) setCapturePicking(null);
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

  node.querySelector('.ruler-button').addEventListener('click', () => setRulersShown(card, !rulerState(card).shown));
  node.querySelector('.contrast-button').addEventListener('click', () => toggleLayoutContrast(card));
  // The popover closes itself on the press outside it, before this click:
  // a click that finds it open for this card closes it instead of reopening.
  const gridButton = node.querySelector('.grid-overlay-button');
  let gridDialogWasOpen = false;
  gridButton.addEventListener('pointerdown', () => { gridDialogWasOpen = gridDialogCard === card; });
  gridButton.addEventListener('click', () => {
    if (gridDialogWasOpen || gridDialogCard === card) {
      gridDialogWasOpen = false;
      gridDialog.hidePopover();
    } else openGridDialog(card);
  });
  node.querySelector('.solo-button').addEventListener('click', () => openSeparately(card, DEVICES[device.id]));
  node.querySelector('.capture-visible-button').addEventListener('click', () => saveCapture(card, 'visible'));
  node.querySelectorAll('.capture-full-button').forEach((button) => {
    button.addEventListener('click', () => saveCapture(card, 'full', { delay: Number(button.dataset.delay) || 0 }));
  });
  node.querySelector('.capture-element-button').addEventListener('click', () => startElementCapture(card));
  node.querySelector('.capture-actions > summary').addEventListener('click', (event) => {
    if (card.querySelector('.capture-actions').getAttribute('aria-busy') === 'true') event.preventDefault();
  });
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
      loadPreviewFrame(iframe, targetUrl);
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
  syncCommentMarkers();
  if (!commentsPanel.hidden) renderComments();
  syncCodeFrame();
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
  // Chrome swaps content scripts only when the extension itself reloads, so a
  // mismatch that survives one preview reload means an outdated inspector.js.
  card.dataset.inspectorOutdated = String(Number(event.data.inspectorProtocolVersion) !== INSPECTOR_PROTOCOL_VERSION);
  if (Number(event.data.inspectorProtocolVersion) !== INSPECTOR_PROTOCOL_VERSION && !card.dataset.inspectorProtocolReloaded) {
    card.dataset.inspectorProtocolReloaded = 'true';
    const iframe = card.querySelector('iframe');
    loadPreviewFrame(iframe, iframe.src);
    return;
  }
  card.dataset.previewReady = 'true';
  clearTimeout(card.previewReadyTimer);
  // Only the new document says it is ready, so what the frame reports from
  // now on is about it. Heavy pages fire load seconds later, and links
  // clicked meanwhile must not be ignored.
  delete card.querySelector('iframe').dataset.navigating;
  // A new document starts at the top and needs to be asked for its scroll.
  if (card.rulers) {
    card.rulers.scrollX = 0;
    card.rulers.scrollY = 0;
    if (card.rulers.shown) event.source.postMessage({ source: 'viewport-parade', type: 'watch-ruler-scroll', enabled: true }, '*');
    renderRulers(card);
  }
  if (inspectorModeActive) {
    event.source.postMessage({ source: 'viewport-parade', type: 'toggle-inspector', enabled: true }, '*');
  }
  enableNavigationSync(card);
  if (!layersFrame) setLayersFrame(event.source);
  // A fresh document has neither the comment picker nor markers, whatever
  // was sent to the one it replaced.
  commentPickerFrames.delete(card.querySelector('iframe'));
  if (!commentsPanel.hidden) setCommentPicker(true);
  card.commentMarkersPayload = '';
  card.replayedCommentId = null;
  cardMarkerStatuses.delete(card);
  syncCommentMarkers();
  reconcilePendingChanges(card);
  applyRecordedChanges(card);
  // A new document in the Code panel's preview: its code is read afresh.
  if (!codePanel.hidden && event.source === codeFrame) {
    codeNodes.clear();
    codeBodyIndex = null;
    codeSelectedKey = null;
    postToCode({ type: 'code-watch', enabled: true });
    loadCodeNodes();
    renderCodeContext();
    if (codeView === 'css') requestCodeStyles();
    else codeSheets = null;
  }
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'studio-shortcut') return;
  const isPreview = [...document.querySelectorAll('.viewport-card iframe')].some((iframe) => iframe.contentWindow === event.source);
  const shortcut = String(event.data.shortcut || '').toLowerCase();
  if (isPreview && shortcut === 'escape') {
    if (placingCommentId) setCommentPlacing(null);
  } else if (isPreview && ['i', 'c', 'l', 'v', 'e', 'shift+r', 'shift+g', 'shift+c'].includes(shortcut)) handleStudioShortcut(shortcut);
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
  selectedLayerText = Number.isInteger(event.data.textIndex) ? event.data.textIndex : null;
  revealCodeSelection(event.data.path);
  breadcrumbAncestors = Array.isArray(event.data.ancestors) ? event.data.ancestors : [];
  breadcrumbChildren = Array.isArray(event.data.children) ? event.data.children : [];
  renderBreadcrumbs();
  expandLayerAncestors(selectedLayerPath);
  if (!layersPanel.hidden) renderLayersTree();
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'navigate-preview') return;
  const preview = [...document.querySelectorAll('.viewport-card iframe')].find((iframe) => iframe.contentWindow === event.source);
  if (preview && !preview.dataset.navigating) openPreviewUrl(event.data.url, true);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'capture-element-picked') return;
  const card = cardForFrame(event.source);
  if (!card || card !== capturePickCard || !event.data.element) return;
  setCapturePicking(null);
  // The page the element is on, as the preview shows it now (client-side
  // routing does not reload the preview).
  let url = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
  try { if (event.data.route) url = canonicalInspectorUrl(new URL(event.data.route, url).href); } catch { /* Keep the card's page. */ }
  saveCapture(card, 'element', {
    url,
    target: { element: event.data.element },
    steps: Array.isArray(event.data.steps) ? event.data.steps : []
  });
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'capture-element-cancelled') return;
  if (capturePickCard && cardForFrame(event.source) === capturePickCard) cancelElementCapture();
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !capturePickCard) return;
  event.preventDefault();
  cancelElementCapture();
});

// A click in one preview is repeated in the others; each finds the same
// control on its own and skips it if the page there is another page.
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'mirror-click') return;
  const sourceCard = cardForFrame(event.source);
  if (!sourceCard) return;
  const { path, element, expanded, open, checked } = event.data;
  document.querySelectorAll('.viewport-card').forEach((card) => {
    if (card === sourceCard) return;
    card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'mirror-click', path, element, expanded, open, checked }, '*');
  });
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
    ...placeOfCard(card),
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
  const snapshot = typeof event.data.snapshot?.html === 'string' ? event.data.snapshot : null;
  if (placingCommentId && !commentsPanel.hidden) {
    moveComment(placingCommentId, card, { element: event.data.element, route: event.data.route || '/', steps: event.data.steps, snapshot });
    clearInspectorSelections();
    return;
  }
  clearOtherInspectorSelections(event.source);
  commentSelection = { frame: card.querySelector('iframe'), element: event.data.element, route: event.data.route || '/', steps: Array.isArray(event.data.steps) ? event.data.steps : [], snapshot };
  if (!commentsPanel.hidden) renderComments();
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'comment-markers-status') return;
  const card = cardForFrame(event.source);
  if (!card || !Array.isArray(event.data.statuses)) return;
  cardMarkerStatuses.set(card, new Map(event.data.statuses.map(({ id, state }) => [id, state])));
  const pendingState = pendingFocusCommentId && cardMarkerStatuses.get(card).get(pendingFocusCommentId);
  if (['placed', 'approx'].includes(pendingState)) {
    event.source.postMessage({ source: 'viewport-parade', type: 'comment-marker-focus', id: pendingFocusCommentId }, '*');
    pendingFocusCommentId = null;
  } else if (pendingState === 'other-view' && card.replayedCommentId !== pendingFocusCommentId) {
    // Opened the page for a comment on one of its tabs: switch to it too.
    card.replayedCommentId = pendingFocusCommentId;
    event.source.postMessage({ source: 'viewport-parade', type: 'comment-replay-steps', id: pendingFocusCommentId }, '*');
  }
  if (!commentsPanel.hidden) renderComments();
});

// An older comment turned up after the user switched a tab or opened a
// popup: it keeps those steps, so the export and the list can reach it.
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'comment-steps-learned') return;
  const card = cardForFrame(event.source);
  const comment = commentById(event.data.id);
  if (!card || !comment || comment.steps?.length || !commentShownOnCard(comment, card)) return;
  if (!Array.isArray(event.data.steps) || !event.data.steps.length) return;
  comment.steps = event.data.steps;
  saveComments();
  syncCommentMarkers();
  if (!commentsPanel.hidden) renderComments();
  speak(`Comment ${comments.indexOf(comment) + 1} now remembers the “${viewStepsLabel(comment.steps)}” view.`);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'comment-marker-activated') return;
  if (!cardForFrame(event.source) || commentsPanel.hidden) return;
  selectComment(event.data.id, { reveal: true });
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'comment-marker-moved') return;
  const card = cardForFrame(event.source);
  if (!card || commentsPanel.hidden) return;
  moveComment(event.data.id, card, { element: event.data.element, pin: event.data.pin, route: event.data.route, offset: event.data.offset, same: Boolean(event.data.same), steps: event.data.steps });
  commentsList.querySelector(`[data-comment-id="${event.data.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-editor-close') return;
  if (inspectorFrame?.contentWindow === event.source) {
    hideInspectorPanel();
    selectedLayerPath = undefined;
    if (!layersPanel.hidden) renderLayersTree();
  }
});

// The unit sits at the end of the field as its own select, the way the weight
// name does: "2" + "em". A hidden input carries the joined CSS value through
// the usual pipeline; values that aren't number + unit (var(), calc(),
// normal) stay whole in the field and the unit select steps aside.
const LENGTH_UNITS = ['px', 'pt', 'em', 'rem', 'ch', 'ex', 'vw', 'vh', 'vmin', 'vmax', 'svh', 'lvh', 'dvh'];
// Line height also takes a bare multiplier of the font size ("1.5") and %.
const LINE_HEIGHT_UNITS = ['', '%', ...LENGTH_UNITS];
// Sizes are often a share of the parent as well.
const SIZE_UNITS = ['px', '%', ...LENGTH_UNITS.slice(1)];

function lengthUnitControl(shell, input, units) {
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = input.name;
  hidden.dataset.property = input.dataset.property;
  hidden.value = input.value;
  hidden.dataset.previousValue = input.dataset.previousValue;
  input.removeAttribute('name');
  delete input.dataset.property;
  delete input.dataset.previousValue;
  const show = attachUnitSelect(shell, input, units, (value, type) => {
    hidden.value = value;
    hidden.dispatchEvent(new Event(type, { bubbles: true }));
    return hidden.value;
  });
  show(hidden.value);
  // Lets a control that sets the value itself refresh the field.
  hidden.showValue = show;
  return hidden;
}

// Splits a value into the field's number and a unit select at its end.
// send(value, type) gets the joined CSS value and returns the value to show
// once editing is done; the returned show() puts a value back in the field.
function attachUnitSelect(shell, input, units, send) {
  const unitSelect = document.createElement('select');
  unitSelect.className = 'inspector-unit-select';
  unitSelect.setAttribute('aria-label', 'Unit');
  units.forEach((unit) => unitSelect.add(new Option(unit || '×', unit)));
  const bareUnit = units.includes('') ? '' : 'px';
  const split = (text) => String(text).trim().match(/^([-+]?\d*\.?\d+)\s*([a-z]+|%)?$/i);
  const show = (value) => {
    const match = split(value);
    unitSelect.hidden = !match;
    if (!match) {
      input.value = value;
      return;
    }
    const unit = (match[2] || bareUnit).toLowerCase();
    if (![...unitSelect.options].some((option) => option.value === unit)) unitSelect.add(new Option(unit));
    unitSelect.value = unit;
    input.value = match[1];
  };
  const compose = () => {
    const match = split(input.value);
    return match ? `${match[1]}${(match[2] ?? unitSelect.value).toLowerCase()}` : input.value.trim();
  };
  input.addEventListener('input', () => send(compose(), 'input'));
  input.addEventListener('change', () => show(send(compose(), 'change')));
  unitSelect.addEventListener('change', () => show(send(compose(), 'change')));
  shell.append(unitSelect);
  return show;
}

// "2 em" is how people type a length but not valid CSS; join number and unit.
function normalizeCssLength(value) {
  return value.replace(/^\s*([-+]?\d*\.?\d+)\s+([a-z]+|%)\s*$/i, (match, number, unit) => `${number}${unit.toLowerCase()}`);
}

function sendInspectorFieldChange(event) {
  const input = event.target.closest('input[data-property], select[data-property]');
  if (!input || !inspectorFrame?.contentWindow) return;
  const value = CSS_LENGTH_FIELDS.has(input.dataset.property) ? normalizeCssLength(input.value) : input.value;
  // Rewrite the field only once editing is done, so the caret stays put while typing.
  if (event.type === 'change') input.value = value;
  const previousValue = input.dataset.previousValue ?? '';
  if (event.type === 'change' && value === previousValue) return;
  inspectorFrame.contentWindow.postMessage({
    source: 'viewport-parade',
    type: 'inspector-editor-input',
    property: input.dataset.property,
    value,
    previousValue
  }, '*');
  input.dataset.previousValue = value;
  const changed = changedInspectorProperties.get(inspectorChangeKey) || new Set();
  changedInspectorProperties.set(inspectorChangeKey, changed);
  // align-items backs both the flex alignment control and the grid's Align
  // items field: keep every copy on the same value, then let controls that
  // draw from panel values redraw.
  inspectorPanelFields.querySelectorAll(`[data-property="${input.dataset.property}"]`).forEach((other) => {
    if (other === input) return;
    if (other instanceof HTMLSelectElement && ![...other.options].some((option) => option.value === value)) other.add(new Option(value, value));
    other.value = value;
    other.dataset.previousValue = value;
    other.showValue?.(value);
  });
  // An emptied field drops the override, which is the same as a reset.
  if (value.trim()) {
    changed.add(input.dataset.property);
    markInspectorFieldChanged(input.dataset.property);
  } else {
    changed.delete(input.dataset.property);
    unmarkInspectorFieldChanged(input.dataset.property);
  }
  inspectorPanelFields.querySelectorAll('.inspector-syncs').forEach((control) => {
    if (!control.contains(input)) control.refreshFromPanel();
  });
  if (['display', 'flexDirection', 'flexWrap'].includes(input.dataset.property)) updateLayoutFieldVisibility();
  else markHiddenChangesInactive();
}

// A changed value gets a blue dot right after it, on what shows it: the side
// or corner field of a split control, otherwise the field's own box. The
// dot resets the value to what the page declares.
function markInspectorFieldChanged(property) {
  const shells = [...inspectorPanelFields.querySelectorAll(`[data-properties~="${property}"]`)];
  const fields = new Set([...inspectorPanelFields.querySelectorAll(`[data-property="${property}"]`)].map((input) => input.closest('.inspector-field')));
  const hosts = [...shells];
  fields.forEach((field) => {
    if (!field || shells.some((shell) => field.contains(shell))) return;
    const box = field.querySelector('.inspector-input-shell, .inspector-color-shell, .inspector-tabs, :scope > input:not([type="hidden"]), :scope > select');
    if (box) hosts.push(box.matches('input, select') ? field : box);
  });
  hosts.forEach((host) => {
    if (host.querySelector(':scope > .inspector-change-dot')) return;
    const properties = host.dataset.properties
      ? host.dataset.properties.split(' ')
      : [...host.closest('.inspector-field').querySelectorAll('[data-property]')].map((input) => input.dataset.property);
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'inspector-change-dot';
    dot.title = 'Reset to the page value';
    dot.setAttribute('aria-label', dot.title);
    dot.addEventListener('pointerdown', (event) => event.preventDefault());
    dot.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetInspectorProperties(properties);
    });
    host.classList.add('has-change-dot');
    host.append(dot);
    changeDotResizeObserver.observe(host);
    placeChangeDot(dot);
  });
}

function unmarkInspectorFieldChanged(property) {
  const changed = changedInspectorProperties.get(inspectorChangeKey);
  inspectorPanelFields.querySelectorAll('.inspector-change-dot').forEach((dot) => {
    const host = dot.parentElement;
    const properties = host.dataset.properties
      ? host.dataset.properties.split(' ')
      : [...host.closest('.inspector-field').querySelectorAll('[data-property]')].map((input) => input.dataset.property);
    if (!properties.includes(property) || properties.some((other) => changed?.has(other))) return;
    host.classList.remove('has-change-dot');
    dot.remove();
  });
}

const changeDotMeasure = document.createElement('canvas').getContext('2d');
// The line box centre sits below the middle of digits and capitals; move the
// dot onto that middle so it lines up with the value, not the box.
function changeDotLift(style) {
  changeDotMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const font = changeDotMeasure.measureText('0');
  return (font.fontBoundingBoxAscent - font.fontBoundingBoxDescent) / 2 - (font.actualBoundingBoxAscent - font.actualBoundingBoxDescent) / 2;
}

function placeChangeDot(dot) {
  const host = dot.parentElement;
  if (!host) return;
  const hostBox = host.getBoundingClientRect();
  const tab = host.querySelector('.inspector-tab[aria-pressed="true"]');
  if (tab) {
    const tabBox = tab.getBoundingClientRect();
    const content = document.createRange();
    content.selectNodeContents(tab);
    const lift = tab.classList.contains('is-icon') ? 0 : changeDotLift(getComputedStyle(tab));
    dot.style.left = `${Math.min(content.getBoundingClientRect().right + 7, tabBox.right - 5) - hostBox.left}px`;
    dot.style.top = `${tabBox.top + tabBox.height / 2 + lift - hostBox.top}px`;
    return;
  }
  const target = host.querySelector('input:not([type="hidden"]):not([type="color"]), select:not(.inspector-unit-select), .inspector-menu-value');
  if (!target) return;
  const style = getComputedStyle(target);
  const text = target instanceof HTMLSelectElement ? target.selectedOptions[0]?.text || '' : target.value ?? target.textContent;
  const lift = changeDotLift(style);
  const box = target.getBoundingClientRect();
  const start = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
  const end = box.right - parseFloat(style.paddingRight) - 3;
  dot.style.left = `${Math.min(start + changeDotMeasure.measureText(text).width + 7, end) - hostBox.left}px`;
  dot.style.top = `${box.top + box.height / 2 + lift - hostBox.top}px`;
}

const placeChangeDots = () => inspectorPanelFields.querySelectorAll('.inspector-change-dot').forEach(placeChangeDot);
const changeDotResizeObserver = new ResizeObserver(placeChangeDots);
['input', 'change'].forEach((type) => inspectorPanelFields.addEventListener(type, () => requestAnimationFrame(placeChangeDots)));

// Removing the override brings back the page's own value; the panel is then
// rebuilt from the page so every control shows it.
function resetInspectorProperties(properties) {
  const frame = inspectorFrame?.contentWindow;
  const changed = changedInspectorProperties.get(inspectorChangeKey);
  if (!frame || !changed) return;
  properties.filter((property) => changed.has(property)).forEach((property) => {
    const input = inspectorPanelFields.querySelector(`[data-property="${property}"]`);
    frame.postMessage({ source: 'viewport-parade', type: 'inspector-editor-input', property, value: '', previousValue: input?.value ?? '' }, '*');
    changed.delete(property);
    unmarkInspectorFieldChanged(property);
  });
  if (selectedLayerPath !== undefined) {
    frame.postMessage({ source: 'viewport-parade', type: 'layers-select', path: layerPathArray(selectedLayerPath) }, '*');
  }
}

inspectorPanelFields.addEventListener('input', sendInspectorFieldChange);
inspectorPanelFields.addEventListener('change', sendInspectorFieldChange);

// The panel's sections, State included.
function inspectorGroups() {
  return [...inspectorPanelFields.querySelectorAll('.inspector-group')].filter((group) => group.setCollapsed);
}

// Leaves the first open section open and folds the others.
function focusInspectorGroups() {
  const open = inspectorGroups().filter((group) => !group.classList.contains('is-collapsed'));
  open.slice(1).forEach((group) => group.setCollapsed(true));
}

inspectorMenu(inspectorPanelMore, inspectorPanelMore.parentElement, () => {
  const groups = inspectorGroups();
  const collapsed = groups.filter((group) => group.classList.contains('is-collapsed'));
  return {
    compact: true,
    groups: [{
      items: [
        // Several open sections are what focus mode rules out.
        { icon: inspectorIcon(INSPECTOR_ICON_PATHS.sections.expand), text: 'Expand all', disabled: inspectorFocusMode || !collapsed.length, pick: () => groups.forEach((group) => group.setCollapsed(false)) },
        { icon: inspectorIcon(INSPECTOR_ICON_PATHS.sections.collapse), text: 'Collapse all', disabled: collapsed.length === groups.length, pick: () => groups.forEach((group) => group.setCollapsed(true)) }
      ]
    }, {
      items: [{
        icon: inspectorIcon(INSPECTOR_ICON_PATHS.sections.focus),
        text: 'Focus mode',
        checked: inspectorFocusMode,
        pick: () => {
          inspectorFocusMode = !inspectorFocusMode;
          try { localStorage.setItem(INSPECTOR_FOCUS_KEY, String(inspectorFocusMode)); } catch { /* Not remembered. */ }
          if (inspectorFocusMode) focusInspectorGroups();
        }
      }]
    }]
  };
});

inspectorPanelClose.addEventListener('click', () => {
  clearInspectorSelections();
  hideInspectorPanel();
});

// Escape lets go of the selected element, as closing the panel does. Open
// menus and in-place editors handle Escape first and stop it.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || inspectorPanel.hidden || customDialog.matches(':popover-open') || workspaceDialog.matches(':popover-open')) return;
  if (inspectorPanel.contains(document.activeElement)) document.activeElement.blur();
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
commentAttachButton.addEventListener('click', () => {
  delete commentAttachInput.dataset.commentId;
  commentAttachInput.click();
});
// One file input serves the new comment and, via its menu, an existing one.
commentAttachInput.addEventListener('change', () => {
  const files = [...(commentAttachInput.files || [])];
  const { commentId: targetId } = commentAttachInput.dataset;
  commentAttachInput.value = '';
  delete commentAttachInput.dataset.commentId;
  if (!files.length) return;
  if (targetId) attachToComment(targetId, files);
  else attachToDraft(files);
});
commentDraftAttachments.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  const index = Number(button?.dataset.index);
  if (!draftAttachments[index]) return;
  if (button.dataset.action === 'open-image') {
    openImageViewer(draftAttachments, index);
  } else if (button.dataset.action === 'remove-image') {
    forgetAttachments(draftAttachments.splice(index, 1));
    renderDraftAttachments();
    commentInput.focus();
  }
});
// A pasted image goes to the comment being written, or being edited.
commentsPanel.addEventListener('paste', (event) => {
  const files = imageFilesFrom(event.clipboardData);
  if (!files.length) return;
  if (event.target === commentInput) {
    event.preventDefault();
    attachToDraft(files);
  } else if (event.target.classList?.contains('comment-edit-input') && editingCommentId) {
    event.preventDefault();
    attachToComment(editingCommentId, files);
  }
});
// Images dropped on the form go to the new comment; dropped on a comment,
// they are added to it.
let commentDropTarget = null;
function setCommentDropTarget(target) {
  if (commentDropTarget === target) return;
  commentDropTarget?.classList.remove('is-drop-target');
  commentDropTarget = target;
  commentDropTarget?.classList.add('is-drop-target');
}
function commentDropTargetFor(event) {
  if (![...(event.dataTransfer?.types || [])].includes('Files')) return null;
  return event.target.closest?.('.comments-form, .comment-item') || null;
}
commentsPanel.addEventListener('dragover', (event) => {
  if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
  // Anywhere else in the panel a drop must not open the file in the tab.
  event.preventDefault();
  const target = commentDropTargetFor(event);
  event.dataTransfer.dropEffect = target ? 'copy' : 'none';
  setCommentDropTarget(target);
});
commentsPanel.addEventListener('dragleave', (event) => {
  if (!commentsPanel.contains(event.relatedTarget)) setCommentDropTarget(null);
});
commentsPanel.addEventListener('drop', (event) => {
  const target = commentDropTargetFor(event);
  setCommentDropTarget(null);
  if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
  event.preventDefault();
  const files = imageFilesFrom(event.dataTransfer);
  if (!target || !files.length) return;
  if (target.classList.contains('comments-form')) attachToDraft(files);
  else attachToComment(target.dataset.commentId, files);
});
imageViewerPrev.addEventListener('click', () => showImageViewerItem(imageViewerIndex - 1));
imageViewerNext.addEventListener('click', () => showImageViewerItem(imageViewerIndex + 1));
document.querySelector('#image-viewer-close').addEventListener('click', () => imageViewer.close());
// A click on the dimmed backdrop, not on the image or its controls, closes it.
imageViewer.addEventListener('click', (event) => {
  if (event.target === imageViewer || event.target.id === 'image-viewer-stage') imageViewer.close();
});
imageViewer.addEventListener('keydown', (event) => {
  // Studio shortcuts and Escape handlers behind the preview stay out of it;
  // the dialog still closes itself on Escape.
  event.stopPropagation();
  if (event.key === 'ArrowLeft' && imageViewerItems.length > 1) showImageViewerItem(imageViewerIndex - 1);
  else if (event.key === 'ArrowRight' && imageViewerItems.length > 1) showImageViewerItem(imageViewerIndex + 1);
});
imageViewer.addEventListener('close', () => {
  imageViewerItems = [];
  imageViewerImage.removeAttribute('src');
});

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
    case 'shift+r':
      toggleAllRulers();
      break;
    case 'shift+g':
      toggleAllLayoutContrast();
      break;
    case 'shift+c':
      toggleAllGridOverlays();
      break;
    case 'e':
      setCodeOpen(codePanel.hidden);
      break;
    default:
      break;
  }
}

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)) return;
  const shortcut = (event.shiftKey && ({ KeyR: 'shift+r', KeyG: 'shift+g', KeyC: 'shift+c' })[event.code])
    || ({ KeyI: 'i', KeyC: 'c', KeyL: 'l', KeyV: 'v', KeyE: 'e' })[event.code];
  if (!shortcut) return;
  event.preventDefault();
  handleStudioShortcut(shortcut);
});

// A click on the title toggles the group like the rest of the row, but a
// double click renames it instead — so the single-click toggle waits a beat
// to see whether a second click is on its way.
let groupTitleClickTimer = null;

function toggleCommentGroup(groupKey) {
  const group = commentGroups().find((candidate) => candidate.key === groupKey);
  if (group) commentGroupExpanded.set(groupKey, !isCommentGroupExpanded(group));
  renderComments();
}

commentsList.addEventListener('click', (event) => {
  const groupKey = event.target.closest('.comment-group')?.dataset.groupKey;
  if (groupKey && event.target.closest('.comment-group-toggle')) {
    toggleCommentGroup(groupKey);
    return;
  }
  if (groupKey && event.target.closest('[data-action="rename-group"]')) {
    clearTimeout(groupTitleClickTimer);
    groupTitleClickTimer = setTimeout(() => toggleCommentGroup(groupKey), 250);
    return;
  }
  const item = event.target.closest('.comment-item');
  const id = item?.dataset.commentId;
  const comment = id && commentById(id);
  if (!comment) return;
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'menu') {
    openCommentMenuId = openCommentMenuId === id ? null : id;
    renderComments();
    return;
  }
  if (openCommentMenuId) {
    openCommentMenuId = null;
    if (!action) {
      renderComments();
      return;
    }
  }
  if (action === 'edit') {
    startCommentEdit(id);
    return;
  }
  if (action === 'open-image') {
    openImageViewer(commentAttachments(comment), Number(event.target.closest('[data-index]').dataset.index));
    return;
  }
  if (action === 'remove-image') {
    removeCommentAttachment(id, Number(event.target.closest('[data-index]').dataset.index));
    return;
  }
  if (action === 'add-image') {
    commentAttachInput.dataset.commentId = id;
    commentAttachInput.click();
    return;
  }
  if (action === 'edit-save') {
    saveCommentEdit();
    return;
  }
  if (action === 'edit-cancel') {
    stopCommentEdit();
    return;
  }
  // Clicks inside the editor are for the text, not for selecting the comment.
  if (event.target.closest('.comment-edit')) return;
  if (action === 'delete') {
    if (editingCommentId === id) editingCommentId = null;
    comments.splice(comments.indexOf(comment), 1);
    forgetAttachments(commentAttachments(comment));
    if (selectedCommentId === id) selectedCommentId = null;
    if (placingCommentId === id) placingCommentId = null;
    if (pendingFocusCommentId === id) pendingFocusCommentId = null;
    if (expandedCommentId === id) expandedCommentId = null;
    saveComments();
    renderComments();
    syncChangeUi();
    syncCommentMarkers();
    notify('Comment removed from the pending handoff.');
    return;
  }
  if (action === 'move') {
    setCommentPlacing(id);
    return;
  }
  const placement = commentPlacement(comment);
  if (placement === 'other-view') {
    // Switch the preview to the tab the comment was left in, then focus it.
    selectedCommentId = id;
    pendingFocusCommentId = id;
    document.querySelectorAll('.viewport-card').forEach((card) => {
      if (!commentShownOnCard(comment, card)) return;
      // Once per document: the status that follows must not replay again.
      card.replayedCommentId = id;
      card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'comment-replay-steps', id }, '*');
    });
    renderComments();
    syncCommentMarkers();
    return;
  }
  if (placement === 'other-page' || placement === 'other-viewport') {
    // Bring up the comment's page and width; its marker is focused once
    // that preview reports it.
    selectedCommentId = id;
    pendingFocusCommentId = id;
    if (placement === 'other-page') openPreviewUrl(comment.url, true);
    if (canonicalInspectorUrl(targetUrl) !== canonicalInspectorUrl(comment.url)) {
      pendingFocusCommentId = null;
    } else if (![...document.querySelectorAll('.viewport-card')].some((card) => commentShownOnCard(comment, card))) {
      showCommentViewport(comment);
    }
    renderComments();
    return;
  }
  // Selecting the card also expands its text past the three-line clamp;
  // opening one collapses whichever other one was open.
  expandedCommentId = expandedCommentId === id ? null : id;
  selectComment(id, { focus: true });
});
function startCommentEdit(id) {
  const comment = commentById(id);
  if (!comment) return;
  editingCommentId = id;
  editingCommentDraft = comment.comment;
  if (placingCommentId) placingCommentId = null;
  renderComments();
  const editor = commentsList.querySelector('.comment-edit-input');
  editor?.focus();
  editor?.setSelectionRange(editor.value.length, editor.value.length);
}

function stopCommentEdit() {
  editingCommentId = null;
  editingCommentDraft = '';
  renderComments();
}

function saveCommentEdit() {
  const comment = editingCommentId && commentById(editingCommentId);
  const text = editingCommentDraft.trim();
  if (!comment || (!text && !commentAttachments(comment).length)) return;
  const changed = comment.comment !== text;
  comment.comment = text;
  editingCommentId = null;
  editingCommentDraft = '';
  if (changed) saveComments();
  renderComments();
  syncCommentMarkers();
  if (changed) notify(`Comment ${comments.indexOf(comment) + 1} updated.`, 'success');
}

function startGroupTitleEdit(url) {
  editingGroupTitleUrl = url;
  editingGroupTitleDraft = commentGroupLabel(url);
  renderComments();
  const input = commentsList.querySelector('.comment-group-title-input');
  input?.focus();
  input?.select();
}

function stopGroupTitleEdit() {
  editingGroupTitleUrl = null;
  editingGroupTitleDraft = '';
  renderComments();
}

function saveGroupTitleEdit() {
  const url = editingGroupTitleUrl;
  if (!url) return;
  const text = editingGroupTitleDraft.trim();
  editingGroupTitleUrl = null;
  editingGroupTitleDraft = '';
  // Typing back the real name (or clearing the field) just drops the override.
  setPageTitleOverride(url, text === commentGroupRealLabel(url) ? '' : text);
  renderComments();
}

commentsList.addEventListener('dblclick', (event) => {
  const titleEl = event.target.closest('[data-action="rename-group"]');
  if (!titleEl) return;
  clearTimeout(groupTitleClickTimer);
  const groupKey = titleEl.closest('.comment-group')?.dataset.groupKey;
  const group = groupKey && commentGroups().find((candidate) => candidate.key === groupKey);
  if (group) startGroupTitleEdit(group.url);
});
commentsList.addEventListener('input', (event) => {
  if (!event.target.classList.contains('comment-group-title-input')) return;
  editingGroupTitleDraft = event.target.value;
});
commentsList.addEventListener('keydown', (event) => {
  if (!event.target.classList.contains('comment-group-title-input')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    stopGroupTitleEdit();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    saveGroupTitleEdit();
  }
});
commentsList.addEventListener('focusout', (event) => {
  if (!event.target.classList.contains('comment-group-title-input')) return;
  saveGroupTitleEdit();
});

commentsList.addEventListener('input', (event) => {
  if (!event.target.classList.contains('comment-edit-input')) return;
  editingCommentDraft = event.target.value;
  const save = event.target.closest('.comment-edit')?.querySelector('[data-action="edit-save"]');
  if (save) save.disabled = !editingCommentDraft.trim() && !commentAttachments(commentById(editingCommentId)).length;
});
commentsList.addEventListener('keydown', (event) => {
  if (!event.target.classList.contains('comment-edit-input')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    stopCommentEdit();
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    saveCommentEdit();
  }
});
// Adds a preview at the comment's width, reusing a device of that width or
// making a custom one. In single-viewport mode the one preview switches.
function showCommentViewport(comment) {
  const { width, height } = comment.viewport;
  // A comment from another workspace opens that workspace.
  const workspace = workspaceOf(comment);
  if (workspace && WORKSPACES.indexOf(workspace) !== activeWorkspace
    && workspaceViewports(workspace).some((viewport) => sameViewportSize(viewport, comment.viewport))) {
    applyWorkspace(workspace);
    return;
  }
  let id = Object.keys(DEVICES).find((key) => DEVICES[key].width === width);
  if (!id) {
    id = `custom-${++customDeviceCount}`;
    DEVICES[id] = { name: 'Custom', width, height };
  }
  if (mode === 'single') {
    selected = new Set([id]);
    singleWidth = width;
  } else {
    selected.add(id);
  }
  render();
  speak(`Opened the ${width} px viewport.`);
}

// A click anywhere outside the open menu closes it.
document.addEventListener('pointerdown', (event) => {
  if (!openCommentMenuId || (event.target instanceof Element && event.target.closest('.comment-menu, .comment-more'))) return;
  openCommentMenuId = null;
  renderComments();
}, true);
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || (!placingCommentId && !openCommentMenuId)) return;
  event.preventDefault();
  if (openCommentMenuId) {
    openCommentMenuId = null;
    renderComments();
  } else {
    setCommentPlacing(null);
  }
});
function setCommentsMenuOpen(open) {
  commentsMenuOpen = open;
  commentsMenu.hidden = !open;
  commentsMenuToggle.setAttribute('aria-expanded', String(open));
}

function deleteAllComments() {
  if (!comments.length) return;
  const count = comments.length;
  if (!window.confirm(`Delete all ${count} comment${count === 1 ? '' : 's'} on every page?\n\nThis cannot be undone.`)) return;
  forgetAttachments(comments.flatMap(commentAttachments));
  comments.splice(0);
  selectedCommentId = null;
  placingCommentId = null;
  pendingFocusCommentId = null;
  openCommentMenuId = null;
  editingCommentId = null;
  saveComments();
  renderComments();
  syncChangeUi();
  syncCommentMarkers();
  notify(`${count} comment${count === 1 ? '' : 's'} deleted.`);
}

commentsMenuToggle.addEventListener('click', () => setCommentsMenuOpen(!commentsMenuOpen));
document.addEventListener('pointerdown', (event) => {
  if (commentsMenuOpen && !(event.target instanceof Element && event.target.closest('#comments-menu, #comments-menu-toggle'))) setCommentsMenuOpen(false);
}, true);
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !commentsMenuOpen) return;
  event.preventDefault();
  setCommentsMenuOpen(false);
  commentsMenuToggle.focus();
});
commentsMenuDeleteAll.addEventListener('click', () => {
  setCommentsMenuOpen(false);
  deleteAllComments();
});
commentsImportButton.addEventListener('click', () => {
  setCommentsMenuOpen(false);
  commentsImportInput.click();
});
commentsImportInput.addEventListener('change', async () => {
  const [file] = commentsImportInput.files || [];
  commentsImportInput.value = '';
  if (!file) return;
  commentsMenuToggle.disabled = true;
  try {
    await importReviewFile(file);
  } catch (error) {
    notify(`Review was not imported: ${error.message}`, 'error');
  } finally {
    commentsMenuToggle.disabled = false;
  }
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
  if (event.target.closest('.layers-select')) selectLayer(item.dataset.path, layerTextIndex(item));
});
// The text a Layers row stands for, or null for an element row.
const layerTextIndex = (item) => (item.dataset.textIndex === undefined ? null : Number(item.dataset.textIndex));
layersTree.addEventListener('pointerover', (event) => {
  const item = event.target.closest('.layers-node');
  if (item) hoverLayer(item.dataset.path, layerTextIndex(item));
});
layersTree.addEventListener('pointerleave', () => hoverLayer(null));
layersTree.addEventListener('focusin', (event) => {
  const item = event.target.closest('.layers-node');
  if (item) hoverLayer(item.dataset.path, layerTextIndex(item));
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
// The dialog sits under the + button, centred on it, and follows it while
// the window is resized; it stays inside the window.
function workspaceViewports(workspace) {
  return workspace.viewports.map((viewport) => (viewport.device ? STOCK_DEVICES[viewport.device] : viewport));
}

// Site breakpoints: the width media queries in the open page's CSS, read the
// way the Code panel reads it (linked files from other origins included).
// Every query marks where styles switch; one preview opens per range between
// switches, at the range's first width, and one below the first switch.
// "(min-width: 768px)" and "(max-width: 767.98px)" are the same switch, 768.
const SITE_BREAKPOINTS_PLACEHOLDER = [375, 768, 1024, 1440].map((width) => breakpointViewport('', width));
const SITE_BREAKPOINTS_LIMIT = 16;

function mediaWidthSwitches(query) {
  const px = (value, unit) => Number(value) * (/r?em/i.test(unit) ? 16 : 1);
  // "Below b" switches at b, "b and below" just after b.
  const upTo = (value, inclusive) => (inclusive ? Math.floor(value) + 1 : Math.ceil(value));
  const from = (value, inclusive) => (inclusive ? Math.ceil(value) : Math.floor(value) + 1);
  const switches = [];
  String(query).split(',').forEach((part) => {
    if (/^\s*(only\s+)?print\b/i.test(part) || /^\s*not\b/i.test(part)) return;
    for (const match of part.matchAll(/\(\s*(min|max)-width\s*:\s*([\d.]+)(px|r?em)\s*\)/gi)) {
      const value = px(match[2], match[3]);
      switches.push(match[1].toLowerCase() === 'min' ? from(value, true) : upTo(value, true));
    }
    // Range syntax: (width >= 768px), (400px < width <= 900px).
    for (const match of part.matchAll(/\(([^()]*\bwidth\b[^()]*)\)/gi)) {
      const tokens = match[1].match(/[\d.]+(?:px|r?em)|<=|>=|<|>|\bwidth\b/gi) || [];
      const at = tokens.findIndex((token) => token.toLowerCase() === 'width');
      if (at < 0 || /-width/i.test(match[1])) continue;
      const side = (operator, value, widthOnLeft) => {
        const [, number, unit] = value.match(/([\d.]+)(px|r?em)/i);
        const limit = px(number, unit);
        const below = widthOnLeft ? operator.startsWith('<') : operator.startsWith('>');
        switches.push(below ? upTo(limit, operator.includes('=')) : from(limit, operator.includes('=')));
      };
      if (tokens[at + 1] && tokens[at + 2]) side(tokens[at + 1], tokens[at + 2], true);
      if (at >= 2) side(tokens[at - 1], tokens[at - 2], false);
    }
  });
  return switches;
}

// Queries come from the page's loaded rules; stylesheets it cannot read come
// as text.
function siteBreakpointViewports({ queries: loaded = [], texts = [] }) {
  const queries = [...loaded];
  texts.forEach((text) => {
    const css = String(text || '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/@media\s+([^{;]+)\{/gi)) queries.push(match[1]);
    for (const match of css.matchAll(/@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')\s*([^;]*);/gi)) if (match[1].trim()) queries.push(match[1]);
  });
  // Switches a pixel apart ("max-width: 768px" beside "min-width: 768px")
  // are one breakpoint written off by one, not a layout of its own.
  const switches = [...new Set(queries.flatMap(mediaWidthSwitches))]
    .filter((width) => width >= 200 && width <= 3840)
    .sort((left, right) => left - right)
    .filter((width, index, all) => index === 0 || width - all[index - 1] > 1);
  if (!switches.length) return { switches, viewports: [] };
  const viewports = [];
  if (switches[0] - 1 >= 200) viewports.push(breakpointViewport(`Up to ${switches[0] - 1}`, Math.max(200, Math.min(375, switches[0] - 1))));
  switches.forEach((width, index) => {
    const next = switches[index + 1];
    viewports.push(breakpointViewport(next ? `${width}–${next - 1}` : `${width}+`, width));
  });
  return { switches, viewports: viewports.slice(0, SITE_BREAKPOINTS_LIMIT) };
}

let siteBreakpointsRequest = null;

function detectSiteBreakpoints(workspace) {
  const frame = [...document.querySelectorAll('.viewport-card')]
    .find((card) => card.dataset.previewReady === 'true')?.querySelector('iframe');
  if (!frame?.contentWindow) {
    notify('Open a page and wait for its preview to load, then choose Site breakpoints.', 'error');
    return;
  }
  const requestId = String(Date.now());
  const done = (styles) => {
    if (siteBreakpointsRequest?.requestId !== requestId) return;
    clearTimeout(siteBreakpointsRequest.timer);
    siteBreakpointsRequest = null;
    renderWorkspaces();
    if (!styles) {
      notify('The preview did not answer. Refresh the preview and try again.', 'error');
      return;
    }
    const { switches, viewports } = siteBreakpointViewports(styles);
    if (!viewports.length) {
      notify('No width breakpoints were found in this page’s CSS.', 'error');
      return;
    }
    workspace.viewports = viewports;
    applyWorkspace(workspace);
    notify(`Breakpoints in this page’s CSS: ${switches.join(', ')} px.`, 'success');
  };
  siteBreakpointsRequest = { requestId, frame: frame.contentWindow, done, timer: setTimeout(() => done(null), 15000) };
  renderWorkspaces();
  frame.contentWindow.postMessage({ source: 'viewport-parade', type: 'breakpoints-request', requestId }, '*');
}

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'breakpoints-styles') return;
  if (!siteBreakpointsRequest || event.source !== siteBreakpointsRequest.frame || event.data.requestId !== siteBreakpointsRequest.requestId) return;
  siteBreakpointsRequest.done({
    queries: Array.isArray(event.data.queries) ? event.data.queries.map(String) : [],
    texts: Array.isArray(event.data.texts) ? event.data.texts.map(String) : []
  });
});

// Each pane in proportion to its size, scaled so the whole set fits the card.
function workspacePreview(workspace) {
  const viewports = workspaceViewports(workspace).length ? workspaceViewports(workspace) : SITE_BREAKPOINTS_PLACEHOLDER;
  const gap = 3;
  const room = { width: 140, height: 50 };
  const totalWidth = viewports.reduce((sum, viewport) => sum + viewport.width, 0);
  const tallest = Math.max(...viewports.map((viewport) => viewport.height));
  const scale = Math.min((room.width - gap * (viewports.length - 1)) / totalWidth, room.height / tallest);
  const preview = document.createElement('span');
  preview.className = 'workspace-preview';
  preview.setAttribute('aria-hidden', 'true');
  viewports.forEach((viewport) => {
    const pane = document.createElement('i');
    pane.style.width = `${Math.max(2, Math.round(viewport.width * scale))}px`;
    pane.style.height = `${Math.max(2, Math.round(viewport.height * scale))}px`;
    preview.append(pane);
  });
  return preview;
}

function workspaceChanges(workspace) {
  return [...changeLog.values()].filter((change) => workspaceOf(change) === workspace);
}

// The blue dot on a workspace drops every style change made in it, as the
// dot next to an inspector field does for one property.
function resetWorkspaceChanges(workspace) {
  const changes = workspaceChanges(workspace);
  changes.forEach((change) => changeLog.delete(changeKey(change)));
  document.querySelectorAll('.viewport-card').forEach((card) => {
    const pageUrl = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
    const size = { width: Number(card.dataset.viewportWidth), height: Number(card.dataset.viewportHeight) };
    const shown = changes.filter((change) => canonicalInspectorUrl(change.url) === pageUrl && sameViewportSize(change.viewport, size));
    if (!shown.length) return;
    card.querySelector('iframe')?.contentWindow?.postMessage({
      source: 'viewport-parade',
      type: 'reset-recorded-changes',
      changes: shown.map((change) => ({ selector: change.selector, property: change.property }))
    }, '*');
  });
  if (!inspectorPanel.hidden) {
    clearInspectorSelections();
    hideInspectorPanel();
  }
  syncChangeUi();
  renderWorkspaces();
  notify(`Style changes in ${workspace.name} reset.`, 'success');
}

function renderWorkspaces() {
  workspaceList.replaceChildren(...WORKSPACES.map((workspace, index) => {
    const item = document.createElement('div');
    item.className = 'workspace-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'workspace-option';
    button.dataset.workspace = String(index);
    button.setAttribute('aria-pressed', String(index === activeWorkspace));
    button.title = workspace.detected
      ? ['Finds the width breakpoints in this page’s CSS and opens a preview for each.', ...workspaceViewports(workspace).map(({ name, width, height }) => `${name} · ${width} × ${height}`)].join('\n')
      : workspaceViewports(workspace).map(({ name, width, height }) => `${name} · ${width} × ${height}`).join('\n');
    const name = document.createElement('span');
    name.className = 'workspace-name';
    const searching = workspace.detected && siteBreakpointsRequest;
    name.textContent = searching ? 'Reading CSS…' : workspace.name;
    if (searching) button.setAttribute('aria-busy', 'true');
    button.append(workspacePreview(workspace), name);
    item.append(button);
    if (workspaceChanges(workspace).length) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'inspector-change-dot workspace-change-dot';
      dot.dataset.workspace = String(index);
      dot.title = `Reset style changes in ${workspace.name}`;
      dot.setAttribute('aria-label', dot.title);
      item.append(dot);
    }
    return item;
  }));
}

function applyWorkspace(workspace) {
  const ids = workspace.viewports.map((viewport) => {
    if (viewport.device) {
      DEVICES[viewport.device] = { ...STOCK_DEVICES[viewport.device] };
      return viewport.device;
    }
    const id = `workspace-${viewport.width}x${viewport.height}`;
    DEVICES[id] = { name: viewport.name, width: viewport.width, height: viewport.height };
    return id;
  });
  Object.keys(DEVICES).forEach((id) => {
    if (!ids.includes(id)) delete DEVICES[id];
  });
  activeWorkspace = WORKSPACES.indexOf(workspace);
  selected = new Set(ids);
  mode = 'multi';
  workspaceDialog.hidePopover();
  render();
  speak(`Preset ${workspace.name}: ${ids.length} viewports.`);
}

function placeWorkspaceDialog() {
  if (!workspaceDialog.matches(':popover-open')) return;
  const trigger = workspaceTrigger.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = workspaceDialog;
  workspaceDialog.style.left = `${Math.max(12, Math.min(trigger.left + trigger.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
  workspaceDialog.style.top = `${Math.max(12, Math.min(trigger.bottom + 8, window.innerHeight - height - 12))}px`;
}
window.addEventListener('resize', placeWorkspaceDialog);
workspaceTrigger.addEventListener('click', () => {
  renderWorkspaces();
  workspaceDialog.showPopover();
  placeWorkspaceDialog();
  requestAnimationFrame(() => (workspaceList.querySelector('[aria-pressed="true"]') || workspaceList.firstElementChild)?.focus());
});
workspaceDialog.querySelector('.dialog-close').addEventListener('click', () => workspaceDialog.hidePopover());
workspaceList.addEventListener('click', (event) => {
  const dot = event.target.closest('.workspace-change-dot');
  if (dot) {
    resetWorkspaceChanges(WORKSPACES[Number(dot.dataset.workspace)]);
    return;
  }
  const button = event.target.closest('.workspace-option');
  if (!button) return;
  const workspace = WORKSPACES[Number(button.dataset.workspace)];
  if (workspace.detected) detectSiteBreakpoints(workspace);
  else applyWorkspace(workspace);
});

// Light or dark studio, remembered across sessions (theme.js applies it
// before the first paint). Previews keep the site's own colours.
const themeToggle = document.querySelector('#theme-toggle');

function syncThemeToggle() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.dataset.tooltip = dark ? 'Light theme' : 'Dark theme';
}

function setTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('pixelprism-theme', theme); } catch { /* Not remembered. */ }
  syncThemeToggle();
  // Rulers are drawn on canvases and take the theme's colours when redrawn.
  document.querySelectorAll('.viewport-card').forEach((card) => renderRulers(card));
  speak(theme === 'dark' ? 'Dark theme.' : 'Light theme.');
}

syncThemeToggle();
themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

const helpDialog = document.querySelector('#help-dialog');
const helpTrigger = document.querySelector('#help-trigger');

function placeHelpDialog() {
  if (!helpDialog.matches(':popover-open')) return;
  const trigger = helpTrigger.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = helpDialog;
  helpDialog.style.left = `${Math.max(12, Math.min(trigger.left + trigger.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
  helpDialog.style.top = `${Math.max(12, Math.min(trigger.bottom + 8, window.innerHeight - height - 12))}px`;
}
window.addEventListener('resize', placeHelpDialog);
// The trigger opens and closes the popover itself (popovertarget).
helpDialog.addEventListener('toggle', (event) => {
  if (event.newState === 'open') placeHelpDialog();
});
helpDialog.querySelector('.dialog-close').addEventListener('click', () => helpDialog.hidePopover());

function placeCustomDialog() {
  if (!customDialog.matches(':popover-open')) return;
  const trigger = customTrigger.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = customDialog;
  customDialog.style.left = `${Math.max(12, Math.min(trigger.left + trigger.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
  customDialog.style.top = `${Math.max(12, Math.min(trigger.bottom + 8, window.innerHeight - height - 12))}px`;
}
window.addEventListener('resize', placeCustomDialog);
// The cards look like the Presets ones. A size card adds that viewport at
// once; the Custom card holds its own width and height fields.
function renderCustomSizes() {
  const option = (name, title, preview) => {
    const item = document.createElement('div');
    item.className = 'workspace-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'workspace-option';
    if (title) button.title = title;
    const label = document.createElement('span');
    label.className = 'workspace-name';
    label.textContent = name;
    button.append(preview, label);
    item.append(button);
    return { item, button };
  };
  const icon = (markup) => {
    const preview = document.createElement('span');
    preview.className = 'workspace-preview is-icon';
    preview.setAttribute('aria-hidden', 'true');
    preview.innerHTML = markup;
    return preview;
  };
  // A screen with its resolution's badge on it.
  const monitor = (badge) => `<svg class="workspace-icon-monitor" viewBox="0 0 64 48"><rect x="4" y="3" width="56" height="33" rx="3"/><path d="M32 36v6M22 44h20"/><text x="32" y="20">${badge}</text></svg>`;
  customSizeList.replaceChildren(...CUSTOM_PRESETS.map((preset, index) => {
    const { item, button } = option(`${preset.name} · ${preset.width} × ${preset.height}`, '', icon(monitor(preset.badge)));
    button.dataset.size = String(index);
    return item;
  }), customForm);
}

function addViewport(name, width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < MIN_VIEWPORT_WIDTH || height < MIN_VIEWPORT_HEIGHT) {
    notify(`Minimum viewport size is ${MIN_VIEWPORT_WIDTH} × ${MIN_VIEWPORT_HEIGHT}px.`, 'error');
    return;
  }
  const id = `custom-${++customDeviceCount}`;
  DEVICES[id] = { name, width, height };
  selected.add(id);
  if (selected.size > 1) mode = 'multi';
  customDialog.hidePopover();
  speak(`Added viewport: ${width} × ${height} pixels.`);
  render();
}

customTrigger.addEventListener('click', () => {
  renderCustomSizes();
  customDialog.showPopover();
  placeCustomDialog();
  requestAnimationFrame(() => customSizeList.querySelector('.workspace-option')?.focus());
});
customSizeList.addEventListener('click', (event) => {
  const button = event.target.closest('button.workspace-option');
  if (!button) return;
  const preset = CUSTOM_PRESETS[Number(button.dataset.size)];
  addViewport(preset.name, preset.width, preset.height);
});
customDialog.querySelector('.dialog-close').addEventListener('click', () => customDialog.hidePopover());
// A click on the Custom card around its fields goes to the width.
customForm.addEventListener('click', (event) => {
  if (!event.target.closest('input, button, label')) customWidth.focus();
});
customForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(customForm);
  addViewport('Custom', Math.round(Number(formData.get('width'))), Math.round(Number(formData.get('height'))));
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
restoreComments();
restoreChanges();
syncChangeUi();
checkFileSchemeAccess();
pruneAttachments();
pruneViewSnapshots();
