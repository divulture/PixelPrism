// Picking elements with the pointer, and the view an element was picked in.

// A comment on an element shown in a state (Hover) remembers that state
// after the tabs and popups it was left in.
// What opened the popup, panel or menu an element is in, when the recorder
// did not see it open (a menu opened by hover, or by a press it could not
// tell): kept as a step, so the comment, the edit and the review open it
// again. Searched up from the element, as a fixed header can hold both a
// menu and its button.
const popupOpenerFor = (element, steps) => {
  const recordedPopup = steps.some((step) => stepNodes.get(step)?.popup?.contains(element));
  if (recordedPopup) return null;
  // Named by its own text, not the menu it holds ("Products", not
  // "Products Analytics Billing").
  const ownLabel = (control, popup) => truncate([...control.childNodes]
    .filter((node) => !(node instanceof Element && node.contains(popup)))
    .map((node) => node.textContent)
    .join(' '), 60) || control.getAttribute('aria-label') || control.getAttribute('title') || '';
  // A tab is a switch; a toggle that says it is open (aria-expanded) is
  // replayed only when closed; anything else opens the popup.
  const openerStep = (control, popup) => {
    const step = { element: elementContextFor(control), label: ownLabel(control, popup) || 'Popup' };
    if (control.matches('[role="tab"], [aria-selected]')) return step;
    if (control.hasAttribute('aria-expanded')) return { ...step, expanded: 'true' };
    return { kind: 'open', ...step };
  };
  const recordedControl = (control) => {
    const key = stepControlKey({ domPath: domPathFor(control), indexPath: indexPathFor(control) });
    return steps.some((step) => stepControlKey(step.element) === key);
  };
  for (let node = element, depth = 0; node && node !== document.body && depth < 12; node = node.parentElement, depth += 1) {
    // A control that names this container (aria-controls): Radix, Headless
    // UI, Webflow and Bootstrap menus, tabs, accordions.
    if (node.id) {
      const escaped = CSS.escape(node.id);
      const named = [...document.querySelectorAll(`[aria-controls~="${escaped}"], [aria-owns~="${escaped}"]`)].find((control) => !node.contains(control));
      // A hidden control (a phone menu button at desktop width) opened nothing.
      if (named) return recordedControl(named) || !isReplayable(named) || !isShown(named) ? null : openerStep(named, node);
      const described = [...document.querySelectorAll(`[aria-describedby~="${escaped}"]`)].find((control) => !node.contains(control));
      if (described) return { kind: 'hover', element: elementContextFor(described), label: ownLabel(described, node) || 'Tooltip' };
    }
    // An open toggle right beside the container (Bootstrap's dropdown).
    const parent = node.parentElement;
    if (parent && parent !== document.body && depth < 8) {
      const toggle = [...parent.querySelectorAll(':scope > [aria-expanded="true"], :scope > * > [aria-expanded="true"]')]
        .find((control) => !node.contains(control) && !control.contains(node) && isShown(control));
      if (toggle) return recordedControl(toggle) || !isReplayable(toggle) ? null : openerStep(toggle, node);
    }
  }
  // A CSS hover menu (li:hover > ul): the floating box the element is in,
  // and the small hovered item holding it that has content of its own.
  let floating = null;
  for (let node = element; node && node !== document.body && !floating; node = node.parentElement) {
    const position = getComputedStyle(node).position;
    if (position === 'absolute' || position === 'fixed') floating = node;
  }
  if (!floating) return null;
  const viewportArea = window.innerWidth * window.innerHeight;
  for (let node = floating.parentElement, depth = 0; node && node !== document.body && depth < 3; node = node.parentElement, depth += 1) {
    if (!node.matches(':hover')) break;
    const box = node.getBoundingClientRect();
    const ownContent = [...node.children].some((child) => !child.contains(floating) && isShown(child));
    if (ownContent && box.width * box.height < viewportArea / 4) {
      return recordedControl(node) ? null : { kind: 'hover', element: elementContextFor(node), label: ownLabel(node, floating) || 'Hover menu' };
    }
  }
  return null;
};
// The view an element is shown in: the switches and popups recorded, and
// what opened the popup it is in.
const viewStepsFor = (element) => {
  const recorded = relevantViewSteps(element, currentViewSteps());
  const opener = popupOpenerFor(element, recorded);
  return opener ? [...recorded, opener] : recorded;
};
const stateStepsFor = (element) => (forcedState && forcedState.element === element
  ? [{ kind: 'state', state: forcedState.state, element: elementContextFor(element), label: STATE_LABEL[forcedState.state] }]
  : []);
