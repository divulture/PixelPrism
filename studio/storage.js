// Comments, edits and page names kept in the browser per site.

// Comments survive a closed studio tab or an extension reload. They are kept
// per site, so a studio opened for another site starts with its own notes.
const COMMENTS_STORAGE_PREFIX = 'pixelprism-comments:';
const storedCommentOrigins = new Set();

function commentOrigin(url) {
  try {
    const origin = new URL(url).origin;
    return origin === 'null' ? 'file://' : origin;
  } catch {
    return '';
  }
}

function commentIdentity(comment) {
  const target = comment.pin
    ? `pin:${Math.round(comment.pin.x)},${Math.round(comment.pin.y)}`
    : comment.element ? reviewElementKey(comment.element, comment.element.selector) : 'page';
  const images = commentAttachments(comment).map((attachment) => `${attachment.name}:${attachment.size}`).join('|');
  return [canonicalInspectorUrl(comment.url), comment.viewport.width, comment.viewport.height, target, comment.comment, images].join('\u0000');
}

function isValidComment(comment) {
  return comment && typeof comment === 'object'
    && typeof comment.url === 'string'
    && typeof comment.comment === 'string'
    && (!comment.attachments || (Array.isArray(comment.attachments) && comment.attachments.every((attachment) => attachment && typeof attachment.name === 'string')))
    && (comment.comment.trim() || commentAttachments(comment).length)
    && Number.isFinite(comment.viewport?.width) && Number.isFinite(comment.viewport?.height)
    && (!comment.pin || (Number.isFinite(comment.pin.x) && Number.isFinite(comment.pin.y)));
}

function saveComments() {
  // A comment on a site not seen yet this session (a preview followed a
  // link) must not overwrite the notes already stored for that site.
  new Set(comments.map((comment) => commentOrigin(comment.url))).forEach((origin) => restoreComments(origin));
  const byOrigin = new Map([...storedCommentOrigins].map((origin) => [origin, []]));
  comments.forEach((comment) => {
    const origin = commentOrigin(comment.url);
    // Edit entries are rebuilt from the stored changes (syncChangeNotes).
    if (!origin || comment.change) return;
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    byOrigin.get(origin).push(comment);
  });
  byOrigin.forEach((list, origin) => {
    storedCommentOrigins.add(origin);
    // Comments on the demo page last until Studio is closed.
    if (origin === DEMO_ORIGIN) return;
    try {
      if (list.length) localStorage.setItem(COMMENTS_STORAGE_PREFIX + origin, JSON.stringify(list));
      else localStorage.removeItem(COMMENTS_STORAGE_PREFIX + origin);
    } catch {
      // Storage full or unavailable: comments still live for this session.
    }
  });
}

function saveChanges() {
  // Changes on a site not seen yet this session must not overwrite the
  // changes already stored for that site.
  new Set([...changeLog.values()].map((change) => commentOrigin(change.url))).forEach((origin) => restoreChanges(origin));
  const byOrigin = new Map([...storedChangeOrigins].map((origin) => [origin, []]));
  changeLog.forEach((change) => {
    const origin = commentOrigin(change.url);
    if (!origin) return;
    if (!byOrigin.has(origin)) byOrigin.set(origin, []);
    byOrigin.get(origin).push(change);
  });
  byOrigin.forEach((list, origin) => {
    storedChangeOrigins.add(origin);
    // Edits on the demo page last until Studio is closed.
    if (origin === DEMO_ORIGIN) return;
    try {
      if (list.length) localStorage.setItem(CHANGES_STORAGE_PREFIX + origin, JSON.stringify(list));
      else localStorage.removeItem(CHANGES_STORAGE_PREFIX + origin);
    } catch {
      // Storage full or unavailable: changes still live for this session.
    }
  });
}

// Adds the style changes saved for a site, once per site and session. The
// previews get them back when they load.
function restoreChanges(origin = commentOrigin(targetUrl)) {
  if (!origin || storedChangeOrigins.has(origin)) return;
  storedChangeOrigins.add(origin);
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(CHANGES_STORAGE_PREFIX + origin) || '[]');
  } catch {
    return;
  }
  if (!Array.isArray(stored)) return;
  let restored = 0;
  stored.forEach((change) => {
    if (!change || typeof change.url !== 'string' || typeof change.selector !== 'string' || typeof change.property !== 'string') return;
    if (!Number.isFinite(change.viewport?.width) || !Number.isFinite(change.viewport?.height)) return;
    const key = changeKey(change);
    if (changeLog.has(key)) return;
    changeLog.set(key, change);
    restored += 1;
  });
  if (restored) syncChangeUi();
}

// Adds the comments saved for a site, once per site and session.
function restoreComments(origin = commentOrigin(targetUrl)) {
  if (!origin || storedCommentOrigins.has(origin)) return;
  storedCommentOrigins.add(origin);
  let stored = [];
  try {
    stored = JSON.parse(localStorage.getItem(COMMENTS_STORAGE_PREFIX + origin) || '[]');
  } catch {
    return;
  }
  if (!Array.isArray(stored)) return;
  const known = new Set(comments.map(commentIdentity));
  const restored = stored.filter((comment) => isValidComment(comment) && !known.has(commentIdentity(comment)));
  if (!restored.length) return;
  comments.push(...restored);
  syncChangeUi();
  if (!commentsPanel.hidden) renderComments();
  syncCommentMarkers();
  notify(`${restored.length} saved comment${restored.length === 1 ? '' : 's'} restored.`);
}

// A short display name the user typed in for a page, in place of its path.
// Purely cosmetic and local: it survives a refresh but never touches the
// real page, so the group's real path/URL still shows up on hover.
const PAGE_TITLE_STORAGE_PREFIX = 'pixelprism-page-titles:';
const storedPageTitleOrigins = new Set();
const pageTitleOverrides = new Map();

function restorePageTitles(origin) {
  if (!origin || storedPageTitleOrigins.has(origin)) return;
  storedPageTitleOrigins.add(origin);
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(PAGE_TITLE_STORAGE_PREFIX + origin) || '{}');
  } catch {
    return;
  }
  if (!stored || typeof stored !== 'object') return;
  Object.entries(stored).forEach(([url, name]) => {
    if (typeof name === 'string' && name.trim()) pageTitleOverrides.set(url, name.trim());
  });
}

function savePageTitles(origin) {
  if (!origin) return;
  storedPageTitleOrigins.add(origin);
  const entries = {};
  pageTitleOverrides.forEach((name, url) => { if (commentOrigin(url) === origin) entries[url] = name; });
  try {
    if (Object.keys(entries).length) localStorage.setItem(PAGE_TITLE_STORAGE_PREFIX + origin, JSON.stringify(entries));
    else localStorage.removeItem(PAGE_TITLE_STORAGE_PREFIX + origin);
  } catch {
    // Storage full or unavailable: the rename still lives for this session.
  }
}

function setPageTitleOverride(url, name) {
  const trimmed = (name || '').trim();
  if (trimmed) pageTitleOverrides.set(url, trimmed);
  else pageTitleOverrides.delete(url);
  savePageTitles(commentOrigin(url));
}
