// Commands from Studio’s Inspector and Code panels, and recorded edits coming back.

// Edits recorded earlier for this page and size come back when the preview
// loads again, and go away when Studio resets them.
const applyRecordedChanges = (changes) => {
  (Array.isArray(changes) ? changes : []).forEach((change) => {
    const { selector, property, value, wrapText } = change;
    if (property === 'text') {
      applyRecordedText(change);
      return;
    }
    if (property === 'alt') {
      applyRecordedAlt(change);
      return;
    }
    if (typeof selector !== 'string' || typeof property !== 'string' || !value) return;
    if (wrapText && typeof wrapText === 'object') rewrapText(wrapText);
    const declarations = layoutRules.get(selector) || new Map();
    declarations.set(property, String(value));
    layoutRules.set(selector, declarations);
  });
  renderLayoutRules();
  scheduleLayoutMap();
};
const resetRecordedChanges = (changes) => {
  (Array.isArray(changes) ? changes : []).forEach((change) => {
    const { selector, property } = change;
    if (property === 'text') {
      resetRecordedText(change);
      return;
    }
    if (property === 'alt') {
      resetRecordedAlt(change);
      return;
    }
    [layoutRules, typographyRules].forEach((rules) => {
      const declarations = rules.get(selector);
      if (declarations?.delete(property) && !declarations.size) rules.delete(selector);
    });
  });
  renderLayoutRules();
  renderTypographyRules();
  if (selectedElement) show(selectedElement);
  scheduleLayoutMap();
};
// The Code panel's rows: hover highlights the element, a click selects it
// as Layers does, and the CSS view asks which rules match the selection.
// State pseudo-classes and pseudo-elements are left out of that test.
const codeSelectorMatches = (selector) => {
  if (!selectedElement) return false;
  return selector.split(',').some((part) => {
    const plain = part
      .replace(/::?(before|after|placeholder|selection|marker|first-line|first-letter|backdrop|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+)(\([^)]*\))?/gi, '')
      .replace(/:(hover|focus|focus-visible|focus-within|active|visited|target)\b/gi, '')
      .trim();
    try { return selectedElement.matches(plain || '*'); } catch { return false; }
  });
};
const handleCodeMessage = (data) => {
  if (data.type === 'code-hover') {
    const element = codeElementFor(data.path);
    if (element) show(element, 'size');
    else if (selectedElement) show(selectedElement, 'size');
    else hideOverlays();
  } else if (data.type === 'code-select') {
    selectLayerElement(codeElementFor(data.path), { exact: true });
  } else if (data.type === 'code-match-selectors') {
    const selectors = Array.isArray(data.selectors) ? data.selectors : [];
    window.parent.postMessage({ source: 'viewport-parade', type: 'code-selectors', matched: selectors.filter(codeSelectorMatches) }, extensionOrigin);
  }
};
// While the studio's margin or padding fields are in use, that zone of the
// selected element stays highlighted; the earlier zone comes back after.
let zoneBeforeFieldHighlight;

// Puts this part into the page; install() calls it once, on Studio's first request.
const installCommands = () => {
  // The Inspector's state switch: the element is shown in that state, and
  // the panel reads and edits the state's rule.
  window.addEventListener('message', async (event) => {
    if (!isStudioMessage(event, 'inspector-set-state') || !selectedElement || interactionMode !== 'edit') return;
    const element = selectedElement;
    const state = selectedStates.includes(event.data.state) ? event.data.state : 'default';
    // Edits go to the state's rule from the moment it is chosen: settling the
    // state's styles takes up to a second and a half, and an edit typed
    // meanwhile would otherwise land in the default rule.
    inspectorState = state;
    componentSelector = `${baseComponentSelector}${STATE_SUFFIX[state] || ''}`;
    if (state === 'default') releaseForcedState();
    else await forceState(element, state);
    if (selectedElement !== element) return;
    populateEditor(element, 'component');
    show(element);
    scheduleLayoutMap();
    reportSelectedElement();
  });
  window.addEventListener('message', (event) => {
    if (['code-hover', 'code-select', 'code-match-selectors'].some((type) => isStudioMessage(event, type))) handleCodeMessage(event.data);
  });
  window.addEventListener('message', (event) => {
    if (isStudioMessage(event, 'apply-recorded-changes')) applyRecordedChanges(event.data.changes);
    else if (isStudioMessage(event, 'reset-recorded-changes')) resetRecordedChanges(event.data.changes);
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'inspector-highlight-zone') || !selectedElement) return;
    if (event.data.zone) {
      if (zoneBeforeFieldHighlight === undefined) zoneBeforeFieldHighlight = highlightedZone;
      show(selectedElement, event.data.zone);
    } else if (zoneBeforeFieldHighlight !== undefined) {
      show(selectedElement, zoneBeforeFieldHighlight);
      zoneBeforeFieldHighlight = undefined;
    }
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'inspector-pointer-left')) return;
    pointerInside = false;
    // Keep hoveredElement for scroll calculations, but remove the focused
    // colours as soon as the cursor is no longer over this preview.
    clearHover();
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'inspector-pointer-entered')) return;
    pointerInside = true;
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'layers-request-tree')) return;
    sendLayersTree();
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'layers-select')) return;
    const element = layerElementFor(event.data.path);
    const node = Number.isInteger(event.data.textIndex) ? element?.childNodes[event.data.textIndex] : null;
    selectLayerElement(element, { exact: true, textNode: node?.nodeType === Node.TEXT_NODE ? node : null });
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'layers-hover')) return;
    const element = layerElementFor(event.data.path);
    const node = Number.isInteger(event.data.textIndex) ? element?.childNodes[event.data.textIndex] : null;
    if (node?.nodeType === Node.TEXT_NODE) showTextNode(node);
    else if (element) show(element, 'size');
    else if (selectedElement) show(selectedElement, 'size');
    else hideOverlays();
  });
};