const viewStepsWithState = (element) => [...viewStepsFor(element), ...stateStepsFor(element)];
// Taken when an element is picked for editing, while its menu is still
// open; edits made later keep it.
let selectionViewSteps = [];
// Where a comment click landed, in this window: Studio opens its comment
// box there and the marker keeps that spot in the element.
let commentPickPoint = null;
// A comment's place: the click, or the element's corner when it was picked
// another way (Layers); the offset is kept only for a click.
const commentPlaceFor = (element) => {
  const rect = element.getBoundingClientRect();
  const clicked = commentPickPoint;
  commentPickPoint = null;
  const x = clicked ? clicked.x : Math.min(Math.max(rect.left, 0), innerWidth);
  const y = clicked ? clicked.y : Math.min(Math.max(rect.top, 0), innerHeight);
  return {
    point: { x: Math.round(x), y: Math.round(y) },
    ...(clicked ? { offset: { x: Math.round(x - rect.left), y: Math.round(y - rect.top) } } : {})
  };
};
const reportSelectedElement = () => {
  if (!selectedElement) return;
  const steps = viewStepsWithState(selectedElement);
  // A comment's element comes with the copy of its view (pageSnapshot).
  const snapshot = interactionMode === 'comment' ? viewSnapshotFor(steps) : null;
  const place = interactionMode === 'comment' ? commentPlaceFor(selectedElement) : {};
  window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-element-selected', route: `${location.pathname}${location.search}${location.hash}`, element: elementContextFor(selectedElement), steps, ...place, ...(snapshot ? { snapshot } : {}) }, extensionOrigin);
};
// Text under the pointer that lies directly in an element beside child
// elements: the text layer Layers shows for it. An element holding only
// text is that layer itself, so it gets none.
const textNodeAt = (element, x, y) => {
  if (!(element instanceof Element) || !element.children.length) return null;
  const range = document.createRange();
  return [...element.childNodes].find((node) => {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return false;
    range.selectNodeContents(node);
    return [...range.getClientRects()].some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  }) || null;
};
// Picking listens on the window, whose capture phase runs before any
// listener on the document: libraries that delegate from the document in
// capture (Bootstrap's tabs and dropdowns) would otherwise take the press
// first, and a tab picked for the Inspector would switch. PixelPrism's own
// nodes (comment markers) handle their presses themselves.
const isStudioPress = (event) => event.composedPath().some((node) => node instanceof Element && node.hasAttribute('data-viewport-parade-overlay'));
const refreshHoveredElement = () => {
  if ((active || commentPickerActive || capturePickerActive) && (!pinned || capturePickerActive) && pointerInside && hoveredElement) show(hoveredElement);
  else if (selectedElement) show(selectedElement);
  scheduleLayoutMap();
};

// Puts this part into the page; install() calls it once, on Studio's first request.
const installPicking = () => {
  document.addEventListener('pointermove', (event) => {
    pointerInside = true;
    if ((!active && !commentPickerActive && !capturePickerActive) || (pinned && !capturePickerActive)) return;
    const hoveredText = active && !capturePickerActive && interactionMode !== 'comment' ? textNodeAt(event.target, event.clientX, event.clientY) : null;
    if (hoveredText) {
      hoveredElement = event.target;
      showTextNode(hoveredText);
      return;
    }
    if (capturePickerActive) {
      // A screenshot takes the whole element; spacing zones do not apply.
      hoveredElement = event.target;
      show(hoveredElement, 'size');
    } else if (hoveredElement !== event.target) {
      hoveredElement = event.target;
      show(hoveredElement, undefined);
    } else {
      show(hoveredElement, editorModeAtPoint(hoveredElement, event.clientX, event.clientY));
    }
  }, true);
  window.addEventListener('click', (event) => {
    if ((!active && !commentPickerActive && !capturePickerActive) || replayingSteps) return;
    if (suppressMarkerClick || isStudioPress(event)) return;
    // Text being edited takes its clicks (the caret), and only it: a link
    // or button around it does not act.
    if (isTextEditTarget(event.target) || isTextEditKeyClick(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    // A click elsewhere keeps the edited text.
    finishTextEdit(true);
    event.preventDefault();
    event.stopImmediatePropagation();
    if (capturePickerActive) {
      pickCaptureElement(event.target);
      return;
    }
    // A subsequent click is a request to edit another zone, not a request to
    // close the editor. This makes it possible to move from content to padding
    // on the same element without toggling the inspector off and on again.
    const textNode = interactionMode !== 'comment' ? textNodeAt(event.target, event.clientX, event.clientY) : null;
    commentPickPoint = interactionMode === 'comment' ? { x: event.clientX, y: event.clientY } : null;
    selectLayerElement(event.target, textNode ? { exact: true, textNode } : {});
  }, true);
  // While the Inspector or Comments pick elements, presses do not reach the
  // page: an open menu would take a press elsewhere as "outside" and close,
  // and a select (Radix) would pick the option pressed. The click that
  // follows still selects.
  ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'touchstart', 'touchend'].forEach((type) => {
    window.addEventListener(type, (event) => {
      if ((!active && !commentPickerActive && !capturePickerActive) || replayingSteps || !event.isTrusted) return;
      if (isStudioPress(event)) return;
      // In text being edited a press places the caret; the page hears none.
      if (isTextEditTarget(event.target)) {
        event.stopImmediatePropagation();
        return;
      }
      // Kept from moving focus, which closes popups too; a touch keeps its
      // default so it still produces the click.
      if (type === 'pointerdown' || type === 'mousedown') event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  });
  window.addEventListener('dblclick', (event) => {
    if ((!active && !commentPickerActive && !capturePickerActive) || isStudioPress(event)) return;
    // A double click in text being edited selects a word, as in any field.
    if (isTextEditTarget(event.target)) {
      event.stopImmediatePropagation();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    // In the Inspector a double click on text edits it in place.
    const textTarget = active && interactionMode === 'edit' && !capturePickerActive ? textEditElementAt(event.target, event.clientX, event.clientY) : null;
    if (textTarget) {
      startTextEdit(textTarget);
      return;
    }
    selectLayerElement(event.target);
  }, true);
  window.addEventListener('scroll', refreshHoveredElement, true);
  window.addEventListener('resize', refreshHoveredElement);
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'toggle-inspector')) return;
    active = Boolean(event.data.enabled);
    interactionMode = active ? 'edit' : (commentPickerActive ? 'comment' : 'edit');
    syncInteractionState();
    if (!active && !commentPickerActive) clearSelection();
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'toggle-comment-picker')) return;
    commentPickerActive = Boolean(event.data.enabled);
    interactionMode = commentPickerActive ? 'comment' : 'edit';
    syncInteractionState();
    if (!commentPickerActive && !active) clearSelection();
  });
};
