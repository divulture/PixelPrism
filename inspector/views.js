// Records the tabs, popups and menus the page is switched to, so comments, edits and reviews can return to them.

// Clicks that switch a view inside the page: tabs, segmented controls,
// accordions. A comment keeps the ones made before it on this page, so
// the studio and the review export can bring that view back. Only view
// switches are kept: replaying other clicks could submit or delete
// something for real in the user's session.
const VIEW_SWITCH_SELECTOR = '[role="tab"], [role="radio"], [role="menuitemradio"], [aria-selected], [aria-controls], [aria-expanded], summary, input[type="radio"]';
// A whole class name that ends like a group of switches: tabs, nav-tabs,
// tab-list, segmented-control, filters-list… Never tab-content or tab-pane,
// whose children are the page content, not switches.
const VIEW_SWITCH_GROUP = /(^|[-_])(tabs|tab-?list|tab-?bar|tabs-?list|segment(ed)?(-?control)?|pills|switcher|toggle-?group|filters(-?list)?)$/i;
const isViewSwitchGroup = (node) => node.getAttribute('role') === 'tablist'
  || (typeof node.className === 'string' && node.className.split(/\s+/).some((name) => VIEW_SWITCH_GROUP.test(name)));
const RISKY_CONTROL = /(delete|remove|удал|save|сохран|submit|отправ|send|pay|оплат|buy|купи|confirm|подтверд|log ?out|sign ?out|выйти)/i;
const viewSwitchFor = (target) => {
  if (!(target instanceof Element)) return null;
  let control = target.closest(VIEW_SWITCH_SELECTOR);
  if (!control) {
    // Tabs built from plain elements: the clicked item is a direct child of
    // a tabs-like group (role="tablist", or a class such as .tabs).
    for (let node = target, depth = 0; node?.parentElement && depth < 6; node = node.parentElement, depth += 1) {
      if (isViewSwitchGroup(node.parentElement)) {
        control = node;
        break;
      }
    }
  }
  if (!control || control === document.body || control === document.documentElement) return null;
  if (control.closest('form') && !control.matches('[role="tab"], [aria-selected], [aria-expanded], summary')) return null;
  return isReplayable(control) ? control : null;
};
// Never replayed: real navigation (followed as a page change), submits,
// and anything that reads like it changes data.
const isReplayable = (control) => {
  if (control.matches('[type="submit"]') || (control.matches('a[href]') && !control.getAttribute('href').startsWith('#') && !isSameDocumentLink(control))) return false;
  // A button in a form without type="button" submits it.
  if (control.matches('button:not([type])') && control.closest('form')) return false;
  return !RISKY_CONTROL.test(`${control.textContent || ''} ${control.getAttribute('aria-label') || ''}`);
};
// Popups that appear on a click: dialogs, modals, drawers, menus,
// popovers. Class-named ones must float (fixed or absolute) to count.
const POPUP_SELECTOR = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], [role="listbox"], [popover], [class*="modal" i], [class*="dialog" i], [class*="drawer" i], [class*="popover" i], [class*="popup" i], [class*="dropdown-menu" i]';
const isShown = (node) => {
  if (!node.isConnected) return false;
  const rect = node.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const style = getComputedStyle(node);
  return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
};
const visiblePopups = () => {
  const nodes = [...document.querySelectorAll(POPUP_SELECTOR)].filter((node) => {
    if (node.closest('[data-viewport-parade-overlay]') || !isShown(node)) return false;
    if (node.matches('dialog, [role], [aria-modal], [popover]')) return !node.matches('[popover]') || node.matches(':popover-open');
    return ['fixed', 'absolute'].includes(getComputedStyle(node).position);
  });
  // The outermost node stands for the popup; its inner parts are skipped.
  return nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
};
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
// A popup is also told by how it sits: floating (fixed or absolute) high
// above the page, or in the top layer. Libraries name theirs freely
// (ant-select-dropdown, react-select's menu), so names alone miss many.
const isPopupLayer = (node, loose = false) => {
  if (node.matches(':popover-open, dialog[open]')) return true;
  const style = getComputedStyle(node);
  const floating = style.position === 'fixed' || style.position === 'absolute';
  if (node.matches(POPUP_SELECTOR)) return node.matches('dialog, [role], [aria-modal], [popover]') || floating;
  if (!floating) return false;
  const z = Number.parseInt(style.zIndex, 10);
  return loose || (Number.isFinite(z) && z >= 10);
};
// The popup a node is in: its outermost popup-like ancestor that does not
// hold `trigger`, so a fixed header holding a menu button and its menu is
// not taken for the menu. `loose` takes any floating box, for a node the
// trigger itself names (aria-controls).
const popupLayerFor = (node, trigger = null, loose = false) => {
  let layer = null;
  for (let current = node instanceof Element ? node : node?.parentElement; current && current !== document.body && current !== document.documentElement; current = current.parentElement) {
    if (current.hasAttribute('data-viewport-parade-overlay')) return null;
    if (trigger && current.contains(trigger)) break;
    if (isPopupLayer(current, loose)) layer = current;
  }
  return layer;
};
const isSizable = (node) => {
  const rect = node.getBoundingClientRect();
  return rect.width >= 24 && rect.height >= 16;
};
// A portal is added as a plain wrapper with the popup a few levels inside.
const popupInside = (element) => {
  const queue = [[element, 0]];
  for (let index = 0; index < queue.length && index < 200; index += 1) {
    const [node, depth] = queue[index];
    if (node !== element && isPopupLayer(node) && isShown(node)) return node;
    if (depth < 4) [...node.children].forEach((child) => queue.push([child, depth + 1]));
  }
  return null;
};
// Watches the page for a popup opened by pressing `trigger`: the one the
// trigger names (aria-controls), a popup-like layer that appeared or
// changed, or a newly visible named popup. Started on the press itself,
// as many menus open on pointerdown, before the click.
const watchForPopup = (trigger, lifetime = 2500) => {
  const changed = new Set();
  const before = new Set(visiblePopups());
  const observer = new MutationObserver((records) => records.forEach((record) => {
    if (record.type === 'childList') record.addedNodes.forEach((node) => changed.add(node));
    else changed.add(record.target);
  }));
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'data-state', 'aria-expanded'] });
  const stopTimer = setTimeout(() => observer.disconnect(), lifetime);
  const find = () => {
    if (trigger?.getAttribute?.('aria-expanded') !== 'false') {
      const ids = `${trigger?.getAttribute?.('aria-controls') || ''} ${trigger?.getAttribute?.('aria-owns') || ''}`.split(/\s+/).filter(Boolean);
      for (const id of ids) {
        const named = document.getElementById(id);
        const layer = named && popupLayerFor(named, trigger, true);
        if (layer && isShown(layer)) return layer;
      }
    }
    const checked = new Set();
    for (const node of changed) {
      const element = node instanceof Element ? node : node.parentElement;
      if (!element?.isConnected || checked.has(element) || checked.size > 300) continue;
      checked.add(element);
      const inside = trigger?.contains(element) ? null : popupInside(element);
      const layer = popupLayerFor(element, trigger) || (inside && popupLayerFor(inside, trigger));
      if (layer && !before.has(layer) && isShown(layer) && isSizable(layer)) return layer;
    }
    return visiblePopups().find((node) => !before.has(node) && (!trigger || !node.contains(trigger))) || null;
  };
  return {
    find,
    // Resolves with the popup, or null after `timeout`.
    async wait(timeout) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        await wait(120);
        const popup = find();
        if (popup) return popup;
      }
      return null;
    },
    stop() {
      clearTimeout(stopTimer);
      observer.disconnect();
    }
  };
};
// What a comment needs to find an element inside a popup again.
const popupContextFor = (element) => {
  const layer = popupLayerFor(element);
  if (!layer || layer === element) return {};
  const path = [];
  for (let current = element; current && current !== layer; current = current.parentElement) {
    path.unshift([...current.parentElement.children].indexOf(current));
  }
  return { popup: { path, role: layer.getAttribute('role') || '' } };
};
// Popups open now, for finding an element by its place in one.
const shownPopupLayers = () => {
  const layers = new Set(visiblePopups());
  const visit = (node, depth) => {
    if (depth > 4 || !node || node.hasAttribute('data-viewport-parade-overlay')) return;
    if (isPopupLayer(node) && isShown(node)) {
      layers.add(node);
      return;
    }
    [...node.children].forEach((child) => visit(child, depth + 1));
  };
  [...(document.body?.children || [])].forEach((child) => visit(child, 0));
  return [...layers];
};
let viewSteps = [];
let viewStepsPath = `${location.pathname}${location.search}`;
// Page nodes behind each step, kept out of the steps so they can be posted.
const stepNodes = new WeakMap();
// A closed popup takes its opening step and every step made inside it.
const pruneViewSteps = () => {
  const closed = [];
  viewSteps = viewSteps.filter((step) => {
    const nodes = stepNodes.get(step);
    if (nodes?.control && closed.some((popup) => popup.contains(nodes.control))) return false;
    if (nodes?.popup && !isShown(nodes.popup)) {
      closed.push(nodes.popup);
      return false;
    }
    return true;
  });
};
const currentViewSteps = () => {
  if (viewStepsPath !== `${location.pathname}${location.search}`) return [];
  pruneViewSteps();
  return viewSteps.slice();
};
// Which control a view step pressed. Icon buttons side by side (Export,
// Settings) can share one domPath; their place in the page tells them apart.
const stepControlKey = (context) => (context ? `${context.domPath || context.selector || ''}|${Array.isArray(context.indexPath) ? context.indexPath.join('.') : ''}` : '');
const recordViewStep = (step, control, popup = null) => {
  const path = `${location.pathname}${location.search}`;
  if (path !== viewStepsPath) {
    viewSteps = [];
    viewStepsPath = path;
  }
  pruneViewSteps();
  stepNodes.set(step, { control, popup });
  // The latest click on a control wins; older ones are superseded.
  viewSteps = viewSteps.filter((previous) => stepControlKey(previous.element) !== stepControlKey(step.element)).concat(step).slice(-12);
};
// The steps an element needs. Tabs and switches stay, but a popup (a modal,
// a menu) only counts for what is inside it: a comment on the page behind an
// open modal belongs to the page, not to the modal, and its review
// screenshot must not show the modal.
const relevantViewSteps = (element, steps) => {
  if (!element || !steps.length) return steps;
  const nodes = steps.map((step) => stepNodes.get(step) || {});
  // The step whose popup holds each step's control.
  const holders = steps.map((_, index) => (nodes[index].control
    ? steps.findIndex((_other, other) => other !== index && nodes[other].popup?.contains(nodes[index].control))
    : -1));
  let inShownPopup = null;
  const needed = new Set();
  steps.forEach((step, index) => {
    const { popup } = nodes[index];
    if (popup) {
      if (popup.contains(element)) needed.add(index);
    } else if (step.kind === 'open') {
      // A popup that was not seen open: told apart only by what is shown now.
      inShownPopup ??= visiblePopups().some((node) => node.contains(element));
      if (inShownPopup) needed.add(index);
    } else if (holders[index] < 0) {
      needed.add(index);
    }
  });
  // What is needed in a popup needs the step that opened it, and the
  // switches made inside a needed popup stay with it.
  for (let changed = true; changed;) {
    changed = false;
    steps.forEach((step, index) => {
      const holder = holders[index];
      if (holder < 0) return;
      if (needed.has(index) && !needed.has(holder)) {
        needed.add(holder);
        changed = true;
      } else if (!needed.has(index) && needed.has(holder) && !nodes[index].popup && step.kind !== 'open') {
        needed.add(index);
        changed = true;
      }
    });
  }
  return steps.filter((_, index) => needed.has(index));
};
const recordingPaused = () => replayingSteps || inspectorInteractionActive || document.documentElement.hasAttribute('data-viewport-parade-inspecting');
// Whether the page has left the view it loaded in, for a comment's copy of
// its view (pageSnapshot): something on it was pressed or typed into (a
// tab, also one built from plain buttons; a route the click led to), by a
// person or by PixelPrism (a click mirrored from another preview, a
// comment's view opened again), or a container in it scrolled. Counted from
// the load, before any tool is set up.
let viewVersion = 0;
const viewChanged = () => { viewVersion += 1; };
['click', 'keydown', 'input', 'change'].forEach((type) => document.addEventListener(type, (event) => {
  if (event.isTrusted && !recordingPaused()) viewChanged();
}, true));
const scrolledContainers = new Set();
document.addEventListener('scroll', (event) => {
  if (event.target instanceof Element) scrolledContainers.add(event.target);
}, true);
const clickTriggerFor = (target) => {
  const switchControl = viewSwitchFor(target);
  const trigger = switchControl || (target instanceof Element
    ? target.closest('button, a, [role="button"], [aria-haspopup], [aria-controls], [tabindex], label') || target
    : null);
  if (!trigger || trigger === document.body || trigger === document.documentElement || !isReplayable(trigger)) return null;
  return { trigger, switchControl };
};
// An icon button is named by its tooltip (title="Settings").
const labelFor = (control) => truncate(control.textContent || control.getAttribute('aria-label') || control.getAttribute('title') || '', 60);
// Menus and selects often open on the press, before the click; a modal one
// may then block the click entirely. The watch starts on the press, and a
// popup opened without a click is recorded from there.
let pressWatch = null;
// A switch's state before it is pressed: the step records where the press
// takes it, so a replay does not close what is already open. Taken on the
// press, as a menu opened on pointerdown has changed by the click.
const switchStateOf = (control) => ({
  expanded: control.getAttribute('aria-expanded'),
  open: control.tagName === 'SUMMARY' && control.parentElement instanceof HTMLDetailsElement ? control.parentElement.open : undefined
});
const switchStepFor = (control, label, before) => {
  const step = { element: elementContextFor(control), label };
  if (before.expanded === 'true' || before.expanded === 'false') step.expanded = before.expanded === 'true' ? 'false' : 'true';
  if (typeof before.open === 'boolean') step.open = !before.open;
  return step;
};
document.addEventListener('pointerdown', (event) => {
  if (recordingPaused() || !event.isTrusted || event.button !== 0) return;
  const found = clickTriggerFor(event.target);
  if (!found) return;
  const watch = watchForPopup(found.trigger);
  const press = { trigger: found.trigger, watch, at: Date.now(), switchBefore: found.switchControl ? switchStateOf(found.switchControl) : null };
  pressWatch = press;
  const context = elementContextFor(found.trigger);
  const label = labelFor(found.trigger);
  watch.wait(1200).then((popup) => {
    // A click on the same control took the watch over.
    if (pressWatch !== press) return;
    pressWatch = null;
    if (found.switchControl) {
      const expandedNow = found.switchControl.getAttribute('aria-expanded');
      if (popup || (press.switchBefore.expanded !== null && expandedNow !== press.switchBefore.expanded)) {
        recordViewStep(switchStepFor(found.switchControl, label, press.switchBefore), found.switchControl, popup);
      }
    } else if (popup) recordViewStep({ kind: 'open', element: context, label }, found.trigger, popup);
  });
}, true);
document.addEventListener('click', (event) => {
  if (recordingPaused() || !event.isTrusted) return;
  const found = clickTriggerFor(event.target);
  if (!found) return;
  const { trigger, switchControl } = found;
  const label = labelFor(trigger);
  const press = pressWatch && pressWatch.trigger === trigger && Date.now() - pressWatch.at < 2000 ? pressWatch : null;
  pressWatch = null;
  const watch = press ? press.watch : watchForPopup(trigger);
  let step = null;
  if (switchControl) {
    step = switchStepFor(switchControl, label, press?.switchBefore || switchStateOf(switchControl));
    recordViewStep(step, switchControl);
  }
  const context = switchControl ? null : elementContextFor(trigger);
  // Any other click counts once it opens a popup.
  watch.wait(1200).then((popup) => {
    if (!popup) return;
    if (step) stepNodes.set(step, { control: switchControl, popup });
    else recordViewStep({ kind: 'open', element: context, label }, trigger, popup);
  });
}, true);
