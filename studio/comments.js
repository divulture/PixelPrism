// Comments: the list, markers, picking, editing, and importing an exported review.

function activeCommentContext() {
  if (!commentSelection?.frame?.isConnected) return null;
  const card = cardForFrame(commentSelection.frame.contentWindow);
  if (!card) return null;
  return { url: canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl), route: commentSelection.route || '/', viewport: { width: Number(card.dataset.viewportWidth), height: Number(card.dataset.viewportHeight) }, element: commentSelection.element, offset: commentSelection.offset || null, steps: commentSelection.steps || [], snapshot: commentSelection.snapshot || null };
}

// Comments have no stored id; this one only has to stay stable while the
// studio is open, so markers in the previews can refer to their comment.
const commentIds = new WeakMap();
let commentIdSeed = 0;
let selectedCommentId = null;
// The one comment shown in full instead of clamped to three lines; opening
// another one collapses it, like an accordion.
let expandedCommentId = null;
let placingCommentId = null;
// A comment from another page that was clicked: shown once that page loads.
let pendingFocusCommentId = null;
let openCommentMenuId = null;
// The comment being edited in the list, and its unsaved text.
let editingCommentId = null;
let editingCommentDraft = '';
// Comment id -> { phase: 'in' | 'out', at }: when its image-only note started
// to appear or leave, so a re-render midway continues the animation.
const handoffNotes = new Map();
const HANDOFF_NOTE_MS = 180;
// Page URL -> expanded, for groups the user opened or closed by hand.
const commentGroupExpanded = new Map();
// The group whose display name is being edited (a page URL), and its draft.
let editingGroupTitleUrl = null;
let editingGroupTitleDraft = '';
let commentsMenuOpen = false;
// Per card: comment id -> 'placed' | 'hidden' | 'missing', as its preview
// reported after looking for the commented elements.
const cardMarkerStatuses = new WeakMap();

function commentId(comment) {
  if (!commentIds.has(comment)) commentIds.set(comment, `comment-${commentIdSeed += 1}`);
  return commentIds.get(comment);
}

function commentById(id) {
  return comments.find((comment) => commentId(comment) === id);
}

// Inspector edits show in the list too: one entry per edited element at its
// page and size, with a marker, so an edit can be found again. The entries
// are not stored but rebuilt from the recorded changes on every change
// (syncChangeUi): resetting a value with its blue dot takes its line away,
// and deleting the entry reverts its edits. They stay out of the agent
// review and the design review, which list the edits themselves.
function changeNoteKey(change) {
  const key = changeKey(change);
  return key.slice(0, key.lastIndexOf('\u0000'));
}

const shortText = (text) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > 40 ? `${value.slice(0, 39)}…` : value;
};

function changeNoteText(changes) {
  return changes.map((change) => (change.property === 'text'
    ? `Text: “${shortText(change.from)}” → “${shortText(change.to)}”`
    : change.property === 'alt'
      ? `Alt: “${shortText(change.from)}” → “${shortText(change.to)}”`
      : `${change.property}: ${change.from || 'none'} → ${change.to}`)).join('\n');
}

function forgetCommentUi(id) {
  if (selectedCommentId === id) selectedCommentId = null;
  if (placingCommentId === id) placingCommentId = null;
  if (pendingFocusCommentId === id) pendingFocusCommentId = null;
  if (expandedCommentId === id) expandedCommentId = null;
  if (openCommentMenuId === id) openCommentMenuId = null;
}

function syncChangeNotes() {
  const groups = new Map();
  activeChanges().forEach((change) => {
    const key = changeNoteKey(change);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(change);
  });
  let changed = false;
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const note = comments[index];
    if (!note.change || groups.has(note.change)) continue;
    comments.splice(index, 1);
    forgetCommentUi(commentId(note));
    changed = true;
  }
  groups.forEach((changes, key) => {
    const text = changeNoteText(changes);
    const note = comments.find((comment) => comment.change === key);
    if (note) {
      if (note.comment !== text) { note.comment = text; changed = true; }
      return;
    }
    const [first] = changes;
    // An edit made in a state is recorded on its rule (".card:hover"); the
    // marker goes on the element.
    const suffix = INSPECTOR_STATE_SUFFIXES[changeState(first)] || '';
    const selector = suffix && first.selector.endsWith(suffix) ? first.selector.slice(0, -suffix.length) : first.selector;
    comments.push({
      type: 'change',
      change: key,
      url: canonicalInspectorUrl(first.url),
      route: first.route || '/',
      viewport: { width: first.viewport.width, height: first.viewport.height },
      ...(first.workspace ? { workspace: first.workspace } : {}),
      ...(first.device ? { device: first.device } : {}),
      element: first.element || { selector },
      ...(first.steps?.length ? { steps: first.steps } : {}),
      comment: text
    });
    changed = true;
  });
  if (!changed) return;
  renderComments();
  syncCommentMarkers();
}

function revertChangeNote(note) {
  const changes = activeChanges().filter((change) => changeNoteKey(change) === note.change);
  if (!inspectorPanel.hidden) {
    clearInspectorSelections();
    hideInspectorPanel();
  }
  revertChanges(changes);
  notify(`Edits to ${note.element?.selector || 'the element'} reverted.`);
}

function isCommentAnchored(comment) {
  return Boolean(comment.element || comment.pin);
}

// A comment belongs to the page and viewport it was written in, so its
// marker is shown only in a preview of the same page at the same width.
function commentShownOnCard(comment, card) {
  return !card.classList.contains('is-embed-blocked')
    && canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl) === canonicalInspectorUrl(comment.url)
    && Number(card.dataset.viewportWidth) === comment.viewport.width;
}

function commentPlacement(comment) {
  if (!isCommentAnchored(comment)) return 'page';
  const cards = [...document.querySelectorAll('.viewport-card')];
  const showing = cards.filter((card) => commentShownOnCard(comment, card));
  if (!showing.length) {
    const url = canonicalInspectorUrl(comment.url);
    return cards.some((card) => canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl) === url) ? 'other-viewport' : 'other-page';
  }
  const id = commentId(comment);
  const states = showing.map((card) => cardMarkerStatuses.get(card)?.get(id));
  if (states.includes('placed')) return 'placed';
  if (states.includes('other-view')) return 'other-view';
  if (states.includes('approx')) return 'approx';
  if (states.includes('hidden')) return 'hidden';
  if (states.includes('missing')) return 'missing';
  return 'loading';
}

