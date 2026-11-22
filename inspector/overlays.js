// Element labels, box and spacing overlays, the layout map and its contrast layer.

const marginOverlay = document.createElement('div');
const paddingOverlay = document.createElement('div');
const contentOverlay = document.createElement('div');
// Four non-overlapping strips keep the content free of spacing fills.
const createStrips = () => [0, 1, 2, 3].map(() => document.createElement('div'));
const marginStrips = createStrips();
const paddingStrips = createStrips();
const spacingEdge = document.createElement('div');
const gutterLayer = document.createElement('div');
const spacingValues = document.createElement('div');
// Shared by spacing overlays and Alt measurements.
const formatMeasure = (value) => String(Math.round(value * 10) / 10);
const overlayValueTag = (layer, text, x, y, color) => {
  const node = document.createElement('div');
  node.style.cssText = `position:absolute;box-sizing:border-box;padding:3px 4px;border-radius:2px;background:${color};color:#fff;font:600 11px/1 Inter,ui-sans-serif,system-ui,sans-serif;white-space:nowrap;font-variant-numeric:tabular-nums;`;
  node.textContent = text;
  layer.append(node);
  const { clientWidth: width, clientHeight: height } = document.documentElement;
  node.style.left = `${Math.max(2, Math.min(width - node.offsetWidth - 2, x - node.offsetWidth / 2))}px`;
  node.style.top = `${Math.max(2, Math.min(height - node.offsetHeight - 2, y - node.offsetHeight / 2))}px`;
  return node;
};
// Only the visible part of a band gets a label; offscreen bands stay quiet.
const spacingValueTag = (left, top, width, height, value, color, layer = spacingValues) => {
  const right = Math.min(document.documentElement.clientWidth, left + width);
  const bottom = Math.min(document.documentElement.clientHeight, top + height);
  left = Math.max(0, left);
  top = Math.max(0, top);
  if (right <= left || bottom <= top) return;
  layer.style.display = 'block';
  overlayValueTag(layer, formatMeasure(value), (left + right) / 2, (top + bottom) / 2, color);
};
// Hover has its own spacing layer so the pinned selection stays visible.
const hoverOutline = document.createElement('div');
const hoverSpacing = document.createElement('div');
const layoutMap = document.createElement('div');
const label = document.createElement('div');
// Containers inherit fonts too; only an element holding rendered text gets type details.
const labelHasText = (element) => [...element.childNodes].some((node) => {
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return false;
  const range = document.createRange();
  range.selectNodeContents(node);
  return [...range.getClientRects()].some((rect) => rect.width > 0 && rect.height > 0);
});
const showElementLabel = (element, styles, box) => {
  if (textEditing) {
    label.style.display = 'none';
    return;
  }
  label.replaceChildren();
  label.style.display = 'block';
  const heading = document.createElement('div');
  heading.textContent = `${selectorFor(element)}  ${Math.round(box.width)} × ${Math.round(box.height)} px`;
  label.append(heading);
  if (active && interactionMode === 'edit' && !capturePickerActive && labelHasText(element) && styles.visibility === 'visible') {
    const details = document.createElement('div');
    details.dataset.viewportParadeTypography = '';
    details.style.cssText = 'font-weight:400;';
    const font = document.createElement('div');
    font.dataset.typographySection = 'font';
    font.style.cssText = 'margin-top:5px;padding-top:5px;border-top:1px solid #ffffff30;';
    const family = document.createElement('div');
    family.dataset.typographyProperty = 'fontFamily';
    family.textContent = styles.fontFamily;
    const specs = document.createElement('div');
    specs.dataset.typographySpecs = '';
    specs.style.cssText = 'display:flex;gap:10px;margin-top:4px;';
    [['fontSize', 'Size'], ['fontWeight', 'Weight'], ['lineHeight', 'LH']].forEach(([property, title]) => {
      const spec = document.createElement('span');
      spec.dataset.typographyProperty = property;
      spec.style.cssText = 'white-space:nowrap;';
      const name = document.createElement('span');
      name.style.color = '#b8bec9';
      name.textContent = `${title} `;
      spec.append(name, document.createTextNode(styles[property]));
      specs.append(spec);
    });
    font.append(family, specs);
    const color = document.createElement('div');
    color.dataset.typographySection = 'color';
    color.dataset.typographyProperty = 'color';
    color.style.cssText = 'display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin-top:5px;padding-top:5px;border-top:1px solid #ffffff30;';
    const colorName = document.createElement('span');
    colorName.textContent = 'Color';
    colorName.style.color = '#b8bec9';
    const colorValue = document.createElement('span');
    colorValue.style.cssText = 'min-width:0;overflow-wrap:anywhere;text-align:right;';
    let colorText = styles.color;
    const swatch = document.createElement('span');
    swatch.style.cssText = `display:inline-block;vertical-align:-1px;width:9px;height:9px;margin-right:4px;border:1px solid #ffffff60;border-radius:2px;background:${styles.color};`;
    colorValue.append(swatch, document.createTextNode(colorText));
    color.append(colorName, colorValue);
    details.append(font, color);
    label.append(details);
  }
  // Measure the whole card so a multiline token or font stack stays inside the preview.
  const left = box.left - number(styles.marginLeft);
  const top = box.top - number(styles.marginTop);
  const bottom = box.bottom + number(styles.marginBottom);
  const labelWidth = label.offsetWidth;
  const labelHeight = label.offsetHeight;
  label.style.left = `${Math.max(8, Math.min(innerWidth - labelWidth - 8, left))}px`;
  label.style.top = `${top - labelHeight - 6 >= 8
    ? top - labelHeight - 6
    : bottom + 6 + labelHeight <= innerHeight - 8 ? bottom + 6 : 8}px`;
};
// The layout mode greys the page out through one layer that filters what
// lies under it. A filter on the page's own elements would turn them into
// the containing block of every position:fixed descendant, so drawers,
// sidebars and modals would open relative to the page, off screen.
const contrastStyle = document.createElement('style');
const contrastLayer = document.createElement('div');
const hideOverlays = () => {
  [marginOverlay, paddingOverlay, contentOverlay, ...marginStrips, ...paddingStrips, spacingEdge, gutterLayer, spacingValues, hoverOutline, hoverSpacing, label].forEach((overlay) => { overlay.style.display = 'none'; });
  gutterLayer.replaceChildren();
  spacingValues.replaceChildren();
  window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-editor-close' }, extensionOrigin);
  selectedElement = undefined;
  highlightedZone = undefined;
};
const clearSelection = () => {
  pinned = false;
  commentArea = null;
  hideCommentAreaBox();
  hideOverlays();
  unwrapUnusedText();
  releaseForcedState();
  inspectorState = 'default';
  inspectorPseudo = '';
  pseudoTarget = undefined;
};
const clearHover = () => {
  // Selection is persistent: moving into the Studio Inspector must not make
  // the pinned element lose its visual outline and spacing overlay.
  if (selectedElement) {
    hoverOutline.style.display = 'none';
    hoverSpacing.style.display = 'none';
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
// The outline of the element the pointer is over beside the selection; none
// on the selection itself.
const showHoverOutline = (target) => {
  hoverSpacing.replaceChildren();
  hoverSpacing.style.display = 'none';
  if (!target || target === selectedElement || target.closest?.('[data-viewport-parade-overlay]')) {
    hoverOutline.style.display = 'none';
    if (target && target === selectedElement) showElementLabel(target, getComputedStyle(target), target.getBoundingClientRect());
    return;
  }
  const box = target.getBoundingClientRect();
  setRect(hoverOutline, box.left, box.top, box.width, box.height);
  const styles = getComputedStyle(target);
  showElementLabel(target, styles, box);
  const sides = (prefix, suffix = '') => ['Top', 'Right', 'Bottom', 'Left'].map((side) => number(styles[`${prefix}${side}${suffix}`]));
  const margin = sides('margin');
  const padding = sides('padding');
  const border = sides('border', 'Width');
  const band = (x, y, width, height, value, color, fill) => {
    if (width <= 0 || height <= 0 || value <= 0) return;
    const strip = document.createElement('div');
    strip.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${width}px;height:${height}px;background:${fill};`;
    hoverSpacing.append(strip);
    spacingValueTag(x, y, width, height, value, color, hoverSpacing);
  };
  const bands = (outer, inner, values, color, fill) => {
    const [l, t, r, b] = outer;
    const [il, it, ir, ib] = inner;
    [[l, t, r-l, it-t, values[0]], [l, ib, r-l, b-ib, values[2]], [l, it, il-l, ib-it, values[3]], [ir, it, r-ir, ib-it, values[1]]]
      .forEach((rect) => band(...rect, color, fill));
  };
  const inner = [box.left + border[3], box.top + border[0], box.right - border[1], box.bottom - border[2]];
  bands([box.left-margin[3], box.top-margin[0], box.right+margin[1], box.bottom+margin[2]], [box.left, box.top, box.right, box.bottom], margin, '#f97316', 'rgba(249,115,22,.2)');
  bands(inner, [inner[0]+padding[3], inner[1]+padding[0], inner[2]-padding[1], inner[3]-padding[2]], padding, '#22c55e', 'rgba(34,197,94,.2)');
  const gutters = document.createElement('div');
  hoverSpacing.append(gutters);
  drawGutters(target, styles, undefined, gutters, hoverSpacing);
};
// Fill only the band between the outer and inner rectangles.
const drawStrips = (strips, [ol, ot, or, ob], [il, it, ir, ib], fill, edge) => {
  const rects = [[ol, ot, or - ol, it - ot], [ol, ib, or - ol, ob - ib], [ol, it, il - ol, ib - it], [ir, it, or - ir, ib - it]];
  strips.forEach((strip, index) => {
    const [x, y, width, height] = rects[index];
    if (width < 1 || height < 1) {
      strip.style.display = 'none';
      return;
    }
    setRect(strip, x, y, width, height);
    spacingValueTag(x, y, width, height, index < 2 ? height : width, edge);
    strip.style.background = fill;
    strip.style.borderWidth = '0';
  });
};
const hideStrips = (strips) => strips.forEach((strip) => { strip.style.display = 'none'; });
const hideSpacing = () => {
  spacingValues.replaceChildren();
  gutterLayer.replaceChildren();
  gutterLayer.style.display = 'none';
  hideStrips(marginStrips);
  hideStrips(paddingStrips);
  spacingEdge.style.display = 'none';
};
// highlight: 'both', 'row', 'column' or nothing. Highlighted gutters take
// the spacing recipe (20% fill, 2px edge) in violet.
const drawGutters = (element, styles, highlight, layer = gutterLayer, valuesLayer = spacingValues) => {
  layer.replaceChildren();
  layer.style.display = 'none';
  const columnGap = number(styles.columnGap);
  const rowGap = number(styles.rowGap);
  if ((!columnGap && !rowGap) || (!styles.display.includes('flex') && !styles.display.includes('grid'))) return;
  layer.style.display = 'block';
  const children = [...element.children].filter((child) => {
    const childStyle = getComputedStyle(child);
    return !['absolute', 'fixed'].includes(childStyle.position) && childStyle.display !== 'none';
  }).map((child) => child.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0);
  const mark = (left, top, width, height, axis) => {
    if (width < 1 || height < 1) return;
    const gutter = document.createElement('div');
    const paint = highlight === 'both' || highlight === axis
      ? 'background:rgba(139,92,246,.2);border:2px solid #8b5cf6;'
      : 'background:repeating-linear-gradient(135deg,rgba(139,92,246,.18) 0 3px,rgba(139,92,246,.06) 3px 6px);';
    gutter.style.cssText = `position:fixed;left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(width)}px;height:${Math.round(height)}px;${paint}box-sizing:border-box;`;
    layer.append(gutter);
    spacingValueTag(left, top, width, height, axis === 'column' ? columnGap : rowGap, '#8b5cf6', valuesLayer);
  };
  children.forEach((first, index) => children.slice(index + 1).forEach((second) => {
    const verticalOverlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
    const horizontalOverlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
    // Visual order can differ from DOM order (order, reverse and RTL).
    const [left, right] = first.left <= second.left ? [first, second] : [second, first];
    const [top, bottom] = first.top <= second.top ? [first, second] : [second, first];
    const horizontalGap = right.left - left.right;
    const verticalGap = bottom.top - top.bottom;
    if (columnGap && horizontalGap > 0 && horizontalGap <= columnGap + 2 && verticalOverlap > 0) {
      mark(left.right, Math.max(first.top, second.top), horizontalGap, verticalOverlap, 'column');
    }
    if (rowGap && verticalGap > 0 && verticalGap <= rowGap + 2 && horizontalOverlap > 0) {
      mark(Math.max(first.left, second.left), top.bottom, horizontalOverlap, verticalGap, 'row');
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
  [marginOverlay, paddingOverlay, contentOverlay, ...marginStrips, ...paddingStrips, spacingEdge, gutterLayer, spacingValues, layoutMap, hoverSpacing, hoverOutline].forEach((overlay) => {
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
  spacingValues.dataset.viewportParadeSpacingValues = '';
  spacingValues.style.cssText += 'display:block;inset:0;z-index:2147483647;';
  layoutMap.style.cssText += 'z-index:2147483645;inset:0;';
  hoverSpacing.dataset.viewportParadeHoverSpacing = '';
  hoverSpacing.style.cssText += 'inset:0;';
  hoverOutline.style.cssText += 'border:2px solid #2563eb;';
  label.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;display:none;box-sizing:border-box;width:max-content;max-width:min(390px,calc(100vw - 16px));padding:5px 7px;border-radius:4px;background:#15181f;color:#fff;font:600 11px/1.3 Inter,ui-sans-serif,system-ui,sans-serif;white-space:pre-wrap;overflow-wrap:anywhere;box-shadow:0 4px 12px rgba(0,0,0,.25);';
  paddingOverlay.dataset.viewportParadeElementOutline = '';
  hoverOutline.dataset.viewportParadeHoverOutline = '';
  label.dataset.viewportParadeElementLabel = '';
  label.setAttribute('aria-hidden', 'true');
  label.dataset.viewportParadeOverlay = '';
  document.documentElement.append(label);
  new MutationObserver(scheduleLayoutMapSoon).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
  document.addEventListener('transitionend', scheduleLayoutMapSoon, true);
  document.addEventListener('animationend', scheduleLayoutMapSoon, true);
};
