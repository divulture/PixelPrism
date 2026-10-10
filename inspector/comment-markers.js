// Comment markers: placing, resolving, dragging, and replaying the view a comment was left in.

// Comment markers: numbered pins over commented elements, shown while the
// Comments panel is open. Dragging a marker onto another element re-binds
// its comment; Alt keeps the exact point instead. Markers live in a shadow
// root so page styles cannot restyle them.
const commentLayer = document.createElement('div');
const commentShadow = commentLayer.attachShadow({ mode: 'open' });
let commentTargetBox = null;
let commentMarkers = [];
let commentMarkersEnabled = false;
let selectedCommentId = null;
let markerDrag = null;
let suppressMarkerClick = false;
let lastMarkerStatus = '';
let markerResolveTimer;
let markerPositionFrame;
let markerDriftTimer;
// Previews are scaled down in Studio; markers keep their on-screen size.
let markerScale = 1;

const isRendered = (element) => {
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 && rect.height < 1) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
};
// Comments left before views were recorded have no steps. When such an
// element was not shown on this page load and appears after the user
// switches tabs or opens a popup, those switches are how to reach it.
const unshownCommentIds = new Set();
const learnViewSteps = (marker) => {
  if (marker.steps.length || marker.pin) return;
  // An element in a closed menu: the control that names the menu
  // (aria-controls) is known without opening it, so a comment left before
  // comments kept their menus learns it here.
  if (marker.state === 'hidden' && marker.target) {
    const opener = popupOpenerFor(marker.target, []);
    if (opener) {
      marker.steps = [opener];
      marker.state = 'other-view';
      window.parent.postMessage({ source: 'viewport-parade', type: 'comment-steps-learned', id: marker.id, steps: marker.steps }, extensionOrigin);
      return;
    }
  }
  if (marker.state !== 'placed') {
    unshownCommentIds.add(marker.id);
    return;
  }
  if (!unshownCommentIds.delete(marker.id)) return;
  const steps = marker.target ? relevantViewSteps(marker.target, currentViewSteps()) : currentViewSteps();
  if (!steps.length) return;
  marker.steps = steps;
  window.parent.postMessage({ source: 'viewport-parade', type: 'comment-steps-learned', id: marker.id, steps }, extensionOrigin);
};
const resolveCommentMarkers = () => {
  commentMarkers.forEach((marker) => {
    if (marker.pin) {
      marker.target = null;
      marker.state = 'placed';
      return;
    }
    if (!marker.target?.isConnected) marker.target = commentElementFor(marker);
    // Checked only for a missing element, so a normal page costs nothing.
    const inOtherView = () => marker.steps.length > 0 && !viewStepsClicked(marker.steps) && !viewStepsMatch(marker.steps, false);
    if (marker.target && isRendered(marker.target)) marker.state = 'placed';
    // Left in another tab or panel: the studio can switch to it.
    else if (inOtherView()) marker.state = 'other-view';
    else if (marker.target) marker.state = 'hidden';
    // Element gone: show the comment where the element was recorded.
    else marker.state = recordedRectFor(marker) ? 'approx' : 'missing';
    learnViewSteps(marker);
  });
  const status = JSON.stringify(commentMarkers.map(({ id, state }) => [id, state]));
  if (status !== lastMarkerStatus) {
    lastMarkerStatus = status;
    window.parent.postMessage({
      source: 'viewport-parade',
      type: 'comment-markers-status',
      statuses: commentMarkers.map(({ id, state }) => ({ id, state }))
    }, extensionOrigin);
  }
  positionCommentMarkers();
};
// Throttled rather than debounced: a page that animates forever would
// otherwise never let a late-rendered element get its marker.
const scheduleMarkerResolve = () => {
  if (!commentMarkersEnabled || markerResolveTimer) return;
  markerResolveTimer = setTimeout(() => {
    markerResolveTimer = undefined;
    if (commentMarkersEnabled) resolveCommentMarkers();
  }, 250);
};
// Whether the page shows the view a comment was left in: each recorded
// switch is found and is in its recorded state (a selected tab, an open
// panel). Tabs made of plain classes have no readable state; `unknown` is
// what they count as.
const viewStepsMatch = (steps, unknown = true) => steps.every((step) => {
  // A state (Hover) is put on the element itself; it never hides it.
  if (step.kind === 'state') return true;
  // A popup is open or not, but which one cannot be told apart.
  if (step.kind === 'open') return unknown && visiblePopups().length > 0;
  const control = commentElementFor({ element: step.element, selector: step.element?.selector });
  if (!control) return false;
  // A menu that opens on hover is open while its trigger is held in Hover.
  if (step.kind === 'hover') return (forcedState?.state === 'hover' && forcedState.element === control) || control.matches(':hover');
  if (step.expanded) return control.getAttribute('aria-expanded') === step.expanded;
  if (typeof step.open === 'boolean' && control.parentElement instanceof HTMLDetailsElement) return control.parentElement.open === step.open;
  const selected = control.getAttribute('aria-selected');
  if (selected === 'true' || selected === 'false') return selected === 'true';
  if (control.matches('input[type="radio"]')) return control.checked;
  return unknown;
});
// The recorded switches were clicked since this page loaded (by the user
// or by a replay), so the page is in that view as far as we can tell.
const viewStepsClicked = (steps) => {
  const clicked = new Set(currentViewSteps().map((step) => stepControlKey(step.element)));
  return steps.every((step) => step.kind === 'state' || (step.kind === 'hover' ? viewStepsMatch([step], false) : clicked.has(stepControlKey(step.element))));
};
const closeButtonIn = (popup) => [...popup.querySelectorAll('button, [role="button"], a, [aria-label]')].find((control) => {
  if (!isShown(control)) return false;
  const label = normalizeText(`${control.getAttribute('aria-label') || ''} ${control.getAttribute('title') || ''}`);
  const text = normalizeText(control.textContent);
  return /(close|dismiss|закры)/i.test(label) || /^(×|✕|✖|x|close|закрыть)$/i.test(text)
    || (typeof control.className === 'string' && /(^|[-_\s])close([-_\s]|$)/i.test(control.className) && !RISKY_CONTROL.test(`${text} ${label}`));
}) || null;
// Closes a popup the way a person would: Escape, then its close button,
// then the control that opened it. Nothing else is pressed, so no data
// changes with it.
const closePopup = async (popup, control, step) => {
  const gone = async (timeout) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (!popup.isConnected || !isShown(popup)) return true;
      await wait(60);
    }
    return !popup.isConnected || !isShown(popup);
  };
  if (!isShown(popup)) return;
  const target = popup.contains(document.activeElement) ? document.activeElement : popup;
  pressKey(target, 'Escape');
  if (await gone(500)) return;
  const close = closeButtonIn(popup);
  if (close) {
    pressControl(close);
    if (await gone(700)) return;
  }
  if (control?.isConnected && (step.expanded || control.getAttribute('aria-expanded') === 'true')) {
    pressControl(control);
    await gone(700);
  }
};
// Brings the page back to the view a comment needs: popups opened for
// another comment are closed. `keepSteps` are the steps the comment keeps;
// its element (when shown) keeps the popups it is in.
const closeViewsNotKept = async (keepSteps, element) => {
  pruneViewSteps();
  const kept = new Set(element ? relevantViewSteps(element, viewSteps) : []);
  const keptControls = new Set(keepSteps.map((step) => stepControlKey(step.element)).filter(Boolean));
  const doomed = viewSteps.filter((step) => {
    const popup = stepNodes.get(step)?.popup;
    return popup && isShown(popup) && !kept.has(step) && !keptControls.has(stepControlKey(step.element));
  });
  const hoverHeld = forcedState?.origin === 'view' && !keepSteps.some((step) => step.kind === 'hover');
  if (!doomed.length && !hoverHeld) return false;
  replayingSteps = true;
  try {
    if (hoverHeld) releaseForcedState();
    // Inner popups first; closing the outer one closes what is in it.
    const popups = doomed.map((step) => ({ step, ...stepNodes.get(step) }))
      .sort((left, right) => (left.popup.contains(right.popup) ? 1 : right.popup.contains(left.popup) ? -1 : 0));
    for (const { step, popup, control } of popups) await closePopup(popup, control, step);
  } finally {
    viewChanged();
    replayingSteps = false;
  }
  pruneViewSteps();
  return true;
};
// Presses the recorded view switches again, waiting for each control to
// render, and skipping those already in the recorded state. A popup that
// does not open from a press gets the keys that open menus and selects.
const replayViewSteps = async (allSteps) => {
  const steps = allSteps.filter((step) => step.kind !== 'state');
  // A popup left open for another comment would cover the controls.
  await closeViewsNotKept(steps, null);
  if (forcedState?.origin === 'view') releaseForcedState();
  replayingSteps = true;
  try {
    for (const step of steps) {
      let control = null;
      for (let attempt = 0; attempt < 15 && !control; attempt += 1) {
        control = commentElementFor({ element: step.element, selector: step.element?.selector });
        if (!control) await wait(100);
      }
      if (!control) continue;
      if (step.kind === 'hover') {
        const watch = watchForPopup(control);
        await forceState(control, 'hover', 'view');
        stepNodes.set(step, { control, popup: await watch.wait(1200) });
        watch.stop();
        continue;
      }
      if (step.kind !== 'open' && viewStepsMatch([step]) && (step.expanded || typeof step.open === 'boolean' || control.getAttribute('aria-selected') === 'true')) continue;
      const watch = watchForPopup(control);
      let popup = null;
      const opened = () => popup || control.getAttribute('aria-expanded') === 'true';
      const settled = () => (step.kind === 'open' ? opened() : viewStepsMatch([step]));
      // A menu button is hovered first: a menu that opens on hover (Webflow)
      // would close again on the press that follows.
      if (step.expanded === 'true' || control.hasAttribute('aria-haspopup')) {
        sendStateEvents(control, 'hover', true);
        popup = await watch.wait(400);
      }
      if (!opened() && !(step.kind !== 'open' && viewStepsMatch([step], false))) {
        pressControl(control);
        // Wait for a popup to open; a plain switch just gets time to render.
        popup = await watch.wait(step.kind === 'open' ? 1500 : 350);
      }
      for (const key of ['Enter', 'ArrowDown']) {
        if (settled()) break;
        pressKey(control, key);
        popup = await watch.wait(step.kind === 'open' ? 800 : 350);
      }
      watch.stop();
      stepNodes.set(step, { control, popup });
    }
  } finally {
    viewChanged();
    replayingSteps = false;
  }
  // The page now shows this view; comments left here keep these steps.
  viewSteps = steps.slice();
  viewStepsPath = `${location.pathname}${location.search}`;
};
const recordedRectFor = (marker) => {
  const rect = marker.element?.rect;
  return rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) ? rect : null;
};
const markerRectFor = (marker) => {
  if (marker.pin) return { left: marker.pin.x - window.scrollX, top: marker.pin.y - pageScrollY(), width: 0, height: 0 };
  if (marker.state === 'approx') {
    const rect = recordedRectFor(marker);
    return { left: rect.x - window.scrollX, top: rect.y - pageScrollY(), width: rect.width, height: rect.height };
  }
  return marker.state === 'placed' && marker.target?.isConnected ? marker.target.getBoundingClientRect() : null;
};
const positionCommentMarkers = () => {
  markerPositionFrame = undefined;
  const perTarget = new Map();
  const inset = 13;
  commentMarkers.forEach((marker) => {
    if (markerDrag?.marker === marker && markerDrag.moved) return;
    const rect = markerRectFor(marker);
    if (!rect) {
      marker.node.style.display = 'none';
      return;
    }
    const key = marker.target || (marker.pin ? `${marker.pin.x},${marker.pin.y}` : `${rect.left},${rect.top}`);
    const offset = perTarget.get(key) || 0;
    perTarget.set(key, offset + 1);
    // A marker moved inside its element keeps that spot; otherwise it sits
    // on the top-left corner, side by side with others on the element.
    const point = marker.offset && !marker.pin
      ? { x: Math.min(Math.max(marker.offset.x, 0), rect.width), y: Math.min(Math.max(marker.offset.y, 0), rect.height) }
      : { x: offset * 24, y: 0 };
    let x = rect.left + point.x;
    let y = rect.top + point.y;
    // Keep the marker of a partly visible element on screen, like the
    // review screenshots do; one that scrolled away goes with it.
    const intersects = rect.left + rect.width > 0 && rect.left < innerWidth && rect.top + rect.height > 0 && rect.top < innerHeight;
    if (intersects) {
      x = Math.min(Math.max(x, inset + (marker.offset ? 0 : offset * 24)), Math.max(inset, innerWidth - inset));
      y = Math.min(Math.max(y, inset), Math.max(inset, innerHeight - inset));
    }
    marker.node.style.display = '';
    marker.node.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) scale(${markerScale})`;
    marker.node.classList.toggle('is-selected', marker.id === selectedCommentId);
  });
  const selected = markerDrag ? null : commentMarkers.find((marker) => marker.id === selectedCommentId && ((marker.target && marker.state === 'placed') || marker.state === 'approx'));
  if (selected) {
    // A recorded position is outlined dashed: it is where the element was.
    showCommentTargetBox(selected.state === 'approx' ? markerRectFor(selected) : selected.target.getBoundingClientRect(), selected.state === 'approx');
  } else if (!markerDrag) {
    commentTargetBox.style.display = 'none';
  }
};
const scheduleMarkerPosition = () => {
  if (!commentMarkersEnabled || markerPositionFrame) return;
  markerPositionFrame = requestAnimationFrame(positionCommentMarkers);
};
const showCommentTargetBox = (rect, drop) => {
  commentTargetBox.classList.toggle('is-drop', drop);
  Object.assign(commentTargetBox.style, {
    display: 'block',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  });
};
const applyCommentMarkers = (data) => {
  commentMarkersEnabled = Boolean(data.enabled);
  selectedCommentId = data.selectedId || null;
  markerScale = Math.min(3, Math.max(1, 1 / (Number(data.scale) || 1)));
  commentTargetBox.style.borderWidth = `${1.5 * markerScale}px`;
  commentMarkers.forEach((marker) => marker.node.remove());
  commentMarkers = [];
  lastMarkerStatus = '';
  clearInterval(markerDriftTimer);
  if (markerDrag) markerDrag = null;
  commentLayer.style.display = commentMarkersEnabled ? 'block' : 'none';
  if (!commentMarkersEnabled) {
    commentTargetBox.style.display = 'none';
    return;
  }
  commentMarkers = (Array.isArray(data.markers) ? data.markers : []).map((item) => {
    const node = document.createElement('div');
    node.className = 'marker';
    node.textContent = String(item.number);
    node.title = `${item.number}. ${truncate(item.text, 160)}\n\nDrag within the element to move the marker, or onto another element to attach the comment there. Hold Alt to pick the exact element under the pointer.`;
    node.dataset.commentId = item.id;
    commentShadow.append(node);
    const pin = item.pin && Number.isFinite(item.pin.x) && Number.isFinite(item.pin.y) ? { x: item.pin.x, y: item.pin.y } : null;
    const offset = item.offset && Number.isFinite(item.offset.x) && Number.isFinite(item.offset.y) ? { x: item.offset.x, y: item.offset.y } : null;
    const steps = Array.isArray(item.steps) ? item.steps : [];
    return { id: item.id, number: item.number, element: item.element || null, selector: item.selector || '', pin, offset, steps, node, target: null, state: 'missing' };
  });
  resolveCommentMarkers();
  // Layout can shift without a scroll or DOM change (fonts, animations).
  markerDriftTimer = setInterval(scheduleMarkerPosition, 500);
};
const focusCommentMarker = async (id) => {
  const marker = commentMarkers.find((candidate) => candidate.id === id);
  selectedCommentId = id;
  if (!marker) return;
  // Another comment's modal or menu is closed, so this one is seen on the
  // page it was left on.
  if (!marker.pin && await closeViewsNotKept(marker.steps, marker.state === 'placed' ? marker.target : null)) {
    lastMarkerStatus = '';
    resolveCommentMarkers();
  }
  if (selectedCommentId !== id) return;
  const recorded = marker.state === 'approx' ? recordedRectFor(marker) : null;
  const scroller = pageScroller() || window;
  if (marker.pin) scroller.scrollTo({ top: Math.max(0, marker.pin.y - (innerHeight / 2)), behavior: 'smooth' });
  else if (recorded) scroller.scrollTo({ top: Math.max(0, recorded.y + (recorded.height / 2) - (innerHeight / 2)), behavior: 'smooth' });
  else if (marker.target && marker.state === 'placed') marker.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  // A comment left on a state (Hover) shows its element in that state.
  const stateStep = marker.steps.find((step) => step.kind === 'state');
  if (stateStep && marker.target && marker.state === 'placed') forceState(marker.target, stateStep.state, 'comment');
  else if (forcedState?.origin === 'comment') releaseForcedState();
  marker.node.classList.remove('is-pulse');
  void marker.node.offsetWidth;
  marker.node.classList.add('is-pulse');
  scheduleMarkerPosition();
};
const markerNodeFromEvent = (event) => event.composedPath().find((node) => node instanceof Element && node.classList.contains('marker') && commentShadow.contains(node));
// Where a dragged marker lands. Inside its own element it only moves
// there; over another element it re-binds to it. Alt picks exactly the
// element under the pointer, such as a badge inside the current link.
const dropTargetAt = (marker, x, y, exactElement) => {
  const current = marker.state === 'placed' && marker.target?.isConnected ? marker.target : null;
  const currentRect = current?.getBoundingClientRect();
  const inside = (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  if (current && !exactElement && inside(currentRect)) return { element: current, rect: currentRect, same: true };
  const hit = document.elementsFromPoint(x, y).find((element) => element !== commentLayer && !element.hasAttribute('data-viewport-parade-overlay'));
  const element = hit && hit !== document.documentElement && hit !== document.body ? hit : null;
  const rect = element?.getBoundingClientRect();
  // The page background, or a wrapper bigger than a good part of the
  // screen, is no target worth binding to: keep the dropped point instead.
  if (!element || rect.width * rect.height > innerWidth * innerHeight * 0.4) {
    return { pin: { x: Math.round(x + window.scrollX), y: Math.round(y + pageScrollY()) }, under: hit || document.body };
  }
  return { element, rect, same: element === current };
};
const endMarkerDrag = () => {
  if (!markerDrag) return;
  markerDrag.marker.node.classList.remove('is-dragging');
  try { markerDrag.marker.node.releasePointerCapture(markerDrag.pointerId); } catch { /* Already released. */ }
  markerDrag = null;
  commentTargetBox.style.display = 'none';
  scheduleMarkerPosition();
};

// Puts this part into the page; install() calls it once, on Studio's first request.
const installCommentMarkers = () => {
  commentLayer.dataset.viewportParadeOverlay = '';
  commentLayer.setAttribute('aria-hidden', 'true');
  commentLayer.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;';
  commentShadow.innerHTML = `<style>
    :host { all: initial; }
    .target { position: fixed; box-sizing: border-box; display: none; border: 1.5px solid rgba(239, 68, 68, .9); border-radius: 2px; background: rgba(239, 68, 68, .07); pointer-events: none; }
    .target.is-drop { border-style: dashed; background: rgba(239, 68, 68, .1); }
    .marker { position: fixed; left: 0; top: 0; box-sizing: border-box; display: grid; place-items: center; width: 22px; height: 22px; margin: -11px 0 0 -11px; padding: 0; border: 2px solid #fff; border-radius: 50%; background: #ef4444; color: #fff; box-shadow: 0 1px 4px rgba(24, 24, 27, .3); font: 600 11px/1 Inter, ui-sans-serif, system-ui, sans-serif; font-variant-numeric: tabular-nums; cursor: grab; pointer-events: auto; user-select: none; touch-action: none; transition: box-shadow 120ms ease, opacity 120ms ease; }
    .marker:hover { box-shadow: 0 0 0 3px rgba(239, 68, 68, .28), 0 1px 4px rgba(24, 24, 27, .3); }
    .marker.is-selected { z-index: 2; animation: marker-select-pulse 1.6s ease-in-out infinite; }
    .marker.is-dragging { z-index: 3; cursor: grabbing; opacity: .92; transition: none; animation: none; }
    .marker.is-pulse { animation: pulse 700ms ease-out 2; }
    @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, .6), 0 2px 6px rgba(24, 24, 27, .3); } 100% { box-shadow: 0 0 0 14px rgba(239, 68, 68, 0), 0 2px 6px rgba(24, 24, 27, .3); } }
    @keyframes marker-select-pulse { 0%, 100% { box-shadow: 0 0 0 4px rgba(239, 68, 68, .32), 0 2px 8px rgba(24, 24, 27, .35); } 50% { box-shadow: 0 0 0 8px rgba(239, 68, 68, .14), 0 2px 8px rgba(24, 24, 27, .35); } }
  </style><div class="target"></div>`;
  commentTargetBox = commentShadow.querySelector('.target');
  document.documentElement.append(commentLayer);
  // Grabbing a marker never selects the element underneath it: the picker
  // leaves presses on PixelPrism's nodes to these listeners.
  window.addEventListener('pointerdown', (event) => {
    const node = commentMarkersEnabled && markerNodeFromEvent(event);
    if (!node) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.button !== 0) return;
    const marker = commentMarkers.find((candidate) => candidate.node === node);
    if (!marker) return;
    markerDrag = { marker, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false, drop: null };
    node.setPointerCapture(event.pointerId);
  }, true);
  window.addEventListener('pointermove', (event) => {
    if (!markerDrag) {
      if (commentMarkersEnabled && markerNodeFromEvent(event)) event.stopImmediatePropagation();
      return;
    }
    if (event.pointerId !== markerDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!markerDrag.moved && Math.hypot(event.clientX - markerDrag.startX, event.clientY - markerDrag.startY) < 4) return;
    markerDrag.moved = true;
    const { node } = markerDrag.marker;
    node.classList.add('is-dragging');
    node.style.transform = `translate(${Math.round(event.clientX)}px, ${Math.round(event.clientY)}px) scale(${markerScale})`;
    markerDrag.drop = dropTargetAt(markerDrag.marker, event.clientX, event.clientY, event.altKey);
    // Solid: stays on its element. Dashed: will move to this element.
    if (markerDrag.drop.element) showCommentTargetBox(markerDrag.drop.rect, !markerDrag.drop.same);
    else commentTargetBox.style.display = 'none';
  }, true);
  window.addEventListener('pointerup', (event) => {
    if (!markerDrag || event.pointerId !== markerDrag.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // The click that follows this pointerup must not reach the comment
    // picker; reset afterwards in case the browser sends no click at all.
    suppressMarkerClick = true;
    setTimeout(() => { suppressMarkerClick = false; }, 0);
    const { marker, moved } = markerDrag;
    const drop = moved ? dropTargetAt(marker, event.clientX, event.clientY, event.altKey) : null;
    endMarkerDrag();
    if (!moved) {
      selectedCommentId = marker.id;
      scheduleMarkerPosition();
      window.parent.postMessage({ source: 'viewport-parade', type: 'comment-marker-activated', id: marker.id }, extensionOrigin);
      return;
    }
    const route = `${location.pathname}${location.search}${location.hash}`;
    window.parent.postMessage(drop.element
      ? {
        source: 'viewport-parade',
        type: 'comment-marker-moved',
        id: marker.id,
        route,
        element: elementContextFor(drop.element),
        // Where in the element the marker was dropped.
        offset: { x: Math.round(event.clientX - drop.rect.left), y: Math.round(event.clientY - drop.rect.top) },
        same: drop.same,
        steps: viewStepsWithState(drop.element)
      }
      : { source: 'viewport-parade', type: 'comment-marker-moved', id: marker.id, route, pin: drop.pin, steps: relevantViewSteps(drop.under || document.body, currentViewSteps()) }, extensionOrigin);
  }, true);
  window.addEventListener('pointercancel', (event) => {
    if (markerDrag && event.pointerId === markerDrag.pointerId) endMarkerDrag();
  }, true);
  window.addEventListener('click', (event) => {
    if (!suppressMarkerClick && !(commentMarkersEnabled && markerNodeFromEvent(event))) return;
    suppressMarkerClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('dblclick', (event) => {
    if (!commentMarkersEnabled || !markerNodeFromEvent(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  // Escape with focus in the preview lets go of the selected element; Studio
  // closes its panel when told the selection is gone.
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !active || !selectedElement || interactionMode !== 'edit') return;
    clearSelection();
  });
  window.addEventListener('keydown', (event) => {
    if (!commentMarkersEnabled || event.key !== 'Escape' || replayingSteps) return;
    if (markerDrag) {
      event.preventDefault();
      event.stopImmediatePropagation();
      endMarkerDrag();
      return;
    }
    // Focus is in the preview while a comment waits to be placed; Studio
    // cannot hear Escape there on its own.
    window.parent.postMessage({ source: 'viewport-parade', type: 'studio-shortcut', shortcut: 'escape' }, extensionOrigin);
  }, true);
  window.addEventListener('scroll', scheduleMarkerPosition, true);
  window.addEventListener('resize', scheduleMarkerPosition);
  new MutationObserver(scheduleMarkerResolve).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'comment-markers')) return;
    applyCommentMarkers(event.data);
  });
  window.addEventListener('message', (event) => {
    if (!isStudioMessage(event, 'comment-marker-focus')) return;
    focusCommentMarker(event.data.id);
  });
  window.addEventListener('message', async (event) => {
    if (!isStudioMessage(event, 'comment-replay-steps')) return;
    const marker = commentMarkers.find((candidate) => candidate.id === event.data.id);
    if (!marker?.steps.length) return;
    await replayViewSteps(marker.steps);
    // Report right away; the studio focuses the marker once it is placed.
    lastMarkerStatus = '';
    resolveCommentMarkers();
  });
};