// The browser draws a native select's open list outside the page, so no
// screenshot shows it; the comment stays on the select itself.
const NATIVE_SELECT_NOTE = ' · A native select’s open list can’t be captured; the comment goes on the select';

// The tabs and panels switched to before a comment was left: Archive › Week.
function viewStepsLabel(steps) {
  return (Array.isArray(steps) ? steps : []).map(viewStepLabel).filter(Boolean).join(' › ') || 'another view';
}

// Steps recorded before icon buttons were named by their tooltip still
// carry it in their markup: title="Settings".
function viewStepLabel(step) {
  if (step?.label) return step.label;
  const element = step?.element;
  const title = /\stitle="([^"]+)"/.exec(String(element?.htmlSnippet || ''))?.[1];
  return element?.attributes?.['aria-label'] || (title ? title.replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '');
}

function commentViewLabel(comment) {
  return viewStepsLabel(comment.steps);
}

function commentPlacementLabel(comment, placement) {
  switch (placement) {
    case 'hidden': return 'Hidden';
    case 'missing': return 'Not found';
    case 'approx': return 'Not found · by position';
    case 'other-view': return `In “${commentViewLabel(comment)}”`;
    default: return '';
  }
}

function renderComments() {
  const context = activeCommentContext();
  const placing = placingCommentId && commentById(placingCommentId);
  const contextText = placing
    ? `Moving comment ${commentNumber(placing)}: click an element in a preview`
    : context?.element?.selector ? `Selected: ${context.element.selector}${context.steps.some((step) => step.kind === 'state') ? ` · ${viewStepsLabel(context.steps.filter((step) => step.kind === 'state'))}` : ''}${['select', 'option'].includes(context.element.tag) ? NATIVE_SELECT_NOTE : ''}` : '';
  commentsContext.textContent = contextText;
  commentsContext.hidden = !contextText;
  // Status updates re-render the list while a comment is being edited;
  // keep the caret where it was.
  const activeEditor = document.activeElement?.classList.contains('comment-edit-input') ? document.activeElement : null;
  const selection = activeEditor ? [activeEditor.selectionStart, activeEditor.selectionEnd, activeEditor.scrollTop] : null;
  commentsList.replaceChildren(...commentGroups().map((group) => renderCommentGroup(group)));
  const editor = commentsList.querySelector('.comment-edit-input');
  if (editor && selection) {
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(selection[0], selection[1]);
    editor.scrollTop = selection[2];
  }
  commentsEmpty.hidden = siteComments().length > 0;
  commentsMenuDeleteAll.disabled = !siteComments().length;
  // Near the bottom of the list the menu opens upwards to stay visible.
  const openMenu = commentsList.querySelector('.comment-menu:not([hidden])');
  if (openMenu) {
    const listBottom = commentsList.closest('.comments-list-wrap').getBoundingClientRect().bottom;
    openMenu.classList.toggle('is-up', openMenu.getBoundingClientRect().bottom > listBottom);
  }
}

// Comments grouped by page: the page open in the previews comes first and
// is expanded; other pages start collapsed so they do not bury it.
// A group is one page at one viewport size, so notes left at another width
// on the same page are told apart at a glance.
function commentGroupKey(comment) {
  return [canonicalInspectorUrl(comment.url), comment.viewport.width, comment.viewport.height].join('\u0000');
}

function commentGroups() {
  const current = canonicalInspectorUrl(targetUrl);
  const cards = [...document.querySelectorAll('.viewport-card')];
  const groups = new Map();
  comments.forEach((comment) => {
    if (!isCurrentSite(comment.url)) return;
    const url = canonicalInspectorUrl(comment.url);
    const key = commentGroupKey(comment);
    if (!groups.has(key)) {
      const isCurrent = url === current;
      groups.set(key, { key, url, viewport: comment.viewport, isCurrent, isShown: isCurrent && cards.some((card) => commentShownOnCard(comment, card)), entries: [] });
    }
    groups.get(key).entries.push({ comment, index: commentNumber(comment) - 1 });
  });
  // A fixed order, so opening a page never reshuffles the list: pages
  // alphabetically, sizes of one page narrowest first like the preview cards.
  return [...groups.values()].sort((left, right) => (
    left.url.localeCompare(right.url, undefined, { numeric: true })
    || left.viewport.width - right.viewport.width
    || left.viewport.height - right.viewport.height
  ));
}

