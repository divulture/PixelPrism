// The box, spacing and gap overlays, the layout map and the layout-contrast layer drawn over the page.

const marginOverlay = document.createElement('div');
const paddingOverlay = document.createElement('div');
const contentOverlay = document.createElement('div');
// The margin / padding band as four strips: top and bottom span the full
// width, left and right sit between them, so the band can be filled and
// framed whatever sides it has. spacingEdge draws the band's inner edge.
// These come after the box overlays, so they paint above the grey outline.
const createStrips = () => [0, 1, 2, 3].map(() => document.createElement('div'));
const marginStrips = createStrips();
const paddingStrips = createStrips();
const spacingEdge = document.createElement('div');
const gutterLayer = document.createElement('div');
const layoutMap = document.createElement('div');
const label = document.createElement('div');
// The layout mode greys the page out through one layer that filters what
// lies under it. A filter on the page's own elements would turn them into
// the containing block of every position:fixed descendant, so drawers,
// sidebars and modals would open relative to the page, off screen.
const contrastStyle = document.createElement('style');
const contrastLayer = document.createElement('div');
const hideOverlays = () => {
  [marginOverlay, paddingOverlay, contentOverlay, ...marginStrips, ...paddingStrips, spacingEdge, gutterLayer].forEach((overlay) => { overlay.style.display = 'none'; });
  gutterLayer.replaceChildren();
  window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-editor-close' }, extensionOrigin);
  selectedElement = undefined;
  highlightedZone = undefined;
};
const clearSelection = () => {
  pinned = false;
  hideOverlays();
  selectedTextNode = null;
  unwrapUnusedText();
  releaseForcedState();
  inspectorState = 'default';
};
const clearHover = () => {
  // Selection is persistent: moving into the Studio Inspector must not make
  // the pinned element lose its visual outline and spacing overlay.
  if (selectedElement) {
    show(selectedElement);
    return;
  }
  pinned = false;
  hideOverlays();
};
let mapParent = layoutMap;
const mapBox = (left, top, width, height, style) => {
  if (width < 1 || height < 1) return;
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(width)}px;height:${Math.round(height)}px;box-sizing:border-box;${style}`;
  mapParent.append(box);
};
// A fixed element that is on top where it stands: a drawer, a modal, a
// fixed header. Hit-testing its visible middle tells it from a fixed
// background that sits under the page.
const isTopLayer = (element, box) => {
  const x = (Math.max(box.left, 0) + Math.min(box.right, innerWidth)) / 2;
  const y = (Math.max(box.top, 0) + Math.min(box.bottom, innerHeight)) / 2;
  const hit = document.elementFromPoint(x, y);
  return Boolean(hit && element.contains(hit));
};
// A layer covers an element's outline when it is not part of that layer
// and is what shows where the two overlap: a panel over the page covers the
// page, while a fixed page shell under a panel does not cover the panel.
const coversOutline = (layer, element, outer) => {
  if (layer.element.contains(element)) return false;
  const left = Math.max(layer.box.left, outer.left, 0);
  const right = Math.min(layer.box.right, outer.right, innerWidth);
  const top = Math.max(layer.box.top, outer.top, 0);
  const bottom = Math.min(layer.box.bottom, outer.bottom, innerHeight);
  if (right <= left || bottom <= top) return false;
  const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
  return Boolean(hit && layer.element.contains(hit));
};
// Outlines of an element are cut out wherever a top layer covers it, so a
// panel opened over the page stays over the page's outlines too. Each hole
// is its own nested clip, so overlapping layers still subtract cleanly.
const clipGroups = new Map();
const clipGroup = (holes) => {
  const key = holes.map((hole) => hole.index).join(',');
  if (clipGroups.has(key)) return clipGroups.get(key);
  let parent = layoutMap;
  holes.forEach(({ box }) => {
    const wrap = document.createElement('div');
    const [l, t, r, b] = [box.left, box.top, box.right, box.bottom].map(Math.round);
    wrap.style.cssText = `position:absolute;inset:0;clip-path:path(evenodd,'M-10 -10H${innerWidth + 10}V${innerHeight + 10}H-10Z M${l} ${t}H${r}V${b}H${l}Z');`;
    parent.append(wrap);
    parent = wrap;
  });
  clipGroups.set(key, parent);
  return parent;
};
const renderLayoutMap = () => {
  layoutMap.replaceChildren();
  clipGroups.clear();
  layoutMap.style.display = layoutMode ? 'block' : 'none';
  if (!layoutMode) return;
  const layers = [];
  const candidates = [...document.body.querySelectorAll('*')]
    .filter((element) => {
      const box = element.getBoundingClientRect();
      if (box.width < 24 || box.height < 24 || box.bottom < 0 || box.right < 0 || box.top > innerHeight || box.left > innerWidth) return false;
      const styles = getComputedStyle(element);
      if (styles.position === 'fixed' && styles.visibility !== 'hidden' && isTopLayer(element, box)) {
        layers.push({ element, box, index: layers.length });
      }
      const hasSpacing = number(styles.marginTop) || number(styles.marginRight) || number(styles.marginBottom) || number(styles.marginLeft)
        || number(styles.paddingTop) || number(styles.paddingRight) || number(styles.paddingBottom) || number(styles.paddingLeft)
        || number(styles.rowGap) || number(styles.columnGap);
      return hasSpacing && (element.children.length > 0 || styles.display.includes('flex') || styles.display.includes('grid'));
    })
    .sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)
    .slice(0, 140);
  candidates.forEach((element) => {
    const box = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const margin = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map((property) => number(styles[property]));
    const outer = { left: box.left - margin[3], top: box.top - margin[0], right: box.right + margin[1], bottom: box.bottom + margin[2] };
    mapParent = layoutMap;
    const holes = layers.filter((layer) => coversOutline(layer, element, outer));
    if (holes.length) mapParent = clipGroup(holes);
    const padding = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((property) => number(styles[property]));
    const border = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].map((property) => number(styles[property]));
    // The persistent layout map is deliberately monochrome. Colour is reserved
    // for the focused element, so its measurements remain immediately legible.
    mapBox(box.left - margin[3], box.top - margin[0], box.width + margin[1] + margin[3], box.height + margin[0] + margin[2], 'border:1px solid rgba(24,24,27,.42);background:rgba(24,24,27,.035);');
    mapBox(box.left + border[3], box.top + border[0], box.width - border[1] - border[3], box.height - border[0] - border[2], 'border:1px solid rgba(82,82,91,.4);background:rgba(82,82,91,.055);');
    mapBox(box.left + border[3] + padding[3], box.top + border[0] + padding[0], box.width - border[1] - border[3] - padding[1] - padding[3], box.height - border[0] - border[2] - padding[0] - padding[2], 'border:1px dashed rgba(113,113,122,.5);background:rgba(161,161,170,.07);');
    const columnGap = number(styles.columnGap);
    const rowGap = number(styles.rowGap);
    if ((columnGap || rowGap) && (styles.display.includes('flex') || styles.display.includes('grid'))) {
      const children = [...element.children].map((child) => child.getBoundingClientRect());
      children.forEach((first, index) => children.slice(index + 1).forEach((second) => {
        const verticalOverlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        const horizontalOverlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const horizontalGap = second.left - first.right;
        const verticalGap = second.top - first.bottom;
        const gutterStyle = 'background:repeating-linear-gradient(135deg,rgba(39,39,42,.24) 0 3px,rgba(161,161,170,.24) 3px 6px);outline:1px solid rgba(63,63,70,.45);';
        if (columnGap && horizontalGap > 0 && horizontalGap <= columnGap + 2 && verticalOverlap > 0) {
          mapBox(first.right, Math.max(first.top, second.top), horizontalGap, verticalOverlap, gutterStyle);
        }
        if (rowGap && verticalGap > 0 && verticalGap <= rowGap + 2 && horizontalOverlap > 0) {
          mapBox(Math.max(first.left, second.left), first.bottom, horizontalOverlap, verticalGap, gutterStyle);
        }
      }));
    }
  });
};
const scheduleLayoutMap = () => {
  if (!layoutMode || mapFrame) return;
  mapFrame = requestAnimationFrame(() => { mapFrame = undefined; renderLayoutMap(); });
};
// Panels and modals open without a scroll, so the map also follows changes
// in the page and the end of their slide-in transitions. Studio overlays
// live outside <body>, so drawing the map never triggers another round.
let mapTimer;
const scheduleLayoutMapSoon = () => {
  if (!layoutMode || mapTimer) return;
  mapTimer = setTimeout(() => { mapTimer = undefined; scheduleLayoutMap(); }, 120);
};
const number = (value) => Number.parseFloat(value) || 0;
const setRect = (overlay, left, top, width, height) => {
  overlay.style.display = 'block';
  overlay.style.left = `${Math.round(left)}px`;
  overlay.style.top = `${Math.round(top)}px`;
  overlay.style.width = `${Math.max(0, Math.round(width))}px`;
  overlay.style.height = `${Math.max(0, Math.round(height))}px`;
};
// Fill the band between an outer and an inner rect ([left, top, right,
// bottom]) and frame it in the edge colour: each strip frames its sides on
// the outer boundary, spacingEdge the inner boundary wherever the band is.
const drawStrips = (strips, [ol, ot, or, ob], [il, it, ir, ib], fill, edge) => {
  const rects = [[ol, ot, or - ol, it - ot], [ol, ib, or - ol, ob - ib], [ol, it, il - ol, ib - it], [ir, it, or - ir, ib - it]];
  strips.forEach((strip, index) => {
    const [x, y, width, height] = rects[index];
    if (width < 1 || height < 1) {
      strip.style.display = 'none';
      return;
    }
    setRect(strip, x, y, width, height);
    strip.style.background = fill;
    strip.style.borderColor = edge || 'transparent';
    const edgeWidth = (onBoundary) => (onBoundary ? '2px' : '0');
    strip.style.borderWidth = [edgeWidth(y <= ot), edgeWidth(x + width >= or), edgeWidth(y + height >= ob), edgeWidth(x <= ol)].join(' ');
  });
  // The inner edge sits just outside the inner rect, inside the band.
  const has = [it - ot >= 1, or - ir >= 1, ob - ib >= 1, il - ol >= 1];
  const grow = has.map((side) => (side ? 2 : 0));
  setRect(spacingEdge, il - grow[3], it - grow[0], ir - il + grow[1] + grow[3], ib - it + grow[0] + grow[2]);
  spacingEdge.style.borderColor = edge;
  spacingEdge.style.borderWidth = grow.map((width) => `${width}px`).join(' ');
};
const hideStrips = (strips) => strips.forEach((strip) => { strip.style.display = 'none'; });
const hideSpacing = () => {
  hideStrips(marginStrips);
  hideStrips(paddingStrips);
  spacingEdge.style.display = 'none';
};
// highlight: 'both', 'row', 'column' or nothing. Highlighted gutters take
// the spacing recipe (20% fill, 2px edge) in violet.
const drawGutters = (element, styles, highlight) => {
  gutterLayer.replaceChildren();
  gutterLayer.style.display = 'none';
  const columnGap = number(styles.columnGap);
  const rowGap = number(styles.rowGap);
  if ((!columnGap && !rowGap) || (!styles.display.includes('flex') && !styles.display.includes('grid'))) return;
  gutterLayer.style.display = 'block';
  const children = [...element.children].map((child) => child.getBoundingClientRect());
  const mark = (left, top, width, height, axis) => {
    if (width < 1 || height < 1) return;
    const gutter = document.createElement('div');
    const paint = highlight === 'both' || highlight === axis
      ? 'background:rgba(139,92,246,.2);border:2px solid #8b5cf6;'
      : 'background:repeating-linear-gradient(135deg,rgba(113,113,122,.22) 0 3px,rgba(161,161,170,.22) 3px 6px);outline:1px solid rgba(113,113,122,.45);';
    gutter.style.cssText = `position:fixed;left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(width)}px;height:${Math.round(height)}px;${paint}box-sizing:border-box;`;
    gutterLayer.append(gutter);
  };
  children.forEach((first, index) => children.slice(index + 1).forEach((second) => {
    const verticalOverlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
    const horizontalOverlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
    const horizontalGap = second.left - first.right;
    const verticalGap = second.top - first.bottom;
    if (columnGap && horizontalGap > 0 && horizontalGap <= columnGap + 2 && verticalOverlap > 0) {
      mark(first.right, Math.max(first.top, second.top), horizontalGap, verticalOverlap, 'column');
    }
    if (rowGap && verticalGap > 0 && verticalGap <= rowGap + 2 && horizontalOverlap > 0) {
      mark(Math.max(first.left, second.left), first.bottom, horizontalOverlap, verticalGap, 'row');
    }
  }));
};

// Puts this part into the page; install() calls it once, on Studio's first request.
const installOverlays = () => {
  contrastStyle.dataset.viewportParadeOverlay = '';
  contrastStyle.textContent = 'html[data-viewport-parade-layout-contrast] body { background: #fff !important; } [data-viewport-parade-contrast-layer] { display: none; } html[data-viewport-parade-layout-contrast] [data-viewport-parade-contrast-layer] { display: block; }';
  document.documentElement.append(contrastStyle);
  contrastLayer.setAttribute('aria-hidden', 'true');
  contrastLayer.dataset.viewportParadeOverlay = '';
  contrastLayer.dataset.viewportParadeContrastLayer = '';
  contrastLayer.style.cssText = 'position:fixed;inset:0;z-index:2147483644;pointer-events:none;-webkit-backdrop-filter:grayscale(1) contrast(.92);backdrop-filter:grayscale(1) contrast(.92);';
  document.documentElement.append(contrastLayer);
  [marginOverlay, paddingOverlay, contentOverlay, ...marginStrips, ...paddingStrips, spacingEdge, gutterLayer, layoutMap].forEach((overlay) => {
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.viewportParadeOverlay = '';
    overlay.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;display:none;box-sizing:border-box;';
    document.documentElement.append(overlay);
  });
  marginOverlay.style.cssText += 'border:1px solid rgba(82,82,91,.7);background:rgba(82,82,91,.05);';
  paddingOverlay.style.cssText += 'border:1px solid rgba(113,113,122,.7);background:rgba(113,113,122,.07);';
  contentOverlay.style.cssText += 'border:1px solid rgba(161,161,170,.75);background:rgba(161,161,170,.08);';
  [...marginStrips, ...paddingStrips, spacingEdge].forEach((strip) => { strip.style.cssText += 'border:0 solid transparent;'; });
  gutterLayer.style.cssText += 'z-index:2147483647;';
  layoutMap.style.cssText += 'z-index:2147483645;inset:0;';
  label.style.cssText = 'position:absolute;left:-2px;top:-57px;box-sizing:border-box;width:max-content;max-width:min(390px,calc(100vw - 16px));padding:5px 7px;border-radius:4px;background:#15181f;color:#fff;font:600 11px/1.3 Inter,ui-sans-serif,system-ui,sans-serif;white-space:pre-wrap;box-shadow:0 4px 12px rgba(0,0,0,.25);';
  marginOverlay.append(label);
  new MutationObserver(scheduleLayoutMapSoon).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
  document.addEventListener('transitionend', scheduleLayoutMapSoon, true);
  document.addEventListener('animationend', scheduleLayoutMapSoon, true);
};
