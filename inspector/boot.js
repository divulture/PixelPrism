// The only script Chrome runs in every frame of every permitted page. It does
// nothing on a normal browsing tab: only a preview embedded by Studio asks the
// service worker to load the Inspector's scripts (INSPECTOR_SCRIPTS in
// background.js) into its frame.
(() => {
  if (window.top === window) return;
  if (window.__viewportParadeInspectorInstalled || window.__pixelprismInspectorRequested) return;
  const extensionOrigin = new URL(chrome.runtime.getURL('/')).origin;
  // Only previews directly embedded by Studio; otherwise a nested frame (for
  // example one on figma.com) would receive messages addressed to the
  // extension origin and Chromium would reject them.
  const parentOrigin = window.location.ancestorOrigins?.[0]
    || (document.referrer ? new URL(document.referrer).origin : '');
  if (parentOrigin !== extensionOrigin) return;
  window.__pixelprismInspectorRequested = true;
  chrome.runtime.sendMessage({ type: 'load-inspector' }).catch(() => {
    // An extension reloaded under an open Studio: the preview stays plain.
  });
})();