// The page's real path/host, ignoring any name the user typed in for it.
function commentGroupRealLabel(url) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}` || '/';
    let currentOrigin = '';
    try { currentOrigin = new URL(targetUrl).origin; } catch { /* No page open. */ }
    return parsed.origin === currentOrigin || parsed.protocol === 'file:' ? path : `${parsed.host}${path}`;
  } catch {
    return url;
  }
}

// What the group actually shows: a short name the user typed in, if any,
// otherwise the real path/host.
function commentGroupLabel(url) {
  restorePageTitles(commentOrigin(url));
  return pageTitleOverrides.get(url) || commentGroupRealLabel(url);
}

function isCommentGroupExpanded(group) {
  return commentGroupExpanded.get(group.key) ?? group.isShown;
}

function renderCommentGroup(group) {
  const expanded = isCommentGroupExpanded(group);
  const node = document.createElement('li');
  node.className = 'comment-group';
  node.classList.toggle('is-current', group.isCurrent);
  node.dataset.groupKey = group.key;
  const header = document.createElement('div');
  header.className = 'comment-group-header';
  // The title can turn into a text input to rename the page, so it can't
  // live inside a <button> (invalid nesting) — the toggle is split around it.
  const toggleStart = document.createElement('button');
  toggleStart.type = 'button'; toggleStart.className = 'comment-group-toggle'; toggleStart.dataset.action = 'toggle-group';
  toggleStart.setAttribute('aria-expanded', String(expanded));
  toggleStart.innerHTML = window.phosphorIcon(expanded ? 'caret-down' : 'caret-right');
  const size = document.createElement('span');
  size.className = 'comment-group-size tooltip-trigger';
  size.dataset.tooltip = viewportLabel(group.entries[0].comment);
  size.innerHTML = deviceIcon(deviceGlyph('', group.viewport.width));
  toggleStart.append(size);
  const isEditingTitle = editingGroupTitleUrl === group.url;
  let title;
  if (isEditingTitle) {
    title = document.createElement('input');
    title.type = 'text';
    title.className = 'comment-group-title comment-group-title-input';
    title.maxLength = 200;
    title.setAttribute('aria-label', `Rename ${commentGroupRealLabel(group.url)}`);
    title.value = editingGroupTitleDraft;
  } else {
    title = document.createElement('span');
    title.className = 'comment-group-title';
    title.textContent = commentGroupLabel(group.url);
    // The real path/URL always shows on hover, even once the page has a
    // typed-in display name.
    title.title = commentGroupRealLabel(group.url);
    title.tabIndex = 0;
    title.dataset.action = 'rename-group';
  }
  const toggleEnd = document.createElement('button');
  toggleEnd.type = 'button'; toggleEnd.className = 'comment-group-toggle comment-group-toggle-end'; toggleEnd.dataset.action = 'toggle-group';
  const count = document.createElement('span');
  count.className = 'comment-group-count';
  count.textContent = String(group.entries.length);
  toggleEnd.append(count);
  // Marks what the previews show right now: this page at this width. It
  // sits right next to the title, not off by the count.
  let shown = null;
  if (group.isShown) {
    shown = document.createElement('span');
    shown.className = 'comment-group-shown';
    shown.title = 'Shown in the previews';
    shown.innerHTML = window.phosphorIcon('eye');
  }
  header.append(toggleStart, title, ...(shown ? [shown] : []), toggleEnd);
  const list = document.createElement('ol');
  list.className = 'comment-group-list';
  list.hidden = !expanded;
  if (expanded) list.append(...group.entries.map(({ comment, index }) => renderCommentItem(comment, index)));
  node.append(header, list);
  return node;
}

function renderCommentItem(comment, index) {
  const id = commentId(comment);
  const placement = commentPlacement(comment);
  const isPlacing = placingCommentId === id;
  const isChange = Boolean(comment.change);
  const item = document.createElement('li');
  item.className = `comment-item is-${placement}`;
  item.classList.toggle('is-change', isChange);
  item.classList.toggle('is-selected', selectedCommentId === id);
  item.classList.toggle('is-placing', isPlacing);
  item.classList.toggle('is-text-expanded', expandedCommentId === id);
  item.dataset.commentId = id;
  const number = document.createElement('span');
  number.className = 'comment-number';
  number.textContent = String(index + 1);
  const isEditing = editingCommentId === id;
  item.classList.toggle('is-editing', isEditing);
  let text;
  if (isEditing) {
    text = document.createElement('div');
    text.className = 'comment-edit';
    const field = document.createElement('textarea');
    field.className = 'comment-edit-input';
    field.maxLength = 2000;
    field.setAttribute('aria-label', `Edit comment ${index + 1}`);
    field.value = editingCommentDraft;
    const actions = document.createElement('div');
    actions.className = 'comment-edit-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.dataset.action = 'edit-cancel'; cancel.textContent = 'Cancel';
    const save = document.createElement('button');
    save.type = 'button'; save.dataset.action = 'edit-save'; save.textContent = 'Save';
    save.title = IS_MAC ? 'Save (⌘ Enter)' : 'Save (Ctrl+Enter)';
    save.disabled = !editingCommentDraft.trim() && !commentAttachments(comment).length;
    const attach = document.createElement('button');
    attach.type = 'button'; attach.className = 'comment-attach tooltip-trigger'; attach.dataset.action = 'add-image';
    attach.setAttribute('aria-label', 'Attach images');
    attach.dataset.tooltip = 'Attach images';
    attach.innerHTML = window.phosphorIcon('paperclip');
    actions.append(attach, cancel, save);
    text.append(field, actions);
  } else if (comment.comment) {
    text = document.createElement('p');
    text.textContent = comment.comment;
  }
  // The last image of a comment without text goes with the comment itself.
  const attachments = commentAttachments(comment);
  let tiles = attachments.length ? renderAttachmentTiles(attachments, { removable: attachments.length > 1 || Boolean(comment.comment.trim()) }) : null;
  // While editing, the images sit between the text and its buttons.
  if (isEditing && tiles) {
    text.insertBefore(tiles, text.querySelector('.comment-edit-actions'));
    tiles = null;
  }
  // Text first, then the meta row: number, element, whether it was found, actions.
  const meta = document.createElement('div');
  meta.className = 'comment-meta';
  meta.append(number);
  const target = document.createElement('span');
  target.className = 'comment-target';
  target.textContent = comment.pin ? 'Pinned point' : comment.element?.selector || 'Page';
  target.title = target.textContent;
  // While moving, the hint takes the selector's place.
  const state = isPlacing ? 'Click an element · Esc cancels' : commentPlacementLabel(comment, placement);
  if (!isPlacing) meta.append(target);
  if (state) {
    const stateText = document.createElement('span');
    stateText.className = 'comment-state';
    stateText.textContent = isPlacing ? state : `· ${state}`;
    if (placement === 'approx' && !isPlacing) stateText.title = 'The element is gone; the marker shows where it was when the comment was left.';
    meta.append(stateText);
  }
  const actions = document.createElement('div');
  actions.className = 'comment-actions';
  const menuOpen = openCommentMenuId === id;
  const more = document.createElement('button');
  more.type = 'button'; more.className = 'comment-more tooltip-trigger'; more.dataset.action = 'menu';
  more.setAttribute('aria-label', `Actions for comment ${index + 1}`);
  more.setAttribute('aria-haspopup', 'menu');
  more.setAttribute('aria-expanded', String(menuOpen));
  more.dataset.tooltip = 'Actions';
  more.classList.toggle('is-placing', isPlacing);
  more.innerHTML = window.phosphorIcon('dots-three');
  const remove = document.createElement('button');
  remove.type = 'button'; remove.className = 'comment-delete tooltip-trigger'; remove.dataset.action = 'delete';
  remove.setAttribute('aria-label', isChange ? `Revert edits ${index + 1}` : `Delete comment ${index + 1}`);
  remove.dataset.tooltip = isChange ? 'Revert edits' : 'Delete comment';
  remove.innerHTML = window.phosphorIcon('trash');
  // An edit entry is not written by hand: nothing to edit, attach or move.
  actions.append(...(isChange ? [remove] : [remove, more]));
  const menu = document.createElement('div');
  menu.className = 'menu comment-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = !menuOpen;
  const menuItem = (action, label) => {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.action = action;
    button.setAttribute('role', 'menuitem');
    button.append(label);
    menu.append(button);
  };
  menuItem('edit', 'Edit');
  if (attachments.length < ATTACHMENTS_PER_COMMENT) menuItem('add-image', 'Attach images');
  menuItem('move', isPlacing ? 'Cancel reattaching' : 'Reattach comment');
  // The menu lives inside actions so it tracks that row regardless of how
  // tall the comment text above it is.
  actions.append(menu);
  if (!isEditing) meta.append(actions);
  item.append(...[text, tiles, meta, commentHandoffNote(comment, id)].filter(Boolean));
  return item;
}

// Agents never get a comment without text (agentComments), so the comment
// says so itself. Typing text while editing already folds the note away.
function commentHandoffNote(comment, id) {
  const imageOnly = !comment.change && !comment.comment.trim() && commentAttachments(comment).length > 0;
  const show = imageOnly && !(editingCommentId === id && editingCommentDraft.trim());
  const now = performance.now();
  let entry = handoffNotes.get(id);
  const phase = show ? 'in' : 'out';
  if (!entry && !show) return null;
  if (entry?.phase !== phase) {
    // Turning back midway starts from where the other animation got to.
    const elapsed = entry ? Math.min(now - entry.at, HANDOFF_NOTE_MS) : HANDOFF_NOTE_MS;
    entry = { phase, at: now - (HANDOFF_NOTE_MS - elapsed) };
    handoffNotes.set(id, entry);
  }
  const elapsed = Math.min(now - entry.at, HANDOFF_NOTE_MS);
  if (phase === 'out' && elapsed >= HANDOFF_NOTE_MS) {
    handoffNotes.delete(id);
    return null;
  }
  const wrap = document.createElement('div');
  wrap.className = `comment-handoff-note is-${phase}`;
  wrap.style.animationDelay = `${-elapsed}ms`;
  if (phase === 'out') wrap.addEventListener('animationend', () => wrap.remove(), { once: true });
  const clip = document.createElement('div');
  // Not a <p>: the comment's own text styles (.comment-item p) would apply.
  const note = document.createElement('div');
  note.className = 'inspector-note';
  note.textContent = 'Agents handoff leaves out comments with only images. Add text to send this one to your agent; the images still show in the HTML/PDF review.';
  clip.append(note);
  wrap.append(clip);
  return wrap;
}

function syncCommentHandoffNote(id) {
  const item = commentsList.querySelector(`.comment-item[data-comment-id="${CSS.escape(id)}"]`);
  const comment = commentById(id);
  if (!item || !comment) return;
  const current = item.querySelector(':scope > .comment-handoff-note');
  const next = commentHandoffNote(comment, id);
  if (current && next) current.replaceWith(next);
  else if (current) current.remove();
  else if (next) item.append(next);
}

// Sends each preview the markers of its page and width. Previews that never
// showed markers are left alone, so closing the panel installs nothing.
function syncCommentMarkers() {
  if (!hasExtensionRuntime) return;
  const enabled = !commentsPanel.hidden;
  document.querySelectorAll('.viewport-card').forEach((card) => {
    const frame = card.querySelector('iframe');
    if (!frame?.contentWindow || card.dataset.previewReady !== 'true') return;
    if (!enabled && !card.commentMarkersPayload) return;
    const markers = enabled ? comments.flatMap((comment) => (
      isCommentAnchored(comment) && commentShownOnCard(comment, card)
        ? [{ id: commentId(comment), number: commentNumber(comment), text: commentSummary(comment), element: comment.element || null, selector: comment.element?.selector || '', pin: comment.pin || null, offset: comment.offset || null, steps: comment.steps || [] }]
        : []
    )) : [];
    const message = { source: 'viewport-parade', type: 'comment-markers', enabled, markers, selectedId: enabled ? selectedCommentId : null, scale: Number(card.dataset.scale) || 1 };
    const payload = enabled ? JSON.stringify(message) : '';
    if (payload === (card.commentMarkersPayload || '')) return;
    card.commentMarkersPayload = payload;
    frame.contentWindow.postMessage(message, '*');
  });
}

function selectComment(id, { focus = false, reveal = false } = {}) {
  const comment = commentById(id);
  if (!comment) return;
  selectedCommentId = id;
  if (reveal) commentGroupExpanded.set(commentGroupKey(comment), true);
  renderComments();
  syncCommentMarkers();
  if (focus) {
    document.querySelectorAll('.viewport-card').forEach((card) => {
      if (!commentShownOnCard(comment, card)) return;
      card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'comment-marker-focus', id }, '*');
    });
  }
  if (reveal) commentsList.querySelector(`[data-comment-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function setCommentPlacing(id) {
  placingCommentId = id && placingCommentId !== id ? id : null;
  if (placingCommentId) {
    selectedCommentId = placingCommentId;
    clearInspectorSelections();
    speak(`Click an element in any preview to reattach comment ${commentNumber(commentById(placingCommentId))}.`);
  }
  renderComments();
  syncCommentMarkers();
}

// Re-binds a comment to an element or point in a preview. The comment then
// belongs to that preview's page and width, like a newly written one.
function moveComment(id, card, { element, pin, route, offset, same = false, steps, snapshot }) {
  const comment = commentById(id);
  if (!comment || !card) return;
  // An edit's marker stays on the edited element: send it back there.
  if (comment.change) {
    delete card.commentMarkersPayload;
    syncCommentMarkers();
    return;
  }
  // A new target lives in the view the preview shows now.
  if (!same && Array.isArray(steps)) {
    if (steps.length) comment.steps = steps;
    else delete comment.steps;
  }
  // Picked again by a click: the copy of the view it was picked in, if any.
  if (snapshot !== undefined) {
    if (snapshot) {
      storeViewSnapshot(snapshot);
      comment.snapshot = snapshot.id;
    } else delete comment.snapshot;
  }
  comment.url = canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl);
  if (typeof route === 'string') comment.route = route;
  comment.viewport = { width: Number(card.dataset.viewportWidth), height: Number(card.dataset.viewportHeight) };
  Object.assign(comment, placeOfCard(card));
  if (pin) {
    comment.pin = { x: Math.round(pin.x), y: Math.round(pin.y) };
    delete comment.element;
    delete comment.offset;
  } else if (element && typeof element === 'object') {
    comment.element = element;
    delete comment.pin;
    // A marker dragged into place keeps its spot in the element; a comment
    // attached by clicking starts at the element's corner again.
    if (offset && Number.isFinite(offset.x) && Number.isFinite(offset.y)) comment.offset = { x: Math.round(offset.x), y: Math.round(offset.y) };
    else delete comment.offset;
  } else {
    return;
  }
  placingCommentId = null;
  selectedCommentId = id;
  saveComments();
  renderComments();
  syncCommentMarkers();
  const number = commentNumber(comment);
  if (same) notify(`Marker ${number} moved within ${element.selector || 'its element'}.`, 'success');
  else notify(`Comment ${number} moved to ${pin ? 'the pinned point' : element.selector || 'the element'}.`, 'success');
}

