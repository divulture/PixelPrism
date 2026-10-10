// Images attached to comments, view snapshots in IndexedDB, and the image viewer.

// Images attached to comments. A comment keeps a small record per image
// ({ id, name, type, size, width, height }); the file itself lives in
// IndexedDB, since localStorage only fits a few screenshots.
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ATTACHMENTS_PER_COMMENT = 10;
const attachmentUrls = new Map();
const attachmentLoads = new Map();
// Images attached to the comment being written, before it is added.
let draftAttachments = [];
// Stored this session: never pruned while a comment may be about to take them.
const sessionAttachmentIds = new Set();
// A database with one object store; the store function runs `action` on it
// in a transaction and resolves with the request's result.
function indexedDbStore(name, storeName) {
  let dbPromise = null;
  return (mode, action) => {
    dbPromise ||= new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
    return dbPromise.then((db) => new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  };
}

const attachmentStore = indexedDbStore('pixelprism-attachments', 'images');

function newAttachmentId() {
  return `image-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function commentAttachments(comment) {
  return Array.isArray(comment?.attachments) ? comment.attachments : [];
}

// What a comment says in one line, also when it is only images.
function commentSummary(comment) {
  const count = commentAttachments(comment).length;
  return comment.comment || (count === 1 ? 'Image' : `${count} images`);
}

function loadAttachmentUrl(id) {
  if (attachmentUrls.has(id)) return Promise.resolve(attachmentUrls.get(id));
  if (!attachmentLoads.has(id)) {
    attachmentLoads.set(id, attachmentStore('readonly', (store) => store.get(id))
      .then((blob) => {
        if (blob instanceof Blob) attachmentUrls.set(id, URL.createObjectURL(blob));
        return attachmentUrls.get(id) || '';
      })
      .catch(() => '')
      .finally(() => attachmentLoads.delete(id)));
  }
  return attachmentLoads.get(id);
}

function attachmentBlob(id) {
  return attachmentStore('readonly', (store) => store.get(id)).then((blob) => (blob instanceof Blob ? blob : null), () => null);
}

// Stores picked, pasted or dropped images; returns the records of the ones kept.
async function storeImageFiles(files, room) {
  const skipped = { type: 0, size: 0, count: 0, failed: 0 };
  const added = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) { skipped.type += 1; continue; }
    if (added.length >= room) { skipped.count += 1; continue; }
    if (file.size > ATTACHMENT_MAX_BYTES) { skipped.size += 1; continue; }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      skipped.type += 1;
      continue;
    }
    const attachment = {
      id: newAttachmentId(),
      name: file.name || 'image.png',
      type: file.type,
      size: file.size,
      width: image.naturalWidth,
      height: image.naturalHeight
    };
    sessionAttachmentIds.add(attachment.id);
    try {
      await attachmentStore('readwrite', (store) => store.put(file, attachment.id));
    } catch {
      URL.revokeObjectURL(url);
      skipped.failed += 1;
      continue;
    }
    attachmentUrls.set(attachment.id, url);
    added.push(attachment);
  }
  const notes = [];
  if (skipped.type) notes.push(`${skipped.type} not an image`);
  if (skipped.size) notes.push(`${skipped.size} larger than ${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`);
  if (skipped.count) notes.push(`${skipped.count} over the limit of ${ATTACHMENTS_PER_COMMENT} per comment`);
  if (skipped.failed) notes.push(`${skipped.failed} could not be stored`);
  if (notes.length) notify(`Some files were not attached: ${notes.join(', ')}.`, 'error');
  return added;
}

function forgetAttachments(attachments) {
  const ids = attachments.map((attachment) => attachment.id).filter(Boolean);
  if (!ids.length) return;
  ids.forEach((id) => {
    const url = attachmentUrls.get(id);
    if (url) URL.revokeObjectURL(url);
    attachmentUrls.delete(id);
  });
  attachmentStore('readwrite', (store) => ids.forEach((id) => store.delete(id))).catch(() => { /* Pruned on the next start. */ });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// The HTML review carries its images inline, so it stays one file.
async function embeddedAttachments(attachments) {
  const embedded = await Promise.all(attachments.map(async ({ id, ...details }) => {
    const blob = await attachmentBlob(id);
    return blob ? { ...details, src: await blobToDataUrl(blob) } : null;
  }));
  return embedded.filter(Boolean);
}

// Images of an imported review are stored again under new ids.
async function importedAttachments(sources) {
  const stored = await Promise.all(sources.map(async (source) => {
    if (typeof source?.src !== 'string' || !source.src.startsWith('data:image/')) return null;
    try {
      const blob = await (await fetch(source.src)).blob();
      const attachment = {
        id: newAttachmentId(),
        name: String(source.name || 'image.png'),
        type: blob.type,
        size: blob.size,
        width: Math.round(Number(source.width) || 0),
        height: Math.round(Number(source.height) || 0)
      };
      sessionAttachmentIds.add(attachment.id);
      await attachmentStore('readwrite', (store) => store.put(blob, attachment.id));
      return attachment;
    } catch {
      return null;
    }
  }));
  return stored.filter(Boolean);
}

// Drops stored images no saved comment refers to: drafts of a closed studio,
// or images of comments removed while storage was unavailable.
async function pruneAttachments() {
  let keys;
  try {
    keys = await attachmentStore('readonly', (store) => store.getAllKeys());
  } catch {
    return;
  }
  if (!keys?.length) return;
  const stored = storedComments();
  // Unreadable storage: better to keep every image than lose one in use.
  if (!stored) return;
  const used = new Set([...sessionAttachmentIds, ...[...comments, ...stored, { attachments: draftAttachments }].flatMap(commentAttachments).map((attachment) => attachment.id)]);
  deleteStaleKeys(attachmentStore, keys, used);
}

// Every comment kept for any site, or null when the storage cannot be read.
function storedComments() {
  try {
    const all = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(COMMENTS_STORAGE_PREFIX)) continue;
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(stored)) all.push(...stored);
    }
    return all;
  } catch {
    return null;
  }
}

// Another studio tab may hold drafts not saved anywhere yet, so only
// records more than a day old (the id starts with its time) are dropped.
function deleteStaleKeys(store, keys, used) {
  const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
  const stale = keys.filter((key) => !used.has(key) && parseInt(String(key).split('-')[1], 36) < dayAgo);
  if (stale.length) store('readwrite', (objects) => stale.forEach((key) => objects.delete(key))).catch(() => {});
}

// Copies of the views comments were left in (pageSnapshot in inspector/snapshot.js),
// which the HTML review captures instead of opening the view again. A copy
// holds a whole page, so it lives in IndexedDB; a comment keeps its id, and
// comments left on one view share it.
const viewSnapshotStore = indexedDbStore('pixelprism-snapshots', 'views');
const sessionSnapshotIds = new Set();

function storeViewSnapshot(snapshot) {
  if (typeof snapshot?.id !== 'string' || typeof snapshot.html !== 'string' || sessionSnapshotIds.has(snapshot.id)) return;
  sessionSnapshotIds.add(snapshot.id);
  viewSnapshotStore('readwrite', (store) => store.put(snapshot, snapshot.id)).catch(() => sessionSnapshotIds.delete(snapshot.id));
}

function loadViewSnapshot(id) {
  return viewSnapshotStore('readonly', (store) => store.get(id)).then((snapshot) => (typeof snapshot?.html === 'string' ? snapshot : null), () => null);
}

async function pruneViewSnapshots() {
  let keys;
  try {
    keys = await viewSnapshotStore('readonly', (store) => store.getAllKeys());
  } catch {
    return;
  }
  const stored = storedComments();
  if (!keys?.length || !stored) return;
  deleteStaleKeys(viewSnapshotStore, keys, new Set([...sessionSnapshotIds, ...[...comments, ...stored].map((comment) => comment.snapshot).filter(Boolean)]));
}

// A row of image tiles. Clicking a tile opens the image; the cross removes it.
function renderAttachmentTiles(attachments, { removable = false } = {}) {
  const list = document.createElement('div');
  list.className = 'comment-attachments';
  attachments.forEach((attachment, index) => {
    const tile = document.createElement('div');
    tile.className = 'comment-attachment';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'comment-attachment-open';
    open.dataset.action = 'open-image';
    open.dataset.index = String(index);
    open.title = attachment.name;
    open.setAttribute('aria-label', `Open ${attachment.name}`);
    const image = document.createElement('img');
    image.alt = '';
    image.draggable = false;
    const url = attachmentUrls.get(attachment.id);
    if (url) image.src = url;
    else loadAttachmentUrl(attachment.id).then((loaded) => {
      if (loaded) image.src = loaded;
      else tile.classList.add('is-missing');
    });
    open.append(image);
    tile.append(open);
    if (removable) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'comment-attachment-remove';
      remove.dataset.action = 'remove-image';
      remove.dataset.index = String(index);
      remove.title = 'Remove image';
      remove.setAttribute('aria-label', `Remove ${attachment.name}`);
      remove.innerHTML = window.phosphorIcon('x');
      tile.append(remove);
    }
    list.append(tile);
  });
  return list;
}

function renderDraftAttachments() {
  commentDraftAttachments.hidden = !draftAttachments.length;
  commentDraftAttachments.replaceChildren(...(draftAttachments.length ? renderAttachmentTiles(draftAttachments, { removable: true }).childNodes : []));
  syncCommentComposer();
}

async function attachToDraft(files) {
  const added = await storeImageFiles(files, ATTACHMENTS_PER_COMMENT - draftAttachments.length);
  if (!added.length) return;
  draftAttachments = [...draftAttachments, ...added];
  renderDraftAttachments();
}

async function attachToComment(id, files) {
  const comment = commentById(id);
  if (!comment) return;
  const added = await storeImageFiles(files, ATTACHMENTS_PER_COMMENT - commentAttachments(comment).length);
  // The comment may have been deleted while the files were read.
  if (!added.length || !comments.includes(comment)) {
    forgetAttachments(added);
    return;
  }
  comment.attachments = [...commentAttachments(comment), ...added];
  saveComments();
  renderComments();
  syncCommentMarkers();
  notify(`${added.length === 1 ? 'Image' : `${added.length} images`} attached to comment ${commentNumber(comment)}.`, 'success');
}

function removeCommentAttachment(id, index) {
  const comment = commentById(id);
  const attachments = commentAttachments(comment);
  if (!attachments[index]) return;
  const [removed] = attachments.splice(index, 1);
  if (!attachments.length) delete comment.attachments;
  forgetAttachments([removed]);
  saveComments();
  renderComments();
  syncCommentMarkers();
  notify(`Image removed from comment ${commentNumber(comment)}.`);
}

function imageFilesFrom(dataTransfer) {
  return [...(dataTransfer?.files || [])].filter((file) => file.type.startsWith('image/'));
}

// Full-size preview of a comment's images, with arrows between them.
let imageViewerItems = [];
let imageViewerIndex = 0;

function showImageViewerItem(index) {
  imageViewerIndex = (index + imageViewerItems.length) % imageViewerItems.length;
  const attachment = imageViewerItems[imageViewerIndex];
  imageViewerImage.removeAttribute('src');
  imageViewerImage.alt = attachment.name;
  loadAttachmentUrl(attachment.id).then((url) => {
    if (imageViewerItems[imageViewerIndex] !== attachment) return;
    if (url) imageViewerImage.src = url;
  });
  const size = attachment.width && attachment.height ? ` · ${attachment.width} × ${attachment.height}` : '';
  const position = imageViewerItems.length > 1 ? ` · ${imageViewerIndex + 1} / ${imageViewerItems.length}` : '';
  imageViewerCaption.textContent = `${attachment.name}${size}${position}`;
  imageViewerPrev.hidden = imageViewerNext.hidden = imageViewerItems.length < 2;
}

function openImageViewer(attachments, index) {
  if (!attachments[index]) return;
  imageViewerItems = attachments.slice();
  showImageViewerItem(index);
  if (!imageViewer.open) imageViewer.showModal();
}
