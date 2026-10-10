// Text nodes and the Layers tree.

const selectorFor = (element) => {
  const tag = element.tagName.toLowerCase();
  if (element.id) return `${tag}#${element.id}`;
  const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join('');
  return `${tag}${classes}`;
};
const layerPathFor = (element) => {
  const path = [];
  let current = element;
  while (current && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) return [];
    path.unshift([...parent.children].indexOf(current));
    current = parent;
  }
  return path;
};
const layerElementFor = (path) => Array.isArray(path)
  ? path.reduce((element, index) => element?.children[index], document.body)
  : undefined;
// Text beside child elements has no tag or class of its own. It can still be
// selected in Layers: the panel shows the values it takes from its parent,
// and the first edit wraps it in a span that takes the styles. A wrapper
// left with no changes comes off when the selection moves on; one with
// changes stays, and its changes tell the agent to add the span.
let selectedTextNode = null;
const TEXT_WRAPPER = 'viewportParadeText';
const isTextWrapper = (element) => element?.dataset?.[TEXT_WRAPPER] !== undefined;
const textWrapperSelector = (id) => `span[data-viewport-parade-text="${id}"]`;
const wrapTextNode = (node, id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`) => {
  const span = document.createElement('span');
  span.dataset[TEXT_WRAPPER] = id;
  node.before(span);
  span.append(node);
  return span;
};
const textWrapperHasChanges = (span) => {
  const selector = textWrapperSelector(span.dataset[TEXT_WRAPPER]);
  return editedTexts.has(span) || [layoutRules, typographyRules].some((rules) => [...rules.keys()].some((key) => key.startsWith(selector)));
};
const unwrapUnusedText = (keep) => {
  document.querySelectorAll('span[data-viewport-parade-text]').forEach((span) => {
    if (span === keep || textWrapperHasChanges(span)) return;
    const parent = span.parentNode;
    span.replaceWith(...span.childNodes);
    parent?.normalize();
  });
};
// A recorded change on wrapped text, after a reload: wrap the same text again.
const rewrapText = ({ id, parent, text }) => {
  if (!id || document.querySelector(textWrapperSelector(id))) return;
  let host;
  try { host = parent ? document.querySelector(parent) : null; } catch { host = null; }
  const wanted = String(text || '').replace(/\s+/g, ' ').trim().replace(/…$/, '');
  const node = host && wanted && [...host.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.replace(/\s+/g, ' ').trim().startsWith(wanted));
  if (node) wrapTextNode(node, id);
};
// From body down to the element, for Studio's breadcrumbs: tag plus id or
// first class, the way the Layers tree names elements.
const mediaFor = (element) => {
  if (element instanceof HTMLImageElement) {
    return { kind: 'image', src: element.currentSrc || element.src || '', naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight, alt: element.getAttribute('alt') };
  }
  if (element instanceof HTMLVideoElement) {
    return { kind: 'video', src: element.currentSrc || element.src || '', naturalWidth: element.videoWidth, naturalHeight: element.videoHeight };
  }
  return null;
};
const crumbFor = (element) => {
  const tag = element.tagName.toLowerCase();
  const name = element.id ? `#${element.id}` : element.classList[0] ? `.${element.classList[0]}` : '';
  return { path: layerPathFor(element), label: `${tag}${name}` };
};
const ancestorsFor = (element) => {
  const chain = [];
  for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
    chain.unshift(crumbFor(current));
    if (current === document.body) break;
  }
  return chain;
};
// Direct children worth selecting, for the breadcrumbs' step down.
const childrenFor = (element) => {
  const ignored = new Set(['script', 'style', 'meta', 'link', 'noscript', 'template']);
  return [...element.children]
    .filter((child) => !ignored.has(child.tagName.toLowerCase()) && child.dataset.viewportParadeOverlay === undefined)
    .map(crumbFor);
};
const layerTextOf = (text) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 72 ? `${clean.slice(0, 72)}…` : clean;
};
const layerTextFor = (element) => layerTextOf([...element.childNodes]
  .filter((node) => node.nodeType === Node.TEXT_NODE)
  .map((node) => node.textContent)
  .join(' '));