function setCommentPicker(enabled) {
  if (!hasExtensionRuntime) return;
  if (enabled) {
    document.querySelectorAll('.viewport-card iframe').forEach((frame) => {
      const card = frame.closest('.viewport-card');
      if (!frame.contentWindow || card?.dataset.previewReady !== 'true' || commentPickerFrames.has(frame)) return;
      frame.contentWindow.postMessage({ source: 'viewport-parade', type: 'toggle-comment-picker', enabled: true }, '*');
      commentPickerFrames.add(frame);
    });
    speak('Select an element in any preview to attach the comment.');
  } else {
    commentPickerFrames.forEach((frame) => {
      frame.contentWindow?.postMessage({ source: 'viewport-parade', type: 'toggle-comment-picker', enabled: false }, '*');
    });
    commentPickerFrames.clear();
  }
}

function setCommentsOpen(open) {
  if (open) {
    setCursorModeActive(false);
    setLayersOpen(false);
    setInspectorMode(false);
  }
  commentsPanel.hidden = !open;
  commentsToggle.setAttribute('aria-pressed', String(open));
  if (!open) { closeCommentComposer(); placingCommentId = null; pendingFocusCommentId = null; openCommentMenuId = null; editingCommentId = null; setCommentsMenuOpen(false); }
  if (open) { renderComments(); setCommentPicker(true); }
  else setCommentPicker(false);
  syncCommentMarkers();
}

