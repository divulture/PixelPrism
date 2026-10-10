// The box a comment is written in, as in Figma: a click in a preview while
// Comments is open puts a pin there with the box beside it. Enter adds the
// comment to the list, and its marker stays on the spot that was clicked.

const commentComposerBox = commentsForm.querySelector('.comment-composer-box');
const commentComposerSend = commentsForm.querySelector('.comment-composer-send');
// The preview frame and the point in it (in the page's own pixels) the box
// belongs to, so it follows when the previews scroll, zoom or resize.
let commentComposerPlace = null;

function placeCommentComposer() {
  if (commentsForm.hidden || !commentComposerPlace) return;
  const { frame, point } = commentComposerPlace;
  if (!frame.isConnected) {
    closeCommentComposer();
    return;
  }
  const frameBox = frame.getBoundingClientRect();
  const scale = frame.offsetWidth ? frameBox.width / frame.offsetWidth : 1;
  const x = frameBox.left + point.x * scale;
  const y = frameBox.top + point.y * scale;
  commentsForm.style.left = `${x}px`;
  commentsForm.style.top = `${y}px`;
  // The box opens to the right of the pin, or to its left near the window's
  // edge, and moves up rather than run off the bottom.
  const { offsetWidth: width, offsetHeight: height } = commentComposerBox;
  commentsForm.classList.toggle('is-flipped', x + 32 + width > window.innerWidth - 12);
  commentComposerBox.style.top = `${Math.min(-30, window.innerHeight - 12 - y - height)}px`;
}

// Changes of the box move smoothly, never in a jump.
const COMMENT_COMPOSER_TIMING = { duration: 200, easing: 'cubic-bezier(.2, .8, .2, 1)' };
const commentComposerMotion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// The fade-out of a box being closed, cancelled if it opens again meanwhile.
let commentComposerClosing = null;

function sizeCommentInput() {
  commentInput.style.height = 'auto';
  commentInput.style.height = `${Math.min(commentInput.scrollHeight, 160)}px`;
}

// Empty, the box is one line; with text or images it opens up as Figma's
// does. The text stays where it is: the box grows to its new height and the
// buttons glide to their own row (FLIP), clipped by the box as it grows.
function setCommentComposerExpanded(expanded) {
  if (commentsForm.classList.contains('is-expanded') === expanded) return;
  const moving = [commentComposerSend, commentAttachButton];
  const before = !commentsForm.hidden && commentComposerMotion()
    ? { height: commentComposerBox.offsetHeight, spots: moving.map((node) => node.getBoundingClientRect()) }
    : null;
  commentsForm.classList.toggle('is-expanded', expanded);
  sizeCommentInput();
  if (!before) return;
  commentComposerBox.style.overflow = 'hidden';
  commentComposerBox.animate([{ height: `${before.height}px` }, { height: `${commentComposerBox.offsetHeight}px` }], COMMENT_COMPOSER_TIMING)
    .finished.catch(() => {}).finally(() => { commentComposerBox.style.overflow = ''; });
  moving.forEach((node, index) => {
    const after = node.getBoundingClientRect();
    node.animate([
      { transform: `translate(${before.spots[index].left - after.left}px, ${before.spots[index].top - after.top}px)` },
      { transform: 'none' }
    ], COMMENT_COMPOSER_TIMING);
  });
}

function syncCommentComposer() {
  const filled = Boolean(commentInput.value.trim()) || draftAttachments.length > 0;
  commentComposerSend.disabled = !filled;
  setCommentComposerExpanded(filled);
  sizeCommentInput();
  placeCommentComposer();
}

// While open, the box is placed every frame: previews scroll, zoom and
// change size in many ways, and none of them may leave it behind.
function followCommentComposer() {
  if (commentsForm.hidden) return;
  placeCommentComposer();
  requestAnimationFrame(followCommentComposer);
}

// The box grows out of the pin; opened again elsewhere, it slides there.
function openCommentComposer(frame, point) {
  const reopened = Boolean(commentComposerClosing);
  commentComposerClosing?.cancel();
  commentComposerClosing = null;
  const wasHidden = commentsForm.hidden;
  const from = !wasHidden && !reopened && commentComposerPlace ? commentsForm.getBoundingClientRect() : null;
  commentComposerPlace = { frame, point };
  commentsForm.hidden = false;
  syncCommentComposer();
  commentInput.focus({ preventScroll: true });
  if (wasHidden) requestAnimationFrame(followCommentComposer);
  if (!commentComposerMotion()) return;
  if (wasHidden) {
    commentsForm.querySelector('.comment-composer-pin').animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], COMMENT_COMPOSER_TIMING);
    commentComposerBox.style.transformOrigin = commentsForm.classList.contains('is-flipped') ? 'right center' : 'left center';
    commentComposerBox.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], COMMENT_COMPOSER_TIMING);
  } else if (from) {
    const to = commentsForm.getBoundingClientRect();
    commentsForm.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'none' }], COMMENT_COMPOSER_TIMING);
  }
}

// The text and images written so far stay for the next spot clicked; only
// a comment that was added clears them (addComment).
function closeCommentComposer({ clearSelection = true } = {}) {
  if (commentsForm.hidden || commentComposerClosing) return;
  commentComposerPlace = null;
  if (clearSelection) {
    commentSelection = null;
    clearInspectorSelections();
    if (!commentsPanel.hidden) renderComments();
  }
  if (!commentComposerMotion()) {
    commentsForm.hidden = true;
    return;
  }
  // Fading out, it no longer takes clicks.
  commentsForm.style.pointerEvents = 'none';
  commentComposerClosing = commentsForm.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.96)' }], { duration: 120, easing: 'ease-in' });
  commentComposerClosing.finished.then(() => {
    commentsForm.hidden = true;
    commentComposerClosing = null;
  }, () => {}).finally(() => { commentsForm.style.pointerEvents = ''; });
}

commentInput.addEventListener('input', () => syncCommentComposer());
commentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeCommentComposer();
    return;
  }
  // Enter adds the comment, Shift+Enter starts a new line.
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!commentComposerSend.disabled) commentsForm.requestSubmit();
  }
});
// A press anywhere else in Studio puts the box away; a click in a preview
// opens it again at the new spot.
document.addEventListener('pointerdown', (event) => {
  if (!commentsForm.hidden && !commentsForm.contains(event.target) && !imageViewer.contains(event.target)) closeCommentComposer();
}, true);
commentsForm.addEventListener('paste', (event) => {
  const files = imageFilesFrom(event.clipboardData);
  if (!files.length) return;
  event.preventDefault();
  attachToDraft(files);
});
commentsForm.addEventListener('dragover', (event) => {
  if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  commentsForm.classList.add('is-drop-target');
});
commentsForm.addEventListener('dragleave', (event) => {
  if (!commentsForm.contains(event.relatedTarget)) commentsForm.classList.remove('is-drop-target');
});
commentsForm.addEventListener('drop', (event) => {
  commentsForm.classList.remove('is-drop-target');
  if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
  event.preventDefault();
  const files = imageFilesFrom(event.dataTransfer);
  if (files.length) attachToDraft(files);
});
