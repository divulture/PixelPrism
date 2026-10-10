// Studio modes and keyboard shortcuts.

// The shortcut list names modifier keys the way this system does.
document.querySelectorAll('kbd[data-key]').forEach((kbd) => {
  const { label, name } = KEY_NAMES[kbd.dataset.key];
  kbd.textContent = label;
  if (name) kbd.title = name;
  else kbd.removeAttribute('title');
});

// Escape lets go of the selected element, as closing the panel does. Open
// menus and in-place editors handle Escape first and stop it.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || inspectorPanel.hidden || customDialog.matches(':popover-open') || workspaceDialog.matches(':popover-open')) return;
  if (inspectorPanel.contains(document.activeElement)) document.activeElement.blur();
  clearInspectorSelections();
  hideInspectorPanel();
});

cursorToggle.addEventListener('click', activateCursorMode);
inspectorToggle.addEventListener('click', () => {
  const nextOpen = !inspectorModeActive;
  setInspectorMode(nextOpen);
  if (!nextOpen) setCursorModeActive(true);
});
layersToggle.addEventListener('click', () => setLayersOpen(layersPanel.hidden));
layersPanelClose.addEventListener('click', () => setLayersOpen(false));
commentsToggle.addEventListener('click', () => setCommentsOpen(commentsPanel.hidden));
commentsPanelClose.addEventListener('click', () => setCommentsOpen(false));

function handleStudioShortcut(shortcut) {
  switch (shortcut) {
    case 'i':
      setInspectorMode(!inspectorModeActive);
      if (!inspectorModeActive) setCursorModeActive(true);
      break;
    case 'c':
      setCommentsOpen(commentsPanel.hidden);
      break;
    case 'l':
      setLayersOpen(layersPanel.hidden);
      break;
    case 'v':
      activateCursorMode();
      break;
    case 'shift+r':
      toggleAllRulers();
      break;
    case 'shift+g':
      toggleAllLayoutContrast();
      break;
    case 'shift+c':
      toggleAllGridOverlays();
      break;
    case 'e':
      setCodeOpen(codePanel.hidden);
      break;
    default:
      break;
  }
}

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.matches('input, textarea, select, [contenteditable="true"]') || target.isContentEditable)) return;
  const shortcut = (event.shiftKey && ({ KeyR: 'shift+r', KeyG: 'shift+g', KeyC: 'shift+c' })[event.code])
    || ({ KeyI: 'i', KeyC: 'c', KeyL: 'l', KeyV: 'v', KeyE: 'e', KeyS: 's' })[event.code];
  if (!shortcut) return;
  event.preventDefault();
  handleStudioShortcut(shortcut);
});