function addComment(rawComment) {
  const comment = rawComment.trim();
  if (!comment && !draftAttachments.length) return;
  const context = activeCommentContext();
  const activeCard = cardForFrame(layersFrame) || document.querySelector('.viewport-card');
  const place = placeOfCard((context && cardForFrame(commentSelection.frame.contentWindow)) || activeCard);
  const viewport = context?.viewport || (activeCard ? { width: Number(activeCard.dataset.viewportWidth), height: Number(activeCard.dataset.viewportHeight) } : { width: window.innerWidth, height: window.innerHeight });
  if (context?.snapshot) storeViewSnapshot(context.snapshot);
  comments.push({ type: 'comment', url: context?.url || canonicalInspectorUrl(activeCard?.dataset.loadedUrl || targetUrl), route: context?.route || '/', viewport, ...place, ...(context?.element ? { element: context.element } : {}), ...(context?.element && context.offset ? { offset: context.offset } : {}), ...(context?.steps?.length ? { steps: context.steps } : {}), ...(context?.snapshot ? { snapshot: context.snapshot.id } : {}), comment, ...(draftAttachments.length ? { attachments: draftAttachments } : {}) });
  commentInput.value = '';
  draftAttachments = [];
  renderDraftAttachments();
  saveComments();
  syncCommentComposer();
  closeCommentComposer();
  renderComments(); syncChangeUi(); syncCommentMarkers(); notify('Comment added to the pending handoff.', 'success');
}

function reviewDataFromHtml(text) {
  const parsed = new DOMParser().parseFromString(text, 'text/html');
  const raw = parsed.getElementById('pixelprism-review-data')?.textContent;
  if (!raw || raw.includes('{{PIXELPRISM_REVIEW_DATA}}')) throw new Error('This file is not a PixelPrism HTML review.');
  const data = JSON.parse(raw);
  if (!Array.isArray(data?.pages)) throw new Error('This review has no pages.');
  return data;
}

