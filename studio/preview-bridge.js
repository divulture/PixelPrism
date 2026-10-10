// Messages from the previews: readiness, selections, edits, comments and mirrored clicks.

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'preview-ready') return;
  const card = [...document.querySelectorAll('.viewport-card')].find((candidate) => candidate.querySelector('iframe').contentWindow === event.source);
  if (!card) return;
  // Content scripts already injected into a preview survive an extension
  // reload. Reload that iframe once when it reports an older protocol, so the
  // page receives the same inspector code as the Studio shell.
  // Chrome swaps content scripts only when the extension itself reloads, so a
  // mismatch that survives one preview reload means outdated inspector scripts.
  card.dataset.inspectorOutdated = String(Number(event.data.inspectorProtocolVersion) !== INSPECTOR_PROTOCOL_VERSION);
  if (Number(event.data.inspectorProtocolVersion) !== INSPECTOR_PROTOCOL_VERSION && !card.dataset.inspectorProtocolReloaded) {
    card.dataset.inspectorProtocolReloaded = 'true';
    const iframe = card.querySelector('iframe');
    loadPreviewFrame(iframe, iframe.src);
    return;
  }
  card.dataset.previewReady = 'true';
  clearTimeout(card.previewReadyTimer);
  // Only the new document says it is ready, so what the frame reports from
  // now on is about it. Heavy pages fire load seconds later, and links
  // clicked meanwhile must not be ignored.
  delete card.querySelector('iframe').dataset.navigating;
  // A new document starts at the top and needs to be asked for its scroll.
  if (card.rulers) {
    card.rulers.scrollX = 0;
    card.rulers.scrollY = 0;
    if (card.rulers.shown) event.source.postMessage({ source: 'viewport-parade', type: 'watch-ruler-scroll', enabled: true }, '*');
    renderRulers(card);
  }
  if (inspectorModeActive) {
    event.source.postMessage({ source: 'viewport-parade', type: 'toggle-inspector', enabled: true }, '*');
  }
  enableNavigationSync(card);
  if (!layersFrame) setLayersFrame(event.source);
  // A fresh document has neither the comment picker nor markers, whatever
  // was sent to the one it replaced.
  commentPickerFrames.delete(card.querySelector('iframe'));
  if (!commentsPanel.hidden) setCommentPicker(true);
  card.commentMarkersPayload = '';
  card.replayedCommentId = null;
  cardMarkerStatuses.delete(card);
  syncCommentMarkers();
  reconcilePendingChanges(card);
  applyRecordedChanges(card);
  // A new document in the Code panel's preview: its code is read afresh.
  if (!codePanel.hidden && event.source === codeFrame) {
    codeNodes.clear();
    codeBodyIndex = null;
    codeSelectedKey = null;
    postToCode({ type: 'code-watch', enabled: true });
    loadCodeNodes();
    renderCodeContext();
    if (codeView === 'css') requestCodeStyles();
    else codeSheets = null;
  }
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'studio-shortcut') return;
  const isPreview = [...document.querySelectorAll('.viewport-card iframe')].some((iframe) => iframe.contentWindow === event.source);
  const shortcut = String(event.data.shortcut || '').toLowerCase();
  if (isPreview && shortcut === 'escape') {
    if (placingCommentId) setCommentPlacing(null);
  } else if (isPreview && ['i', 'c', 'l', 'v', 'e', 's', 'shift+r', 'shift+g', 'shift+c'].includes(shortcut)) handleStudioShortcut(shortcut);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'pending-changes-reconciled') return;
  const card = [...document.querySelectorAll('.viewport-card')].find((candidate) => (
    candidate.querySelector('iframe').contentWindow === event.source
  ));
  if (!card || card.dataset.reconciliationRequest !== event.data.requestId) return;
  const resolved = Array.isArray(event.data.resolved) ? event.data.resolved : [];
  if (!resolved.length) return;
  let removed = 0;
  resolved.forEach(({ key, after }) => {
    // Do not let a late answer clear a newer edit to the same property.
    if (changeLog.get(key)?.to === after && changeLog.delete(key)) removed += 1;
  });
  if (removed) syncChangeUi();
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'layers-tree') return;
  if (!layersFrame) setLayersFrame(event.source);
  if (event.source !== layersFrame) return;
  layersTreeData = event.data.tree;
  renderLayersTree();
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'layers-selected') return;
  setLayersFrame(event.source);
  selectedLayerPath = layerPathKey(event.data.path);
  selectedLayerText = Number.isInteger(event.data.textIndex) ? event.data.textIndex : null;
  revealCodeSelection(event.data.path);
  breadcrumbAncestors = Array.isArray(event.data.ancestors) ? event.data.ancestors : [];
  breadcrumbChildren = Array.isArray(event.data.children) ? event.data.children : [];
  renderBreadcrumbs();
  expandLayerAncestors(selectedLayerPath);
  if (!layersPanel.hidden) renderLayersTree();
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'navigate-preview') return;
  const preview = [...document.querySelectorAll('.viewport-card iframe')].find((iframe) => iframe.contentWindow === event.source);
  if (preview && !preview.dataset.navigating) openPreviewUrl(event.data.url, true);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'capture-element-picked') return;
  const card = cardForFrame(event.source);
  if (!card || card !== capturePickCard || !event.data.element) return;
  setCapturePicking(null);
  // The page the element is on, as the preview shows it now (client-side
  // routing does not reload the preview).
  let url = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
  try { if (event.data.route) url = canonicalInspectorUrl(new URL(event.data.route, url).href); } catch { /* Keep the card's page. */ }
  saveCapture(card, 'element', {
    url,
    target: { element: event.data.element },
    steps: Array.isArray(event.data.steps) ? event.data.steps : []
  });
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'capture-element-cancelled') return;
  if (capturePickCard && cardForFrame(event.source) === capturePickCard) cancelElementCapture();
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !capturePickCard) return;
  event.preventDefault();
  cancelElementCapture();
});

