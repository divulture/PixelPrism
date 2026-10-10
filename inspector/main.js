// Tells Studio the preview is ready and sets the tools up on the first request.

window.addEventListener('message', function activateInspector(event) {
  const type = event.data?.type;
  if (!isStudioMessage(event, type) || !['toggle-inspector', 'toggle-comment-picker', 'toggle-capture-picker', 'toggle-layout-contrast', 'layers-request-tree', 'comment-markers', 'apply-recorded-changes', 'code-hover', 'code-select', 'code-match-selectors'].includes(type)) return;
  window.removeEventListener('message', activateInspector);
  install(event.data);
});
// A press anywhere in the page selects this preview in Studio, and with it
// the preview Layers and Code view show. Hovering a preview does not, nor a
// press mirrored from another preview (dispatched, so not trusted).
window.addEventListener('pointerdown', (event) => {
  if (!event.isTrusted) return;
  window.parent.postMessage({ source: 'viewport-parade', type: 'preview-pressed' }, extensionOrigin);
}, true);
// Sent last, once every script of the preview listens for Studio's replies.
window.parent.postMessage({
  source: 'viewport-parade',
  type: 'preview-ready',
  url: location.href,
  inspectorProtocolVersion: INSPECTOR_PROTOCOL_VERSION
}, extensionOrigin);
