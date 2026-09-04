(() => {
  const INSPECTOR_PROTOCOL_VERSION = 54;
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
    // A made-up id (React's ":r5:") differs on every load; it proves nothing.
    if (context.id && !GENERATED_ID.test(context.id) && element.id !== context.id) return false;
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
    if (context.id && !GENERATED_ID.test(context.id)) {
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
  // Interaction states shown on demand: the Inspector's Hover, Focus and
  // Pressed. The page's own :hover, :focus and :active rules are copied into
  // a sheet keyed to an attribute PixelPrism puts on the element, and on its
  // ancestors, which a real pointer hovers and presses too. So the state
  // holds while the pointer is over the Studio panel, and no debugger runs.
  // States a script draws get pointer and focus events (sendStateEvents).
  const STATE_ATTRIBUTE = 'data-viewport-parade-state';
  const STATE_SUFFIX = { hover: ':hover', focus: ':focus-visible', active: ':active' };
  const STATE_LABEL = { hover: 'Hover', focus: 'Focus', active: 'Pressed' };
  const STATE_TOKENS = { hover: 'hover', focus: 'focus focus-within', active: 'hover active' };
  const ANCESTOR_STATE_TOKENS = { hover: 'hover', focus: 'focus-within', active: 'hover active' };
  // An escaped colon is part of a class name (.md\:hover\:underline).
  const statePseudoPattern = /(?<![\\:]):(hover|active|focus-visible|focus-within|focus)(?![\w-])/gi;
  const hasStatePseudo = (selector) => new RegExp(statePseudoPattern.source, 'i').test(selector);
  const splitSelectorList = (text) => {
    const parts = [];
    let depth = 0;
    let quote = '';
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '\\') index += 1;
      else if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '(' || char === '[') depth += 1;
      else if (char === ')' || char === ']') depth -= 1;
      else if (char === ',' && !depth) {
        parts.push(text.slice(start, index).trim());
        start = index + 1;
      }
    }
    parts.push(text.slice(start).trim());
    return parts.filter(Boolean);
  };
  // One selector with its state pseudo-classes keyed to the attribute, or ''
  // when it has none. A state after a pseudo-element (::-webkit-scrollbar:hover)
  // cannot take an attribute, and :not(:hover) would match everything else.
  const forcedStateSelector = (selector) => {
    if (!hasStatePseudo(selector)) return '';
    if (/::[\w-]+(?:\([^)]*\))?:(?:hover|active|focus)/i.test(selector) || /:not\([^)]*:(?:hover|active|focus)/i.test(selector)) return '';
    return selector.replace(statePseudoPattern, (match, name) => {
      const token = name.toLowerCase() === 'focus-visible' ? 'focus' : name.toLowerCase();
      return `[${STATE_ATTRIBUTE}~="${token}"]`;
    });
  };
  const forcedStateSelectors = (selectorText) => splitSelectorList(String(selectorText)).map(forcedStateSelector).filter(Boolean);
  // The state a recorded edit is for: ".button:hover" → hover.
  const stateOfSelector = (selector) => Object.keys(STATE_SUFFIX).find((state) => String(selector).endsWith(STATE_SUFFIX[state])) || null;
  const ruleListOf = (sheet) => {
    try { return sheet.cssRules; } catch { return null; }
  };
  // Stylesheets from other origins can't be read by the page; the extension
  // fetches them, as it does for the Code panel.
  const fetchedStateSheets = new Map();
  const pageStyleSheets = async () => {
    const linked = await Promise.all([...document.styleSheets]
      .filter((sheet) => sheet.ownerNode?.dataset?.viewportParadeOverlay === undefined)
      .map(async (sheet) => {
        const media = sheet.media?.mediaText || '';
        const rules = ruleListOf(sheet);
        if (rules) return { rules, href: sheet.href, media };
        if (!sheet.href) return null;
        if (!fetchedStateSheets.has(sheet.href)) {
          fetchedStateSheets.set(sheet.href, chrome.runtime.sendMessage({ type: 'load-stylesheet', url: sheet.href })
            .then((response) => {
              if (!response?.ok || typeof response.css !== 'string') return null;
              const parsed = new CSSStyleSheet();
              parsed.replaceSync(response.css);
              return parsed;
            })
            .catch(() => null));
        }
        const parsed = await fetchedStateSheets.get(sheet.href);
        return parsed ? { rules: parsed.cssRules, href: sheet.href, media } : null;
      }));
    return [
      ...linked.filter(Boolean),
      ...(document.adoptedStyleSheets || []).map((sheet) => ({ rules: sheet.cssRules, href: null, media: '' }))
    ];
  };
  // Copied rules live in the document, so url() is made absolute against the
  // stylesheet it came from.
  const absoluteCssUrls = (text, base) => (base ? text.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (match, quote, path) => {
    if (!path || /^(?:data:|blob:|#|[a-z][\w+.-]*:)/i.test(path)) return match;
    try { return `url("${new URL(path, base).href}")`; } catch { return match; }
  }) : text);
  // The state copy of one rule, keeping its @media, @layer and nesting.
  const stateRuleText = (rule, base) => {
    if (rule.styleSheet) {
      const rules = ruleListOf(rule.styleSheet);
      const href = rule.styleSheet.href || base;
      return rules ? absoluteCssUrls([...rules].map((child) => stateRuleText(child, href)).join(''), href) : '';
    }
    const children = rule.cssRules ? [...rule.cssRules] : [];
    if (typeof rule.selectorText === 'string' && rule.style) {
      const forced = forcedStateSelectors(rule.selectorText);
      let text = forced.length ? `${forced.join(',')}{${rule.style.cssText}${children.map((child) => child.cssText).join('')}}` : '';
      const nested = children.map((child) => stateRuleText(child, base)).join('');
      if (nested) text += `${rule.selectorText}{${nested}}`;
      return text;
    }
    if (!children.length || rule.type === 7) return '';
    const inner = children.map((child) => stateRuleText(child, base)).join('');
    if (!inner) return '';
    const prelude = rule.media ? `@media ${rule.media.mediaText}` : rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
    return `${prelude}{${inner}}`;
  };
  const stateSheetText = (sheets) => sheets.map(({ rules, href, media }) => {
    const text = absoluteCssUrls([...rules].map((rule) => stateRuleText(rule, href)).join(''), href);
    return text && media && media !== 'all' ? `@media ${media}{${text}}` : text;
  }).join('\n');
  // Which states the page's CSS styles on this element, even a plain card
  // with a :hover rule. Nested rules are read against their parents.
  const stateRulesFor = (element, sheets) => {
    const found = new Set();
    const visit = (rules, parentSelector) => {
      [...rules].forEach((rule) => {
        if (rule.styleSheet) {
          const imported = ruleListOf(rule.styleSheet);
          if (imported) visit(imported, parentSelector);
          return;
        }
        let selector = parentSelector;
        if (typeof rule.selectorText === 'string') {
          selector = parentSelector
            ? splitSelectorList(rule.selectorText).map((part) => (part.includes('&') ? part.replaceAll('&', `:is(${parentSelector})`) : `:is(${parentSelector}) ${part}`)).join(',')
            : rule.selectorText;
          splitSelectorList(selector).forEach((part) => {
            const names = [...part.matchAll(new RegExp(statePseudoPattern.source, 'gi'))].map((match) => match[1].toLowerCase());
            if (!names.length || !forcedStateSelector(part)) return;
            const plain = part.replace(statePseudoPattern, '');
            try {
              if (!element.matches(plain.trim() || '*')) return;
            } catch {
              return;
            }
            names.forEach((name) => found.add(name.startsWith('focus') ? 'focus' : name));
          });
        }
        if (rule.cssRules?.length && rule.type !== 7) visit(rule.cssRules, selector);
      });
    };
    sheets.forEach(({ rules }) => visit(rules, ''));
    return found;
  };
  const FOCUSABLE_SELECTOR = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"]';
  const INTERACTIVE_SELECTOR = `${FOCUSABLE_SELECTOR}, label, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"]`;
  // The states worth offering for an element: what a control can be in, and
  // what the page styles on it.
  const statesFor = (element, sheets) => {
    const states = stateRulesFor(element, sheets);
    if (element.matches(INTERACTIVE_SELECTOR)) ['hover', 'active'].forEach((state) => states.add(state));
    if (element.matches(FOCUSABLE_SELECTOR)) states.add('focus');
    return Object.keys(STATE_SUFFIX).filter((state) => states.has(state));
  };
  let stateStyle;
  let forcedState = null;
  let forcedStateRun = 0;
  // Hover and press drawn by a script (Framer Motion, React's onMouseEnter)
  // answer pointer events, not CSS. The element gets the events a pointer
  // would send, entering through its ancestors.
  const pointerEvent = (type, element, bubbles, buttons = 0) => {
    const box = element.getBoundingClientRect();
    const init = {
      bubbles,
      cancelable: true,
      composed: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2,
      button: 0,
      buttons,
      relatedTarget: null
    };
    return type.startsWith('pointer')
      ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true })
      : new MouseEvent(type, init);
  };
  const ancestorsOf = (element) => {
    const nodes = [];
    for (let node = element; node; node = node.parentElement) nodes.push(node);
    return nodes;
  };
  // A tab selects itself when it gets focus (Radix, React Aria, WAI-ARIA's
  // automatic activation), so its Focus is drawn by the CSS state alone.
  const FOCUS_SELECTS = '[role="tab"]';
  const sendStateEvents = (element, state, on) => {
    if (!element.isConnected) return;
    if (state === 'focus') {
      if (element.matches(FOCUS_SELECTS)) return;
      element.dispatchEvent(new FocusEvent(on ? 'focus' : 'blur', { composed: true }));
      element.dispatchEvent(new FocusEvent(on ? 'focusin' : 'focusout', { bubbles: true, composed: true }));
      return;
    }
    const path = ancestorsOf(element);
    if (on) {
      element.dispatchEvent(pointerEvent('pointerover', element, true));
      path.slice().reverse().forEach((node) => node.dispatchEvent(pointerEvent('pointerenter', element, false)));
      element.dispatchEvent(pointerEvent('mouseover', element, true));
      path.slice().reverse().forEach((node) => node.dispatchEvent(pointerEvent('mouseenter', element, false)));
      if (state === 'active') {
        element.dispatchEvent(pointerEvent('pointerdown', element, true, 1));
      }
      return;
    }
    // A press ends cancelled, so no click or tap fires.
    if (state === 'active') element.dispatchEvent(pointerEvent('pointercancel', element, true));
    element.dispatchEvent(pointerEvent('pointerout', element, true));
    path.forEach((node) => node.dispatchEvent(pointerEvent('pointerleave', element, false)));
    element.dispatchEvent(pointerEvent('mouseout', element, true));
    path.forEach((node) => node.dispatchEvent(pointerEvent('mouseleave', element, false)));
  };
  // A press the way a pointer makes one. Libraries open menus on pointerdown
  // (Radix), on mousedown (MUI, react-select, Ant Design) or on click, so a
  // bare click() opens only some of them.
  const pressControl = (control) => {
    control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    control.dispatchEvent(pointerEvent('pointerover', control, true));
    control.dispatchEvent(pointerEvent('pointerenter', control, false));
    control.dispatchEvent(pointerEvent('mouseover', control, true));
    control.dispatchEvent(pointerEvent('mouseenter', control, false));
    control.dispatchEvent(pointerEvent('pointerdown', control, true, 1));
    control.dispatchEvent(pointerEvent('mousedown', control, true, 1));
    control.focus?.({ preventScroll: true });
    control.dispatchEvent(pointerEvent('pointerup', control, true));
    control.dispatchEvent(pointerEvent('mouseup', control, true));
    control.click();
  };
  const pressKey = (control, key) => {
    control.focus?.({ preventScroll: true });
    const init = { key, code: key, bubbles: true, cancelable: true, composed: true };
    control.dispatchEvent(new KeyboardEvent('keydown', init));
    control.dispatchEvent(new KeyboardEvent('keyup', init));
  };
  // While a state is on, the real pointer leaving (or the preview losing
  // focus to the Studio panel) does not end it.
  ['pointerout', 'pointerleave', 'mouseout', 'mouseleave', 'pointerup', 'pointercancel', 'mouseup', 'blur', 'focusout'].forEach((type) => {
    window.addEventListener(type, (event) => {
      const element = forcedState?.element;
      const target = event.target;
      if (!element || !event.isTrusted || !(target instanceof Node)) return;
      if (target === element || element.contains(target) || target.contains(element)) event.stopImmediatePropagation();
    }, true);
  });
  // Focus leaving the preview for the Studio (the camera menu, a panel) is
  // kept from the page: menus and selects that close when the window loses
  // focus (Radix, Ant Design, hand-made ones) stay open, so an item in them
  // can still be picked for a screenshot, a comment or the Inspector. Focus
  // moving within the page is left alone.
  ['blur', 'focusout'].forEach((type) => {
    window.addEventListener(type, (event) => {
      if (event.isTrusted && !document.hasFocus()) event.stopImmediatePropagation();
    }, true);
  });
  // A script animates its state over a few hundred milliseconds; the panel
  // reads the values once they stop changing.
  const stateStyleSnapshot = (element) => [element, ...element.querySelectorAll('*')].slice(0, 40).map((node) => {
    const style = getComputedStyle(node);
    return [style.backgroundColor, style.color, style.borderColor, style.boxShadow, style.opacity, style.transform, style.outlineColor, style.width, style.height].join('|');
  }).join(';');
  const stateStylesSettled = async (element, run) => {
    const deadline = Date.now() + 1500;
    await new Promise((resolve) => { setTimeout(resolve, 120); });
    let last = stateStyleSnapshot(element);
    let still = 0;
    while (still < 4 && Date.now() < deadline && run === forcedStateRun) {
      await new Promise((resolve) => { setTimeout(resolve, 40); });
      const next = stateStyleSnapshot(element);
      still = next === last ? still + 1 : 0;
      last = next;
    }
  };
  const releaseForcedState = () => {
    forcedStateRun += 1;
    if (!forcedState) return;
    const { element, state } = forcedState;
    forcedState = null;
    document.querySelectorAll(`[${STATE_ATTRIBUTE}]`).forEach((node) => node.removeAttribute(STATE_ATTRIBUTE));
    if (stateStyle) stateStyle.textContent = '';
    sendStateEvents(element, state, false);
  };
  // Puts the element in a state, once the page's state rules are copied.
  // Transitions are held off so the panel reads the state's final values.
  // `origin` says who holds the state: the Inspector's switch, a comment
  // left on a state, or a view replayed for a comment (a hover menu).
  const forceState = async (element, state, origin = 'inspector') => {
    releaseForcedState();
    if (!element?.isConnected || !STATE_SUFFIX[state]) return;
    const run = forcedStateRun;
    const text = stateSheetText(await pageStyleSheets());
    if (run !== forcedStateRun || !element.isConnected) return;
    if (!stateStyle?.isConnected) {
      stateStyle = document.createElement('style');
      stateStyle.dataset.viewportParadeOverlay = '';
    }
    stateStyle.textContent = `[${STATE_ATTRIBUTE}]{transition:none !important}\n${text}`;
    // After the page's sheets and PixelPrism's edits, as a later rule wins a tie.
    document.documentElement.append(stateStyle);
    element.setAttribute(STATE_ATTRIBUTE, STATE_TOKENS[state]);
    for (let node = element.parentElement; node; node = node.parentElement) node.setAttribute(STATE_ATTRIBUTE, ANCESTOR_STATE_TOKENS[state]);
    forcedState = { element, state, origin };
    sendStateEvents(element, state, true);
    await stateStylesSettled(element, run);
  };
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'reconcile-pending-changes')) return;
    const changes = Array.isArray(event.data.changes) ? event.data.changes : [];
    // Let framework microtasks and the first paint settle. This is deliberately
    // bounded; anything not verifiable remains pending for a later reload.
    setTimeout(async () => {
      // The page's own values, without the edits Studio brought back into
      // this preview: those are what the source has to match.
      const overrides = [...document.querySelectorAll('style[data-viewport-parade-overrides]')];
      overrides.forEach((style) => { style.disabled = true; });
      const resolved = [];
      for (const change of changes) {
        const element = elementForChange(change);
        // An edit to a state (".button:hover") is checked in that state. A
        // state the user has switched on in the Inspector is left alone.
        const state = stateOfSelector(change.selector);
        if (!element || (state && forcedState)) continue;
        if (state) await forceState(element, state);
        const actual = actualValueFor(element, change.property);
        if (state) releaseForcedState();
        if (actual !== null && valuesMatch(change.property, actual, change.after)) resolved.push({ key: change.key, after: change.after });
      }
      overrides.forEach((style) => { style.disabled = false; });
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
  // A link to a part of this same page (#pricing) only scrolls, so it is
  // not a page change: each preview clicks its own copy of the link instead
  // (mirrored clicks), as a site can give each breakpoint its own anchors
  // (#pricing-mobile).
  const isSameDocumentLink = (link) => {
    try {
      const url = new URL(link.href, location.href);
      return Boolean(url.hash) && url.href.split('#')[0] === location.href.split('#')[0];
    } catch {
      return false;
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
  // Only a changed address is a route change: routers also rewrite the
  // current entry's state without moving (Vue Router saves the scroll
  // position on beforeunload), and that must not be reported as a visit to
  // this page — it would undo a link click the studio is already loading.
  let documentNavigationUrl = location.href;
  // A new fragment alone is a scroll within the page, not a page change.
  const reportDocumentNavigation = () => setTimeout(() => {
    if (sameNavigationUrl(location.href, documentNavigationUrl)) return;
    const fragmentOnly = location.href.split('#')[0] === documentNavigationUrl.split('#')[0];
    documentNavigationUrl = location.href;
    if (!fragmentOnly) reportPreviewNavigation(location.href);
  }, 0);
  window.navigation?.addEventListener('currententrychange', reportDocumentNavigation);
  window.addEventListener('popstate', reportDocumentNavigation);
  window.addEventListener('hashchange', reportDocumentNavigation);
  // Navigation is useful even when the visual inspector itself is off.
  document.addEventListener('click', (event) => {
    if (replayingSteps || !navigationSyncActive || inspectorInteractionActive || document.documentElement.hasAttribute('data-viewport-parade-inspecting') || event.defaultPrevented || event.button !== 0) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = String(link.getAttribute('target') || '').toLowerCase();
    if ((target && target !== '_self') || isSameDocumentLink(link)) return;
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
    const shortcut = (event.shiftKey && ({ KeyR: 'shift+r', KeyG: 'shift+g', KeyC: 'shift+c' })[event.code])
      || ({ KeyI: 'i', KeyC: 'c', KeyL: 'l', KeyV: 'v', KeyE: 'e' })[event.code];
    if (!shortcut) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.parent.postMessage({ source: 'viewport-parade', type: 'studio-shortcut', shortcut }, extensionOrigin);
  }, true);
  // The element that scrolls the page. Usually the window, but app-like sites
  // often keep the window still and scroll a full-screen container instead,
  // sometimes only at some widths. Page positions are kept in its scroll
  // coordinates, as the review capture expects (REVIEW_SCROLLER_HELPERS in
  // background.js). Cached briefly: markers ask on every scroll frame.
  let pageScrollerCache = null;
  const pageScroller = () => {
    const now = performance.now();
    if (pageScrollerCache && now - pageScrollerCache.time < 1000 && pageScrollerCache.element?.isConnected !== false) return pageScrollerCache.element;
    const root = document.scrollingElement || document.documentElement;
    let range = root.scrollHeight - window.innerHeight;
    let best = null;
    if (range <= window.innerHeight / 4) {
      for (const element of document.body ? document.body.querySelectorAll('*') : []) {
        const elementRange = element.scrollHeight - element.clientHeight;
        if (elementRange <= range || element.clientHeight < window.innerHeight / 2 || element.clientWidth < window.innerWidth / 2) continue;
        if (element.closest('[data-viewport-parade-overlay]') || !/(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY)) continue;
        best = element;
        range = elementRange;
      }
    }
    pageScrollerCache = { element: best, time: now };
    return best;
  };
  const pageScrollY = () => pageScroller()?.scrollTop ?? window.scrollY;
  // Studio's rulers count page pixels, so while they are shown they follow
  // the page's scroll position, at most once a frame.
  let rulerScrollWatched = false;
  let rulerScrollFrame = 0;
  const reportRulerScroll = () => {
    rulerScrollFrame = 0;
    const scroller = pageScroller();
    window.parent.postMessage({
      source: 'viewport-parade',
      type: 'ruler-scroll',
      x: scroller ? scroller.scrollLeft : window.scrollX,
      y: scroller ? scroller.scrollTop : window.scrollY
    }, extensionOrigin);
  };
  const scheduleRulerScroll = () => {
    if (rulerScrollWatched && !rulerScrollFrame) rulerScrollFrame = requestAnimationFrame(reportRulerScroll);
  };
  window.addEventListener('scroll', scheduleRulerScroll, true);
  // Studio's Code panel: the page's live markup one level at a time, and its
  // stylesheets as written. PixelPrism's own nodes and attributes stay out.
  // An element is addressed by its indexes among element children, starting
  // at <html>; from <body> down that is the Layers path.
  const CODE_TEXT_LIMIT = 4000;
  const isStudioNode = (node) => node instanceof Element && node.dataset.viewportParadeOverlay !== undefined;
  const codeElementFor = (path) => (Array.isArray(path)
    ? path.reduce((element, index) => element?.children[index], document.documentElement)
    : null);
  const codeText = (text) => (text.length > CODE_TEXT_LIMIT ? `${text.slice(0, CODE_TEXT_LIMIT)}…` : text);
  const codeChildNodes = (element) => [...element.childNodes].filter((node) => (
    (node.nodeType === Node.ELEMENT_NODE && !isStudioNode(node))
    || (node.nodeType === Node.TEXT_NODE && node.textContent.trim())
    || node.nodeType === Node.COMMENT_NODE
  ));
  const codeElementNode = (element, path) => {
    const children = codeChildNodes(element);
    const text = children.length === 1 && children[0].nodeType === Node.TEXT_NODE ? children[0].textContent.trim() : '';
    return {
      kind: 'element',
      tag: element.tagName.toLowerCase(),
      attributes: [...element.attributes].filter((attribute) => !attribute.name.startsWith('data-viewport-parade')).map((attribute) => [attribute.name, attribute.value]),
      path,
      ...(text && text.length <= 80 ? { text } : { childCount: children.length })
    };
  };
  const codeNodesFor = (path) => {
    if (!Array.isArray(path)) {
      return [
        ...(document.doctype ? [{ kind: 'doctype', text: `<!DOCTYPE ${document.doctype.name}>` }] : []),
        codeElementNode(document.documentElement, [])
      ];
    }
    const parent = codeElementFor(path);
    if (!parent) return [];
    const nodes = [];
    let elementIndex = -1;
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        elementIndex += 1;
        if (!isStudioNode(node)) nodes.push(codeElementNode(node, [...path, elementIndex]));
      } else if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) nodes.push({ kind: 'text', text: codeText(text) });
      } else if (node.nodeType === Node.COMMENT_NODE) {
        nodes.push({ kind: 'comment', text: codeText(node.textContent.trim()) });
      }
    });
    return nodes;
  };
  const codeRulesText = (sheet) => {
    try { return [...sheet.cssRules].map((rule) => rule.cssText).join('\n'); } catch { return ''; }
  };
  // Linked files are fetched by the extension, so files from other origins
  // (CDNs) can be read too; a CSS-in-JS <style> with no text gives its rules.
  const codeStylesheets = () => Promise.all([...document.styleSheets]
    .filter((sheet) => !isStudioNode(sheet.ownerNode))
    .map(async (sheet, index, sheets) => {
      const media = sheet.media?.mediaText || '';
      if (sheet.href) {
        let text = '';
        try {
          const response = await chrome.runtime.sendMessage({ type: 'load-stylesheet', url: sheet.href });
          if (response?.ok && typeof response.css === 'string') text = response.css;
        } catch { /* Fall back to the rules the page can read. */ }
        return { label: sheet.href, href: sheet.href, media, text: text || codeRulesText(sheet) };
      }
      const own = sheet.ownerNode?.textContent || '';
      const inline = sheets.slice(0, index + 1).filter((candidate) => !candidate.href).length;
      return { label: `Inline <style> ${inline}`, media, text: own.trim() ? own : codeRulesText(sheet) };
    }))
    .then((sheets) => [
      ...sheets,
      ...(document.adoptedStyleSheets || []).map((sheet, index) => ({ label: `Constructed stylesheet ${index + 1}`, media: '', text: codeRulesText(sheet) }))
    ]);
  // Media conditions for the Site breakpoints preset, read from the rules the
  // page has loaded (imports and nested rules included). Only a sheet the page
  // cannot read (another origin) is fetched by the extension, and none may
  // hold the answer back for long.
  const breakpointMedia = async () => {
    const queries = [];
    const texts = [];
    const fetches = [];
    const seen = new Set();
    const visitRules = (rules) => {
      for (const rule of rules) {
        if (rule.media?.mediaText) queries.push(rule.media.mediaText);
        if (rule.styleSheet) visitSheet(rule.styleSheet);
        if (rule.cssRules) visitRules(rule.cssRules);
      }
    };
    const visitSheet = (sheet) => {
      if (!sheet || seen.has(sheet) || isStudioNode(sheet.ownerNode)) return;
      seen.add(sheet);
      if (sheet.media?.mediaText) queries.push(sheet.media.mediaText);
      let rules = null;
      try { rules = sheet.cssRules; } catch { /* Another origin. */ }
      if (rules) visitRules(rules);
      else if (sheet.href) {
        fetches.push(Promise.race([
          chrome.runtime.sendMessage({ type: 'load-stylesheet', url: sheet.href })
            .then((response) => { if (response?.ok && typeof response.css === 'string') texts.push(response.css); })
            .catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 4000))
        ]));
      }
    };
    [...document.styleSheets, ...(document.adoptedStyleSheets || [])].forEach(visitSheet);
    await Promise.all(fetches);
    return { queries, texts };
  };
  let codeObserver = null;
  let codeChangeTimer = 0;
  const reportCodeChange = (records) => {
    const relevant = records.some((record) => {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (target?.closest?.('[data-viewport-parade-overlay]')) return false;
      return record.type !== 'attributes' || !record.attributeName.startsWith('data-viewport-parade');
    });
    if (!relevant) return;
    clearTimeout(codeChangeTimer);
    codeChangeTimer = setTimeout(() => window.parent.postMessage({ source: 'viewport-parade', type: 'code-changed' }, extensionOrigin), 400);
  };
  window.addEventListener('message', (event) => {
    if (isStudioMessage(event, 'code-request-nodes')) {
      window.parent.postMessage({ source: 'viewport-parade', type: 'code-nodes', path: event.data.path ?? null, nodes: codeNodesFor(event.data.path) }, extensionOrigin);
    } else if (isStudioMessage(event, 'code-watch')) {
      codeObserver?.disconnect();
      codeObserver = event.data.enabled ? new MutationObserver(reportCodeChange) : null;
      codeObserver?.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
    } else if (isStudioMessage(event, 'code-request-styles')) {
      codeStylesheets().then((sheets) => window.parent.postMessage({ source: 'viewport-parade', type: 'code-styles', sheets }, extensionOrigin));
    } else if (isStudioMessage(event, 'breakpoints-request')) {
      breakpointMedia().then(({ queries, texts }) => window.parent.postMessage({
        source: 'viewport-parade', type: 'breakpoints-styles', requestId: event.data.requestId, queries, texts
      }, extensionOrigin));
    } else if (isStudioMessage(event, 'code-match-media')) {
      const queries = Array.isArray(event.data.queries) ? event.data.queries : [];
      const matches = Object.fromEntries(queries.map((query) => {
        try { return [query, window.matchMedia(query).matches]; } catch { return [query, false]; }
      }));
      window.parent.postMessage({ source: 'viewport-parade', type: 'code-media', matches }, extensionOrigin);
    }
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'watch-ruler-scroll')) return;
    rulerScrollWatched = Boolean(event.data.enabled);
    if (rulerScrollWatched) reportRulerScroll();
  });
  // Describes an element so it can be found again on a fresh load. Used by
  // the tools and by the click recorder, which runs before they are set up.
  const truncate = (value, limit = 240) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}…` : text;
  };
  // Ids a framework makes up on each render (React's useId ":r5:", Radix,
  // Headless UI, MUI, react-select): after a reload the same id can belong to
  // another element, so they never identify one.
  const GENERATED_ID = /[:«»]|^(radix-|headlessui-|mui-\d|react-aria|react-select-\d|rc[_-]|downshift-\d|floating-ui-|base-ui-|ember\d)|[0-9a-f]{8}-[0-9a-f]{4}-/i;
  const stableIdOf = (element) => (element.id && !GENERATED_ID.test(element.id) ? element.id : '');
  const stableSelectorFor = (element) => {
    const tag = element.tagName.toLowerCase();
    if (stableIdOf(element)) return `#${CSS.escape(element.id)}`;
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
      const hasStrongIdentity = stableIdOf(current) || [...current.attributes].some((attribute) => /^(data-(testid|test|cy|qa)|name|role)$/.test(attribute.name));
      if (hasStrongIdentity || current.classList.length) parts.unshift(base);
      else if (parent) {
        const sameTag = [...parent.children].filter((child) => child.tagName === current.tagName);
        parts.unshift(sameTag.length > 1 ? `${base}:nth-of-type(${sameTag.indexOf(current) + 1})` : base);
      } else parts.unshift(base);
      if (stableIdOf(current)) break;
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
      id: stableIdOf(element) || null,
      classes: [...element.classList].filter((name) => !name.startsWith('viewport-parade-')).slice(0, 12),
      selector: stableSelectorFor(element),
      domPath: domPathFor(element),
      indexPath: indexPathFor(element),
      // Inside a menu, dropdown or dialog: where in it, as portals move
      // around the page between loads.
      ...popupContextFor(element),
      text: truncate(element.textContent, 240),
      attributes,
      htmlSnippet: htmlSnippetFor(element),
      // Page coordinates at this viewport size. If the page changes and the
      // element cannot be found again, this still says where it was.
      rect: {
        x: Math.round(box.left + window.scrollX),
        y: Math.round(box.top + pageScrollY()),
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
    if (control.matches('[type="submit"]') || (control.matches('a[href]') && !control.getAttribute('href').startsWith('#') && !isSameDocumentLink(control))) return false;
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
  // A popup is also told by how it sits: floating (fixed or absolute) high
  // above the page, or in the top layer. Libraries name theirs freely
  // (ant-select-dropdown, react-select's menu), so names alone miss many.
  const isPopupLayer = (node, loose = false) => {
    if (node.matches(':popover-open, dialog[open]')) return true;
    const style = getComputedStyle(node);
    const floating = style.position === 'fixed' || style.position === 'absolute';
    if (node.matches(POPUP_SELECTOR)) return node.matches('dialog, [role], [aria-modal], [popover]') || floating;
    if (!floating) return false;
    const z = Number.parseInt(style.zIndex, 10);
    return loose || (Number.isFinite(z) && z >= 10);
  };
  // The popup a node is in: its outermost popup-like ancestor that does not
  // hold `trigger`, so a fixed header holding a menu button and its menu is
  // not taken for the menu. `loose` takes any floating box, for a node the
  // trigger itself names (aria-controls).
  const popupLayerFor = (node, trigger = null, loose = false) => {
    let layer = null;
    for (let current = node instanceof Element ? node : node?.parentElement; current && current !== document.body && current !== document.documentElement; current = current.parentElement) {
      if (current.hasAttribute('data-viewport-parade-overlay')) return null;
      if (trigger && current.contains(trigger)) break;
      if (isPopupLayer(current, loose)) layer = current;
    }
    return layer;
  };
  const isSizable = (node) => {
    const rect = node.getBoundingClientRect();
    return rect.width >= 24 && rect.height >= 16;
  };
  // A portal is added as a plain wrapper with the popup a few levels inside.
  const popupInside = (element) => {
    const queue = [[element, 0]];
    for (let index = 0; index < queue.length && index < 200; index += 1) {
      const [node, depth] = queue[index];
      if (node !== element && isPopupLayer(node) && isShown(node)) return node;
      if (depth < 4) [...node.children].forEach((child) => queue.push([child, depth + 1]));
    }
    return null;
  };
  // Watches the page for a popup opened by pressing `trigger`: the one the
  // trigger names (aria-controls), a popup-like layer that appeared or
  // changed, or a newly visible named popup. Started on the press itself,
  // as many menus open on pointerdown, before the click.
  const watchForPopup = (trigger, lifetime = 2500) => {
    const changed = new Set();
    const before = new Set(visiblePopups());
    const observer = new MutationObserver((records) => records.forEach((record) => {
      if (record.type === 'childList') record.addedNodes.forEach((node) => changed.add(node));
      else changed.add(record.target);
    }));
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'data-state', 'aria-expanded'] });
    const stopTimer = setTimeout(() => observer.disconnect(), lifetime);
    const find = () => {
      if (trigger?.getAttribute?.('aria-expanded') !== 'false') {
        const ids = `${trigger?.getAttribute?.('aria-controls') || ''} ${trigger?.getAttribute?.('aria-owns') || ''}`.split(/\s+/).filter(Boolean);
        for (const id of ids) {
          const named = document.getElementById(id);
          const layer = named && popupLayerFor(named, trigger, true);
          if (layer && isShown(layer)) return layer;
        }
      }
      const checked = new Set();
      for (const node of changed) {
        const element = node instanceof Element ? node : node.parentElement;
        if (!element?.isConnected || checked.has(element) || checked.size > 300) continue;
        checked.add(element);
        const inside = trigger?.contains(element) ? null : popupInside(element);
        const layer = popupLayerFor(element, trigger) || (inside && popupLayerFor(inside, trigger));
        if (layer && !before.has(layer) && isShown(layer) && isSizable(layer)) return layer;
      }
      return visiblePopups().find((node) => !before.has(node) && (!trigger || !node.contains(trigger))) || null;
    };
    return {
      find,
      // Resolves with the popup, or null after `timeout`.
      async wait(timeout) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          await wait(120);
          const popup = find();
          if (popup) return popup;
        }
        return null;
      },
      stop() {
        clearTimeout(stopTimer);
        observer.disconnect();
      }
    };
  };
  // What a comment needs to find an element inside a popup again.
  const popupContextFor = (element) => {
    const layer = popupLayerFor(element);
    if (!layer || layer === element) return {};
    const path = [];
    for (let current = element; current && current !== layer; current = current.parentElement) {
      path.unshift([...current.parentElement.children].indexOf(current));
    }
    return { popup: { path, role: layer.getAttribute('role') || '' } };
  };
  // Popups open now, for finding an element by its place in one.
  const shownPopupLayers = () => {
    const layers = new Set(visiblePopups());
    const visit = (node, depth) => {
      if (depth > 4 || !node || node.hasAttribute('data-viewport-parade-overlay')) return;
      if (isPopupLayer(node) && isShown(node)) {
        layers.add(node);
        return;
      }
      [...node.children].forEach((child) => visit(child, depth + 1));
    };
    [...(document.body?.children || [])].forEach((child) => visit(child, 0));
    return [...layers];
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
  const recordingPaused = () => replayingSteps || inspectorInteractionActive || document.documentElement.hasAttribute('data-viewport-parade-inspecting');
  // Whether the page has left the view it loaded in, for a comment's copy of
  // its view (pageSnapshot): something on it was pressed or typed into (a
  // tab, also one built from plain buttons; a route the click led to), by a
  // person or by PixelPrism (a click mirrored from another preview, a
  // comment's view opened again), or a container in it scrolled. Counted from
  // the load, before any tool is set up.
  let viewVersion = 0;
  const viewChanged = () => { viewVersion += 1; };
  ['click', 'keydown', 'input', 'change'].forEach((type) => document.addEventListener(type, (event) => {
    if (event.isTrusted && !recordingPaused()) viewChanged();
  }, true));
  const scrolledContainers = new Set();
  document.addEventListener('scroll', (event) => {
    if (event.target instanceof Element) scrolledContainers.add(event.target);
  }, true);
  const clickTriggerFor = (target) => {
    const switchControl = viewSwitchFor(target);
    const trigger = switchControl || (target instanceof Element
      ? target.closest('button, a, [role="button"], [aria-haspopup], [aria-controls], [tabindex], label') || target
      : null);
    if (!trigger || trigger === document.body || trigger === document.documentElement || !isReplayable(trigger)) return null;
    return { trigger, switchControl };
  };
  const labelFor = (control) => truncate(control.textContent || control.getAttribute('aria-label') || '', 60);
  // Menus and selects often open on the press, before the click; a modal one
  // may then block the click entirely. The watch starts on the press, and a
  // popup opened without a click is recorded from there.
  let pressWatch = null;
  // A switch's state before it is pressed: the step records where the press
  // takes it, so a replay does not close what is already open. Taken on the
  // press, as a menu opened on pointerdown has changed by the click.
  const switchStateOf = (control) => ({
    expanded: control.getAttribute('aria-expanded'),
    open: control.tagName === 'SUMMARY' && control.parentElement instanceof HTMLDetailsElement ? control.parentElement.open : undefined
  });
  const switchStepFor = (control, label, before) => {
    const step = { element: elementContextFor(control), label };
    if (before.expanded === 'true' || before.expanded === 'false') step.expanded = before.expanded === 'true' ? 'false' : 'true';
    if (typeof before.open === 'boolean') step.open = !before.open;
    return step;
  };
  document.addEventListener('pointerdown', (event) => {
    if (recordingPaused() || !event.isTrusted || event.button !== 0) return;
    const found = clickTriggerFor(event.target);
    if (!found) return;
    const watch = watchForPopup(found.trigger);
    const press = { trigger: found.trigger, watch, at: Date.now(), switchBefore: found.switchControl ? switchStateOf(found.switchControl) : null };
    pressWatch = press;
    const context = elementContextFor(found.trigger);
    const label = labelFor(found.trigger);
    watch.wait(1200).then((popup) => {
      // A click on the same control took the watch over.
      if (pressWatch !== press) return;
      pressWatch = null;
      if (found.switchControl) {
        const expandedNow = found.switchControl.getAttribute('aria-expanded');
        if (popup || (press.switchBefore.expanded !== null && expandedNow !== press.switchBefore.expanded)) {
          recordViewStep(switchStepFor(found.switchControl, label, press.switchBefore), found.switchControl, popup);
        }
      } else if (popup) recordViewStep({ kind: 'open', element: context, label }, found.trigger, popup);
    });
  }, true);
  document.addEventListener('click', (event) => {
    if (recordingPaused() || !event.isTrusted) return;
    const found = clickTriggerFor(event.target);
    if (!found) return;
    const { trigger, switchControl } = found;
    const label = labelFor(trigger);
    const press = pressWatch && pressWatch.trigger === trigger && Date.now() - pressWatch.at < 2000 ? pressWatch : null;
    pressWatch = null;
    const watch = press ? press.watch : watchForPopup(trigger);
    let step = null;
    if (switchControl) {
      step = switchStepFor(switchControl, label, press?.switchBefore || switchStateOf(switchControl));
      recordViewStep(step, switchControl);
    }
    const context = switchControl ? null : elementContextFor(trigger);
    // Any other click counts once it opens a popup.
    watch.wait(1200).then((popup) => {
      if (!popup) return;
      if (step) stepNodes.set(step, { control: switchControl, popup });
      else recordViewStep({ kind: 'open', element: context, label }, trigger, popup);
    });
  }, true);

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
  // An element in a popup is checked by its text too: menu items share
  // their markup, and a portal's place in the page changes between loads.
  const textAgrees = (element, context) => {
    if (!context?.popup || !context.text) return true;
    const text = normalizeText(context.text).replace(/…$/, '');
    const own = normalizeText(element.textContent);
    return own === text || own.startsWith(text);
  };
  // Found by its place inside one of the popups open now.
  const elementInPopups = (context) => {
    if (!Array.isArray(context?.popup?.path)) return null;
    for (const layer of shownPopupLayers()) {
      let node = layer;
      for (const index of context.popup.path) node = node?.children[index];
      if (node && matchesContext(node, context) && textAgrees(node, context)) return node;
    }
    return null;
  };
  const commentElementFor = (marker) => {
    const context = marker.element || { selector: marker.selector };
    if (context.id && !GENERATED_ID.test(context.id)) {
      const byId = document.getElementById(context.id);
      if (byId && matchesContext(byId, context)) return byId;
    }
    const attributes = context.attributes || {};
    for (const name of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'role', 'aria-label', 'href', 'type']) {
      const value = attributes[name];
      if (value === null || value === undefined || value === '') continue;
      const match = queryOne(`[${CSS.escape(name)}="${CSS.escape(String(value))}"]`);
      if (match && matchesContext(match, context) && textAgrees(match, context)) return match;
    }
    const inPopup = elementInPopups(context);
    if (inPopup) return inPopup;
    const byIndexPath = elementAtIndexPath(context.indexPath);
    if (byIndexPath && matchesContext(byIndexPath, context) && textAgrees(byIndexPath, context)) return byIndexPath;
    const candidates = [];
    for (const selector of [context.domPath, context.selector, marker.selector]) {
      const matches = queryAll(selector).filter((element) => matchesContext(element, context));
      if (matches.length === 1 && textAgrees(matches[0], context)) return matches[0];
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
    return best || (candidates.length === 1 && textAgrees(candidates[0], context) ? candidates[0] : null);
  };

  // A click in one preview is repeated in the others, so a menu, tab or
  // accordion opened at one size opens at every size. Links are followed by
  // the navigation sync instead (except links within the page, which are
  // mirrored), and risky controls stay in their preview.
  const MIRROR_TARGET_SELECTOR = 'button, a, summary, label, input, select, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [aria-haspopup], [aria-controls], [aria-expanded], [tabindex]';
  document.addEventListener('click', (event) => {
    if (replayingSteps || !event.isTrusted || !navigationSyncActive || inspectorInteractionActive || document.documentElement.hasAttribute('data-viewport-parade-inspecting')) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const control = event.target.closest(MIRROR_TARGET_SELECTOR) || event.target;
    if (control === document.body || control === document.documentElement || control.closest('[data-viewport-parade-overlay]') || !isReplayable(control)) return;
    const message = { source: 'viewport-parade', type: 'mirror-click', path: `${location.pathname}${location.search}`, element: elementContextFor(control) };
    // States the click switches to, so a preview already there is left alone.
    // Read in the capture phase: the page has not toggled them yet, except a
    // checkbox, which is checked before any click listener runs.
    const expanded = control.getAttribute('aria-expanded');
    if (expanded === 'true' || expanded === 'false') message.expanded = expanded === 'true' ? 'false' : 'true';
    if (control.tagName === 'SUMMARY' && control.parentElement instanceof HTMLDetailsElement) message.open = !control.parentElement.open;
    if (control.matches('input[type="checkbox"], input[type="radio"]')) message.checked = control.checked;
    window.parent.postMessage(message, extensionOrigin);
  }, true);
  // The same control may be another node at this width (a site that renders
  // each breakpoint separately), so a shown look-alike is accepted too: same
  // tag, text and label, with the most classes in common.
  const mirrorTargetFor = (context) => {
    const found = commentElementFor({ element: context, selector: context?.selector });
    if (found && isShown(found)) return found;
    if (!context?.tag) return null;
    const label = context.attributes?.['aria-label'] || null;
    let best = null;
    let bestScore = 0;
    let tied = false;
    document.querySelectorAll(context.tag).forEach((element) => {
      if (element.getAttribute('aria-label') !== label || element.closest('[data-viewport-parade-overlay]') || truncate(element.textContent, 240) !== context.text || !isShown(element)) return;
      const score = (context.classes || []).filter((name) => element.classList.contains(name)).length + (snippetFor(element) === normalizeText(context.htmlSnippet) ? 2 : 0);
      if (score > bestScore) { best = element; bestScore = score; tied = false; }
      else if (score === bestScore) tied = true;
    });
    return best && !tied ? best : null;
  };
  // Menus differ in what they listen to (pointerdown in Radix, click in most),
  // so the whole press is played, at the control's center.
  const pressElement = (element) => {
    const box = element.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, button: 0, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    const pointer = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true };
    element.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, buttons: 1 }));
    element.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 }));
    element.dispatchEvent(new PointerEvent('pointerup', pointer));
    element.dispatchEvent(new MouseEvent('mouseup', init));
    element.click();
  };
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'mirror-click') || inspectorInteractionActive) return;
    if (event.data.path !== `${location.pathname}${location.search}`) return;
    const control = mirrorTargetFor(event.data.element);
    if (!control) return;
    if (event.data.expanded && control.getAttribute('aria-expanded') === event.data.expanded) return;
    if (typeof event.data.open === 'boolean' && control.parentElement instanceof HTMLDetailsElement && control.parentElement.open === event.data.open) return;
    if (typeof event.data.checked === 'boolean' && control.checked === event.data.checked) return;
    pressElement(control);
    viewChanged();
  });

  const install = (initialMessage) => {
  window.__viewportParadeInspectorInstalled = true;

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
  contrastStyle.dataset.viewportParadeOverlay = '';
  contrastStyle.textContent = 'html[data-viewport-parade-layout-contrast] body { background: #fff !important; } [data-viewport-parade-contrast-layer] { display: none; } html[data-viewport-parade-layout-contrast] [data-viewport-parade-contrast-layer] { display: block; }';
  document.documentElement.append(contrastStyle);
  const contrastLayer = document.createElement('div');
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

  let active = false;
  let commentPickerActive = false;
  // One pick for a screenshot of an element; it ends with the click.
  let capturePickerActive = false;
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
  // The selected element's own selector; componentSelector adds the state
  // being edited (".button:hover"), so edits made in Hover go to that rule.
  let baseComponentSelector;
  let inspectorState = 'default';
  let selectedStates = [];
  const syncInteractionState = () => {
    const enabled = active || commentPickerActive || capturePickerActive;
    inspectorInteractionActive = enabled;
    document.documentElement.toggleAttribute('data-viewport-parade-inspecting', enabled);
  };
  const typographyStyle = document.createElement('style');
  typographyStyle.dataset.viewportParadeOverlay = '';
  typographyStyle.dataset.viewportParadeOverrides = '';
  document.documentElement.append(typographyStyle);
  const typographyRules = new Map();
  // Layout and component edits share an override stylesheet. It keeps edits
  // visible even when an imported component stylesheet uses !important, and it
  // applies a shared component change consistently to every matching instance.
  const layoutStyle = document.createElement('style');
  layoutStyle.dataset.viewportParadeOverlay = '';
  layoutStyle.dataset.viewportParadeOverrides = '';
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
    lineHeight: { css: 'line-height', unit: '' }, letterSpacing: { css: 'letter-spacing', unit: 'px' }, wordSpacing: { css: 'word-spacing', unit: 'px' }, textTransform: { css: 'text-transform' },
    textDecorationLine: { css: 'text-decoration-line' }, textAlign: { css: 'text-align' }, textIndent: { css: 'text-indent', unit: 'px' }, fontVariationSettings: { css: 'font-variation-settings' }, fontFeatureSettings: { css: 'font-feature-settings' },
    columnCount: { css: 'column-count' }, direction: { css: 'direction' }, wordBreak: { css: 'word-break' }, whiteSpace: { css: 'white-space' }, overflowWrap: { css: 'overflow-wrap' }, textOverflow: { css: 'text-overflow' },
    webkitTextStrokeWidth: { css: '-webkit-text-stroke-width', unit: 'px' }, webkitTextStrokeColor: { css: '-webkit-text-stroke-color' }, textShadow: { css: 'text-shadow' }
  };
  const componentProperty = {
    display: 'display', flexDirection: 'flex-direction', flexWrap: 'flex-wrap', justifyContent: 'justify-content', alignItems: 'align-items', alignContent: 'align-content', flexGrow: 'flex-grow', flexShrink: 'flex-shrink', flexBasis: 'flex-basis', alignSelf: 'align-self', order: 'order',
    gridTemplateColumns: 'grid-template-columns', gridTemplateRows: 'grid-template-rows', gridAutoColumns: 'grid-auto-columns', gridAutoRows: 'grid-auto-rows', gridAutoFlow: 'grid-auto-flow', justifyItems: 'justify-items', gridColumn: 'grid-column', gridRow: 'grid-row',
    backgroundColor: 'background-color', color: 'color', opacity: 'opacity', borderWidth: 'border-width', borderStyle: 'border-style', borderColor: 'border-color', borderRadius: 'border-radius', boxShadow: 'box-shadow',
    justifySelf: 'justify-self', gridArea: 'grid-area',
    objectFit: 'object-fit', objectPosition: 'object-position',
    backgroundImage: 'background-image', backgroundSize: 'background-size', backgroundPosition: 'background-position', backgroundRepeat: 'background-repeat',
    borderTopLeftRadius: 'border-top-left-radius', borderTopRightRadius: 'border-top-right-radius', borderBottomRightRadius: 'border-bottom-right-radius', borderBottomLeftRadius: 'border-bottom-left-radius',
    position: 'position', top: 'top', right: 'right', bottom: 'bottom', left: 'left', zIndex: 'z-index',
    borderTopWidth: 'border-top-width', borderRightWidth: 'border-right-width', borderBottomWidth: 'border-bottom-width', borderLeftWidth: 'border-left-width',
    overflow: 'overflow', cursor: 'cursor', filter: 'filter'
  };
  const colorProperties = new Set(['backgroundColor', 'color', 'borderColor']);
  const authoredGridProperties = new Set(['gridTemplateColumns', 'gridTemplateRows', 'gridAutoColumns', 'gridAutoRows', 'gridAutoFlow', 'gridColumn', 'gridRow', 'gridArea']);
  const lengthPropertyKeys = new Set([
    'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
    'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'rowGap', 'columnGap', 'borderWidth', 'borderRadius', 'flexBasis',
    'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
    'top', 'right', 'bottom', 'left',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'webkitTextStrokeWidth'
  ]);
  const cssColorToHex = (value) => {
    const match = value.match(/^rgba?\(\s*([\d.]+)[,\s]+\s*([\d.]+)[,\s]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i);
    if (!match) return value;
    const channel = (index) => Math.max(0, Math.min(255, Math.round(Number(match[index])))).toString(16).padStart(2, '0');
    const alpha = match[4] === undefined ? '' : Math.max(0, Math.min(255, Math.round(Number(match[4]) * 255))).toString(16).padStart(2, '0');
    return `#${channel(1)}${channel(2)}${channel(3)}${alpha}`.toUpperCase();
  };
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
  const populateEditor = (element, mode) => {
    const styles = getComputedStyle(element);
    editorMode = mode;
    const sharedSelector = mode === 'typography'
      ? typographySelector
      : mode === 'component'
        ? componentSelector
        : layoutSelector;
    const titleSelector = sharedSelector || selectorFor(element);
    // ".button:hover" matches nothing the pointer isn't on; count the elements.
    const title = sharedSelector && selectorMatchesMultiple(sharedSelector === componentSelector ? baseComponentSelector : sharedSelector)
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
    // Letter spacing and line height keep the unit they were written in (em,
    // unitless 1.5, var(...)) rather than the computed pixels. Letter spacing
    // reads "normal" as the number it means: 0.
    const authoredLetterSpacing = sourceHintFor(element, 'letter-spacing')?.declaredValue;
    values.letterSpacing = authoredLetterSpacing && authoredLetterSpacing !== 'normal'
      ? authoredLetterSpacing
      : styles.letterSpacing === 'normal' ? '0' : styles.letterSpacing;
    values.lineHeight = sourceHintFor(element, 'line-height')?.declaredValue || styles.lineHeight;
    values.webkitTextStrokeColor = cssColorToHex(styles.webkitTextStrokeColor);
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
    // Offsets as written ("auto", "50%"): getComputedStyle resolves auto to
    // pixels on a positioned element, the style map keeps it.
    ['top', 'right', 'bottom', 'left'].forEach((property) => {
      let computed = styles[property];
      try { computed = element.computedStyleMap().get(property).toString(); } catch { /* Older engines: keep the resolved value. */ }
      values[property] = sourceHintFor(element, property)?.declaredValue || computed;
    });
    values.display = styles.display === 'inline-flex' ? 'flex' : styles.display === 'inline-grid' ? 'grid' : styles.display;
    const parentStyles = element.parentElement ? getComputedStyle(element.parentElement) : null;
    const context = {
      childElementCount: element.children.length,
      parentDisplay: parentStyles?.display || '',
      parentFlexDirection: parentStyles?.flexDirection || '',
      // What a picture or video shows, for the Background section.
      media: mediaFor(element),
      renderedWidth: Math.round(element.getBoundingClientRect().width),
      renderedHeight: Math.round(element.getBoundingClientRect().height),
      // Selected text inside this element: the values shown are the ones it
      // takes from the element.
      ...(selectedTextNode?.parentNode === element ? { textOf: layerNameFor(element) } : {})
    };
    // Properties this session already overrides for the selector, so Studio
    // can mark the values the user changed.
    const overridden = new Map([...(layoutRules.get(sharedSelector) || []), ...(typographyRules.get(sharedSelector) || [])]);
    const changedEntries = [...Object.entries(cssProperty), ...Object.entries(componentProperty), ...Object.entries(typographyProperty).map(([property, definition]) => [property, definition.css])]
      .filter(([, css]) => overridden.has(css));
    // Values read from the project's CSS skip the override sheet, so an edited
    // field would show the source value again; show what the user set instead.
    // Fields read as plain pixel numbers keep that form ("24", not "24px").
    changedEntries.forEach(([property, css]) => {
      const value = overridden.get(css);
      const pixels = /^(-?\d*\.?\d+)px$/.exec(value);
      values[property] = typeof values[property] === 'number' && pixels ? Number(pixels[1]) : value;
    });
    // The parent's own edits are not the text's.
    const changed = context.textOf ? [] : changedEntries.map(([property]) => property);
    // The states this element can be shown in, and the ones already edited.
    const states = mode === 'component' ? selectedStates : [];
    const stateChanges = states.filter((state) => [layoutRules, typographyRules].some((rules) => rules.has(`${baseComponentSelector}${STATE_SUFFIX[state]}`)));
    window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-editor-open', editor: { mode, title, selector: sharedSelector || null, values, valueSources, context, changed, state: inspectorState, states, stateChanges } }, extensionOrigin);
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
  new MutationObserver(scheduleLayoutMapSoon).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open'] });
  document.addEventListener('transitionend', scheduleLayoutMapSoon, true);
  document.addEventListener('animationend', scheduleLayoutMapSoon, true);
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
    return [layoutRules, typographyRules].some((rules) => [...rules.keys()].some((key) => key.startsWith(selector)));
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
  // A comment on an element shown in a state (Hover) remembers that state
  // after the tabs and popups it was left in.
  // What opened the popup, panel or menu an element is in, when the recorder
  // did not see it open (a menu opened by hover, or by a press it could not
  // tell): kept as a step, so the comment, the edit and the review open it
  // again. Searched up from the element, as a fixed header can hold both a
  // menu and its button.
  const popupOpenerFor = (element, steps) => {
    const recordedPopup = steps.some((step) => stepNodes.get(step)?.popup?.contains(element));
    if (recordedPopup) return null;
    // Named by its own text, not the menu it holds ("Products", not
    // "Products Analytics Billing").
    const ownLabel = (control, popup) => truncate([...control.childNodes]
      .filter((node) => !(node instanceof Element && node.contains(popup)))
      .map((node) => node.textContent)
      .join(' '), 60) || control.getAttribute('aria-label') || '';
    // A tab is a switch; a toggle that says it is open (aria-expanded) is
    // replayed only when closed; anything else opens the popup.
    const openerStep = (control, popup) => {
      const step = { element: elementContextFor(control), label: ownLabel(control, popup) || 'Popup' };
      if (control.matches('[role="tab"], [aria-selected]')) return step;
      if (control.hasAttribute('aria-expanded')) return { ...step, expanded: 'true' };
      return { kind: 'open', ...step };
    };
    const recordedControl = (control) => steps.some((step) => step.element?.domPath === domPathFor(control));
    for (let node = element, depth = 0; node && node !== document.body && depth < 12; node = node.parentElement, depth += 1) {
      // A control that names this container (aria-controls): Radix, Headless
      // UI, Webflow and Bootstrap menus, tabs, accordions.
      if (node.id) {
        const escaped = CSS.escape(node.id);
        const named = [...document.querySelectorAll(`[aria-controls~="${escaped}"], [aria-owns~="${escaped}"]`)].find((control) => !node.contains(control));
        // A hidden control (a phone menu button at desktop width) opened nothing.
        if (named) return recordedControl(named) || !isReplayable(named) || !isShown(named) ? null : openerStep(named, node);
        const described = [...document.querySelectorAll(`[aria-describedby~="${escaped}"]`)].find((control) => !node.contains(control));
        if (described) return { kind: 'hover', element: elementContextFor(described), label: ownLabel(described, node) || 'Tooltip' };
      }
      // An open toggle right beside the container (Bootstrap's dropdown).
      const parent = node.parentElement;
      if (parent && parent !== document.body && depth < 8) {
        const toggle = [...parent.querySelectorAll(':scope > [aria-expanded="true"], :scope > * > [aria-expanded="true"]')]
          .find((control) => !node.contains(control) && !control.contains(node) && isShown(control));
        if (toggle) return recordedControl(toggle) || !isReplayable(toggle) ? null : openerStep(toggle, node);
      }
    }
    // A CSS hover menu (li:hover > ul): the floating box the element is in,
    // and the small hovered item holding it that has content of its own.
    let floating = null;
    for (let node = element; node && node !== document.body && !floating; node = node.parentElement) {
      const position = getComputedStyle(node).position;
      if (position === 'absolute' || position === 'fixed') floating = node;
    }
    if (!floating) return null;
    const viewportArea = window.innerWidth * window.innerHeight;
    for (let node = floating.parentElement, depth = 0; node && node !== document.body && depth < 3; node = node.parentElement, depth += 1) {
      if (!node.matches(':hover')) break;
      const box = node.getBoundingClientRect();
      const ownContent = [...node.children].some((child) => !child.contains(floating) && isShown(child));
      if (ownContent && box.width * box.height < viewportArea / 4) {
        return recordedControl(node) ? null : { kind: 'hover', element: elementContextFor(node), label: ownLabel(node, floating) || 'Hover menu' };
      }
    }
    return null;
  };
  // The view an element is shown in: the switches and popups recorded, and
  // what opened the popup it is in.
  const viewStepsFor = (element) => {
    const recorded = currentViewSteps();
    const opener = popupOpenerFor(element, recorded);
    return opener ? [...recorded, opener] : recorded;
  };
  const stateStepsFor = (element) => (forcedState && forcedState.element === element
    ? [{ kind: 'state', state: forcedState.state, element: elementContextFor(element), label: STATE_LABEL[forcedState.state] }]
    : []);
  const viewStepsWithState = (element) => [...viewStepsFor(element), ...stateStepsFor(element)];
  // Taken when an element is picked for editing, while its menu is still
  // open; edits made later keep it.
  let selectionViewSteps = [];
  const reportSelectedElement = () => {
    if (!selectedElement) return;
    const steps = viewStepsWithState(selectedElement);
    // A comment's element comes with the copy of its view (pageSnapshot).
    const snapshot = interactionMode === 'comment' ? viewSnapshotFor(steps) : null;
    window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-element-selected', route: `${location.pathname}${location.search}${location.hash}`, element: elementContextFor(selectedElement), steps, ...(snapshot ? { snapshot } : {}) }, extensionOrigin);
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
    if (isTextWrapper(element)) return textWrapperSelector(element.dataset[TEXT_WRAPPER]);
    const tag = element.tagName.toLowerCase();
    const classes = [...element.classList];
    if (classes.length) return `${tag}${classes.map((name) => `.${CSS.escape(name)}`).join('')}`;
    if (stableIdOf(element)) return `${tag}#${CSS.escape(element.id)}`;
    // A bare tag selector could change several unrelated nodes. Build the
    // shortest structural selector that identifies this exact element instead.
    // Unlike the previous temporary data attribute, this selector can also be
    // written back to the source HTML when the user clicks Apply.
    return uniqueOrStructuralSelectorFor(element);
  };
  // An edit to a state also shows while the Inspector holds that state on.
  const overrideRulesText = (rules) => [...rules].map(([selector, declarations]) => `${[selector, ...forcedStateSelectors(selector)].join(',')}{${[...declarations].map(([property, value]) => `${property}:${value} !important`).join(';')}}`).join('\n');
  const renderTypographyRules = () => {
    typographyStyle.textContent = overrideRulesText(typographyRules);
  };
  const renderLayoutRules = () => {
    layoutStyle.textContent = overrideRulesText(layoutRules);
  };
  // A :hover rule counts for an element the Inspector holds in Hover.
  const matchingSelector = (element, selectorText) => selectorText.split(',').map((selector) => selector.trim()).find((selector) => {
    try {
      if (!selector) return null;
      if (element.matches(selector)) return selector;
      const forced = forcedStateSelector(selector);
      return forced && element.matches(forced) ? selector : null;
    } catch { return null; }
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
  const everyStylesheetReadable = () => [...document.styleSheets].every((sheet) => (
    sheet.ownerNode?.dataset?.viewportParadeOverlay !== undefined
    || canReadRules(sheet)
    || authoredStylesheets.some(({ href }) => href === sheet.href)
  ));
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
  // The declaration the browser applies: !important first, then the more
  // specific selector, then the later rule. Layers and scoping are ignored.
  const selectorSpecificity = (selector) => {
    const total = [0, 0, 0];
    const add = (counts) => counts.forEach((count, index) => { total[index] += count; });
    let text = String(selector).replace(/\\./g, 'x');
    text = text.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, ' ');
    text = text.replace(/:(?:is|not|has|matches|-webkit-any)\(((?:[^()]|\([^()]*\))*)\)/g, (match, inner) => {
      add(inner.split(',').map(selectorSpecificity).reduce((best, counts) => (compareSpecificity(counts, best) > 0 ? counts : best), [0, 0, 0]));
      return ' ';
    });
    text = text.replace(/\[[^\]]*\]/g, () => { total[1] += 1; return ' '; });
    text = text.replace(/::?(?:before|after|first-line|first-letter)\b|::[\w-]+(?:\([^)]*\))?/g, () => { total[2] += 1; return ' '; });
    text = text.replace(/:[\w-]+(?:\([^)]*\))?/g, () => { total[1] += 1; return ' '; });
    text = text.replace(/#[\w-]+/g, () => { total[0] += 1; return ' '; });
    text = text.replace(/\.[\w-]+/g, () => { total[1] += 1; return ' '; });
    text.replace(/(^|[\s>+~])[a-z][\w-]*/gi, () => { total[2] += 1; return ''; });
    return total;
  };
  const compareSpecificity = (left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
  const cascadeWinner = (matches) => matches
    .map((match) => ({ ...match, specificity: selectorSpecificity(match.selector) }))
    .sort((left, right) => Number(left.important) - Number(right.important) || compareSpecificity(left.specificity, right.specificity) || left.order - right.order)
    .at(-1);
  const authoredValueFor = (element, property) => {
    const inlineValue = element.style?.getPropertyValue(property).trim();
    if (inlineValue) return { declaredValue: inlineValue, inline: true };
    const matches = activeRuleDeclarations(element, property);
    if (!matches.length) return undefined;
    return cascadeWinner(matches);
  };
  const declarationForCustomProperty = (element, variable) => {
    for (let current = element; current; current = current.parentElement) {
      const inlineValue = current.style?.getPropertyValue(variable).trim();
      if (inlineValue) return { value: inlineValue, inline: true, scope: current === element ? 'element' : 'parent' };
      const matches = activeRuleDeclarations(current, variable);
      if (matches.length) {
        const winner = cascadeWinner(matches);
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
    const hint = sourceHint || sourceHintFor(element, property);
    window.parent.postMessage({
      source: 'viewport-parade',
      type: 'inspector-style-change',
      change: {
        url: location.href,
        selector,
        property,
        from: String(from),
        to: String(to),
        sourceHint: hint,
        // No rule in readable project CSS declares it: the agent should add a
        // declaration rather than look for one to edit. Unknown when some
        // stylesheet (cross-origin) could not be read.
        ...(!hint && everyStylesheetReadable() ? { newDeclaration: true } : {}),
        viewport: { width: window.innerWidth, height: window.innerHeight },
        route: `${location.pathname}${location.search}${location.hash}`,
        element: element ? elementContextFor(element) : undefined,
        // Text that has no element in the source yet: the span to add.
        ...(isTextWrapper(element) ? { wrapText: { id: element.dataset[TEXT_WRAPPER], text: truncate(element.textContent, 240), parent: stableSelectorFor(element.parentElement), parentDomPath: domPathFor(element.parentElement) } } : {}),
        // The view the edit was made in (a tab, an open menu, Hover), so the
        // review captures the element where it can be seen.
        steps: element ? [...(element === selectedElement ? selectionViewSteps : viewStepsFor(element)), ...stateStepsFor(element)] : []
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
    // The same property brought back from an earlier edit gives way.
    const recorded = layoutRules.get(typographySelector);
    if (recorded?.delete(definition.css)) {
      if (!recorded.size) layoutRules.delete(typographySelector);
      renderLayoutRules();
    }
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
    const fromValue = cssValueForInput(input.dataset.property, from, typographyDefinition?.unit ?? 'px');
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
  // Selected or hovered text: one box around the text itself.
  const showTextNode = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    [marginOverlay, paddingOverlay].forEach((overlay) => {
      overlay.style.border = 'none';
      overlay.style.background = 'transparent';
    });
    contentOverlay.style.border = '2px solid #5367d9';
    contentOverlay.style.background = 'rgba(83,103,217,.2)';
    [marginOverlay, paddingOverlay, contentOverlay].forEach((overlay) => setRect(overlay, box.left, box.top, box.width, box.height));
    hideSpacing();
    gutterLayer.replaceChildren();
    label.textContent = `text in ${selectorFor(node.parentElement)}  ${Math.round(box.width)} × ${Math.round(box.height)} px  ·  ${Math.round(box.left)}, ${Math.round(box.top)}`;
    const labelLeft = Math.max(8, Math.min(window.innerWidth - label.offsetWidth - 8, box.left));
    const labelTop = box.top - label.offsetHeight - 6 >= 8 ? box.top - label.offsetHeight - 6 : box.bottom + 6;
    label.style.left = `${labelLeft - box.left}px`;
    label.style.top = `${labelTop - box.top}px`;
  };
  const show = (element, zone = highlightedZone) => {
    if (!element || [marginOverlay, paddingOverlay, contentOverlay].some((overlay) => overlay === element || overlay.contains(element))) return;
    if (element === selectedElement && selectedTextNode?.parentNode === element) {
      showTextNode(selectedTextNode);
      return;
    }
    const box = element.getBoundingClientRect();
    const styles = getComputedStyle(element);
    const margin = ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map((property) => number(styles[property]));
    const padding = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((property) => number(styles[property]));
    const border = ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'].map((property) => number(styles[property]));
    highlightedZone = zone;
    // The margin and padding zones colour only the spacing itself, with the
    // blue size highlight's recipe (20% fill, 2px edge at full strength), on
    // top of a grey outline of the element the spacing belongs to.
    const elementEdge = '1px solid rgba(113,113,122,.9)';
    // The gap zone works the same way, for the whole gap or one axis of it.
    const gapAxis = { gap: 'both', rowGap: 'row', columnGap: 'column' }[zone];
    if (gapAxis) {
      marginOverlay.style.border = 'none';
      marginOverlay.style.background = 'transparent';
      paddingOverlay.style.border = elementEdge;
      paddingOverlay.style.background = 'transparent';
      contentOverlay.style.border = 'none';
      contentOverlay.style.background = 'transparent';
    } else if (zone === 'margin') {
      marginOverlay.style.border = 'none';
      marginOverlay.style.background = 'transparent';
      paddingOverlay.style.border = elementEdge;
      paddingOverlay.style.background = 'transparent';
      contentOverlay.style.border = 'none';
      contentOverlay.style.background = 'transparent';
    } else if (zone === 'padding') {
      marginOverlay.style.border = 'none';
      marginOverlay.style.background = 'transparent';
      paddingOverlay.style.border = elementEdge;
      paddingOverlay.style.background = 'transparent';
      contentOverlay.style.border = 'none';
      contentOverlay.style.background = 'transparent';
    } else {
      marginOverlay.style.border = '1px solid rgba(82,82,91,.7)';
      marginOverlay.style.background = 'rgba(82,82,91,.05)';
      paddingOverlay.style.border = '1px solid rgba(113,113,122,.7)';
      paddingOverlay.style.background = 'rgba(113,113,122,.07)';
      contentOverlay.style.border = zone === 'size' ? '2px solid #5367d9' : '1px solid rgba(161,161,170,.75)';
      contentOverlay.style.background = zone === 'size' ? 'rgba(83,103,217,.2)' : 'rgba(161,161,170,.08)';
    }
    setRect(marginOverlay, box.left - margin[3], box.top - margin[0], box.width + margin[1] + margin[3], box.height + margin[0] + margin[2]);
    setRect(paddingOverlay, box.left + border[3], box.top + border[0], box.width - border[1] - border[3], box.height - border[0] - border[2]);
    setRect(contentOverlay, box.left + border[3] + padding[3], box.top + border[0] + padding[0], box.width - border[1] - border[3] - padding[1] - padding[3], box.height - border[0] - border[2] - padding[0] - padding[2]);
    const borderBox = [box.left, box.top, box.right, box.bottom];
    const paddingBox = [box.left + border[3], box.top + border[0], box.right - border[1], box.bottom - border[2]];
    const contentBox = [paddingBox[0] + padding[3], paddingBox[1] + padding[0], paddingBox[2] - padding[1], paddingBox[3] - padding[2]];
    const marginBox = [box.left - margin[3], box.top - margin[0], box.right + margin[1], box.bottom + margin[2]];
    hideSpacing();
    if (zone === 'margin') drawStrips(marginStrips, marginBox, borderBox, 'rgba(249,115,22,.2)', '#f97316');
    if (zone === 'padding') drawStrips(paddingStrips, paddingBox, contentBox, 'rgba(34,197,94,.2)', '#22c55e');
    const gap = styles.display.includes('flex') || styles.display.includes('grid')
      ? `\ngap: ${styles.rowGap} × ${styles.columnGap}`
      : '';
    drawGutters(element, styles, gapAxis);
    label.textContent = `${selectorFor(element)}  ${Math.round(box.width)} × ${Math.round(box.height)} px  ·  ${Math.round(box.left)}, ${Math.round(box.top)}\nmargin: ${margin.join(' / ')} px   padding: ${padding.join(' / ')} px${gap}`;
    // The label sits above the element, or below it when there is no room
    // above, measured at its real size so it never covers the element. Only
    // an element taller than the preview leaves no room, and then the label
    // goes to the preview's top edge.
    const marginLeft = box.left - margin[3];
    const marginTop = box.top - margin[0];
    const marginBottom = marginTop + box.height + margin[0] + margin[2];
    const labelWidth = label.offsetWidth;
    const labelHeight = label.offsetHeight;
    const labelLeft = Math.max(8, Math.min(window.innerWidth - labelWidth - 8, marginLeft));
    const labelTop = marginTop - labelHeight - 6 >= 8
      ? marginTop - labelHeight - 6
      : marginBottom + 6 + labelHeight <= window.innerHeight - 8
        ? marginBottom + 6
        : 8;
    label.style.left = `${labelLeft - marginLeft}px`;
    label.style.top = `${labelTop - marginTop}px`;
  };

  const applyEditorValue = (propertyName, rawValue, previousValue) => {
    if (!selectedElement) return;
    if (selectedTextNode) adoptTextWrapper();
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
  // Text under the pointer that lies directly in an element beside child
  // elements: the text layer Layers shows for it. An element holding only
  // text is that layer itself, so it gets none.
  const textNodeAt = (element, x, y) => {
    if (!(element instanceof Element) || !element.children.length) return null;
    const range = document.createRange();
    return [...element.childNodes].find((node) => {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return false;
      range.selectNodeContents(node);
      return [...range.getClientRects()].some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    }) || null;
  };
  document.addEventListener('pointermove', (event) => {
    pointerInside = true;
    if ((!active && !commentPickerActive && !capturePickerActive) || (pinned && !capturePickerActive)) return;
    const hoveredText = active && !capturePickerActive && interactionMode !== 'comment' ? textNodeAt(event.target, event.clientX, event.clientY) : null;
    if (hoveredText) {
      hoveredElement = event.target;
      showTextNode(hoveredText);
      return;
    }
    if (capturePickerActive) {
      // A screenshot takes the whole element; spacing zones do not apply.
      hoveredElement = event.target;
      show(hoveredElement, 'size');
    } else if (hoveredElement !== event.target) {
      hoveredElement = event.target;
      show(hoveredElement, undefined);
    } else {
      show(hoveredElement, editorModeAtPoint(hoveredElement, event.clientX, event.clientY));
    }
  }, true);
  // Picking listens on the window, whose capture phase runs before any
  // listener on the document: libraries that delegate from the document in
  // capture (Bootstrap's tabs and dropdowns) would otherwise take the press
  // first, and a tab picked for the Inspector would switch. PixelPrism's own
  // nodes (comment markers) handle their presses themselves.
  const isStudioPress = (event) => event.composedPath().some((node) => node instanceof Element && node.hasAttribute('data-viewport-parade-overlay'));
  window.addEventListener('click', (event) => {
    if ((!active && !commentPickerActive && !capturePickerActive) || replayingSteps) return;
    if (suppressMarkerClick || isStudioPress(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (capturePickerActive) {
      pickCaptureElement(event.target);
      return;
    }
    // A subsequent click is a request to edit another zone, not a request to
    // close the editor. This makes it possible to move from content to padding
    // on the same element without toggling the inspector off and on again.
    const textNode = interactionMode !== 'comment' ? textNodeAt(event.target, event.clientX, event.clientY) : null;
    selectLayerElement(event.target, textNode ? { exact: true, textNode } : {});
  }, true);
  // While the Inspector or Comments pick elements, presses do not reach the
  // page: an open menu would take a press elsewhere as "outside" and close,
  // and a select (Radix) would pick the option pressed. The click that
  // follows still selects.
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend'].forEach((type) => {
    window.addEventListener(type, (event) => {
      if ((!active && !commentPickerActive && !capturePickerActive) || replayingSteps || !event.isTrusted) return;
      if (isStudioPress(event)) return;
      // Kept from moving focus, which closes popups too; a touch keeps its
      // default so it still produces the click.
      if (type === 'pointerdown' || type === 'mousedown') event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  });
  window.addEventListener('dblclick', (event) => {
    if ((!active && !commentPickerActive && !capturePickerActive) || isStudioPress(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectLayerElement(event.target);
  }, true);
  const refreshHoveredElement = () => {
    if ((active || commentPickerActive || capturePickerActive) && (!pinned || capturePickerActive) && pointerInside && hoveredElement) show(hoveredElement);
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
  // A comment left on a view the page does not open in (a tab switched, a
  // menu, dropdown or panel opened, a dialog, a container scrolled) keeps a
  // copy of the page as the preview shows it, and the HTML review captures
  // that copy instead of clicking the view open again on a fresh load, which
  // misses whatever the recorder could not tell apart (tabs and panels
  // without ARIA, menus that do not float high, hand-made toggles). A
  // comment on the page as it loads keeps none, and the review captures the
  // live page. The copy is static HTML: scripts, PixelPrism's nodes and its
  // CSS edits are left out; the held state's sheet stays. Marks
  // (data-pixelprism-*) tell the background what HTML cannot hold: scroll
  // positions, canvases, modal dialogs and popovers, and the hovered and
  // focused elements (for a CSS hover menu). Left-out nodes keep an empty
  // place, and added ones count as PixelPrism's, so the comment's element is
  // found in the copy by the same index path as in the page.
  const SNAPSHOT_VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
  const SNAPSHOT_EMPTIED_TAGS = new Set(['script', 'noscript', 'template', 'noembed', 'noframes']);
  const escapeSnapshotText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');
  const escapeSnapshotAttribute = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\u00a0/g, '&nbsp;');
  // Rules added from script (CSS-in-JS insertRule) are not in the <style> text.
  const sheetText = (sheet) => {
    try { return [...sheet.cssRules].map((rule) => rule.cssText).join('\n'); } catch { return null; }
  };
  const snapshotStyle = (sheet) => `<style data-viewport-parade-overlay>${(sheetText(sheet) || '').replace(/<\/style/gi, '<\\/style')}</style>`;
  const snapshotShadowRoot = (element) => {
    try { return chrome.dom?.openOrClosedShadowRoot?.(element) || element.shadowRoot; } catch { return element.shadowRoot; }
  };
  const pageSnapshot = () => {
    const parts = [];
    const canvases = [];
    let focused = document.activeElement;
    while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
    if (focused === document.body) focused = null;
    const matchesSafely = (element, selector) => {
      try { return element.matches(selector); } catch { return false; }
    };
    const attributesFor = (element, tag) => {
      const attributes = new Map();
      [...element.attributes].forEach(({ name, value }) => {
        if (/^on/i.test(name) || ['loading', 'autoplay', 'autofocus', 'nonce'].includes(name)) return;
        if (name.startsWith('data-pixelprism-')) return;
        if (name.startsWith('data-viewport-parade-') && name !== STATE_ATTRIBUTE) return;
        if (name === 'class') value = value.split(/\s+/).filter((token) => token && !token.startsWith('viewport-parade-')).join(' ');
        if ((name === 'src' || name === 'href') && /^\s*javascript:/i.test(value)) return;
        attributes.set(name, value);
      });
      if (SNAPSHOT_EMPTIED_TAGS.has(tag)) return tag === 'script' ? ' type="text/plain"' : '';
      if (tag === 'meta') attributes.delete('http-equiv');
      if (tag === 'link' && /(^|\s)(modulepreload|preload|prefetch)(\s|$)/i.test(element.rel)) attributes.delete('rel');
      if ((tag === 'style' || tag === 'link') && element.sheet?.disabled) attributes.set('media', 'not all');
      if (tag === 'input') {
        const type = (element.getAttribute('type') || '').toLowerCase();
        if (type === 'checkbox' || type === 'radio') {
          if (element.checked) attributes.set('checked', '');
          else attributes.delete('checked');
        } else if (type === 'password') attributes.set('value', '•'.repeat(element.value.length));
        else if (type !== 'file') attributes.set('value', element.value);
      } else if (tag === 'option') {
        if (element.selected) attributes.set('selected', '');
        else attributes.delete('selected');
      } else if (tag === 'canvas') {
        try {
          canvases.push(element.toDataURL());
          attributes.set('data-pixelprism-canvas', String(canvases.length - 1));
          attributes.set('width', String(element.width));
          attributes.set('height', String(element.height));
        } catch { /* A tainted canvas stays blank. */ }
      } else if (tag === 'img' && element.complete && /^blob:/.test(element.currentSrc)) {
        // A blob URL belongs to the preview's document; the copy gets the pixels.
        try {
          const canvas = document.createElement('canvas');
          canvas.width = element.naturalWidth;
          canvas.height = element.naturalHeight;
          canvas.getContext('2d').drawImage(element, 0, 0);
          attributes.set('src', canvas.toDataURL());
          attributes.delete('srcset');
        } catch { /* Left as it is. */ }
      }
      if (element.scrollTop || element.scrollLeft) attributes.set('data-pixelprism-scroll', `${element.scrollLeft},${element.scrollTop}`);
      if (matchesSafely(element, ':hover')) attributes.set('data-pixelprism-hover', '');
      if (element === focused) attributes.set('data-pixelprism-focus', '');
      if (matchesSafely(element, 'dialog:modal')) attributes.set('data-pixelprism-modal', '');
      if (matchesSafely(element, ':popover-open')) attributes.set('data-pixelprism-popover', '');
      return [...attributes].map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeSnapshotAttribute(value)}"`)).join('');
    };
    const writeChildren = (parent) => {
      for (let node = parent.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === Node.TEXT_NODE) parts.push(escapeSnapshotText(node.data));
        else if (node.nodeType === Node.ELEMENT_NODE) writeElement(node);
      }
    };
    const writeElement = (element) => {
      if (element.hasAttribute('data-viewport-parade-overlay') && element !== stateStyle) return;
      const html = element.namespaceURI === 'http://www.w3.org/1999/xhtml';
      // SVG keeps its case (linearGradient, viewBox).
      const tag = html ? element.localName : element.tagName;
      parts.push(`<${tag}${attributesFor(element, tag.toLowerCase())}>`);
      if (tag === 'head') parts.push(`<base data-viewport-parade-overlay href="${escapeSnapshotAttribute(document.baseURI)}">`);
      if ((html && SNAPSHOT_VOID_TAGS.has(tag)) || SNAPSHOT_EMPTIED_TAGS.has(tag.toLowerCase())) {
        if (!SNAPSHOT_VOID_TAGS.has(tag)) parts.push(`</${tag}>`);
        return;
      }
      const shadow = snapshotShadowRoot(element);
      if (shadow) {
        // Declarative shadow DOM; written open so the copy can reach inside.
        parts.push('<template shadowrootmode="open">');
        (shadow.adoptedStyleSheets || []).forEach((sheet) => parts.push(snapshotStyle(sheet)));
        writeChildren(shadow);
        parts.push('</template>');
      }
      if (html && tag === 'style') {
        const text = (element.sheet && sheetText(element.sheet)) ?? element.textContent;
        parts.push(text.replace(/<\/style/gi, '<\\/style'));
      } else if (html && tag === 'textarea') {
        // The parser drops one newline right after the tag.
        parts.push(`${element.value.startsWith('\n') ? '\n' : ''}${escapeSnapshotText(element.value)}`);
      } else {
        if (html && (tag === 'pre' || tag === 'listing') && element.firstChild?.nodeType === Node.TEXT_NODE && element.firstChild.data.startsWith('\n')) parts.push('\n');
        writeChildren(element);
      }
      // Adopted sheets come after the document's own in the cascade.
      if (tag === 'body') (document.adoptedStyleSheets || []).forEach((sheet) => parts.push(snapshotStyle(sheet)));
      parts.push(`</${tag}>`);
    };
    if (document.compatMode === 'CSS1Compat') parts.push('<!DOCTYPE html>');
    writeElement(document.documentElement);
    return {
      id: `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      html: parts.join(''),
      canvases,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };
  };
  let viewSnapshot = null;
  const viewSnapshotFor = (steps) => {
    // The page's own scroller moves like the window; the review scrolls it.
    const scroller = pageScroller();
    const scrolled = [...scrolledContainers].filter((element) => element.isConnected && element !== scroller && (element.scrollTop || element.scrollLeft));
    if (!viewVersion && !steps.length && !scrolled.length) return null;
    const key = `${viewVersion}|${location.href}|${steps.length}|${scrolled.map((element) => `${element.scrollLeft},${element.scrollTop}`).join(';')}`;
    if (viewSnapshot?.key !== key) {
      try {
        viewSnapshot = { key, snapshot: pageSnapshot() };
      } catch {
        viewSnapshot = null;
      }
    }
    return viewSnapshot?.snapshot || null;
  };
  // The element under the pointer is captured exactly as highlighted; the
  // view it is in (tabs, popups, state) goes with it, as for comments.
  const pickCaptureElement = (element) => {
    if (!(element instanceof Element)) return;
    const steps = viewStepsWithState(element);
    const context = elementContextFor(element);
    setCapturePicker(false);
    window.parent.postMessage({ source: 'viewport-parade', type: 'capture-element-picked', route: `${location.pathname}${location.search}${location.hash}`, element: context, steps }, extensionOrigin);
  };
  const setCapturePicker = (enabled) => {
    if (capturePickerActive === enabled) return;
    capturePickerActive = enabled;
    syncInteractionState();
    // The pick starts from the pointer, not from a pinned Inspector selection.
    clearSelection();
    if (enabled && pointerInside && hoveredElement) show(hoveredElement, 'size');
  };
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'toggle-capture-picker')) return;
    setCapturePicker(Boolean(event.data.enabled));
  });
  window.addEventListener('keydown', (event) => {
    if (!capturePickerActive || event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setCapturePicker(false);
    window.parent.postMessage({ source: 'viewport-parade', type: 'capture-element-cancelled' }, extensionOrigin);
  }, true);
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
  // The Inspector's state switch: the element is shown in that state, and
  // the panel reads and edits the state's rule.
  window.addEventListener('message', async (event) => {
    if (!isStudioMessage(event, 'inspector-set-state') || !selectedElement || interactionMode !== 'edit') return;
    const element = selectedElement;
    const state = selectedStates.includes(event.data.state) ? event.data.state : 'default';
    if (state === 'default') releaseForcedState();
    else await forceState(element, state);
    if (selectedElement !== element) return;
    inspectorState = state;
    componentSelector = `${baseComponentSelector}${STATE_SUFFIX[state] || ''}`;
    populateEditor(element, 'component');
    show(element);
    scheduleLayoutMap();
    reportSelectedElement();
  });
  // Edits recorded earlier for this page and size come back when the preview
  // loads again, and go away when Studio resets them.
  const applyRecordedChanges = (changes) => {
    (Array.isArray(changes) ? changes : []).forEach(({ selector, property, value, wrapText }) => {
      if (typeof selector !== 'string' || typeof property !== 'string' || !value) return;
      if (wrapText && typeof wrapText === 'object') rewrapText(wrapText);
      const declarations = layoutRules.get(selector) || new Map();
      declarations.set(property, String(value));
      layoutRules.set(selector, declarations);
    });
    renderLayoutRules();
    scheduleLayoutMap();
  };
  const resetRecordedChanges = (changes) => {
    (Array.isArray(changes) ? changes : []).forEach(({ selector, property }) => {
      [layoutRules, typographyRules].forEach((rules) => {
        const declarations = rules.get(selector);
        if (declarations?.delete(property) && !declarations.size) rules.delete(selector);
      });
    });
    renderLayoutRules();
    renderTypographyRules();
    if (selectedElement) show(selectedElement);
    scheduleLayoutMap();
  };
  // The Code panel's rows: hover highlights the element, a click selects it
  // as Layers does, and the CSS view asks which rules match the selection.
  // State pseudo-classes and pseudo-elements are left out of that test.
  const codeSelectorMatches = (selector) => {
    if (!selectedElement) return false;
    return selector.split(',').some((part) => {
      const plain = part
        .replace(/::?(before|after|placeholder|selection|marker|first-line|first-letter|backdrop|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+)(\([^)]*\))?/gi, '')
        .replace(/:(hover|focus|focus-visible|focus-within|active|visited|target)\b/gi, '')
        .trim();
      try { return selectedElement.matches(plain || '*'); } catch { return false; }
    });
  };
  const handleCodeMessage = (data) => {
    if (data.type === 'code-hover') {
      const element = codeElementFor(data.path);
      if (element) show(element, 'size');
      else if (selectedElement) show(selectedElement, 'size');
      else hideOverlays();
    } else if (data.type === 'code-select') {
      selectLayerElement(codeElementFor(data.path), { exact: true });
    } else if (data.type === 'code-match-selectors') {
      const selectors = Array.isArray(data.selectors) ? data.selectors : [];
      window.parent.postMessage({ source: 'viewport-parade', type: 'code-selectors', matched: selectors.filter(codeSelectorMatches) }, extensionOrigin);
    }
  };
  window.addEventListener('message', (event) => {
    if (['code-hover', 'code-select', 'code-match-selectors'].some((type) => isStudioMessage(event, type))) handleCodeMessage(event.data);
  });
  window.addEventListener('message', (event) => {
    if (isStudioMessage(event, 'apply-recorded-changes')) applyRecordedChanges(event.data.changes);
    else if (isStudioMessage(event, 'reset-recorded-changes')) resetRecordedChanges(event.data.changes);
  });
  // While the studio's margin or padding fields are in use, that zone of the
  // selected element stays highlighted; the earlier zone comes back after.
  let zoneBeforeFieldHighlight;
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'inspector-highlight-zone') || !selectedElement) return;
    if (event.data.zone) {
      if (zoneBeforeFieldHighlight === undefined) zoneBeforeFieldHighlight = highlightedZone;
      show(selectedElement, event.data.zone);
    } else if (zoneBeforeFieldHighlight !== undefined) {
      show(selectedElement, zoneBeforeFieldHighlight);
      zoneBeforeFieldHighlight = undefined;
    }
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
    const element = layerElementFor(event.data.path);
    const node = Number.isInteger(event.data.textIndex) ? element?.childNodes[event.data.textIndex] : null;
    selectLayerElement(element, { exact: true, textNode: node?.nodeType === Node.TEXT_NODE ? node : null });
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'layers-hover')) return;
    const element = layerElementFor(event.data.path);
    const node = Number.isInteger(event.data.textIndex) ? element?.childNodes[event.data.textIndex] : null;
    if (node?.nodeType === Node.TEXT_NODE) showTextNode(node);
    else if (element) show(element, 'size');
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
    // An element in a closed menu: the control that names the menu
    // (aria-controls) is known without opening it, so a comment left before
    // comments kept their menus learns it here.
    if (marker.state === 'hidden' && marker.target) {
      const opener = popupOpenerFor(marker.target, []);
      if (opener) {
        marker.steps = [opener];
        marker.state = 'other-view';
        window.parent.postMessage({ source: 'viewport-parade', type: 'comment-steps-learned', id: marker.id, steps: marker.steps }, extensionOrigin);
        return;
      }
    }
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
    // A state (Hover) is put on the element itself; it never hides it.
    if (step.kind === 'state') return true;
    // A popup is open or not, but which one cannot be told apart.
    if (step.kind === 'open') return unknown && visiblePopups().length > 0;
    const control = commentElementFor({ element: step.element, selector: step.element?.selector });
    if (!control) return false;
    // A menu that opens on hover is open while its trigger is held in Hover.
    if (step.kind === 'hover') return (forcedState?.state === 'hover' && forcedState.element === control) || control.matches(':hover');
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
    return steps.every((step) => step.kind === 'state' || (step.kind === 'hover' ? viewStepsMatch([step], false) : clicked.has(step.element?.domPath)));
  };
  // Presses the recorded view switches again, waiting for each control to
  // render, and skipping those already in the recorded state. A popup that
  // does not open from a press gets the keys that open menus and selects.
  const replayViewSteps = async (allSteps) => {
    const steps = allSteps.filter((step) => step.kind !== 'state');
    if (forcedState?.origin === 'view') releaseForcedState();
    replayingSteps = true;
    try {
      for (const step of steps) {
        let control = null;
        for (let attempt = 0; attempt < 15 && !control; attempt += 1) {
          control = commentElementFor({ element: step.element, selector: step.element?.selector });
          if (!control) await wait(100);
        }
        if (!control) continue;
        if (step.kind === 'hover') {
          const watch = watchForPopup(control);
          await forceState(control, 'hover', 'view');
          stepNodes.set(step, { control, popup: await watch.wait(1200) });
          watch.stop();
          continue;
        }
        if (step.kind !== 'open' && viewStepsMatch([step]) && (step.expanded || typeof step.open === 'boolean' || control.getAttribute('aria-selected') === 'true')) continue;
        const watch = watchForPopup(control);
        let popup = null;
        const opened = () => popup || control.getAttribute('aria-expanded') === 'true';
        const settled = () => (step.kind === 'open' ? opened() : viewStepsMatch([step]));
        // A menu button is hovered first: a menu that opens on hover (Webflow)
        // would close again on the press that follows.
        if (step.expanded === 'true' || control.hasAttribute('aria-haspopup')) {
          sendStateEvents(control, 'hover', true);
          popup = await watch.wait(400);
        }
        if (!opened() && !(step.kind !== 'open' && viewStepsMatch([step], false))) {
          pressControl(control);
          // Wait for a popup to open; a plain switch just gets time to render.
          popup = await watch.wait(step.kind === 'open' ? 1500 : 350);
        }
        for (const key of ['Enter', 'ArrowDown']) {
          if (settled()) break;
          pressKey(control, key);
          popup = await watch.wait(step.kind === 'open' ? 800 : 350);
        }
        watch.stop();
        stepNodes.set(step, { control, popup });
      }
    } finally {
      viewChanged();
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
    if (marker.pin) return { left: marker.pin.x - window.scrollX, top: marker.pin.y - pageScrollY(), width: 0, height: 0 };
    if (marker.state === 'approx') {
      const rect = recordedRectFor(marker);
      return { left: rect.x - window.scrollX, top: rect.y - pageScrollY(), width: rect.width, height: rect.height };
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
    const scroller = pageScroller() || window;
    if (marker.pin) scroller.scrollTo({ top: Math.max(0, marker.pin.y - (innerHeight / 2)), behavior: 'smooth' });
    else if (recorded) scroller.scrollTo({ top: Math.max(0, recorded.y + (recorded.height / 2) - (innerHeight / 2)), behavior: 'smooth' });
    else if (marker.target && marker.state === 'placed') marker.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    // A comment left on a state (Hover) shows its element in that state.
    const stateStep = marker.steps.find((step) => step.kind === 'state');
    if (stateStep && marker.target && marker.state === 'placed') forceState(marker.target, stateStep.state, 'comment');
    else if (forcedState?.origin === 'comment') releaseForcedState();
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
      return { pin: { x: Math.round(x + window.scrollX), y: Math.round(y + pageScrollY()) } };
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
  // Grabbing a marker never selects the element underneath it: the picker
  // leaves presses on PixelPrism's nodes to these listeners.
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
        steps: viewStepsWithState(drop.element)
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
  // Escape with focus in the preview lets go of the selected element; Studio
  // closes its panel when told the selection is gone.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !active || !selectedElement || interactionMode !== 'edit') return;
    clearSelection();
  });
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
  if (initialMessage.type === 'toggle-capture-picker') setCapturePicker(Boolean(initialMessage.enabled));
  if (initialMessage.type === 'layers-request-tree') sendLayersTree();
  if (initialMessage.type === 'comment-markers') applyCommentMarkers(initialMessage);
  if (initialMessage.type === 'apply-recorded-changes') applyRecordedChanges(initialMessage.changes);
  if (['code-hover', 'code-select', 'code-match-selectors'].includes(initialMessage.type)) handleCodeMessage(initialMessage);
  };
  window.addEventListener('message', function activateInspector(event) {
    const type = event.data?.type;
    if (!isStudioMessage(event, type) || !['toggle-inspector', 'toggle-comment-picker', 'toggle-capture-picker', 'toggle-layout-contrast', 'layers-request-tree', 'comment-markers', 'apply-recorded-changes', 'code-hover', 'code-select', 'code-match-selectors'].includes(type)) return;
    window.removeEventListener('message', activateInspector);
    install(event.data);
  });
})();
