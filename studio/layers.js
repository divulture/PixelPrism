// The Layers panel and the breadcrumbs of the selected element.

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
  if (open) followSelectedCard();
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
  // The preview the tree comes from, as its device icon next to the title.
  layersViewport.hidden = !card;
  if (card) {
    const label = `${card.querySelector('.viewport-name').textContent} preview`;
    layersViewport.innerHTML = deviceIcon(deviceGlyph(card.dataset.device, Number(card.dataset.viewportWidth)));
    layersViewport.dataset.tooltip = label;
    layersViewport.setAttribute('aria-label', label);
  }
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
      crumb.setAttribute('aria-label', `${folded.length} more levels`);
      foldCrumb = crumb;
      items.push(crumb);
      return;
    }
    const key = layerPathKey(ancestor.path);
    // Breadcrumbs carry no tooltips: the crumb is its own label.
    crumb.textContent = ancestor.label;
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
  breadcrumbs.parentElement.scrollLeft = breadcrumbs.parentElement.scrollWidth;
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
