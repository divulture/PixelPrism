// Navigation sync: a link followed in one preview opens in every preview.

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
    || ({ KeyI: 'i', KeyC: 'c', KeyL: 'l', KeyV: 'v', KeyE: 'e', KeyS: 's' })[event.code];
  if (!shortcut) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.parent.postMessage({ source: 'viewport-parade', type: 'studio-shortcut', shortcut }, extensionOrigin);
}, true);
