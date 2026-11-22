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
// another way (Layers); the offset is kept only for a click. A hidden
// element has no corner, so the box opens at its nearest shown ancestor's.
const commentPlaceFor = (element) => {
  const rect = element.getBoundingClientRect();
  const clicked = commentPickPoint;
  commentPickPoint = null;
  let corner = rect;
  for (let node = element; !clicked && node.parentElement && !corner.width && !corner.height; node = node.parentElement) corner = node.parentElement.getBoundingClientRect();
  const x = clicked ? clicked.x : Math.min(Math.max(corner.left, 0), innerWidth);
  const y = clicked ? clicked.y : Math.min(Math.max(corner.top, 0), innerHeight);
  return {
    point: { x: Math.round(x), y: Math.round(y) },
    ...(clicked ? { offset: { x: Math.round(x - rect.left), y: Math.round(y - rect.top) } } : {})
  };
};
// Comments on an area, as in Figma: a press dragged across the page draws
// a frame, and the comment takes the elements wholly inside it as a group.
// The comment's element is the closest one holding them all; the area is
// their joint box inside it, so it stays on them as the page scrolls.
const COMMENT_AREA_THRESHOLD = 5;
const COMMENT_AREA_LIMIT = 24;
// The press that may become a frame: { x, y, pointerId, drawing }.
let commentAreaDrag = null;
// The area picked: its anchor element, its box in that element's own
// pixels and the elements in it.
let commentArea = null;
// The click that ends a drag selects nothing.
let suppressAreaClick = false;
const commentAreaBox = document.createElement('div');
const commentAreaMembersLayer = document.createElement('div');
const areaRectFrom = (drag, x, y) => ({ left: Math.min(drag.x, x), top: Math.min(drag.y, y), right: Math.max(drag.x, x), bottom: Math.max(drag.y, y) });
const isAreaCandidate = (element) => element instanceof Element
  && !element.hasAttribute('data-viewport-parade-overlay')
  && !['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT', 'BR'].includes(element.tagName);
