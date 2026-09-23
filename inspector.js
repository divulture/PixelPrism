(() => {
  const INSPECTOR_PROTOCOL_VERSION = 6;
  // The content script is registered for web pages so it can run inside Studio's
  // cross-origin preview iframe. Do not create any DOM or listeners on a normal
  // browsing tab: wait until the extension page explicitly enables a tool.
  if (window.top === window) return;
  if (window.__viewportParadeInspectorInstalled) return;
  const extensionOrigin = new URL(chrome.runtime.getURL('/')).origin;
  // This content script runs in every frame on permitted pages. It is only
  // meant for previews directly embedded by Studio; otherwise a nested frame
  // (for example one on figma.com) would receive a message addressed to the
  // extension origin and Chromium would reject it.
  const parentOrigin = window.location.ancestorOrigins?.[0]
    || (document.referrer ? new URL(document.referrer).origin : '');
  if (parentOrigin !== extensionOrigin) return;
  window.parent.postMessage({
    source: 'viewport-parade',
    type: 'preview-ready',
    url: location.href,
    inspectorProtocolVersion: INSPECTOR_PROTOCOL_VERSION
  }, extensionOrigin);
  const isStudioMessage = (event, type) => (
    event.source === window.parent
    && event.origin === extensionOrigin
    && event.data?.source === 'viewport-parade'
    && event.data?.type === type
  );
  const queryOne = (selector) => {
    if (!selector || typeof selector !== 'string') return null;
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 ? matches[0] : null;
    } catch { return null; }
  };
  const matchesContext = (element, context = {}) => {
    if (!(element instanceof Element)) return false;
    if (context.tag && element.tagName.toLowerCase() !== context.tag) return false;
    if (context.id && element.id !== context.id) return false;
    if (Array.isArray(context.classes) && context.classes.length
      && !context.classes.every((name) => element.classList.contains(name))) return false;
    return true;
  };
  const uniqueAttributeMatch = (context) => {
    const attributes = context?.attributes;
    if (!attributes || typeof attributes !== 'object') return null;
    for (const name of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'role', 'aria-label', 'href', 'type']) {
      const value = attributes[name];
      if (value === null || value === undefined || value === '') continue;
      const escaped = CSS.escape(String(value));
      const match = queryOne(`[${CSS.escape(name)}="${escaped}"]`);
      if (match && matchesContext(match, context)) return match;
    }
    return null;
  };
  const elementForChange = (change) => {
    const context = change?.element || {};
    // Prefer identities that remain meaningful when markup is rearranged.
    if (context.id) {
      const byId = queryOne(`#${CSS.escape(context.id)}`);
      if (byId && matchesContext(byId, context)) return byId;
    }
    const byAttribute = uniqueAttributeMatch(context);
    if (byAttribute) return byAttribute;
    // DOM path carries the original hierarchy. It is only trusted when it
    // resolves to exactly one matching element.
    const byPath = queryOne(context.domPath);
    if (byPath && matchesContext(byPath, context)) return byPath;
    const hasReliableIdentity = Boolean(context.id)
      || (Array.isArray(context.classes) && context.classes.length > 0)
      || ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'role', 'aria-label', 'href', 'type']
        .some((name) => context.attributes?.[name]);
    if (!hasReliableIdentity) return null;
    const byContextSelector = queryOne(context.selector);
    if (byContextSelector && matchesContext(byContextSelector, context)) return byContextSelector;
    const bySelector = queryOne(change?.selector);
    return bySelector && matchesContext(bySelector, context) ? bySelector : null;
  };
  const textValueFor = (element) => String(element.textContent ?? '').replace(/\s+/g, ' ').trim();
  const numericValue = (value) => {
    const match = String(value).trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+))(?:([a-z%]+))?$/i);
    return match ? { number: Number(match[1]), unit: (match[2] || '').toLowerCase() } : null;
  };
  const colorValue = (value) => {
    const probe = document.createElement('span');
    probe.style.color = '';
    probe.style.color = String(value).trim();
    if (!probe.style.color) return null;
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;color:' + probe.style.color;
    document.documentElement.append(probe);
    const result = getComputedStyle(probe).color.replace(/\s+/g, ' ').trim().toLowerCase();
    probe.remove();
    return result;
  };
  const colorProperties = new Set(['color', 'background-color', 'border-color', 'outline-color', 'text-decoration-color']);
  const numericProperties = new Set(['opacity', 'flex-grow', 'flex-shrink', 'order', 'font-weight']);
  const valuesMatch = (property, actual, expected) => {
    const normalizedProperty = String(property).toLowerCase();
    if (['text', 'text-content', 'textcontent'].includes(normalizedProperty)) return textValueFor({ textContent: actual }) === textValueFor({ textContent: expected });
    if (colorProperties.has(normalizedProperty)) {
      const actualColor = colorValue(actual);
      const expectedColor = colorValue(expected);
      return Boolean(actualColor && expectedColor && actualColor === expectedColor);
    }
    const actualNumber = numericValue(actual);
    const expectedNumber = numericValue(expected);
    if (actualNumber && expectedNumber && (numericProperties.has(normalizedProperty) || actualNumber.unit || expectedNumber.unit)) {
      // CSS layout rounding regularly produces tiny fractional pixel deltas.
      if (actualNumber.unit !== expectedNumber.unit && actualNumber.number !== 0 && expectedNumber.number !== 0) return false;
      return Math.abs(actualNumber.number - expectedNumber.number) <= 0.02;
    }
    return String(actual).trim().replace(/\s+/g, ' ').toLowerCase() === String(expected).trim().replace(/\s+/g, ' ').toLowerCase();
  };
  const actualValueFor = (element, property) => {
    if (['text', 'text-content', 'textContent'].includes(property)) return textValueFor(element);
    const value = getComputedStyle(element).getPropertyValue(property);
    return value ? value.trim() : null;
  };
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'reconcile-pending-changes')) return;
    const changes = Array.isArray(event.data.changes) ? event.data.changes : [];
    // Let framework microtasks and the first paint settle. This is deliberately
    // bounded; anything not verifiable remains pending for a later reload.
    setTimeout(() => {
      const resolved = changes.flatMap((change) => {
        const element = elementForChange(change);
        const actual = element ? actualValueFor(element, change.property) : null;
        return element && actual !== null && valuesMatch(change.property, actual, change.after)
          ? [{ key: change.key, after: change.after }]
          : [];
      });
      window.parent.postMessage({
        source: 'viewport-parade',
        type: 'pending-changes-reconciled',
        requestId: event.data.requestId,
        resolved
      }, extensionOrigin);
    }, 180);
  });
  let navigationSyncActive = false;
  let inspectorInteractionActive = false;
  let expectedNavigationUrl = location.href;
  let lastReportedNavigationUrl = location.href;
  const syncedNavigationProtocols = new Set(['http:', 'https:', 'file:']);
  const navigablePreviewUrl = (value) => {
    try {
      const url = new URL(value, location.href);
      return syncedNavigationProtocols.has(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  };
  const sameNavigationUrl = (left, right) => {
    try {
      return new URL(left, location.href).href === new URL(right, location.href).href;
    } catch {
      return left === right;
    }
  };
  const reportPreviewNavigation = (value = location.href, force = false) => {
    if (!navigationSyncActive) return;
    const href = navigablePreviewUrl(value);
    if (!href || (!force && sameNavigationUrl(href, lastReportedNavigationUrl))) return;
    lastReportedNavigationUrl = href;
    window.parent.postMessage({ source: 'viewport-parade', type: 'navigate-preview', url: href }, extensionOrigin);
  };
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'enable-navigation-sync')) return;
    navigationSyncActive = true;
    expectedNavigationUrl = navigablePreviewUrl(event.data.expectedUrl) || location.href;
    lastReportedNavigationUrl = expectedNavigationUrl;
    if (!sameNavigationUrl(location.href, expectedNavigationUrl)) reportPreviewNavigation(location.href, true);
  });
  ['pushState', 'replaceState'].forEach((method) => {
    try {
      const original = history[method];
      history[method] = function viewportParadeHistorySync(...args) {
        const before = location.href;
        const result = original.apply(this, args);
        if (!sameNavigationUrl(location.href, before)) {
          setTimeout(() => reportPreviewNavigation(location.href), 0);
        }
        return result;
      };
    } catch {
      // Some pages lock down browser APIs. Link clicks and load-time URL
      // checks still keep normal navigation synchronized.
    }
  });
  window.addEventListener('popstate', () => setTimeout(() => reportPreviewNavigation(location.href), 0));
  window.addEventListener('hashchange', () => setTimeout(() => reportPreviewNavigation(location.href), 0));
  // Navigation is useful even when the visual inspector itself is off.
  document.addEventListener('click', (event) => {
    if (!navigationSyncActive || inspectorInteractionActive || document.documentElement.hasAttribute('data-viewport-parade-inspecting') || event.defaultPrevented || event.button !== 0) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = String(link.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return;
    const href = navigablePreviewUrl(link.href);
    if (!href) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    reportPreviewNavigation(href, true);
  }, true);
  // Shortcuts must work before the visual inspector is installed: I is the
  // first way to leave Cursor mode, so installing this listener lazily would
  // make that key impossible to use in a fresh preview.
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.matches('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)) return;
    const shortcut = ({ KeyI: 'i', KeyC: 'c', KeyL: 'l', KeyV: 'v' })[event.code];
    if (!shortcut) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent.postMessage({ source: 'viewport-parade', type: 'studio-shortcut', shortcut }, extensionOrigin);
  }, true);
  const install = (initialMessage) => {
  window.__viewportParadeInspectorInstalled = true;

  const marginOverlay = document.createElement('div');
  const paddingOverlay = document.createElement('div');
  const contentOverlay = document.createElement('div');
  const gutterLayer = document.createElement('div');
  const layoutMap = document.createElement('div');
  const label = document.createElement('div');
  const contrastStyle = document.createElement('style');
  contrastStyle.textContent = 'html[data-viewport-parade-layout-contrast] body { background: #fff !important; } html[data-viewport-parade-layout-contrast] body > :not([data-viewport-parade-overlay]) { filter: grayscale(1) contrast(.92) !important; }';
  document.documentElement.append(contrastStyle);
  [marginOverlay, paddingOverlay, contentOverlay, gutterLayer, layoutMap].forEach((overlay) => {
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.viewportParadeOverlay = '';
    overlay.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;display:none;box-sizing:border-box;';
    document.documentElement.append(overlay);
  });
  marginOverlay.style.cssText += 'border:1px solid rgba(82,82,91,.7);background:rgba(82,82,91,.05);';
  paddingOverlay.style.cssText += 'border:1px solid rgba(113,113,122,.7);background:rgba(113,113,122,.07);';
  contentOverlay.style.cssText += 'border:1px solid rgba(161,161,170,.75);background:rgba(161,161,170,.08);';
  gutterLayer.style.cssText += 'z-index:2147483647;';
  layoutMap.style.cssText += 'z-index:2147483645;';
  label.style.cssText = 'position:absolute;left:-2px;top:-57px;max-width:min(390px,calc(100vw - 16px));padding:5px 7px;border-radius:4px;background:#15181f;color:#fff;font:600 11px/1.3 Inter,ui-sans-serif,system-ui,sans-serif;white-space:pre-wrap;box-shadow:0 4px 12px rgba(0,0,0,.25);';
  marginOverlay.append(label);

  let active = false;
  let commentPickerActive = false;
  let interactionMode = 'edit';
  let pinned = false;
  let layoutMode = false;
  let mapFrame;
  let selectedElement;
  let hoveredElement;
  let pointerInside = true;
  let highlightedZone;
  let editorMode = 'size';
  let typographySelector;
  let componentSelector;
  let layoutSelector;
  const syncInteractionState = () => {
    const enabled = active || commentPickerActive;
    inspectorInteractionActive = enabled;
    document.documentElement.toggleAttribute('data-viewport-parade-inspecting', enabled);
  };
  const typographyStyle = document.createElement('style');
  typographyStyle.dataset.viewportParadeOverlay = '';
  document.documentElement.append(typographyStyle);
  const typographyRules = new Map();
  // Layout and component edits share an override stylesheet. It keeps edits
  // visible even when an imported component stylesheet uses !important, and it
  // applies a shared component change consistently to every matching instance.
  const layoutStyle = document.createElement('style');
  layoutStyle.dataset.viewportParadeOverlay = '';
  document.documentElement.append(layoutStyle);
  const layoutRules = new Map();
  let authoredStylesheetsPromise;
  const authoredStylesheets = [];
  const editorModeLabel = { size: 'Size', margin: 'Margin', padding: 'Padding', gap: 'Gaps', component: 'Element', typography: 'Typography' };
  const cssProperty = {
    width: 'width', height: 'height', minWidth: 'min-width', maxWidth: 'max-width', minHeight: 'min-height', maxHeight: 'max-height', marginTop: 'margin-top', marginRight: 'margin-right', marginBottom: 'margin-bottom', marginLeft: 'margin-left',
    paddingTop: 'padding-top', paddingRight: 'padding-right', paddingBottom: 'padding-bottom', paddingLeft: 'padding-left', rowGap: 'row-gap', columnGap: 'column-gap'
  };
  const typographyProperty = {
    fontFamily: { css: 'font-family' }, fontSize: { css: 'font-size', unit: 'px' }, fontWeight: { css: 'font-weight' }, fontStyle: { css: 'font-style' }, fontStretch: { css: 'font-stretch' },
    lineHeight: { css: 'line-height', unit: 'px' }, letterSpacing: { css: 'letter-spacing', unit: 'px' }, wordSpacing: { css: 'word-spacing', unit: 'px' }, textTransform: { css: 'text-transform' },
    textDecorationLine: { css: 'text-decoration-line' }, textAlign: { css: 'text-align' }, textIndent: { css: 'text-indent', unit: 'px' }, fontVariationSettings: { css: 'font-variation-settings' }, fontFeatureSettings: { css: 'font-feature-settings' }
  };
  const componentProperty = {
    display: 'display', flexDirection: 'flex-direction', flexWrap: 'flex-wrap', justifyContent: 'justify-content', alignItems: 'align-items', alignContent: 'align-content', flexGrow: 'flex-grow', flexShrink: 'flex-shrink', flexBasis: 'flex-basis', alignSelf: 'align-self', order: 'order',
    gridTemplateColumns: 'grid-template-columns', gridTemplateRows: 'grid-template-rows', gridAutoColumns: 'grid-auto-columns', gridAutoRows: 'grid-auto-rows', gridAutoFlow: 'grid-auto-flow', justifyItems: 'justify-items', gridColumn: 'grid-column', gridRow: 'grid-row',
    backgroundColor: 'background-color', color: 'color', opacity: 'opacity', borderWidth: 'border-width', borderStyle: 'border-style', borderColor: 'border-color', borderRadius: 'border-radius', boxShadow: 'box-shadow'
  };
  const colorProperties = new Set(['backgroundColor', 'color', 'borderColor']);
  const authoredGridProperties = new Set(['gridTemplateColumns', 'gridTemplateRows', 'gridAutoColumns', 'gridAutoRows', 'gridAutoFlow', 'gridColumn', 'gridRow']);
  const lengthPropertyKeys = new Set([
    'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'rowGap', 'columnGap', 'borderWidth', 'borderRadius',
    'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent'
  ]);
  const cssColorToHex = (value) => {
    const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+\s*([\d.]+)[,\s]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
    if (!match) return value;
    const channel = (index) => Math.max(0, Math.min(255, Math.round(Number(match[index])))).toString(16).padStart(2, '0');
    const alpha = match[4] === undefined ? '' : Math.max(0, Math.min(255, Math.round(Number(match[4]) * 255))).toString(16).padStart(2, '0');
    return `#${channel(1)}${channel(2)}${channel(3)}${alpha}`.toUpperCase();
  };
  const hideOverlays = () => {
    [marginOverlay, paddingOverlay, contentOverlay, gutterLayer].forEach((overlay) => { overlay.style.display = 'none'; });
    gutterLayer.replaceChildren();
    window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-editor-close' }, extensionOrigin);
    selectedElement = undefined;
    highlightedZone = undefined;
  };
  const clearSelection = () => {
    pinned = false;
    hideOverlays();
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
  const populateEditor = (element, mode) => {
    const styles = getComputedStyle(element);
    editorMode = mode;
    const sharedSelector = mode === 'typography'
      ? typographySelector
      : mode === 'component'
        ? componentSelector
        : layoutSelector;
    const titleSelector = sharedSelector || selectorFor(element);
    const title = sharedSelector && selectorMatchesMultiple(sharedSelector)
      ? `${editorModeLabel[mode]} · all ${sharedSelector}`
      : `${editorModeLabel[mode]} · ${titleSelector}`;
    const values = {};
    const valueSources = {};
    Object.keys(cssProperty).forEach((property) => { values[property] = Math.round(number(styles[property])); });
    // Width and height are meaningful as authored CSS, not just as a rendered
    // pixel rectangle. Keep percentages, viewport units, calc(), variables,
    // and keywords intact; use the CSS initial value when no rule declares it.
    const authoredSizeDefaults = { width: 'auto', height: 'auto', minWidth: '0px', maxWidth: 'none', minHeight: '0px', maxHeight: 'none' };
    Object.keys(authoredSizeDefaults).forEach((property) => {
      values[property] = sourceHintFor(element, cssProperty[property])?.declaredValue || authoredSizeDefaults[property];
    });
    Object.keys(typographyProperty).forEach((property) => {
      values[property] = ['fontSize', 'fontWeight', 'textIndent'].includes(property)
        ? number(styles[property])
        : styles[property];
    });
    Object.keys(componentProperty).forEach((property) => {
      values[property] = ['opacity', 'borderWidth', 'borderRadius'].includes(property)
        ? number(styles[property])
        : colorProperties.has(property)
          ? cssColorToHex(styles[property])
          : styles[property];
    });
    authoredGridProperties.forEach((property) => {
      const authored = authoredValueFor(element, componentProperty[property]);
      if (authored?.declaredValue) {
        values[property] = authored.declaredValue;
        valueSources[property] = {
          kind: 'declared',
          selector: authored.selector || null,
          href: authored.href || null,
          inline: Boolean(authored.inline)
        };
      } else {
        valueSources[property] = { kind: 'computed' };
      }
    });
    values.display = styles.display === 'inline-flex' ? 'flex' : styles.display === 'inline-grid' ? 'grid' : styles.display;
    const parentStyles = element.parentElement ? getComputedStyle(element.parentElement) : null;
    const context = {
      childElementCount: element.children.length,
      parentDisplay: parentStyles?.display || '',
      renderedWidth: Math.round(element.getBoundingClientRect().width),
      renderedHeight: Math.round(element.getBoundingClientRect().height)
    };
    window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-editor-open', editor: { mode, title, values, valueSources, context } }, extensionOrigin);
  };
  const mapBox = (left, top, width, height, style) => {
    if (width < 1 || height < 1) return;
    const box = document.createElement('div');
    box.style.cssText = `position:fixed;left:${Math.round(left)}px;top:${Math.round(top)}px;width:${Math.round(width)}px;height:${Math.round(height)}px;box-sizing:border-box;${style}`;
    layoutMap.append(box);
  };
  const renderLayoutMap = () => {
    layoutMap.replaceChildren();
    layoutMap.style.display = layoutMode ? 'block' : 'none';
    if (!layoutMode) return;
    const candidates = [...document.body.querySelectorAll('*')]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        if (box.width < 24 || box.height < 24 || box.bottom < 0 || box.right < 0 || box.top > innerHeight || box.left > innerWidth) return false;
        const styles = getComputedStyle(element);
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
  const number = (value) => Number.parseFloat(value) || 0;
  const setRect = (overlay, left, top, width, height) => {
    overlay.style.display = 'block';
    overlay.style.left = `${Math.round(left)}px`;
    overlay.style.top = `${Math.round(top)}px`;
    overlay.style.width = `${Math.max(0, Math.round(width))}px`;
    overlay.style.height = `${Math.max(0, Math.round(height))}px`;
  };
  const drawGutters = (element, styles, highlighted) => {
    gutterLayer.replaceChildren();
    gutterLayer.style.display = 'none';
    const columnGap = number(styles.columnGap);
    const rowGap = number(styles.rowGap);
    if ((!columnGap && !rowGap) || (!styles.display.includes('flex') && !styles.display.includes('grid'))) return;
    gutterLayer.style.display = 'block';
    const children = [...element.children].map((child) => child.getBoundingClientRect());
    const mark = (left, top, width, height) => {
      if (width < 1 || height < 1) return;
      const gutter = document.createElement('div');
      const paint = highlighted
        ? 'background:repeating-linear-gradient(135deg,rgba(218,101,14,.62) 0 3px,rgba(255,183,77,.62) 3px 6px);outline:1px solid rgba(194,65,12,.9);'
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
        mark(first.right, Math.max(first.top, second.top), horizontalGap, verticalOverlap);
      }
      if (rowGap && verticalGap > 0 && verticalGap <= rowGap + 2 && horizontalOverlap > 0) {
        mark(Math.max(first.left, second.left), first.bottom, horizontalOverlap, verticalGap);
      }
    }));
  };
  const selectorFor = (element) => {
    const tag = element.tagName.toLowerCase();
    if (element.id) return `${tag}#${element.id}`;
    const classes = [...element.classList].slice(0, 2).map((name) => `.${name}`).join('');
    return `${tag}${classes}`;
  };
  const truncate = (value, limit = 240) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
  };
  const stableSelectorFor = (element) => {
    const tag = element.tagName.toLowerCase();
    if (element.id) return `#${CSS.escape(element.id)}`;
    for (const name of ['data-testid', 'data-test', 'data-cy', 'data-qa']) {
      if (element.hasAttribute(name)) return `[${name}="${CSS.escape(element.getAttribute(name))}"]`;
    }
    const classes = [...element.classList]
      .filter((name) => !name.startsWith('viewport-parade-'))
      .slice(0, 3)
      .map((name) => `.${CSS.escape(name)}`).join('');
    if (classes) return `${tag}${classes}`;
    if (element.getAttribute('name')) return `${tag}[name="${CSS.escape(element.getAttribute('name'))}"]`;
    if (element.getAttribute('role')) return `${tag}[role="${CSS.escape(element.getAttribute('role'))}"]`;
    return tag;
  };
  const domPathFor = (element) => {
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement) {
      const parent = current.parentElement;
      const base = stableSelectorFor(current);
      const hasStrongIdentity = current.id || [...current.attributes].some((attribute) => /^(data-(testid|test|cy|qa)|name|role)$/.test(attribute.name));
      if (hasStrongIdentity || current.classList.length) parts.unshift(base);
      else if (parent) {
        const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
        parts.unshift(sameTag.length > 1 ? `${base}:nth-of-type(${sameTag.indexOf(current) + 1})` : base);
      } else parts.unshift(base);
      if (current.id) break;
      current = parent;
    }
    return parts.join(' > ');
  };
  // Exact position from <html>; it survives repeated class names that make
  // domPath ambiguous. Studio overlays are skipped so they do not shift it.
  const indexPathFor = (element) => {
    const path = [];
    for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
      const parent = current.parentElement;
      if (!parent) return [];
      path.unshift([...parent.children].filter((child) => !child.hasAttribute('data-viewport-parade-overlay')).indexOf(current));
    }
    return path;
  };
  const htmlSnippetFor = (element) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll?.('[data-viewport-parade-overlay], style[data-viewport-parade-overlay]').forEach((node) => node.remove());
    [...clone.attributes].forEach((attribute) => {
      if (attribute.name.startsWith('data-viewport-parade-')) clone.removeAttribute(attribute.name);
    });
    if (clone.children.length) clone.replaceChildren(document.createTextNode('…'));
    return truncate(clone.outerHTML, 420);
  };
  const elementContextFor = (element) => {
    const attributes = {};
    ['role', 'aria-label', 'name', 'href', 'type'].forEach((name) => { attributes[name] = element.getAttribute(name); });
    [...element.attributes].forEach((attribute) => {
      if (attribute.name.startsWith('data-') && !attribute.name.startsWith('data-viewport-parade-')) attributes[attribute.name] = truncate(attribute.value, 120);
    });
    const parent = element.parentElement;
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: [...element.classList].filter((name) => !name.startsWith('viewport-parade-')).slice(0, 12),
      selector: stableSelectorFor(element),
      domPath: domPathFor(element),
      indexPath: indexPathFor(element),
      text: truncate(element.textContent, 240),
      attributes,
      htmlSnippet: htmlSnippetFor(element),
      parent: parent ? {
        tag: parent.tagName.toLowerCase(),
        selector: stableSelectorFor(parent),
        display: getComputedStyle(parent).display
      } : null
    };
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
  const layerTextFor = (element) => [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
  const layerLabelFor = (element) => {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const classes = [...element.classList].slice(0, 3).map((name) => `.${name}`).join('');
    const more = Math.max(0, element.classList.length - 3);
    const text = layerTextFor(element);
    return `${tag}${id}${classes}${more ? ` +${more}` : ''}${text ? ` · ${text}${text.length === 72 ? '…' : ''}` : ''}`;
  };
  const layerTreeFor = (element = document.body) => {
    const ignored = new Set(['script', 'style', 'meta', 'link', 'noscript', 'template']);
    const children = [...element.children]
      .filter((child) => !ignored.has(child.tagName.toLowerCase()) && !child.dataset.viewportParadeOverlay)
      .map((child) => layerTreeFor(child));
    return { path: layerPathFor(element), label: layerLabelFor(element), children };
  };
  const sendLayersTree = () => window.parent.postMessage({
    source: 'viewport-parade', type: 'layers-tree', tree: layerTreeFor()
  }, extensionOrigin);
  const selectLayerElement = async (element, options = {}) => {
    if (!element) return;
    // A selection always exposes the same complete editor. The hover hit test
    // can highlight a spacing zone, but it must never make properties disappear
    // from the right-hand panel. Pointer selection skips tiny inline text
    // wrappers so generated classes such as span.sc-interp do not become broad
    // "edit all" targets; the Layers panel can still select exact nodes.
    const componentTarget = options.exact ? element : selectionTargetFor(element);
    pinned = true;
    selectedElement = componentTarget;
    show(selectedElement, 'size');
    if (interactionMode === 'comment') {
      // Comments reuse the Inspector's hit testing and element-context logic,
      // but selecting a target must not expose the CSS editing panel.
    } else {
      typographySelector = undefined;
      componentSelector = typographySelectorFor(componentTarget);
      await ensureAuthoredStylesheets();
      if (selectedElement !== componentTarget) return;
      populateEditor(selectedElement, 'component');
    }
    window.parent.postMessage({ source: 'viewport-parade', type: 'layers-selected', path: layerPathFor(selectedElement) }, extensionOrigin);
    window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-element-selected', route: `${location.pathname}${location.search}${location.hash}`, element: elementContextFor(selectedElement) }, extensionOrigin);
  };
  const isInlineTextWrapper = (element) => {
    if (!(element instanceof Element) || element.children.length > 0) return false;
    if (!['span', 'b', 'strong', 'i', 'em', 'small', 'mark', 'code', 'abbr', 'time'].includes(element.tagName.toLowerCase())) return false;
    return getComputedStyle(element).display === 'inline' && element.textContent.trim().length > 0;
  };
  const selectionTargetFor = (element) => {
    if (!(element instanceof Element)) return element;
    const visualTarget = element.closest?.('img,picture,video,canvas');
    if (visualTarget) return visualTarget;
    const interactive = element.closest?.('a,button,summary,input,select,textarea,label,[role="button"],[role="tab"],[role="menuitem"]');
    if (interactive) return interactive;
    if (!isInlineTextWrapper(element)) return element;
    for (let current = element.parentElement; current && current !== document.body; current = current.parentElement) {
      const styles = getComputedStyle(current);
      if (styles.display !== 'inline') return current;
    }
    return element;
  };
  const uniqueOrStructuralSelectorFor = (element, preferredSelector) => {
    try {
      const preferredMatches = preferredSelector ? document.querySelectorAll(preferredSelector) : [];
      if (preferredMatches.length === 1 && preferredMatches[0] === element) return preferredSelector;
    } catch {
      // Fall through to a structural selector if a class name needs escaping in
      // an unexpected way.
    }
    const parts = [];
    for (let current = element; current && current !== document.body; current = current.parentElement) {
      const currentTag = current.tagName.toLowerCase();
      const siblings = [...current.parentElement.children].filter((sibling) => sibling.tagName === current.tagName);
      const index = siblings.indexOf(current);
      parts.unshift(siblings.length > 1 ? `${currentTag}:nth-of-type(${index + 1})` : currentTag);
      const selector = `body > ${parts.join(' > ')}`;
      try {
        const matches = document.querySelectorAll(selector);
        if (matches.length === 1 && matches[0] === element) return selector;
      } catch {
        // Keep walking to a more explicit selector if a page has unusual DOM.
      }
    }
    return `body > ${parts.join(' > ')}`;
  };
  const selectorMatchesMultiple = (selector) => {
    try {
      return Boolean(selector && document.querySelectorAll(selector).length > 1);
    } catch {
      return false;
    }
  };
  const typographySelectorFor = (element) => {
    const tag = element.tagName.toLowerCase();
    const classes = [...element.classList];
    if (classes.length) return `${tag}${classes.map((name) => `.${CSS.escape(name)}`).join('')}`;
    if (element.id) return `${tag}#${CSS.escape(element.id)}`;
    // A bare tag selector could change several unrelated nodes. Build the
    // shortest structural selector that identifies this exact element instead.
    // Unlike the previous temporary data attribute, this selector can also be
    // written back to the source HTML when the user clicks Apply.
    return uniqueOrStructuralSelectorFor(element);
  };
  const renderTypographyRules = () => {
    typographyStyle.textContent = [...typographyRules].map(([selector, declarations]) => `${selector}{${[...declarations].map(([property, value]) => `${property}:${value} !important`).join(';')}}`).join('\n');
  };
  const renderLayoutRules = () => {
    layoutStyle.textContent = [...layoutRules].map(([selector, declarations]) => `${selector}{${[...declarations].map(([property, value]) => `${property}:${value} !important`).join(';')}}`).join('\n');
  };
  const matchingSelector = (element, selectorText) => selectorText.split(',').map((selector) => selector.trim()).find((selector) => {
    try { return selector && element.matches(selector) ? selector : null; } catch { return null; }
  });
  const canReadRules = (sheet) => {
    try {
      void sheet.cssRules;
      return true;
    } catch {
      return false;
    }
  };
  const shouldFetchStylesheet = (href) => {
    if (!href) return false;
    if (location.protocol === 'file:') return href.startsWith('file://');
    try {
      return new URL(href).origin === location.origin;
    } catch {
      return false;
    }
  };
  const ensureAuthoredStylesheets = () => {
    if (authoredStylesheetsPromise) return authoredStylesheetsPromise;
    const hrefs = [...new Set([...document.styleSheets]
      .filter((sheet) => !canReadRules(sheet) && shouldFetchStylesheet(sheet.href))
      .map((sheet) => sheet.href))];
    authoredStylesheetsPromise = Promise.all(hrefs.map(async (href) => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'load-stylesheet', url: href });
        if (!response?.ok || typeof response.css !== 'string') return;
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(response.css);
        authoredStylesheets.push({ href, sheet });
      } catch {
        // Keep the editor usable with computed values when a stylesheet cannot
        // be fetched or parsed by the extension.
      }
    }));
    return authoredStylesheetsPromise;
  };
  const containerFor = (element) => {
    for (let current = element.parentElement; current; current = current.parentElement) {
      const styles = getComputedStyle(current);
      if (styles.containerType && styles.containerType !== 'normal') return current;
    }
    return null;
  };
  const containerRuleApplies = (element, conditionText) => {
    const container = containerFor(element);
    if (!container) return false;
    const inlineSize = container.getBoundingClientRect().width;
    const tests = [...String(conditionText).matchAll(/\(\s*(min|max)-width\s*:\s*([0-9.]+)px\s*\)/gi)];
    if (!tests.length) return false;
    return tests.every(([, type, value]) => (
      type.toLowerCase() === 'max'
        ? inlineSize <= Number(value)
        : inlineSize >= Number(value)
    ));
  };
  const activeRuleDeclarations = (element, property) => {
    const matches = [];
    let order = 0;
    const visit = (rules, hrefOverride = null) => {
      [...rules].forEach((rule) => {
        // Content scripts run in an isolated world where CSSStyleRule and
        // CSSMediaRule constructors are not always exposed. Inspect the rule
        // shape instead, otherwise every readable stylesheet is skipped.
        if (rule.type === 4 && !matchMedia(rule.conditionText).matches) return;
        if (rule.constructor?.name === 'CSSContainerRule' && !containerRuleApplies(element, rule.conditionText)) return;
        if (rule.type !== 1 && rule.cssRules?.length) return visit(rule.cssRules, hrefOverride);
        if (!rule.selectorText || !rule.style) return;
        const selector = matchingSelector(element, rule.selectorText);
        const declaredValue = rule.style.getPropertyValue(property).trim();
        if (selector && declaredValue) matches.push({
          selector,
          declaredValue,
          important: rule.style.getPropertyPriority(property) === 'important',
          order,
          href: rule.parentStyleSheet?.href || hrefOverride
        });
        order += 1;
      });
    };
    [...document.styleSheets].forEach((sheet) => {
      // Ignore the temporary PixelPrism override sheets: they show the edit, not
      // the value that existed in the project's source before the edit.
      if (sheet.ownerNode?.dataset?.viewportParadeOverlay !== undefined) return;
      try { visit(sheet.cssRules, sheet.href || null); } catch { /* Cross-origin stylesheets are intentionally unavailable. */ }
    });
    authoredStylesheets.forEach(({ href, sheet }) => visit(sheet.cssRules, href));
    return matches;
  };
  const authoredValueFor = (element, property) => {
    const inlineValue = element.style?.getPropertyValue(property).trim();
    if (inlineValue) return { declaredValue: inlineValue, inline: true };
    const matches = activeRuleDeclarations(element, property);
    if (!matches.length) return undefined;
    return matches.sort((left, right) => Number(left.important) - Number(right.important) || left.order - right.order).at(-1);
  };
  const declarationForCustomProperty = (element, variable) => {
    for (let current = element; current; current = current.parentElement) {
      const inlineValue = current.style?.getPropertyValue(variable).trim();
      if (inlineValue) return { value: inlineValue, inline: true, scope: current === element ? 'element' : 'parent' };
      const matches = activeRuleDeclarations(current, variable);
      if (matches.length) {
        const winner = matches.sort((left, right) => Number(left.important) - Number(right.important) || left.order - right.order).at(-1);
        return { value: winner.declaredValue, selector: winner.selector, inline: false, scope: current === element ? 'element' : 'parent' };
      }
    }
    return null;
  };
  const sourceHintFor = (element, property) => {
    if (!element) return undefined;
    const inlineValue = element.style?.getPropertyValue(property).trim();
    let declaration = inlineValue ? { declaredValue: inlineValue, inline: true } : null;
    if (!declaration) {
      declaration = authoredValueFor(element, property);
    }
    const inheritedProperties = new Set(['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch', 'line-height', 'letter-spacing', 'word-spacing', 'text-transform', 'text-align']);
    const inherited = !declaration && inheritedProperties.has(property);
    if (inherited && element.parentElement) {
      const parent = element.parentElement;
      const parentInlineValue = parent.style?.getPropertyValue(property).trim();
      declaration = parentInlineValue ? { declaredValue: parentInlineValue, inline: true } : null;
      if (!declaration) {
        declaration = authoredValueFor(parent, property);
      }
    }
    if (!declaration) return undefined;
    const variable = declaration.declaredValue.match(/var\(\s*(--[A-Za-z0-9_-]+)/)?.[1];
    const variableDeclaration = variable ? declarationForCustomProperty(element, variable) : null;
    return {
      declaredValue: declaration.declaredValue,
      ...(variable ? { variable } : {}),
      ...(declaration.selector ? { selector: declaration.selector } : {}),
      ...(declaration.inline ? { inline: true } : {}),
      ...(inherited ? { inherited: true } : {}),
      ...(variableDeclaration?.scope === 'parent' ? { parentVariableScope: true } : {}),
      ...(variableDeclaration?.selector ? { variableSelector: variableDeclaration.selector } : {})
    };
  };
  const reportStyleChange = ({ selector, property, from, to, element = selectedElement, sourceHint }) => {
    if (!selector || !property || String(from) === String(to)) return;
    window.parent.postMessage({
      source: 'viewport-parade',
      type: 'inspector-style-change',
      change: {
        url: location.href,
        selector,
        property,
        from: String(from),
        to: String(to),
        sourceHint: sourceHint || sourceHintFor(element, property),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        route: `${location.pathname}${location.search}${location.hash}`,
        element: element ? elementContextFor(element) : undefined
      }
    }, extensionOrigin);
  };
  const withUnit = (value, unit) => {
    const text = String(value ?? '').trim();
    return text && unit && /^[-+]?\d*\.?\d+$/.test(text) ? `${text}${unit}` : text;
  };
  const cssValueForInput = (propertyKey, value, unit = 'px') => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return lengthPropertyKeys.has(propertyKey) && unit && /^[-+]?\d*\.?\d+$/.test(text)
      ? `${text}${unit}`
      : text;
  };
  const inputPreviousValue = (input) => input.dataset.viewportParadePreviousValue ?? input.value;
  const rememberInputValue = (input) => { input.dataset.viewportParadePreviousValue = input.value; };
  const applyTypography = (input) => {
    const definition = typographyProperty[input.dataset.property];
    if (!definition || !typographySelector) return;
    const from = inputPreviousValue(input);
    const declarations = typographyRules.get(typographySelector) || new Map();
    const value = input.value.trim();
    const nextValue = cssValueForInput(input.dataset.property, value, definition.unit);
    if (nextValue === '') declarations.delete(definition.css);
    else declarations.set(definition.css, nextValue);
    if (declarations.size) typographyRules.set(typographySelector, declarations);
    else typographyRules.delete(typographySelector);
    renderTypographyRules();
    reportStyleChange({ selector: typographySelector, property: definition.css, from: cssValueForInput(input.dataset.property, from, definition.unit), to: nextValue });
    rememberInputValue(input);
  };
  const applyComponent = (input) => {
    const typographyDefinition = typographyProperty[input.dataset.property];
    const css = cssProperty[input.dataset.property] || componentProperty[input.dataset.property] || typographyDefinition?.css;
    if (!css || !componentSelector) return;
    const from = inputPreviousValue(input);
    const value = input.value.trim();
    const sourceHint = sourceHintFor(selectedElement, css);
    const componentValue = typographyDefinition
      ? cssValueForInput(input.dataset.property, value, typographyDefinition.unit)
      : cssValueForInput(input.dataset.property, value);
    const declarations = layoutRules.get(componentSelector) || new Map();
    if (componentValue === '') declarations.delete(css);
    else declarations.set(css, componentValue);
    if (declarations.size) layoutRules.set(componentSelector, declarations);
    else layoutRules.delete(componentSelector);
    renderLayoutRules();
    const fromValue = cssValueForInput(input.dataset.property, from, typographyDefinition?.unit || 'px');
    reportStyleChange({ selector: componentSelector, property: css, from: fromValue, to: componentValue, sourceHint });
    rememberInputValue(input);
  };
  const editorModeAtPoint = (element, clientX, clientY) => {
    const box = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const margin = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map((property) => number(styles[property]));
    const border = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].map((property) => number(styles[property]));
    const padding = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((property) => number(styles[property]));
    const within = (left, top, right, bottom) => clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
    const paddingBox = [box.left + border[3], box.top + border[0], box.right - border[1], box.bottom - border[2]];
    const contentBox = [paddingBox[0] + padding[3], paddingBox[1] + padding[0], paddingBox[2] - padding[1], paddingBox[3] - padding[2]];
    const marginBox = [box.left - margin[3], box.top - margin[0], box.right + margin[1], box.bottom + margin[2]];
    const columnGap = number(styles.columnGap);
    const rowGap = number(styles.rowGap);
    if ((columnGap || rowGap) && (styles.display.includes('flex') || styles.display.includes('grid'))) {
      const children = [...element.children].map((child) => child.getBoundingClientRect());
      const inGap = children.some((first, index) => children.slice(index + 1).some((second) => {
        const verticalOverlap = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
        const horizontalOverlap = Math.min(first.right, second.right) - Math.max(first.left, second.left);
        const horizontalGap = second.left - first.right;
        const verticalGap = second.top - first.bottom;
        return (columnGap && horizontalGap > 0 && horizontalGap <= columnGap + 2 && verticalOverlap > 0
          && within(first.right, Math.max(first.top, second.top), second.left, Math.min(first.bottom, second.bottom)))
          || (rowGap && verticalGap > 0 && verticalGap <= rowGap + 2 && horizontalOverlap > 0
            && within(Math.max(first.left, second.left), first.bottom, Math.min(first.right, second.right), second.top));
      }));
      if (inGap) return 'gap';
    }
    if (within(...contentBox)) return 'size';
    if (within(...paddingBox)) return 'padding';
    if (within(...marginBox)) return 'margin';
    return 'size';
  };
  const show = (element, zone = highlightedZone) => {
    if (!element || [marginOverlay, paddingOverlay, contentOverlay].some((overlay) => overlay === element || overlay.contains(element))) return;
    const box = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const margin = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map((property) => number(styles[property]));
    const padding = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((property) => number(styles[property]));
    const border = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].map((property) => number(styles[property]));
    highlightedZone = zone;
    marginOverlay.style.border = zone === 'margin' ? '1px solid #e1a400' : '1px solid rgba(82,82,91,.7)';
    marginOverlay.style.background = zone === 'margin' ? 'rgba(255,229,123,.38)' : 'rgba(82,82,91,.05)';
    paddingOverlay.style.border = zone === 'padding' ? '1px solid #62a84f' : '1px solid rgba(113,113,122,.7)';
    paddingOverlay.style.background = zone === 'padding' ? 'rgba(163,217,113,.4)' : 'rgba(113,113,122,.07)';
    contentOverlay.style.border = zone === 'size' ? '2px solid #5367d9' : '1px solid rgba(161,161,170,.75)';
    contentOverlay.style.background = zone === 'size' ? 'rgba(83,103,217,.2)' : 'rgba(161,161,170,.08)';
    setRect(marginOverlay, box.left - margin[3], box.top - margin[0], box.width + margin[1] + margin[3], box.height + margin[0] + margin[2]);
    setRect(paddingOverlay, box.left + border[3], box.top + border[0], box.width - border[1] - border[3], box.height - border[0] - border[2]);
    setRect(contentOverlay, box.left + border[3] + padding[3], box.top + border[0] + padding[0], box.width - border[1] - border[3] - padding[1] - padding[3], box.height - border[0] - border[2] - padding[0] - padding[2]);
    // Keep the measurement label within the visible preview. Elements near the
    // top used to place the label outside the iframe because it was always
    // positioned 57px above their margin box.
    const marginLeft = box.left - margin[3];
    const marginTop = box.top - margin[0];
    const marginHeight = box.height + margin[0] + margin[2];
    const labelWidth = Math.min(390, Math.max(120, window.innerWidth - 16));
    const labelLeft = Math.max(8, Math.min(window.innerWidth - labelWidth - 8, marginLeft));
    const labelTop = marginTop >= 65
      ? marginTop - 57
      : Math.min(window.innerHeight - 56, marginTop + marginHeight + 8);
    label.style.left = `${labelLeft - marginLeft}px`;
    label.style.top = `${labelTop - marginTop}px`;
    const gap = styles.display.includes('flex') || styles.display.includes('grid')
      ? `\ngap: ${styles.rowGap} × ${styles.columnGap}`
      : '';
    drawGutters(element, styles, zone === 'gap');
    label.textContent = `${selectorFor(element)}  ${Math.round(box.width)} × ${Math.round(box.height)} px  ·  ${Math.round(box.left)}, ${Math.round(box.top)}\nmargin: ${margin.join(' / ')} px   padding: ${padding.join(' / ')} px${gap}`;
  };

  const applyEditorValue = (propertyName, rawValue, previousValue) => {
    if (!selectedElement) return;
    const input = { dataset: { property: propertyName, viewportParadePreviousValue: previousValue }, value: rawValue };
    if (editorMode === 'typography' && typographyProperty[input.dataset.property]) {
      applyTypography(input);
      return;
    }
    if (editorMode === 'component') {
      applyComponent(input);
      show(selectedElement);
      scheduleLayoutMap();
      return;
    }
    const value = input.value.trim();
    const from = inputPreviousValue(input);
    const property = cssProperty[input.dataset.property] || componentProperty[input.dataset.property];
    if (!property || !layoutSelector) return;
    let nextValue = '';
    if (value === '') {
      const declarations = layoutRules.get(layoutSelector);
      declarations?.delete(property);
      if (declarations?.size) layoutRules.set(layoutSelector, declarations);
      else layoutRules.delete(layoutSelector);
    } else if (componentProperty[input.dataset.property]) {
      nextValue = cssValueForInput(input.dataset.property, value);
    } else {
      nextValue = cssValueForInput(input.dataset.property, value);
    }
    if (nextValue) {
      const declarations = layoutRules.get(layoutSelector) || new Map();
      declarations.set(property, nextValue);
      layoutRules.set(layoutSelector, declarations);
    }
    renderLayoutRules();
    reportStyleChange({ selector: layoutSelector, property, from: cssValueForInput(input.dataset.property, from), to: nextValue });
    show(selectedElement);
    scheduleLayoutMap();
  };
  document.addEventListener('pointermove', (event) => {
    pointerInside = true;
    if ((!active && !commentPickerActive) || pinned) return;
    if (hoveredElement !== event.target) {
      hoveredElement = event.target;
      show(hoveredElement, undefined);
    } else {
      show(hoveredElement, editorModeAtPoint(hoveredElement, event.clientX, event.clientY));
    }
  }, true);
  document.addEventListener('click', (event) => {
    if (!active && !commentPickerActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // A subsequent click is a request to edit another zone, not a request to
    // close the editor. This makes it possible to move from content to padding
    // on the same element without toggling the inspector off and on again.
    selectLayerElement(event.target);
  }, true);
  document.addEventListener('dblclick', (event) => {
    if (!active && !commentPickerActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectLayerElement(event.target);
  }, true);
  const refreshHoveredElement = () => {
    if ((active || commentPickerActive) && !pinned && pointerInside && hoveredElement) show(hoveredElement);
    else if (selectedElement) show(selectedElement);
    scheduleLayoutMap();
  };
  window.addEventListener('scroll', refreshHoveredElement, true);
  window.addEventListener('resize', refreshHoveredElement);
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'toggle-inspector')) return;
    active = Boolean(event.data.enabled);
    interactionMode = active ? 'edit' : (commentPickerActive ? 'comment' : 'edit');
    syncInteractionState();
    if (!active && !commentPickerActive) clearSelection();
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'toggle-comment-picker')) return;
    commentPickerActive = Boolean(event.data.enabled);
    interactionMode = commentPickerActive ? 'comment' : 'edit';
    syncInteractionState();
    if (!commentPickerActive && !active) clearSelection();
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'toggle-layout-contrast')) return;
    layoutMode = Boolean(event.data.enabled);
    document.documentElement.toggleAttribute('data-viewport-parade-layout-contrast', layoutMode);
    renderLayoutMap();
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'clear-inspector-selection')) return;
    clearSelection();
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'inspector-editor-input')) return;
    applyEditorValue(event.data.property, String(event.data.value ?? ''), String(event.data.previousValue ?? ''));
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'inspector-pointer-left')) return;
    pointerInside = false;
    // Keep hoveredElement for scroll calculations, but remove the focused
    // colours as soon as the cursor is no longer over this preview.
    clearHover();
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'inspector-pointer-entered')) return;
    pointerInside = true;
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'layers-request-tree')) return;
    sendLayersTree();
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'layers-select')) return;
    selectLayerElement(layerElementFor(event.data.path), { exact: true });
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'layers-hover')) return;
    const element = layerElementFor(event.data.path);
    if (element) show(element, 'size');
    else if (selectedElement) show(selectedElement, 'size');
    else hideOverlays();
  });
  let layersRefreshTimer;
  new MutationObserver(() => {
    clearTimeout(layersRefreshTimer);
    layersRefreshTimer = setTimeout(sendLayersTree, 120);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  if (initialMessage.type === 'toggle-inspector') {
    active = Boolean(initialMessage.enabled);
    interactionMode = 'edit';
    syncInteractionState();
  } else if (initialMessage.type === 'toggle-comment-picker') {
    commentPickerActive = Boolean(initialMessage.enabled);
    interactionMode = 'comment';
    syncInteractionState();
  } else if (initialMessage.type === 'toggle-layout-contrast') {
    layoutMode = Boolean(initialMessage.enabled);
    document.documentElement.toggleAttribute('data-viewport-parade-layout-contrast', layoutMode);
    if (layoutMode) renderLayoutMap();
  }
  if (initialMessage.type === 'layers-request-tree') sendLayersTree();
  };
  window.addEventListener('message', function activateInspector(event) {
    const type = event.data?.type;
    if (!isStudioMessage(event, type) || !['toggle-inspector', 'toggle-comment-picker', 'toggle-layout-contrast', 'layers-request-tree'].includes(type)) return;
    window.removeEventListener('message', activateInspector);
    install(event.data);
  });
})();
