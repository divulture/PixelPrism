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
// Text beside child elements (an h3 beside its icon and badge) has no tag or
// class of its own, and no settings of its own either: they live on the
// element that holds it, so a click, a hover or its Layers row select that
// element, and Layers shows no row for it. Only a double click wraps the text, in a span that is the field to
// type in (text-edit.js); its text change asks the agent to change that text
// where it stands, not to add an element. A wrapper left with no changes
// comes off when the selection moves on. Style changes that earlier versions
// recorded on such a span still apply to it and still reach the agent.
const TEXT_WRAPPER = 'viewportParadeText';
const isTextWrapper = (element) => element?.dataset?.[TEXT_WRAPPER] !== undefined;
const textWrapperSelector = (id) => `span[data-viewport-parade-text="${id}"]`;
const textHolderFor = (node) => (isTextWrapper(node) ? node.parentElement : node);
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
    if (span === keep || span === textEditing?.element || textWrapperHasChanges(span)) return;
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
// The element's ::before and ::after that draw now (content other than
// none), so decoration made of them can be found and selected in Layers.
const layerPseudosFor = (element) => Object.keys(PSEUDO_SUFFIX)
  .filter((pseudo) => hasPseudoContent(getComputedStyle(element, PSEUDO_SUFFIX[pseudo]).content));
// Child elements in page order. Text is not a layer of its own: it belongs
// to the element that holds it, whose row is its place. An element holding
// only text shows it in its label; text beside child elements is left out,
// and so is the temporary span a double click puts around it.
const layerTreeFor = (element = document.body) => {
  const ignored = new Set(['script', 'style', 'meta', 'link', 'noscript', 'template']);
  const path = layerPathFor(element);
  const isLayer = (node) => node.nodeType === Node.ELEMENT_NODE && !ignored.has(node.tagName.toLowerCase()) && !node.dataset.viewportParadeOverlay && !isTextWrapper(node);
  const elements = [...element.children].filter(isLayer);
  const text = layerTextFor(element);
  const name = layerNameFor(element);
  const pseudos = layerPseudosFor(element);
  // Turned off by display: none, for the eye on the row.
  const hidden = getComputedStyle(element).display === 'none';
  const hiddenPseudos = pseudos.filter((pseudo) => getComputedStyle(element, PSEUDO_SUFFIX[pseudo]).display === 'none');
  const node = { path, kind: layerKindFor(element, !elements.length && Boolean(text)), pseudos, hidden, hiddenPseudos };
  if (!elements.length) return { ...node, label: text ? `${name} · ${text}` : name, children: [] };
  return { ...node, label: name, children: elements.map((child) => layerTreeFor(child)) };
};
const sendLayersTree = () => window.parent.postMessage({
  source: 'viewport-parade', type: 'layers-tree', tree: layerTreeFor()
}, extensionOrigin);
// keepText: the text wrapper a double click is about to edit. pseudo: the
// ::before or ::after a Layers row chose ('' for the element itself); left
// out, a pseudo-element chosen on the same element stays.
const selectLayerElement = async (target, options = {}) => {
  if (!target) return;
  const element = textHolderFor(target);
  // A comment's area comes only with the drag that drew it.
  commentArea = options.area || null;
  if (!commentArea) hideCommentAreaBox();
  unwrapUnusedText(options.keepText);
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
  // Studio selects the same element again after each edit to refresh the
  // panel; the outline under the pointer stays unless it is the selection.
  if (hoverOutline.style.display !== 'none') showHoverOutline(hoveredElement);
  show(selectedElement, 'size');
  if (interactionMode === 'comment') {
    placeCommentArea();
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
    // ::before or ::after stays chosen while the same element is selected again.
    const samePseudoTarget = pseudoTarget === componentTarget;
    if (!samePseudoTarget) {
      inspectorPseudo = '';
      pseudoTarget = undefined;
    }
    baseComponentSelector = typographySelectorFor(componentTarget);
    componentSelector = editedComponentSelector();
    const [sheets] = await Promise.all([pageStyleSheets(), ensureAuthoredStylesheets()]);
    if (selectedElement !== componentTarget) return;
    if (!sameElement) selectedStates = statesFor(componentTarget, sheets);
    if (pseudoTarget !== componentTarget) {
      selectedPseudos = pseudosFor(componentTarget, sheets);
      pseudoTarget = componentTarget;
    }
    if (options.pseudo !== undefined) {
      inspectorPseudo = selectedPseudos.includes(options.pseudo) ? options.pseudo : '';
      componentSelector = editedComponentSelector();
    }
    selectionViewSteps = viewStepsFor(componentTarget);
    populateEditor(selectedElement, 'component');
  }
  // A hover menu held open for a comment stays open while its items are picked.
  if (interactionMode === 'comment' && forcedState?.origin === 'comment' && forcedState.element !== componentTarget) releaseForcedState();
  postLayersSelected();
  reportSelectedElement();
};
// The eye on a Layers row: the layer is selected and its Display set to None,
// the same edit as the Display control, so it is recorded and reaches the
// agent. Shown again, the edit is removed; a layer the page itself hides
// gets Display Block.
const setLayerHidden = async (path, pseudo, hidden) => {
  const element = layerElementFor(path);
  if (!element) return;
  await selectLayerElement(element, { exact: true, pseudo });
  if (selectedElement !== element || interactionMode === 'comment' || inspectorPseudo !== pseudo) return;
  const current = getComputedStyle(element, PSEUDO_SUFFIX[pseudo] || null).display;
  if (hidden) {
    if (current !== 'none') applyEditorValue('display', 'none', current, false);
  } else if (layoutRules.get(componentSelector)?.get('display') === 'none') {
    applyEditorValue('display', '', 'none', true);
  } else if (current === 'none') {
    applyEditorValue('display', 'block', 'none', false);
  }
  populateEditor(selectedElement, 'component');
};
const postLayersSelected = () => {
  window.parent.postMessage({ source: 'viewport-parade', type: 'layers-selected', path: layerPathFor(selectedElement), pseudo: inspectorPseudo, ancestors: ancestorsFor(selectedElement), children: childrenFor(selectedElement) }, extensionOrigin);
};
let layersRefreshTimer;

// Puts this part into the page; install() calls it once, on Studio's first request.
const installLayersRefresh = () => {
  new MutationObserver(() => {
    clearTimeout(layersRefreshTimer);
    layersRefreshTimer = setTimeout(sendLayersTree, 120);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
};
