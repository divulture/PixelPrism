// Showing an element in a state (Hover, Focus, Pressed), its ::before and ::after, and pressing controls the way a pointer does.

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
// Every style rule's selector parts, nested ones read against their parents.
const eachStyleSelector = (sheets, callback) => {
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
        splitSelectorList(selector).forEach((part) => callback(part, rule));
      }
      if (rule.cssRules?.length && rule.type !== 7) visit(rule.cssRules, selector);
    });
  };
  sheets.forEach(({ rules }) => visit(rules, ''));
};
// The element's ::before and ::after, which the Inspector edits as their
// own rules (".link::after", ".link:hover::after"). The legacy one-colon
// form (:before) counts too.
const PSEUDO_SUFFIX = { before: '::before', after: '::after' };
const pseudoElementPattern = /::?(before|after)$/i;
// "a.link:hover::after" → { base: 'a.link:hover', pseudo: 'after' }. A bare
// "::after" or ".card > ::after" stands for any element there.
const splitPseudoElement = (selector) => {
  const text = String(selector).trim();
  const match = pseudoElementPattern.exec(text);
  if (!match || text[match.index - 1] === '\\') return { base: text, pseudo: '' };
  const base = text.slice(0, match.index);
  return { base: !base.trim() || /[\s>+~]$/.test(base) ? `${base}*` : base, pseudo: match[1].toLowerCase() };
};
const pseudoOfSelector = (selector) => splitPseudoElement(selector).pseudo;
// The part of a selector that must be in the state for the state match at
// index to apply. At the top level it is everything up to the end of the
// compound (".grid .item:hover" in ".grid .item:hover .icon"), so the host
// is found with its context. Inside :is() or :where(), as Tailwind v4 writes
// group-hover (".x:is(:where(.group):hover *)"), it is the compound alone:
// ":where(.group):hover".
const stateHostSelector = (selector, index) => {
  const starts = [0];
  let quote = '';
  for (let at = 0; at < index; at += 1) {
    const char = selector[at];
    if (char === '\\') at += 1;
    else if (quote) { if (char === quote) quote = ''; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') starts.push(at + 1);
    else if (char === ')' || char === ']') starts.pop();
    else if (/[\s>+~,]/.test(char)) starts[starts.length - 1] = at + 1;
  }
  let end = index;
  let depth = 0;
  for (; end < selector.length; end += 1) {
    const char = selector[end];
    if (char === '\\') end += 1;
    else if (char === '(' || char === '[') depth += 1;
    else if (char === ')' || char === ']') {
      if (!depth) break;
      depth -= 1;
    } else if (!depth && /[\s>+~,]/.test(char)) break;
  }
  return selector.slice(starts.length > 1 ? starts.at(-1) : 0, end);
};
const matchesSafely = (element, selector) => {
  try { return element.matches(selector.trim() || '*'); } catch { return false; }
};
// Which states the page's CSS styles on this element: a plain card with a
// :hover rule, a link whose :hover only moves its ::after, and an element
// whose hover, on it or on an ancestor, changes what is inside it
// (".palette-item:hover .tile-help" for the tile holding the help icon,
// Tailwind's group-hover for the card holding the text).
// Focus on an ancestor is not the element's: focusing it focuses no parent.
// A state found once is not looked for again, and each selector is matched
// once: utility CSS repeats the same hover context in hundreds of rules.
const stateRulesFor = (element, sheets) => {
  const found = new Set();
  const closestCache = new Map();
  const insideCache = new Map();
  const cached = (cache, selector, read) => {
    if (!cache.has(selector)) {
      let result = false;
      try { result = read(selector.trim() || '*'); } catch { /* A selector this browser can't match. */ }
      cache.set(selector, result);
    }
    return cache.get(selector);
  };
  eachStyleSelector(sheets, (selector) => {
    if (found.has('hover') && found.has('focus') && found.has('active')) return;
    const part = splitPseudoElement(selector).base.trim();
    const states = [...part.matchAll(new RegExp(statePseudoPattern.source, 'gi'))]
      .map((match) => ({ match, name: match[1].toLowerCase() }))
      .map((item) => ({ ...item, state: item.name.startsWith('focus') ? 'focus' : item.name }))
      .filter(({ state }) => !found.has(state));
    if (!states.length || !forcedStateSelector(part)) return;
    const plain = part.replace(statePseudoPattern, '');
    const own = matchesSafely(element, plain);
    states.forEach(({ match, name, state }) => {
      if (own) {
        found.add(state);
        return;
      }
      if (name === 'focus' || name === 'focus-visible') return;
      const host = stateHostSelector(part, match.index).replace(statePseudoPattern, '');
      if (!cached(closestCache, host, (text) => Boolean(element.closest(text)))) return;
      if (cached(insideCache, plain, (text) => Boolean(element.querySelector(text)))) found.add(state);
    });
  });
  return found;
};
// Replaced and empty elements draw no ::before or ::after.
const NO_PSEUDO_SELECTOR = 'img, input, select, textarea, video, audio, iframe, canvas, embed, object, br, wbr, svg';
const hasPseudoContent = (value) => Boolean(value) && !/^(none|normal)$/i.test(String(value).trim());
// The pseudo-elements the element has now, and the ones a rule gives
// content in a state (".link:hover::after { content: '' }"). Resets such as
// "*::before { box-sizing: border-box }" set no content and make none.
const pseudosFor = (element, sheets) => {
  if (element.matches(NO_PSEUDO_SELECTOR) || element.closest('svg')) return [];
  const found = new Set(Object.keys(PSEUDO_SUFFIX).filter((pseudo) => hasPseudoContent(getComputedStyle(element, PSEUDO_SUFFIX[pseudo]).content)));
  eachStyleSelector(sheets, (selector, rule) => {
    const { base, pseudo } = splitPseudoElement(selector);
    if (!pseudo || found.has(pseudo) || !hasPseudoContent(rule.style?.getPropertyValue('content'))) return;
    try {
      if (element.matches(base.replace(statePseudoPattern, '').trim() || '*')) found.add(pseudo);
    } catch { /* A selector this browser can't match. */ }
  });
  return Object.keys(PSEUDO_SUFFIX).filter((pseudo) => found.has(pseudo));
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