// The outermost shown elements wholly inside the frame: an element that
// only crosses it is looked into, one outside it is skipped.
const commentAreaMembersIn = (area) => {
  const members = [];
  const visit = (element) => {
    if (members.length >= COMMENT_AREA_LIMIT) return;
    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) {
      // display: contents and zero-size wrappers still hold shown children.
      [...element.children].filter(isAreaCandidate).forEach(visit);
      return;
    }
    if (box.right <= area.left || box.left >= area.right || box.bottom <= area.top || box.top >= area.bottom) return;
    const inside = box.left >= area.left - 1 && box.right <= area.right + 1 && box.top >= area.top - 1 && box.bottom <= area.bottom + 1;
    if (inside) {
      const style = getComputedStyle(element);
      if (style.visibility !== 'hidden' && style.display !== 'none') members.push(textHolderFor(element));
      return;
    }
    [...element.children].filter(isAreaCandidate).forEach(visit);
  };
  if (document.body) [...document.body.children].filter(isAreaCandidate).forEach(visit);
  return [...new Set(members)];
};
const commonAncestorOf = (elements) => {
  let anchor = elements[0];
  while (anchor && anchor !== document.body && !elements.every((element) => anchor.contains(element))) anchor = anchor.parentElement;
  return anchor || document.body;
};
// A frame with no whole element inside (drawn over part of an image or a
// paragraph) belongs to the smallest element that holds it.
const commentAreaHolderOf = (area) => {
  let element = document.elementFromPoint((area.left + area.right) / 2, (area.top + area.bottom) / 2);
  while (element && element.closest?.('[data-viewport-parade-overlay]')) element = element.parentElement;
  for (; element && element !== document.body && element !== document.documentElement; element = element.parentElement) {
    const box = element.getBoundingClientRect();
    if (box.left <= area.left && box.right >= area.right && box.top <= area.top && box.bottom >= area.bottom) return textHolderFor(element);
  }
  return document.body;
};
const setBox = (node, left, top, width, height) => {
  Object.assign(node.style, { display: 'block', left: `${Math.round(left)}px`, top: `${Math.round(top)}px`, width: `${Math.max(0, Math.round(width))}px`, height: `${Math.max(0, Math.round(height))}px` });
};
const showCommentAreaMembers = (members) => {
  commentAreaMembersLayer.replaceChildren(...members.map((member) => {
    const box = member.getBoundingClientRect();
    const outline = document.createElement('div');
    outline.style.cssText = 'position:fixed;box-sizing:border-box;border:1px solid #2563eb;pointer-events:none;';
    setBox(outline, box.left, box.top, box.width, box.height);
    return outline;
  }));
  commentAreaMembersLayer.style.display = members.length ? 'block' : 'none';
};
const hideCommentAreaBox = () => {
  commentAreaBox.style.display = 'none';
  commentAreaMembersLayer.style.display = 'none';
  commentAreaMembersLayer.replaceChildren();
};
// The picked area drawn over its anchor wherever the page has scrolled.
const placeCommentArea = () => {
  if (!commentArea || commentArea.anchor !== selectedElement || !commentArea.anchor.isConnected) {
    hideCommentAreaBox();
    return false;
  }
  const box = commentArea.anchor.getBoundingClientRect();
  const { x, y, width, height } = commentArea.area;
  commentAreaBox.style.borderStyle = 'solid';
  setBox(commentAreaBox, box.left + x, box.top + y, width, height);
  showCommentAreaMembers(commentArea.members.filter((member) => member.isConnected));
  return true;
};
const drawCommentAreaFrame = (drag, event) => {
  const area = areaRectFrom(drag, event.clientX, event.clientY);
  commentAreaBox.style.borderStyle = 'dashed';
  setBox(commentAreaBox, area.left, area.top, area.right - area.left, area.bottom - area.top);
  showCommentAreaMembers(commentAreaMembersIn(area));
};
const finishCommentArea = (drag, event) => {
  const area = areaRectFrom(drag, event.clientX, event.clientY);
  const members = commentAreaMembersIn(area);
  const anchor = members.length ? commonAncestorOf(members) : commentAreaHolderOf(area);
  const anchorBox = anchor.getBoundingClientRect();
  // With elements inside, the area is their joint box; an empty frame
  // keeps its own, within its holder.
  const joint = members.length ? members.map((member) => member.getBoundingClientRect()).reduce((all, box) => ({
    left: Math.min(all.left, box.left), top: Math.min(all.top, box.top), right: Math.max(all.right, box.right), bottom: Math.max(all.bottom, box.bottom)
  })) : {
    left: Math.max(area.left, anchorBox.left), top: Math.max(area.top, anchorBox.top), right: Math.min(area.right, anchorBox.right), bottom: Math.min(area.bottom, anchorBox.bottom)
  };
  const relative = {
    x: Math.round(joint.left - anchorBox.left),
    y: Math.round(joint.top - anchorBox.top),
    width: Math.round(joint.right - joint.left),
    height: Math.round(joint.bottom - joint.top)
  };
  // The pin goes on the area's top right corner; the box opens beside it.
  commentPickPoint = { x: joint.right, y: joint.top };
  selectLayerElement(anchor, { exact: true, area: { anchor, area: relative, members } });
};
const reportSelectedElement = () => {
  if (!selectedElement) return;
  const steps = viewStepsWithState(selectedElement);
  // A comment's element comes with the copy of its view (pageSnapshot).
  const snapshot = interactionMode === 'comment' ? viewSnapshotFor(steps) : null;
  const place = interactionMode === 'comment' ? commentPlaceFor(selectedElement) : {};
  const area = interactionMode === 'comment' && commentArea?.anchor === selectedElement
    ? { area: commentArea.area, elements: commentArea.members.map(commentAreaMemberContext) }
    : {};
  window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-element-selected', route: `${location.pathname}${location.search}${location.hash}`, element: elementContextFor(selectedElement), steps, ...place, ...area, ...(snapshot ? { snapshot } : {}) }, extensionOrigin);
};
// What an agent needs to find each element of an area, without the
// markup and attributes the comment's own element carries.
const commentAreaMemberContext = (element) => {
  const { tag, id, classes, selector, domPath, indexPath, text, rect } = elementContextFor(element);
  return { tag, id, classes, selector, domPath, indexPath, text: truncate(text, 120), rect };
};
// Text under the pointer that lies directly in an element beside child
// elements. It is never selected (its settings are its element's); a double
// click edits it in place and Alt measures to it.
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
  if (commentAreaDrag?.drawing) return;
  if ((active || commentPickerActive || capturePickerActive) && (!pinned || capturePickerActive) && pointerInside && hoveredElement) show(hoveredElement);
  else if (selectedElement) {
    show(selectedElement);
    placeCommentArea();
    if (hoverOutline.style.display !== 'none' && pointerInside) showHoverOutline(hoveredElement);
  }
  scheduleLayoutMap();
};

