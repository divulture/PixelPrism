// Mirrored clicks: a click in one preview is repeated in the others.

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
