// Picking an element for an element screenshot.

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

// Puts this part into the page; install() calls it once, on Studio's first request.
const installCapture = () => {
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
};
