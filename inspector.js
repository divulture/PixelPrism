(() => {
  const INSPECTOR_PROTOCOL_VERSION = 14;
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
  // True while recorded view switches are clicked again by PixelPrism, so
  // neither the tools nor the recorder treat those clicks as the user's.
  let replayingSteps = false;
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
  // Router calls to history.pushState run in the page's world, where a patch
  // made from this isolated content script is invisible. Navigation API
  // events are shared by both worlds, so SPA route changes are reported too.
  window.navigation?.addEventListener('currententrychange', () => setTimeout(() => reportPreviewNavigation(location.href), 0));
  window.addEventListener('popstate', () => setTimeout(() => reportPreviewNavigation(location.href), 0));
  window.addEventListener('hashchange', () => setTimeout(() => reportPreviewNavigation(location.href), 0));
  // Navigation is useful even when the visual inspector itself is off.
  document.addEventListener('click', (event) => {
    if (replayingSteps || !navigationSyncActive || inspectorInteractionActive || document.documentElement.hasAttribute('data-viewport-parade-inspecting') || event.defaultPrevented || event.button !== 0) return;
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
  // Describes an element so it can be found again on a fresh load. Used by
  // the tools and by the click recorder, which runs before they are set up.
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
    const box = element.getBoundingClientRect();
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
      // Page coordinates at this viewport size. If the page changes and the
      // element cannot be found again, this still says where it was.
      rect: {
        x: Math.round(box.left + window.scrollX),
        y: Math.round(box.top + window.scrollY),
        width: Math.round(box.width),
        height: Math.round(box.height)
      },
      parent: parent ? {
        tag: parent.tagName.toLowerCase(),
        selector: stableSelectorFor(parent),
        display: getComputedStyle(parent).display
      } : null
    };
  };
  // Clicks that switch a view inside the page: tabs, segmented controls,
  // accordions. A comment keeps the ones made before it on this page, so
  // the studio and the review export can bring that view back. Only view
  // switches are kept: replaying other clicks could submit or delete
  // something for real in the user's session.
  const VIEW_SWITCH_SELECTOR = '[role="tab"], [role="radio"], [role="menuitemradio"], [aria-selected], [aria-controls], [aria-expanded], summary, input[type="radio"]';
  // A whole class name that ends like a group of switches: tabs, nav-tabs,
  // tab-list, segmented-control, filters-list… Never tab-content or tab-pane,
  // whose children are the page content, not switches.
  const VIEW_SWITCH_GROUP = /(^|[-_])(tabs|tab-?list|tab-?bar|tabs-?list|segment(ed)?(-?control)?|pills|switcher|toggle-?group|filters(-?list)?)$/i;
  const isViewSwitchGroup = (node) => node.getAttribute('role') === 'tablist'
    || (typeof node.className === 'string' && node.className.split(/\s+/).some((name) => VIEW_SWITCH_GROUP.test(name)));
  const RISKY_CONTROL = /(delete|remove|удал|save|сохран|submit|отправ|send|pay|оплат|buy|купи|confirm|подтверд|log ?out|sign ?out|выйти)/i;
  const viewSwitchFor = (target) => {
    if (!(target instanceof Element)) return null;
    let control = target.closest(VIEW_SWITCH_SELECTOR);
    if (!control) {
      // Tabs built from plain elements: the clicked item is a direct child of
      // a tabs-like group (role="tablist", or a class such as .tabs).
      for (let node = target, depth = 0; node?.parentElement && depth < 6; node = node.parentElement, depth += 1) {
        if (isViewSwitchGroup(node.parentElement)) {
          control = node;
          break;
        }
      }
    }
    if (!control || control === document.body || control === document.documentElement) return null;
    if (control.closest('form') && !control.matches('[role="tab"], [aria-selected], [aria-expanded], summary')) return null;
    return isReplayable(control) ? control : null;
  };
  // Never replayed: real navigation (followed as a page change), submits,
  // and anything that reads like it changes data.
  const isReplayable = (control) => {
    if (control.matches('[type="submit"]') || (control.matches('a[href]') && !control.getAttribute('href').startsWith('#'))) return false;
    // A button in a form without type="button" submits it.
    if (control.matches('button:not([type])') && control.closest('form')) return false;
    return !RISKY_CONTROL.test(`${control.textContent || ''} ${control.getAttribute('aria-label') || ''}`);
  };
  // Popups that appear on a click: dialogs, modals, drawers, menus,
  // popovers. Class-named ones must float (fixed or absolute) to count.
  const POPUP_SELECTOR = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], [role="listbox"], [popover], [class*="modal" i], [class*="dialog" i], [class*="drawer" i], [class*="popover" i], [class*="popup" i], [class*="dropdown-menu" i]';
  const isShown = (node) => {
    if (!node.isConnected) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
  };
  const visiblePopups = () => {
    const nodes = [...document.querySelectorAll(POPUP_SELECTOR)].filter((node) => {
      if (node.closest('[data-viewport-parade-overlay]') || !isShown(node)) return false;
      if (node.matches('dialog, [role], [aria-modal], [popover]')) return !node.matches('[popover]') || node.matches(':popover-open');
      return ['fixed', 'absolute'].includes(getComputedStyle(node).position);
    });
    // The outermost node stands for the popup; its inner parts are skipped.
    return nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
  };
  const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  // Resolves with a popup that was not open before, or null after `timeout`.
  const popupOpenedSince = async (before, timeout) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await wait(120);
      const opened = visiblePopups().find((node) => !before.has(node));
      if (opened) return opened;
    }
    return null;
  };
  let viewSteps = [];
  let viewStepsPath = `${location.pathname}${location.search}`;
  // Page nodes behind each step, kept out of the steps so they can be posted.
  const stepNodes = new WeakMap();
  // A closed popup takes its opening step and every step made inside it.
  const pruneViewSteps = () => {
    const closed = [];
    viewSteps = viewSteps.filter((step) => {
      const nodes = stepNodes.get(step);
      if (nodes?.control && closed.some((popup) => popup.contains(nodes.control))) return false;
      if (nodes?.popup && !isShown(nodes.popup)) {
        closed.push(nodes.popup);
        return false;
      }
      return true;
    });
  };
  const currentViewSteps = () => {
    if (viewStepsPath !== `${location.pathname}${location.search}`) return [];
    pruneViewSteps();
    return viewSteps.slice();
  };
  const recordViewStep = (step, control, popup = null) => {
    const path = `${location.pathname}${location.search}`;
    if (path !== viewStepsPath) {
      viewSteps = [];
      viewStepsPath = path;
    }
    pruneViewSteps();
    stepNodes.set(step, { control, popup });
    // The latest click on a control wins; older ones are superseded.
    viewSteps = viewSteps.filter((previous) => previous.element.domPath !== step.element.domPath).concat(step).slice(-12);
  };
  document.addEventListener('click', (event) => {
    if (replayingSteps || !event.isTrusted || inspectorInteractionActive || document.documentElement.hasAttribute('data-viewport-parade-inspecting')) return;
    const switchControl = viewSwitchFor(event.target);
    const trigger = switchControl || (event.target instanceof Element
      ? event.target.closest('button, a, [role="button"], [aria-haspopup], [aria-controls], [tabindex], label') || event.target
      : null);
    if (!trigger || trigger === document.body || trigger === document.documentElement || !isReplayable(trigger)) return;
    const label = truncate(trigger.textContent || trigger.getAttribute('aria-label') || '', 60);
    const popupsBefore = new Set(visiblePopups());
    let step = null;
    if (switchControl) {
      step = { element: elementContextFor(switchControl), label };
      // Toggles remember the state they were switched to, so a replay does
      // not close what is already open.
      const expanded = switchControl.getAttribute('aria-expanded');
      if (expanded === 'true' || expanded === 'false') step.expanded = expanded === 'true' ? 'false' : 'true';
      if (switchControl.tagName === 'SUMMARY' && switchControl.parentElement instanceof HTMLDetailsElement) step.open = !switchControl.parentElement.open;
      recordViewStep(step, switchControl);
    }
    const context = switchControl ? null : elementContextFor(trigger);
    // Any other click counts once it opens a popup.
    popupOpenedSince(popupsBefore, 900).then((popup) => {
      if (!popup) return;
      if (step) stepNodes.set(step, { control: switchControl, popup });
      else recordViewStep({ kind: 'open', element: context, label }, trigger, popup);
    });
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
      componentSelector = typographySelectorFor(componentTarget);
      await ensureAuthoredStylesheets();
      if (selectedElement !== componentTarget) return;
      populateEditor(selectedElement, 'component');
    }
    window.parent.postMessage({ source: 'viewport-parade', type: 'layers-selected', path: layerPathFor(selectedElement) }, extensionOrigin);
    window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-element-selected', route: `${location.pathname}${location.search}${location.hash}`, element: elementContextFor(selectedElement), steps: currentViewSteps() }, extensionOrigin);
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
    if ((!active && !commentPickerActive) || replayingSteps) return;
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
  // Comment markers: numbered pins over commented elements, shown while the
  // Comments panel is open. Dragging a marker onto another element re-binds
  // its comment; Alt keeps the exact point instead. Markers live in a shadow
  // root so page styles cannot restyle them.
  const commentLayer = document.createElement('div');
  commentLayer.dataset.viewportParadeOverlay = '';
  commentLayer.setAttribute('aria-hidden', 'true');
  commentLayer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;';
  const commentShadow = commentLayer.attachShadow({ mode: 'open' });
  commentShadow.innerHTML = `<style>
    :host { all: initial; }
    .target { position: fixed; box-sizing: border-box; display: none; border: 1.5px solid rgba(239, 68, 68, .9); border-radius: 2px; background: rgba(239, 68, 68, .07); pointer-events: none; }
    .target.is-drop { border-style: dashed; background: rgba(239, 68, 68, .1); }
    .marker { position: fixed; left: 0; top: 0; box-sizing: border-box; display: grid; place-items: center; width: 22px; height: 22px; margin: -11px 0 0 -11px; padding: 0; border: 2px solid #fff; border-radius: 50%; background: #ef4444; color: #fff; box-shadow: 0 1px 4px rgba(24, 24, 27, .3); font: 600 11px/1 Inter, ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums; cursor: grab; pointer-events: auto; user-select: none; touch-action: none; transition: box-shadow 120ms ease, opacity 120ms ease; }
    .marker:hover { box-shadow: 0 0 0 3px rgba(239, 68, 68, .28), 0 1px 4px rgba(24, 24, 27, .3); }
    .marker.is-selected { z-index: 2; animation: marker-select-pulse 1.6s ease-in-out infinite; }
    .marker.is-dragging { z-index: 3; cursor: grabbing; opacity: .92; transition: none; animation: none; }
    .marker.is-pulse { animation: pulse 700ms ease-out 2; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, .6), 0 2px 6px rgba(24, 24, 27, .3); } 100% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0), 0 2px 6px rgba(24, 24, 27, .3); } }
    @keyframes marker-select-pulse { 0%, 100% { box-shadow: 0 0 0 4px rgba(239, 68, 68, .32), 0 2px 8px rgba(24, 24, 27, .35); } 50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, .14), 0 2px 8px rgba(24, 24, 27, .35); } }
  </style><div class="target"></div>`;
  const commentTargetBox = commentShadow.querySelector('.target');
  document.documentElement.append(commentLayer);
  let commentMarkers = [];
  let commentMarkersEnabled = false;
  let selectedCommentId = null;
  let markerDrag = null;
  let suppressMarkerClick = false;
  let lastMarkerStatus = '';
  let markerResolveTimer;
  let markerPositionFrame;
  let markerDriftTimer;
  // Previews are scaled down in Studio; markers keep their on-screen size.
  let markerScale = 1;

  // Same lookup as the exported review, so a marker shown here is also
  // placed on the review screenshot.
  const queryAll = (selector) => {
    if (!selector || typeof selector !== 'string') return [];
    try { return [...document.querySelectorAll(selector)].slice(0, 400); } catch { return []; }
  };
  const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const snippetFor = (element) => {
    const clone = element.cloneNode(true);
    [...clone.attributes].forEach((attribute) => {
      if (attribute.name.startsWith('data-viewport-parade-') || attribute.name.startsWith('data-pixelprism-')) clone.removeAttribute(attribute.name);
    });
    if (clone.children.length) clone.replaceChildren(document.createTextNode('…'));
    return normalizeText(clone.outerHTML);
  };
  const elementAtIndexPath = (path) => {
    if (!Array.isArray(path) || !path.length) return null;
    let node = document.documentElement;
    for (const index of path) {
      node = [...node.children].filter((child) => !child.hasAttribute('data-viewport-parade-overlay'))[index];
      if (!node) return null;
    }
    return node;
  };
  const commentElementFor = (marker) => {
    const context = marker.element || { selector: marker.selector };
    if (context.id) {
      const byId = document.getElementById(context.id);
      if (byId && matchesContext(byId, context)) return byId;
    }
    const attributes = context.attributes || {};
    for (const name of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'role', 'aria-label', 'href', 'type']) {
      const value = attributes[name];
      if (value === null || value === undefined || value === '') continue;
      const match = queryOne(`[${CSS.escape(name)}="${CSS.escape(String(value))}"]`);
      if (match && matchesContext(match, context)) return match;
    }
    const byIndexPath = elementAtIndexPath(context.indexPath);
    if (byIndexPath && matchesContext(byIndexPath, context)) return byIndexPath;
    const candidates = [];
    for (const selector of [context.domPath, context.selector, marker.selector]) {
      const matches = queryAll(selector).filter((element) => matchesContext(element, context));
      if (matches.length === 1) return matches[0];
      matches.forEach((element) => { if (!candidates.includes(element)) candidates.push(element); });
    }
    if (!candidates.length) return null;
    const snippet = normalizeText(context.htmlSnippet).replace(/…$/, '');
    const text = normalizeText(context.text).replace(/…$/, '');
    let best = null;
    let bestScore = 0;
    candidates.forEach((element) => {
      let score = 0;
      if (snippet) {
        const candidateSnippet = snippetFor(element);
        if (candidateSnippet === snippet) score += 4;
        else if (candidateSnippet.startsWith(snippet) || snippet.startsWith(candidateSnippet.slice(0, 80))) score += 2;
      }
      if (text) {
        const candidateText = normalizeText(element.textContent);
        if (candidateText === text) score += 3;
        else if (candidateText.startsWith(text)) score += 2;
      }
      if (score > bestScore) { best = element; bestScore = score; }
    });
    return best || (candidates.length === 1 ? candidates[0] : null);
  };
  const isRendered = (element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 && rect.height < 1) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  // Comments left before views were recorded have no steps. When such an
  // element was not shown on this page load and appears after the user
  // switches tabs or opens a popup, those switches are how to reach it.
  const unshownCommentIds = new Set();
  const learnViewSteps = (marker) => {
    if (marker.steps.length || marker.pin) return;
    if (marker.state !== 'placed') {
      unshownCommentIds.add(marker.id);
      return;
    }
    if (!unshownCommentIds.delete(marker.id)) return;
    const steps = currentViewSteps();
    if (!steps.length) return;
    marker.steps = steps;
    window.parent.postMessage({ source: 'viewport-parade', type: 'comment-steps-learned', id: marker.id, steps }, extensionOrigin);
  };
  const resolveCommentMarkers = () => {
    commentMarkers.forEach((marker) => {
      if (marker.pin) {
        marker.target = null;
        marker.state = 'placed';
        return;
      }
      if (!marker.target?.isConnected) marker.target = commentElementFor(marker);
      // Checked only for a missing element, so a normal page costs nothing.
      const inOtherView = () => marker.steps.length > 0 && !viewStepsClicked(marker.steps) && !viewStepsMatch(marker.steps, false);
      if (marker.target && isRendered(marker.target)) marker.state = 'placed';
      // Left in another tab or panel: the studio can switch to it.
      else if (inOtherView()) marker.state = 'other-view';
      else if (marker.target) marker.state = 'hidden';
      // Element gone: show the comment where the element was recorded.
      else marker.state = recordedRectFor(marker) ? 'approx' : 'missing';
      learnViewSteps(marker);
    });
    const status = JSON.stringify(commentMarkers.map(({ id, state }) => [id, state]));
    if (status !== lastMarkerStatus) {
      lastMarkerStatus = status;
      window.parent.postMessage({
        source: 'viewport-parade',
        type: 'comment-markers-status',
        statuses: commentMarkers.map(({ id, state }) => ({ id, state }))
      }, extensionOrigin);
    }
    positionCommentMarkers();
  };
  // Throttled rather than debounced: a page that animates forever would
  // otherwise never let a late-rendered element get its marker.
  const scheduleMarkerResolve = () => {
    if (!commentMarkersEnabled || markerResolveTimer) return;
    markerResolveTimer = setTimeout(() => {
      markerResolveTimer = undefined;
      if (commentMarkersEnabled) resolveCommentMarkers();
    }, 250);
  };
  // Whether the page shows the view a comment was left in: each recorded
  // switch is found and is in its recorded state (a selected tab, an open
  // panel). Tabs made of plain classes have no readable state; `unknown` is
  // what they count as.
  const viewStepsMatch = (steps, unknown = true) => steps.every((step) => {
    // A popup is open or not, but which one cannot be told apart.
    if (step.kind === 'open') return unknown && visiblePopups().length > 0;
    const control = commentElementFor({ element: step.element, selector: step.element?.selector });
    if (!control) return false;
    if (step.expanded) return control.getAttribute('aria-expanded') === step.expanded;
    if (typeof step.open === 'boolean' && control.parentElement instanceof HTMLDetailsElement) return control.parentElement.open === step.open;
    const selected = control.getAttribute('aria-selected');
    if (selected === 'true' || selected === 'false') return selected === 'true';
    if (control.matches('input[type="radio"]')) return control.checked;
    return unknown;
  });
  // The recorded switches were clicked since this page loaded (by the user
  // or by a replay), so the page is in that view as far as we can tell.
  const viewStepsClicked = (steps) => {
    const clicked = new Set(currentViewSteps().map((step) => step.element?.domPath));
    return steps.every((step) => clicked.has(step.element?.domPath));
  };
  // Clicks the recorded view switches again, waiting for each control to
  // render, and skipping those already in the recorded state.
  const replayViewSteps = async (steps) => {
    replayingSteps = true;
    try {
      for (const step of steps) {
        let control = null;
        for (let attempt = 0; attempt < 15 && !control; attempt += 1) {
          control = commentElementFor({ element: step.element, selector: step.element?.selector });
          if (!control) await wait(100);
        }
        if (!control) continue;
        if (step.kind !== 'open' && viewStepsMatch([step]) && (step.expanded || typeof step.open === 'boolean' || control.getAttribute('aria-selected') === 'true')) continue;
        const popupsBefore = new Set(visiblePopups());
        control.click();
        // Wait for a popup to open; a plain switch just gets time to render.
        const popup = await popupOpenedSince(popupsBefore, step.kind === 'open' ? 1500 : 350);
        stepNodes.set(step, { control, popup });
      }
    } finally {
      replayingSteps = false;
    }
    // The page now shows this view; comments left here keep these steps.
    viewSteps = steps.slice();
    viewStepsPath = `${location.pathname}${location.search}`;
  };
  const recordedRectFor = (marker) => {
    const rect = marker.element?.rect;
    return rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ? rect : null;
  };
  const markerRectFor = (marker) => {
    if (marker.pin) return { left: marker.pin.x - window.scrollX, top: marker.pin.y - window.scrollY, width: 0, height: 0 };
    if (marker.state === 'approx') {
      const rect = recordedRectFor(marker);
      return { left: rect.x - window.scrollX, top: rect.y - window.scrollY, width: rect.width, height: rect.height };
    }
    return marker.state === 'placed' && marker.target?.isConnected ? marker.target.getBoundingClientRect() : null;
  };
  const positionCommentMarkers = () => {
    markerPositionFrame = undefined;
    const perTarget = new Map();
    const inset = 13;
    commentMarkers.forEach((marker) => {
      if (markerDrag?.marker === marker && markerDrag.moved) return;
      const rect = markerRectFor(marker);
      if (!rect) {
        marker.node.style.display = 'none';
        return;
      }
      const key = marker.target || (marker.pin ? `${marker.pin.x},${marker.pin.y}` : `${rect.left},${rect.top}`);
      const offset = perTarget.get(key) || 0;
      perTarget.set(key, offset + 1);
      // A marker moved inside its element keeps that spot; otherwise it sits
      // on the top-left corner, side by side with others on the element.
      const point = marker.offset && !marker.pin
        ? { x: Math.min(Math.max(marker.offset.x, 0), rect.width), y: Math.min(Math.max(marker.offset.y, 0), rect.height) }
        : { x: offset * 24, y: 0 };
      let x = rect.left + point.x;
      let y = rect.top + point.y;
      // Keep the marker of a partly visible element on screen, like the
      // review screenshots do; one that scrolled away goes with it.
      const intersects = rect.left + rect.width > 0 && rect.left < innerWidth && rect.top + rect.height > 0 && rect.top < innerHeight;
      if (intersects) {
        x = Math.min(Math.max(x, inset + (marker.offset ? 0 : offset * 24)), Math.max(inset, innerWidth - inset));
        y = Math.min(Math.max(y, inset), Math.max(inset, innerHeight - inset));
      }
      marker.node.style.display = '';
      marker.node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${markerScale})`;
      marker.node.classList.toggle('is-selected', marker.id === selectedCommentId);
    });
    const selected = markerDrag ? null : commentMarkers.find((marker) => marker.id === selectedCommentId && ((marker.target && marker.state === 'placed') || marker.state === 'approx'));
    if (selected) {
      // A recorded position is outlined dashed: it is where the element was.
      showCommentTargetBox(selected.state === 'approx' ? markerRectFor(selected) : selected.target.getBoundingClientRect(), selected.state === 'approx');
    } else if (!markerDrag) {
      commentTargetBox.style.display = 'none';
    }
  };
  const scheduleMarkerPosition = () => {
    if (!commentMarkersEnabled || markerPositionFrame) return;
    markerPositionFrame = requestAnimationFrame(positionCommentMarkers);
  };
  const showCommentTargetBox = (rect, drop) => {
    commentTargetBox.classList.toggle('is-drop', drop);
    Object.assign(commentTargetBox.style, {
      display: 'block',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  };
  const applyCommentMarkers = (data) => {
    commentMarkersEnabled = Boolean(data.enabled);
    selectedCommentId = data.selectedId || null;
    markerScale = Math.min(3, Math.max(1, 1 / (Number(data.scale) || 1)));
    commentTargetBox.style.borderWidth = `${1.5 * markerScale}px`;
    commentMarkers.forEach((marker) => marker.node.remove());
    commentMarkers = [];
    lastMarkerStatus = '';
    clearInterval(markerDriftTimer);
    if (markerDrag) markerDrag = null;
    commentLayer.style.display = commentMarkersEnabled ? 'block' : 'none';
    if (!commentMarkersEnabled) {
      commentTargetBox.style.display = 'none';
      return;
    }
    commentMarkers = (Array.isArray(data.markers) ? data.markers : []).map((item) => {
      const node = document.createElement('div');
      node.className = 'marker';
      node.textContent = String(item.number);
      node.title = `${item.number}. ${truncate(item.text, 160)}\n\nDrag within the element to move the marker, or onto another element to attach the comment there. Hold Alt to pick the exact element under the pointer.`;
      node.dataset.commentId = item.id;
      commentShadow.append(node);
      const pin = item.pin && Number.isFinite(item.pin.x) && Number.isFinite(item.pin.y) ? { x: item.pin.x, y: item.pin.y } : null;
      const offset = item.offset && Number.isFinite(item.offset.x) && Number.isFinite(item.offset.y) ? { x: item.offset.x, y: item.offset.y } : null;
      const steps = Array.isArray(item.steps) ? item.steps : [];
      return { id: item.id, number: item.number, element: item.element || null, selector: item.selector || '', pin, offset, steps, node, target: null, state: 'missing' };
    });
    resolveCommentMarkers();
    // Layout can shift without a scroll or DOM change (fonts, animations).
    markerDriftTimer = setInterval(scheduleMarkerPosition, 500);
  };
  const focusCommentMarker = (id) => {
    const marker = commentMarkers.find((candidate) => candidate.id === id);
    selectedCommentId = id;
    if (!marker) return;
    const recorded = marker.state === 'approx' ? recordedRectFor(marker) : null;
    if (marker.pin) window.scrollTo({ top: Math.max(0, marker.pin.y - (innerHeight / 2)), behavior: 'smooth' });
    else if (recorded) window.scrollTo({ top: Math.max(0, recorded.y + (recorded.height / 2) - (innerHeight / 2)), behavior: 'smooth' });
    else if (marker.target && marker.state === 'placed') marker.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    marker.node.classList.remove('is-pulse');
    void marker.node.offsetWidth;
    marker.node.classList.add('is-pulse');
    scheduleMarkerPosition();
  };
  const markerNodeFromEvent = (event) => event.composedPath().find((node) => node instanceof Element && node.classList.contains('marker') && commentShadow.contains(node));
  // Where a dragged marker lands. Inside its own element it only moves
  // there; over another element it re-binds to it. Alt picks exactly the
  // element under the pointer, such as a badge inside the current link.
  const dropTargetAt = (marker, x, y, exactElement) => {
    const current = marker.state === 'placed' && marker.target?.isConnected ? marker.target : null;
    const currentRect = current?.getBoundingClientRect();
    const inside = (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (current && !exactElement && inside(currentRect)) return { element: current, rect: currentRect, same: true };
    const hit = document.elementsFromPoint(x, y).find((element) => element !== commentLayer && !element.hasAttribute('data-viewport-parade-overlay'));
    const element = hit && hit !== document.documentElement && hit !== document.body ? hit : null;
    const rect = element?.getBoundingClientRect();
    // The page background, or a wrapper bigger than a good part of the
    // screen, is no target worth binding to: keep the dropped point instead.
    if (!element || rect.width * rect.height > innerWidth * innerHeight * 0.4) {
      return { pin: { x: Math.round(x + window.scrollX), y: Math.round(y + window.scrollY) } };
    }
    return { element, rect, same: element === current };
  };
  const endMarkerDrag = () => {
    if (!markerDrag) return;
    markerDrag.marker.node.classList.remove('is-dragging');
    try { markerDrag.marker.node.releasePointerCapture(markerDrag.pointerId); } catch { /* Already released. */ }
    markerDrag = null;
    commentTargetBox.style.display = 'none';
    scheduleMarkerPosition();
  };
  // Window capture runs before the comment picker's document listeners, so
  // grabbing a marker never selects the element underneath it.
  window.addEventListener('pointerdown', (event) => {
    const node = commentMarkersEnabled && markerNodeFromEvent(event);
    if (!node) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button !== 0) return;
    const marker = commentMarkers.find((candidate) => candidate.node === node);
    if (!marker) return;
    markerDrag = { marker, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, drop: null };
    node.setPointerCapture(event.pointerId);
  }, true);
  window.addEventListener('pointermove', (event) => {
    if (!markerDrag) {
      if (commentMarkersEnabled && markerNodeFromEvent(event)) event.stopImmediatePropagation();
      return;
    }
    if (event.pointerId !== markerDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!markerDrag.moved && Math.hypot(event.clientX - markerDrag.startX, event.clientY - markerDrag.startY) < 4) return;
    markerDrag.moved = true;
    const { node } = markerDrag.marker;
    node.classList.add('is-dragging');
    node.style.transform = `translate(${Math.round(event.clientX)}px, ${Math.round(event.clientY)}px) scale(${markerScale})`;
    markerDrag.drop = dropTargetAt(markerDrag.marker, event.clientX, event.clientY, event.altKey);
    // Solid: stays on its element. Dashed: will move to this element.
    if (markerDrag.drop.element) showCommentTargetBox(markerDrag.drop.rect, !markerDrag.drop.same);
    else commentTargetBox.style.display = 'none';
  }, true);
  window.addEventListener('pointerup', (event) => {
    if (!markerDrag || event.pointerId !== markerDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // The click that follows this pointerup must not reach the comment
    // picker; reset afterwards in case the browser sends no click at all.
    suppressMarkerClick = true;
    setTimeout(() => { suppressMarkerClick = false; }, 0);
    const { marker, moved } = markerDrag;
    const drop = moved ? dropTargetAt(marker, event.clientX, event.clientY, event.altKey) : null;
    endMarkerDrag();
    if (!moved) {
      selectedCommentId = marker.id;
      scheduleMarkerPosition();
      window.parent.postMessage({ source: 'viewport-parade', type: 'comment-marker-activated', id: marker.id }, extensionOrigin);
      return;
    }
    const route = `${location.pathname}${location.search}${location.hash}`;
    window.parent.postMessage(drop.element
      ? {
        source: 'viewport-parade',
        type: 'comment-marker-moved',
        id: marker.id,
        route,
        element: elementContextFor(drop.element),
        // Where in the element the marker was dropped.
        offset: { x: Math.round(event.clientX - drop.rect.left), y: Math.round(event.clientY - drop.rect.top) },
        same: drop.same,
        steps: currentViewSteps()
      }
      : { source: 'viewport-parade', type: 'comment-marker-moved', id: marker.id, route, pin: drop.pin, steps: currentViewSteps() }, extensionOrigin);
  }, true);
  window.addEventListener('pointercancel', (event) => {
    if (markerDrag && event.pointerId === markerDrag.pointerId) endMarkerDrag();
  }, true);
  window.addEventListener('click', (event) => {
    if (!suppressMarkerClick && !(commentMarkersEnabled && markerNodeFromEvent(event))) return;
    suppressMarkerClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('dblclick', (event) => {
    if (!commentMarkersEnabled || !markerNodeFromEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('keydown', (event) => {
    if (!commentMarkersEnabled || event.key !== 'Escape') return;
    if (markerDrag) {
      event.preventDefault();
      event.stopImmediatePropagation();
      endMarkerDrag();
      return;
    }
    // Focus is in the preview while a comment waits to be placed; Studio
    // cannot hear Escape there on its own.
    window.parent.postMessage({ source: 'viewport-parade', type: 'studio-shortcut', shortcut: 'escape' }, extensionOrigin);
  }, true);
  window.addEventListener('scroll', scheduleMarkerPosition, true);
  window.addEventListener('resize', scheduleMarkerPosition);
  new MutationObserver(scheduleMarkerResolve).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'comment-markers')) return;
    applyCommentMarkers(event.data);
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'comment-marker-focus')) return;
    focusCommentMarker(event.data.id);
  });
  window.addEventListener('message', async (event) => {
    if (!isStudioMessage(event, 'comment-replay-steps')) return;
    const marker = commentMarkers.find((candidate) => candidate.id === event.data.id);
    if (!marker?.steps.length) return;
    await replayViewSteps(marker.steps);
    // Report right away; the studio focuses the marker once it is placed.
    lastMarkerStatus = '';
    resolveCommentMarkers();
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
  if (initialMessage.type === 'comment-markers') applyCommentMarkers(initialMessage);
  };
  window.addEventListener('message', function activateInspector(event) {
    const type = event.data?.type;
    if (!isStudioMessage(event, type) || !['toggle-inspector', 'toggle-comment-picker', 'toggle-layout-contrast', 'layers-request-tree', 'comment-markers'].includes(type)) return;
    window.removeEventListener('message', activateInspector);
    install(event.data);
  });
})();