// Brings comments back from an exported HTML review. Older exports only
// carry the element selector; newer ones carry the full element record and
// points placed by hand in the review. Entries checked off in the review and
// saved into the file (data.resolved) are finished work and stay behind.
async function importReviewFile(file) {
  const data = reviewDataFromHtml(await file.text());
  const known = new Set(comments.map(commentIdentity));
  const resolved = new Set(Array.isArray(data.resolved) ? data.resolved.map(String) : []);
  let added = 0;
  let duplicates = 0;
  let changes = 0;
  let done = 0;
  // Comments whose images still have to be stored, with those images.
  const withImages = [];
  data.pages.forEach((page) => {
    const url = canonicalInspectorUrl(String(page.url || ''));
    let route = '/';
    try { route = new URL(url).pathname || '/'; } catch { /* Keep the default route. */ }
    (page.viewports || []).forEach((viewport) => {
      (viewport.entries || []).forEach((entry) => {
        if (entry.kind === 'change') {
          changes += 1;
          return;
        }
        if (entry.id != null && resolved.has(String(entry.id))) {
          done += 1;
          return;
        }
        let element = null;
        if (entry.element && typeof entry.element === 'object') element = entry.element;
        else if (entry.target !== 'page' && entry.selector) element = { selector: String(entry.selector) };
        const pin = entry.pin && Number.isFinite(entry.pin.x) && Number.isFinite(entry.pin.y)
          ? { x: Math.round(entry.pin.x), y: Math.round(entry.pin.y) }
          : null;
        const images = Array.isArray(entry.attachments) ? entry.attachments.filter((image) => typeof image?.src === 'string') : [];
        const comment = {
          type: 'comment',
          url,
          route,
          viewport: { width: Math.round(Number(viewport.width) || 0), height: Math.round(Number(viewport.height) || 0) },
          ...(typeof viewport.workspace === 'string' && viewport.workspace ? { workspace: viewport.workspace } : {}),
          ...(typeof viewport.device === 'string' && viewport.device ? { device: viewport.device } : {}),
          ...(element ? { element } : {}),
          ...(pin ? { pin } : {}),
          ...(Array.isArray(viewport.steps) && viewport.steps.length ? { steps: viewport.steps } : {}),
          ...(!pin && element && entry.offset && Number.isFinite(entry.offset.x) && Number.isFinite(entry.offset.y) ? { offset: { x: Math.round(entry.offset.x), y: Math.round(entry.offset.y) } } : {}),
          comment: String(entry.text || ''),
          // Names and sizes only for now: enough to tell duplicates apart.
          ...(images.length ? { attachments: images.map((image) => ({ name: String(image.name || 'image.png'), size: Math.round(Number(image.size) || 0) })) } : {})
        };
        if (!isValidComment(comment)) return;
        const identity = commentIdentity(comment);
        if (known.has(identity)) {
          duplicates += 1;
          return;
        }
        known.add(identity);
        comments.push(comment);
        if (images.length) withImages.push([comment, images]);
        added += 1;
      });
    });
  });
  let lostImages = 0;
  for (const [comment, images] of withImages) {
    const stored = await importedAttachments(images);
    lostImages += images.length - stored.length;
    if (stored.length) comment.attachments = stored;
    else delete comment.attachments;
    // An image-only comment whose images could not be kept is dropped.
    if (!comment.comment.trim() && !stored.length) {
      comments.splice(comments.indexOf(comment), 1);
      added -= 1;
    }
  }
  saveComments();
  renderComments();
  syncChangeUi();
  syncCommentMarkers();
  const notes = [];
  if (done) notes.push(`${done} resolved skipped`);
  if (duplicates) notes.push(`${duplicates} already in the list`);
  if (changes) notes.push(`${changes} CSS change${changes === 1 ? '' : 's'} skipped`);
  if (lostImages) notes.push(`${lostImages} image${lostImages === 1 ? '' : 's'} could not be stored`);
  notify(`Imported ${added} comment${added === 1 ? '' : 's'}${notes.length ? ` (${notes.join(', ')})` : ''}.`, added ? 'success' : undefined);
}
commentsForm.addEventListener('submit', (event) => { event.preventDefault(); addComment(commentInput.value); });
commentAttachButton.addEventListener('click', () => {
  delete commentAttachInput.dataset.commentId;
  commentAttachInput.click();
});
// One file input serves the new comment and, via its menu, an existing one.
commentAttachInput.addEventListener('change', () => {
  const files = [...(commentAttachInput.files || [])];
  const { commentId: targetId } = commentAttachInput.dataset;
  commentAttachInput.value = '';
  delete commentAttachInput.dataset.commentId;
  if (!files.length) return;
  if (targetId) attachToComment(targetId, files);
  else attachToDraft(files);
});
commentDraftAttachments.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  const index = Number(button?.dataset.index);
  if (!draftAttachments[index]) return;
  if (button.dataset.action === 'open-image') {
    openImageViewer(draftAttachments, index);
  } else if (button.dataset.action === 'remove-image') {
    forgetAttachments(draftAttachments.splice(index, 1));
    renderDraftAttachments();
    commentInput.focus();
  }
});
// A pasted image goes to the comment being edited (the comment box has its
// own, in comment-composer.js).
commentsPanel.addEventListener('paste', (event) => {
  const files = imageFilesFrom(event.clipboardData);
  if (!files.length) return;
  if (event.target.classList?.contains('comment-edit-input') && editingCommentId) {
    event.preventDefault();
    attachToComment(editingCommentId, files);
  }
});
// Images dropped on a comment are added to it.
let commentDropTarget = null;
function setCommentDropTarget(target) {
  if (commentDropTarget === target) return;
  commentDropTarget?.classList.remove('is-drop-target');
  commentDropTarget = target;
  commentDropTarget?.classList.add('is-drop-target');
}
function commentDropTargetFor(event) {
  if (![...(event.dataTransfer?.types || [])].includes('Files')) return null;
  return event.target.closest?.('.comment-item:not(.is-change)') || null;
}
commentsPanel.addEventListener('dragover', (event) => {
  if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
  // Anywhere else in the panel a drop must not open the file in the tab.
  event.preventDefault();
  const target = commentDropTargetFor(event);
  event.dataTransfer.dropEffect = target ? 'copy' : 'none';
  setCommentDropTarget(target);
});
commentsPanel.addEventListener('dragleave', (event) => {
  if (!commentsPanel.contains(event.relatedTarget)) setCommentDropTarget(null);
});
commentsPanel.addEventListener('drop', (event) => {
  const target = commentDropTargetFor(event);
  setCommentDropTarget(null);
  if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
  event.preventDefault();
  const files = imageFilesFrom(event.dataTransfer);
  if (!target || !files.length) return;
  attachToComment(target.dataset.commentId, files);
});
imageViewerPrev.addEventListener('click', () => showImageViewerItem(imageViewerIndex - 1));
imageViewerNext.addEventListener('click', () => showImageViewerItem(imageViewerIndex + 1));
document.querySelector('#image-viewer-close').addEventListener('click', () => imageViewer.close());
// A click on the dimmed backdrop, not on the image or its controls, closes it.
imageViewer.addEventListener('click', (event) => {
  if (event.target === imageViewer || event.target.id === 'image-viewer-stage') imageViewer.close();
});
imageViewer.addEventListener('keydown', (event) => {
  // Studio shortcuts and Escape handlers behind the preview stay out of it;
  // the dialog still closes itself on Escape.
  event.stopPropagation();
  if (event.key === 'ArrowLeft' && imageViewerItems.length > 1) showImageViewerItem(imageViewerIndex - 1);
  else if (event.key === 'ArrowRight' && imageViewerItems.length > 1) showImageViewerItem(imageViewerIndex + 1);
});
imageViewer.addEventListener('close', () => {
  imageViewerItems = [];
  imageViewerImage.removeAttribute('src');
});