// A click in one preview is repeated in the others; each finds the same
// control on its own and skips it if the page there is another page.
// A press in a preview, or an element picked in it, selects that preview.
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || !['preview-pressed', 'inspector-element-selected'].includes(event.data?.type)) return;
  const card = cardForFrame(event.source);
  if (card) selectViewportCard(card);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'mirror-click') return;
  const sourceCard = cardForFrame(event.source);
  if (!sourceCard) return;
  const { path, element, expanded, open, checked } = event.data;
  document.querySelectorAll('.viewport-card').forEach((card) => {
    if (card === sourceCard) return;
    card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'mirror-click', path, element, expanded, open, checked }, '*');
  });
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-style-change') return;
  const card = [...document.querySelectorAll('.viewport-card')].find((candidate) => (
    candidate.querySelector('iframe').contentWindow === event.source
  ));
  if (!card) return;

  // Do not rely on iframe location/innerWidth here. A local file can be
  // canonicalised by Chromium (or contain a hash), while its visual viewport
  // may be rounded after scaling. The card is the source of truth for the
  // change that should unlock its save button.
  recordInspectorChange({
    ...event.data.change,
    ...placeOfCard(card),
    url: card.dataset.loadedUrl || targetUrl,
    viewport: {
      width: Number(card.dataset.viewportWidth),
      height: Number(card.dataset.viewportHeight)
    }
  });
  if (isContentChange(event.data.change)) syncContentChange(card, event.data.change);
});

// Text being typed in one preview shows in the others as it is typed.
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-text-preview') return;
  const card = cardForFrame(event.source);
  if (card && event.data.change) syncContentChange(card, event.data.change);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-editor-open') return;
  if (!commentsPanel.hidden && [...commentPickerFrames].some((frame) => frame.contentWindow === event.source)) {
    inspectorFrame = cardForFrame(event.source)?.querySelector('iframe');
    setLayersFrame(event.source);
    return;
  }
  showInspectorPanel(event.data.editor || {}, event.source);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-element-selected') return;
  const card = cardForFrame(event.source);
  if (!card || !event.data.element) return;
  const snapshot = typeof event.data.snapshot?.html === 'string' ? event.data.snapshot : null;
  if (placingCommentId && !commentsPanel.hidden) {
    moveComment(placingCommentId, card, { element: event.data.element, route: event.data.route || '/', steps: event.data.steps, snapshot });
    clearInspectorSelections();
    return;
  }
  clearOtherInspectorSelections(event.source);
  const offset = event.data.offset && Number.isFinite(event.data.offset.x) && Number.isFinite(event.data.offset.y) ? event.data.offset : null;
  commentSelection = { frame: card.querySelector('iframe'), element: event.data.element, offset, route: event.data.route || '/', steps: Array.isArray(event.data.steps) ? event.data.steps : [], snapshot };
  if (!commentsPanel.hidden) renderComments();
  // Comments: the box to write in opens where the element was clicked.
  const point = event.data.point;
  if (!commentsPanel.hidden && point && Number.isFinite(point.x) && Number.isFinite(point.y)) openCommentComposer(card.querySelector('iframe'), point);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'comment-markers-status') return;
  const card = cardForFrame(event.source);
  if (!card || !Array.isArray(event.data.statuses)) return;
  cardMarkerStatuses.set(card, new Map(event.data.statuses.map(({ id, state }) => [id, state])));
  const pendingState = pendingFocusCommentId && cardMarkerStatuses.get(card).get(pendingFocusCommentId);
  if (['placed', 'approx'].includes(pendingState)) {
    event.source.postMessage({ source: 'viewport-parade', type: 'comment-marker-focus', id: pendingFocusCommentId }, '*');
    pendingFocusCommentId = null;
  } else if (pendingState === 'other-view' && card.replayedCommentId !== pendingFocusCommentId) {
    // Opened the page for a comment on one of its tabs: switch to it too.
    card.replayedCommentId = pendingFocusCommentId;
    event.source.postMessage({ source: 'viewport-parade', type: 'comment-replay-steps', id: pendingFocusCommentId }, '*');
  }
  if (!commentsPanel.hidden) renderComments();
});

// An older comment turned up after the user switched a tab or opened a
// popup: it keeps those steps, so the export and the list can reach it.
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'comment-steps-learned') return;
  const card = cardForFrame(event.source);
  const comment = commentById(event.data.id);
  if (!card || !comment || comment.steps?.length || !commentShownOnCard(comment, card)) return;
  if (!Array.isArray(event.data.steps) || !event.data.steps.length) return;
  comment.steps = event.data.steps;
  saveComments();
  syncCommentMarkers();
  if (!commentsPanel.hidden) renderComments();
  speak(`Comment ${commentNumber(comment)} now remembers the “${viewStepsLabel(comment.steps)}” view.`);
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'comment-marker-activated') return;
  if (!cardForFrame(event.source) || commentsPanel.hidden) return;
  selectComment(event.data.id, { reveal: true });
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'comment-marker-moved') return;
  const card = cardForFrame(event.source);
  if (!card || commentsPanel.hidden) return;
  moveComment(event.data.id, card, { element: event.data.element, pin: event.data.pin, route: event.data.route, offset: event.data.offset, same: Boolean(event.data.same), steps: event.data.steps });
  commentsList.querySelector(`[data-comment-id="${event.data.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'inspector-editor-close') return;
  if (inspectorFrame?.contentWindow === event.source) {
    hideInspectorPanel();
    selectedLayerPath = undefined;
    if (!layersPanel.hidden) renderLayersTree();
  }
});
