// Checks which recorded edits the page itself already shows.

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
  // The page's own text, not an edit Studio brought back into this preview.
  if (['text', 'text-content', 'textContent'].includes(property)) return textValueFor(editedTexts.has(element) ? { textContent: editedTexts.get(element) } : element);
  if (property === 'alt') return pageAltOf(element) ?? '';
  const value = getComputedStyle(element).getPropertyValue(property);
  return value ? value.trim() : null;
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
      // Alt text is words: it has to match exactly.
      const matches = change.property === 'alt' ? actual === change.after : valuesMatch(change.property, actual, change.after);
      if (actual !== null && matches) resolved.push({ key: change.key, after: change.after });
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