// A click on the title toggles the group like the rest of the row, but a
// double click renames it instead — so the single-click toggle waits a beat
// to see whether a second click is on its way.
let groupTitleClickTimer = null;

function toggleCommentGroup(groupKey) {
  const group = commentGroups().find((candidate) => candidate.key === groupKey);
  if (group) commentGroupExpanded.set(groupKey, !isCommentGroupExpanded(group));
  renderComments();
}

commentsList.addEventListener('click', (event) => {
  const groupKey = event.target.closest('.comment-group')?.dataset.groupKey;
  if (groupKey && event.target.closest('.comment-group-toggle')) {
    toggleCommentGroup(groupKey);
    return;
  }
  if (groupKey && event.target.closest('[data-action="rename-group"]')) {
    clearTimeout(groupTitleClickTimer);
    groupTitleClickTimer = setTimeout(() => toggleCommentGroup(groupKey), 250);
    return;
  }
  const item = event.target.closest('.comment-item');
  const id = item?.dataset.commentId;
  const comment = id && commentById(id);
  if (!comment) return;
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'menu') {
    openCommentMenuId = openCommentMenuId === id ? null : id;
    renderComments();
    return;
  }
  if (openCommentMenuId) {
    openCommentMenuId = null;
    if (!action) {
      renderComments();
      return;
    }
  }
  if (action === 'edit') {
    startCommentEdit(id);
    return;
  }
  if (action === 'open-image') {
    openImageViewer(commentAttachments(comment), Number(event.target.closest('[data-index]').dataset.index));
    return;
  }
  if (action === 'remove-image') {
    removeCommentAttachment(id, Number(event.target.closest('[data-index]').dataset.index));
    return;
  }
  if (action === 'add-image') {
    commentAttachInput.dataset.commentId = id;
    commentAttachInput.click();
    return;
  }
  if (action === 'edit-save') {
    saveCommentEdit();
    return;
  }
  if (action === 'edit-cancel') {
    stopCommentEdit();
    return;
  }
  // Clicks inside the editor are for the text, not for selecting the comment.
  if (event.target.closest('.comment-edit')) return;
  if (action === 'delete' && comment.change) {
    revertChangeNote(comment);
    return;
  }
  if (action === 'delete') {
    if (editingCommentId === id) editingCommentId = null;
    comments.splice(comments.indexOf(comment), 1);
    forgetAttachments(commentAttachments(comment));
    if (selectedCommentId === id) selectedCommentId = null;
    if (placingCommentId === id) placingCommentId = null;
    if (pendingFocusCommentId === id) pendingFocusCommentId = null;
    if (expandedCommentId === id) expandedCommentId = null;
    saveComments();
    renderComments();
    syncChangeUi();
    syncCommentMarkers();
    notify('Comment removed from the pending handoff.');
    return;
  }
  if (action === 'move') {
    setCommentPlacing(id);
    return;
  }
  const placement = commentPlacement(comment);
  if (placement === 'other-view') {
    // Switch the preview to the tab the comment was left in, then focus it.
    selectedCommentId = id;
    pendingFocusCommentId = id;
    document.querySelectorAll('.viewport-card').forEach((card) => {
      if (!commentShownOnCard(comment, card)) return;
      // Once per document: the status that follows must not replay again.
      card.replayedCommentId = id;
      card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'comment-replay-steps', id }, '*');
    });
    renderComments();
    syncCommentMarkers();
    return;
  }
  if (placement === 'other-page' || placement === 'other-viewport') {
    // Bring up the comment's page and width; its marker is focused once
    // that preview reports it.
    selectedCommentId = id;
    pendingFocusCommentId = id;
    if (placement === 'other-page') openPreviewUrl(comment.url, true);
    if (canonicalInspectorUrl(targetUrl) !== canonicalInspectorUrl(comment.url)) {
      pendingFocusCommentId = null;
    } else if (![...document.querySelectorAll('.viewport-card')].some((card) => commentShownOnCard(comment, card))) {
      showCommentViewport(comment);
    }
    renderComments();
    return;
  }
  // Selecting the card also expands its text past the three-line clamp;
  // opening one collapses whichever other one was open.
  expandedCommentId = expandedCommentId === id ? null : id;
  selectComment(id, { focus: true });
});
function startCommentEdit(id) {
  const comment = commentById(id);
  if (!comment) return;
  editingCommentId = id;
  editingCommentDraft = comment.comment;
  if (placingCommentId) placingCommentId = null;
  renderComments();
  const editor = commentsList.querySelector('.comment-edit-input');
  editor?.focus();
  editor?.setSelectionRange(editor.value.length, editor.value.length);
}

function stopCommentEdit() {
  editingCommentId = null;
  editingCommentDraft = '';
  renderComments();
}

function saveCommentEdit() {
  const comment = editingCommentId && commentById(editingCommentId);
  const text = editingCommentDraft.trim();
  if (!comment || (!text && !commentAttachments(comment).length)) return;
  const changed = comment.comment !== text;
  comment.comment = text;
  editingCommentId = null;
  editingCommentDraft = '';
  if (changed) saveComments();
  renderComments();
  // Text added to an image-only comment makes it something to hand off.
  syncChangeUi();
  syncCommentMarkers();
  if (changed) notify(`Comment ${commentNumber(comment)} updated.`, 'success');
}

function startGroupTitleEdit(url) {
  editingGroupTitleUrl = url;
  editingGroupTitleDraft = commentGroupLabel(url);
  renderComments();
  const input = commentsList.querySelector('.comment-group-title-input');
  input?.focus();
  input?.select();
}