const layerNameFor = (element) => {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = [...element.classList].slice(0, 3).map((name) => `.${name}`).join('');
  const more = Math.max(0, element.classList.length - 3);
  return `${tag}${id}${classes}${more ? ` +${more}` : ''}`;
};
// What a layer is, for its icon in Studio: the element's role by tag, or
// text for an element that holds only text.
const layerKindFor = (element, textOnly) => {
  const tag = element.tagName.toLowerCase();
  if (tag === 'body') return 'body';
  if (['img', 'picture'].includes(tag)) return 'image';
  if (tag === 'svg' || tag === 'canvas') return 'vector';
  if (tag === 'video') return 'video';
  if (['iframe', 'embed', 'object'].includes(tag)) return 'embed';
  if (tag === 'button' || (tag === 'input' && ['submit', 'button', 'reset'].includes(element.type))) return 'button';
  if (tag === 'input' && ['checkbox', 'radio'].includes(element.type)) return 'checkbox';
  if (tag === 'input') return 'input';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'select') return 'select';
  if (tag === 'form') return 'form';
  if (tag === 'a') return 'link';
  if (['ul', 'ol', 'dl'].includes(tag)) return 'list';
  if (['li', 'dt', 'dd'].includes(tag)) return 'list-item';
  if (tag === 'table') return 'table';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (textOnly) return 'text';
  if (['main', 'section', 'article', 'aside', 'header', 'footer', 'nav'].includes(tag)) return 'section';
  return 'box';
};
// Children in page order. An element holding only text is one text layer;
// text beside child elements becomes text layers of its own, which select
// their parent.
const layerTreeFor = (element = document.body) => {
  const ignored = new Set(['script', 'style', 'meta', 'link', 'noscript', 'template']);
  const path = layerPathFor(element);
  const isLayer = (node) => node.nodeType === Node.ELEMENT_NODE && !ignored.has(node.tagName.toLowerCase()) && !node.dataset.viewportParadeOverlay;
  const elements = [...element.children].filter(isLayer);
  const text = layerTextFor(element);
  const name = layerNameFor(element);
  if (!elements.length) {
    // Wrapped text is still the text layer it was.
    if (isTextWrapper(element)) return { path, label: text, kind: 'text', textWrapper: true, children: [] };
    return { path, label: text ? `${name} · ${text}` : name, kind: layerKindFor(element, Boolean(text)), children: [] };
  }
  const children = [...element.childNodes].flatMap((node, textIndex) => {
    if (isLayer(node)) return [layerTreeFor(node)];
    if (node.nodeType !== Node.TEXT_NODE) return [];
    const label = layerTextOf(node.textContent);
    return label ? [{ path, label, kind: 'text', text: true, textIndex, children: [] }] : [];
  });
  return { path, label: name, kind: layerKindFor(element, false), children };
};
const sendLayersTree = () => window.parent.postMessage({
  source: 'viewport-parade', type: 'layers-tree', tree: layerTreeFor()
}, extensionOrigin);
const selectLayerElement = async (element, options = {}) => {
  if (!element) return;
  selectedTextNode = options.textNode?.parentNode === element ? options.textNode : null;
  unwrapUnusedText(element);
  // A selection always exposes the same complete editor. The hover hit test
  // can highlight a spacing zone, but it must never make properties disappear
  // from the right-hand panel. Pointer selection skips tiny inline text
  // wrappers so generated classes such as span.sc-interp do not become broad
  // "edit all" targets; the Layers panel can still select exact nodes.
  // Comments go on exactly what was clicked: a badge inside a menu link
  // must not be widened to the whole link, as CSS editing does.
  const componentTarget = options.exact || interactionMode === 'comment' ? element : selectionTargetFor(element);
  pinned = true;
  selectedElement = componentTarget;
  show(selectedElement, 'size');
  if (interactionMode === 'comment') {
    // Comments reuse the Inspector's hit testing and element-context logic,
    // but selecting a target must not expose the CSS editing panel.
  } else {
    typographySelector = undefined;
    // Choosing the same element again (to refresh the panel) keeps its state.
    const sameElement = forcedState?.element === componentTarget;
    if (!sameElement) {
      releaseForcedState();
      inspectorState = 'default';
    }
    baseComponentSelector = typographySelectorFor(componentTarget);
    componentSelector = `${baseComponentSelector}${STATE_SUFFIX[inspectorState] || ''}`;
    const [sheets] = await Promise.all([pageStyleSheets(), ensureAuthoredStylesheets()]);
    if (selectedElement !== componentTarget) return;
    if (!sameElement) selectedStates = statesFor(componentTarget, sheets);
    selectionViewSteps = viewStepsFor(componentTarget);
    populateEditor(selectedElement, 'component');
  }
  // A hover menu held open for a comment stays open while its items are picked.
  if (interactionMode === 'comment' && forcedState?.origin === 'comment' && forcedState.element !== componentTarget) releaseForcedState();
  postLayersSelected();
  reportSelectedElement();
};
const postLayersSelected = () => {
  const textIndex = selectedTextNode ? [...selectedElement.childNodes].indexOf(selectedTextNode) : -1;
  window.parent.postMessage({ source: 'viewport-parade', type: 'layers-selected', path: layerPathFor(selectedElement), ...(textIndex >= 0 ? { textIndex } : {}), ancestors: ancestorsFor(selectedElement), children: childrenFor(selectedElement) }, extensionOrigin);
};
// The first edit of selected text: wrap it, and edit the wrapper from here on.
const adoptTextWrapper = () => {
  const span = wrapTextNode(selectedTextNode);
  selectedTextNode = null;
  selectedElement = span;
  baseComponentSelector = typographySelectorFor(span);
  componentSelector = `${baseComponentSelector}${STATE_SUFFIX[inspectorState] || ''}`;
  postLayersSelected();
};
let layersRefreshTimer;

// Puts this part into the page; install() calls it once, on Studio's first request.
const installLayersRefresh = () => {
  new MutationObserver(() => {
    clearTimeout(layersRefreshTimer);
    layersRefreshTimer = setTimeout(sendLayersTree, 120);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
};
