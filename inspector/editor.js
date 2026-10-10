// The Inspector’s state and editing: reading values for the panel, finding the rule an edit goes to, and writing it.

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
// Comments get their own cursor, as in Figma: a bubble in the markers' red
// with a plus. Its tip is the hotspot, where the comment's pin goes.
const COMMENT_CURSOR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><defs><filter id="s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#18181b" flood-opacity=".28"/></filter></defs><path d="M4 27V16.5a10.5 10.5 0 1 1 10.5 10.5z" fill="#ef4444" stroke="#fff" stroke-width="2" stroke-linejoin="round" filter="url(#s)"/><path d="M14.5 12.5v8M10.5 16.5h8" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
const COMMENT_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(COMMENT_CURSOR_SVG)}") 4 27, crosshair`;
const commentCursorStyle = document.createElement('style');
commentCursorStyle.textContent = `html[data-viewport-parade-commenting], html[data-viewport-parade-commenting] * { cursor: ${COMMENT_CURSOR} !important; }`;
const syncInteractionState = () => {
  const enabled = active || commentPickerActive || capturePickerActive;
  inspectorInteractionActive = enabled;
  document.documentElement.toggleAttribute('data-viewport-parade-inspecting', enabled);
  document.documentElement.toggleAttribute('data-viewport-parade-commenting', commentPickerActive && !active && !capturePickerActive);
};
const typographyStyle = document.createElement('style');
const typographyRules = new Map();
// Layout and component edits share an override stylesheet. It keeps edits
// visible even when an imported component stylesheet uses !important, and it
// applies a shared component change consistently to every matching instance.
const layoutStyle = document.createElement('style');
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
  overflow: 'overflow', cursor: 'cursor', filter: 'filter', backdropFilter: 'backdrop-filter', aspectRatio: 'aspect-ratio'
};
const colorFields = new Set(['backgroundColor', 'color', 'borderColor']);
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
const populateEditor = (element, mode) => {
  const styles = getComputedStyle(element);
  editorMode = mode;
  const sharedSelector = mode === 'typography'
    ? typographySelector
    : mode === 'component'
      ? componentSelector
      : layoutSelector;
  // ".button:hover" matches nothing the pointer isn't on; count the elements.
  // One element is named by its own tag, id and classes, not by its path.
  const title = sharedSelector && selectorMatchesMultiple(sharedSelector === componentSelector ? baseComponentSelector : sharedSelector)
    ? `${editorModeLabel[mode]} · all ${sharedSelector}`
    : `${editorModeLabel[mode]} · ${selectorFor(element)}`;
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
      : colorFields.has(property)
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
    // Its kind as Layers draws it, for the icon in the panel's header.
    layerKind: selectedTextNode?.parentNode === element || isTextWrapper(element)
      ? 'text'
      : layerKindFor(element, !element.children.length && Boolean(layerTextFor(element))),
    renderedWidth: Math.round(element.getBoundingClientRect().width),
    renderedHeight: Math.round(element.getBoundingClientRect().height),
    // Top-left corner on the page, so it doesn't change with scrolling.
    pageX: Math.round(element.getBoundingClientRect().left + window.scrollX),
    pageY: Math.round(element.getBoundingClientRect().top + window.scrollY),
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
  contentOverlay.style.border = '2px solid #2563eb';
  contentOverlay.style.background = 'rgba(37,99,235,.2)';
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
  // Text being edited is drawn as a field instead (text-edit.js).
  if (element === textEditing?.element) {
    showTextEditField(element);
    return;
  }
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
    contentOverlay.style.border = zone === 'size' ? '2px solid #2563eb' : '1px solid rgba(161,161,170,.75)';
    contentOverlay.style.background = zone === 'size' ? 'rgba(37,99,235,.2)' : 'rgba(161,161,170,.08)';
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
  // Equal sides collapse to one value ("margin: 0", "gap: 24 px"); any
  // difference spells every side out.
  const sides = (values, separator) => values.every((value) => value === values[0])
    ? (values[0] ? `${values[0]} px` : '0')
    : `${values.join(separator)} px`;
  const gapPx = (value) => Math.round(parseFloat(value) || 0);
  const gap = styles.display.includes('flex') || styles.display.includes('grid')
    ? `\ngap: ${sides([gapPx(styles.rowGap), gapPx(styles.columnGap)], ' × ')}`
    : '';
  drawGutters(element, styles, gapAxis);
  label.textContent = `${selectorFor(element)}  ${Math.round(box.width)} × ${Math.round(box.height)} px\nmargin: ${sides(margin, ' / ')}   padding: ${sides(padding, ' / ')}${gap}`;
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
  if (propertyName === 'alt') {
    applyAltEdit(rawValue);
    return;
  }
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

// Puts this part into the page; install() calls it once, on Studio's first request.
const installEditor = () => {
  commentCursorStyle.dataset.viewportParadeOverlay = '';
  document.documentElement.append(commentCursorStyle);
  typographyStyle.dataset.viewportParadeOverlay = '';
  typographyStyle.dataset.viewportParadeOverrides = '';
  document.documentElement.append(typographyStyle);
  layoutStyle.dataset.viewportParadeOverlay = '';
  layoutStyle.dataset.viewportParadeOverrides = '';
  document.documentElement.append(layoutStyle);
};