// Puts this part into the page; install() calls it once, on Studio's first request.
const installPicking = () => {
  [commentAreaBox, commentAreaMembersLayer].forEach((node) => {
    node.setAttribute('aria-hidden', 'true');
    node.dataset.viewportParadeOverlay = '';
    node.style.cssText = 'position:fixed;inset:auto;z-index:2147483646;pointer-events:none;display:none;box-sizing:border-box;';
    document.documentElement.append(node);
  });
  commentAreaBox.style.cssText += 'border:1.5px dashed #2563eb;background:rgba(37,99,235,.08);';
  commentAreaMembersLayer.style.cssText += 'left:0;top:0;width:0;height:0;';
  // Registered before the listeners that keep presses from the page, which
  // stop them; these only watch.
  window.addEventListener('pointerdown', (event) => {
    commentAreaDrag = null;
    if (!commentPickerActive || interactionMode !== 'comment' || capturePickerActive || replayingSteps || !event.isTrusted || event.button !== 0) return;
    if (isStudioPress(event) || isTextEditTarget(event.target)) return;
    commentAreaDrag = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, drawing: false };
  }, true);
  window.addEventListener('pointermove', (event) => {
    if (!commentAreaDrag || event.pointerId !== commentAreaDrag.pointerId) return;
    if (!commentAreaDrag.drawing) {
      if (Math.hypot(event.clientX - commentAreaDrag.x, event.clientY - commentAreaDrag.y) < COMMENT_AREA_THRESHOLD) return;
      commentAreaDrag.drawing = true;
      // The frame replaces the outline of what is under the pointer.
      [marginOverlay, paddingOverlay, contentOverlay, ...marginStrips, ...paddingStrips, spacingEdge, hoverOutline, hoverSpacing, label].forEach((overlay) => { overlay.style.display = 'none'; });
      hideSpacing();
      // Kept while the pointer leaves the frame for Studio.
      try { document.documentElement.setPointerCapture(event.pointerId); } catch { /* The press has ended. */ }
    }
    drawCommentAreaFrame(commentAreaDrag, event);
  }, true);
  const endCommentArea = (event) => {
    const drag = commentAreaDrag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    commentAreaDrag = null;
    try { document.documentElement.releasePointerCapture(event.pointerId); } catch { /* Not captured. */ }
    if (!drag.drawing) return;
    hideCommentAreaBox();
    if (event.type === 'pointercancel') {
      refreshHoveredElement();
      return;
    }
    suppressAreaClick = true;
    // No click may follow (released outside the frame).
    setTimeout(() => { suppressAreaClick = false; }, 0);
    finishCommentArea(drag, event);
  };
  window.addEventListener('pointerup', endCommentArea, true);
  window.addEventListener('pointercancel', endCommentArea, true);
  document.addEventListener('pointermove', (event) => {
    pointerInside = true;
    if (!active && !commentPickerActive && !capturePickerActive) return;
    if (commentAreaDrag?.drawing) return;
    // Text edited in place is part of its element, as the click selects it.
    const target = textHolderFor(event.target);
    if (pinned && !capturePickerActive) {
      // The selection keeps its overlays; what lies under the pointer only
      // gets an outline, so another element can still be aimed at.
      hoveredElement = target;
      if (active && interactionMode === 'edit') showHoverOutline(hoveredElement);
      return;
    }
    if (capturePickerActive) {
      // A screenshot takes the whole element; spacing zones do not apply.
      hoveredElement = target;
      show(hoveredElement, 'size');
    } else if (hoveredElement !== target) {
      hoveredElement = target;
      show(hoveredElement, undefined);
    } else {
      show(hoveredElement, editorModeAtPoint(hoveredElement, event.clientX, event.clientY));
    }
  }, true);
  window.addEventListener('click', (event) => {
    if ((!active && !commentPickerActive && !capturePickerActive) || replayingSteps) return;
    if (suppressMarkerClick || isStudioPress(event)) return;
    if (suppressAreaClick) {
      suppressAreaClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
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
    commentPickPoint = interactionMode === 'comment' ? { x: event.clientX, y: event.clientY } : null;
    selectLayerElement(event.target);
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
