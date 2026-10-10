// Sets the Inspector, comment and capture tools up the first time Studio turns
// one on, then handles that first request. The parts are installed in the
// order they always were: overlays and edit styles first, comment markers last.

const install = (initialMessage) => {
  window.__viewportParadeInspectorInstalled = true;
  installOverlays();
  installEditor();
  installPicking();
  installTextEditing();
  installCapture();
  installCommands();
  installCommentMarkers();
  installLayersRefresh();
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