function stopGroupTitleEdit() {
  editingGroupTitleUrl = null;
  editingGroupTitleDraft = '';
  renderComments();
}

function saveGroupTitleEdit() {
  const url = editingGroupTitleUrl;
  if (!url) return;
  const text = editingGroupTitleDraft.trim();
  editingGroupTitleUrl = null;
  editingGroupTitleDraft = '';
  // Typing back the real name (or clearing the field) just drops the override.
  setPageTitleOverride(url, text === commentGroupRealLabel(url) ? '' : text);
  renderComments();
}

commentsList.addEventListener('dblclick', (event) => {
  const titleEl = event.target.closest('[data-action="rename-group"]');
  if (!titleEl) return;
  clearTimeout(groupTitleClickTimer);
  const groupKey = titleEl.closest('.comment-group')?.dataset.groupKey;
  const group = groupKey && commentGroups().find((candidate) => candidate.key === groupKey);
  if (group) startGroupTitleEdit(group.url);
});
commentsList.addEventListener('input', (event) => {
  if (!event.target.classList.contains('comment-group-title-input')) return;
  editingGroupTitleDraft = event.target.value;
});
commentsList.addEventListener('keydown', (event) => {
  if (!event.target.classList.contains('comment-group-title-input')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    stopGroupTitleEdit();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    saveGroupTitleEdit();
  }
});
commentsList.addEventListener('focusout', (event) => {
  if (!event.target.classList.contains('comment-group-title-input')) return;
  saveGroupTitleEdit();
});

commentsList.addEventListener('input', (event) => {
  if (!event.target.classList.contains('comment-edit-input')) return;
  editingCommentDraft = event.target.value;
  const save = event.target.closest('.comment-edit')?.querySelector('[data-action="edit-save"]');
  if (save) save.disabled = !editingCommentDraft.trim() && !commentAttachments(commentById(editingCommentId)).length;
  syncCommentHandoffNote(editingCommentId);
});
commentsList.addEventListener('keydown', (event) => {
  if (!event.target.classList.contains('comment-edit-input')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    stopCommentEdit();
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    saveCommentEdit();
  }
});
// Adds a preview at the comment's width, reusing a device of that width or
// making a custom one. In single-viewport mode the one preview switches.
function showCommentViewport(comment) {
  const { width, height } = comment.viewport;
  // A comment from another workspace opens that workspace.
  const workspace = workspaceOf(comment);
  if (workspace && WORKSPACES.indexOf(workspace) !== activeWorkspace
    && workspaceViewports(workspace).some((viewport) => sameViewportSize(viewport, comment.viewport))) {
    applyWorkspace(workspace);
    return;
  }
  let id = Object.keys(DEVICES).find((key) => DEVICES[key].width === width);
  if (!id) {
    id = `custom-${++customDeviceCount}`;
    DEVICES[id] = { name: 'Custom', width, height };
  }
  if (mode === 'single') {
    selected = new Set([id]);
    singleWidth = width;
  } else {
    selected.add(id);
  }
  render();
  speak(`Opened the ${width} px viewport.`);
}

// A click anywhere outside the open menu closes it.
document.addEventListener('pointerdown', (event) => {
  if (!openCommentMenuId || (event.target instanceof Element && event.target.closest('.comment-menu, .comment-more'))) return;
  openCommentMenuId = null;
  renderComments();
}, true);
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || (!placingCommentId && !openCommentMenuId)) return;
  event.preventDefault();
  if (openCommentMenuId) {
    openCommentMenuId = null;
    renderComments();
  } else {
    setCommentPlacing(null);
  }
});
function setCommentsMenuOpen(open) {
  commentsMenuOpen = open;
  commentsMenu.hidden = !open;
  commentsMenuToggle.setAttribute('aria-expanded', String(open));
}

// Everything in the list for this site goes: written comments are deleted,
// and Inspector edits are reverted, so the pages go back to their old values.
function deleteAllComments() {
  const count = siteComments().length;
  const written = siteComments().filter((comment) => !comment.change);
  const edits = [...changeLog.values()].filter((change) => isCurrentSite(change.url));
  if (!count && !edits.length) return;
  if (!window.confirm(`Delete all ${count} comment${count === 1 ? '' : 's'} on every page of this site?\n\nInspector edits go back to their original values. This cannot be undone.`)) return;
  forgetAttachments(written.flatMap(commentAttachments));
  written.forEach((comment) => {
    comments.splice(comments.indexOf(comment), 1);
    forgetCommentUi(commentId(comment));
  });
  editingCommentId = null;
  if (edits.length && !inspectorPanel.hidden) {
    clearInspectorSelections();
    hideInspectorPanel();
  }
  saveComments();
  // Reverting drops the edit entries from the list (syncChangeNotes).
  if (edits.length) revertChanges(edits);
  renderComments();
  syncChangeUi();
  syncCommentMarkers();
  notify(`${count} comment${count === 1 ? '' : 's'} deleted.`);
}

commentsMenuToggle.addEventListener('click', () => setCommentsMenuOpen(!commentsMenuOpen));
document.addEventListener('pointerdown', (event) => {
  if (commentsMenuOpen && !(event.target instanceof Element && event.target.closest('#comments-menu, #comments-menu-toggle'))) setCommentsMenuOpen(false);
}, true);
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !commentsMenuOpen) return;
  event.preventDefault();
  setCommentsMenuOpen(false);
  commentsMenuToggle.focus();
});
commentsMenuDeleteAll.addEventListener('click', () => {
  setCommentsMenuOpen(false);
  deleteAllComments();
});
commentsImportButton.addEventListener('click', () => {
  setCommentsMenuOpen(false);
  commentsImportInput.click();
});
commentsImportInput.addEventListener('change', async () => {
  const [file] = commentsImportInput.files || [];
  commentsImportInput.value = '';
  if (!file) return;
  commentsMenuToggle.disabled = true;
  try {
    await importReviewFile(file);
  } catch (error) {
    notify(`Review was not imported: ${error.message}`, 'error');
  } finally {
    commentsMenuToggle.disabled = false;
  }
});
