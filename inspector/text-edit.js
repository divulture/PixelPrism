// Editing text in place: in Inspector mode a double click on text makes it
// editable right in the page. Enter (or a click elsewhere) keeps the new
// text, Escape puts the old one back. The edit goes to Studio as a change of
// the element's "text", and is the same at every width.

// Elements whose text was edited, with their text before the first edit.
const editedTexts = new Map();
let textEditing = null;

const isTextEditTarget = (node) => Boolean(textEditing && node instanceof Node && textEditing.element.contains(node));
// Space typed in text inside a button clicks the button: a click with no
// pointer (detail 0) around the edited text is part of the typing.
const isTextEditKeyClick = (event) => Boolean(textEditing && event.detail === 0 && event.target instanceof Node && event.target.contains(textEditing.element));

// Effects that animate text letter by letter (GSAP SplitText, Splitting.js,
// rolling links) split it into one element per letter, often inside one
// element per word and per line, with the spaces left between the words.
// A double click on a letter, or on any of those wrappers, edits the whole
// label: up through the wrappers whose text is all in such letters, to the
// first link, button, heading, paragraph or other block of text.
const TEXT_BLOCK = 'a, button, label, summary, [role], h1, h2, h3, h4, h5, h6, p, li, dt, dd, figcaption, blockquote, td, th, caption, legend';
const isLetter = (node) => node instanceof HTMLElement && !node.children.length && node.textContent.length <= 2;
const isSplitText = (element) => {
  if (element.querySelector('img, svg, video, canvas, iframe, input, textarea, select')) return false;
  let letters = 0;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue.trim()) continue;
    if (node.parentElement === element || !isLetter(node.parentElement)) return false;
    letters += 1;
  }
  return letters > 2;
};
const textEditLabel = (letter) => {
  let label = letter;
  while ((label === letter || !label.matches(TEXT_BLOCK)) && label.parentElement && label.parentElement !== document.body && isSplitText(label.parentElement)) label = label.parentElement;
  return label;
};

// What a double click edits: an element that holds only text; text beside
// child elements is wrapped in a span first, as an edit of its styles does.
const textEditElementAt = (target, x, y) => {
  if (!(target instanceof HTMLElement) || target.closest('[data-viewport-parade-overlay]')) return null;
  if (target.matches('input, textarea, select, option, img, video, canvas, iframe, svg, svg *')) return null;
  const textNode = textNodeAt(target, x, y);
  if (textNode) return wrapTextNode(textNode);
  if (!target.textContent.trim()) {
    // An empty layer over text (a mask, a decoration) passes the double
    // click to the text under it.
    const under = document.elementsFromPoint(x, y).find((element) => (
      element !== target && !element.contains(target) && element.textContent.trim() && !element.closest('[data-viewport-parade-overlay]')
    ));
    return under ? textEditElementAt(under, x, y) : null;
  }
  if (!target.children.length) return isLetter(target) ? textEditLabel(target) : target;
  // A word or line of split text, or the element it was split in.
  if (!isSplitText(target)) return null;
  const letter = [...target.querySelectorAll('*')].find((element) => isLetter(element) && element.textContent.trim());
  const label = textEditLabel(letter);
  return label.contains(target) ? label : null;
};

// The change of an element's text, as Studio records it.
const textChangeFor = (element, from, to) => ({
  url: location.href,
  selector: isTextWrapper(element) ? textWrapperSelector(element.dataset[TEXT_WRAPPER]) : stableSelectorFor(element),
  property: 'text',
  from,
  to,
  viewport: { width: window.innerWidth, height: window.innerHeight },
  route: `${location.pathname}${location.search}${location.hash}`,
  element: elementContextFor(element),
  // Found again by the text it had in the source.
  ...(isTextWrapper(element) ? { wrapText: { id: element.dataset[TEXT_WRAPPER], text: truncate(from, 240), parent: stableSelectorFor(element.parentElement), parentDomPath: domPathFor(element.parentElement) } } : {}),
  steps: [...(element === selectedElement ? selectionViewSteps : viewStepsFor(element)), ...stateStepsFor(element)]
});

const reportTextChange = (element, from, to) => {
  window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-style-change', change: textChangeFor(element, from, to) }, extensionOrigin);
};

// Text is the same at every width, so the other previews show it as it is
// typed; only the finished edit is recorded.
const previewTextEdit = (text) => {
  textEditing.previewed = true;
  window.parent.postMessage({ source: 'viewport-parade', type: 'inspector-text-preview', change: { ...textEditing.change, to: text } }, extensionOrigin);
};
// Page scripts can change text while it is typed: a translation script puts
// back the text it remembers for a node, a letter effect splits its label
// again and trims it. So the edit keeps its own copy of the text. Each
// keystroke changes the copy and writes it into a new text node, one such a
// script has not seen, with the caret where it belongs in the text.
const placeCaret = (element, offset) => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let rest = offset;
  while (walker.nextNode()) {
    if (rest <= walker.currentNode.length) {
      window.getSelection()?.collapse(walker.currentNode, rest);
      return;
    }
    rest -= walker.currentNode.length;
  }
  window.getSelection()?.collapse(element, element.childNodes.length);
};
const textOffset = (element, node, offset) => {
  const range = document.createRange();
  range.setStart(element, 0);
  range.setEnd(node, offset);
  return range.toString().length;
};
// The selection as offsets in the edit's text. Where the page shows less of
// it (a trimmed trailing space), the end of what it shows is the text's end.
const selectionInText = () => {
  const { element, text } = textEditing;
  const selection = window.getSelection();
  const shown = element.textContent.length;
  const at = (node, offset) => {
    if (!node || !element.contains(node)) return text.length;
    const value = textOffset(element, node, offset);
    return value >= shown ? text.length : value;
  };
  const anchor = at(selection?.anchorNode, selection?.anchorOffset);
  const focus = at(selection?.focusNode, selection?.focusOffset);
  return [Math.min(anchor, focus), Math.max(anchor, focus)];
};
const writeTypedText = (text, caret) => {
  Object.assign(textEditing, { text, caret, typing: false });
  textEditing.element.textContent = text;
  placeCaret(textEditing.element, caret);
  // The field grows with the text.
  showTextEditField(textEditing.element);
  previewTextEdit(text);
};
const INSERTS = new Set(['insertText', 'insertReplacementText', 'insertFromPaste', 'insertFromDrop']);
const onTextEditBeforeInput = (event) => {
  const { text } = textEditing;
  const [start, end] = selectionInText();
  const type = event.inputType;
  let edit = null;
  if (INSERTS.has(type)) edit = [start, end, String(event.data ?? event.dataTransfer?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' ')];
  else if (type.startsWith('delete') && start !== end) edit = [start, end, ''];
  // One character, not half of an emoji.
  else if (type === 'deleteContentBackward') edit = [start - (Array.from(text.slice(0, start)).pop()?.length || 0), end, ''];
  else if (type === 'deleteContentForward') edit = [start, end + (Array.from(text.slice(end))[0]?.length || 0), ''];
  if (!edit) {
    // Word deletion, undo, an input method: the browser edits, input takes it.
    textEditing.typing = true;
    return;
  }
  event.preventDefault();
  const [from, to, inserted] = edit;
  writeTypedText(text.slice(0, from) + inserted + text.slice(to), from + inserted.length);
};
const onTextEditInput = (event) => {
  // An input method is still composing the character; it settles at compositionend.
  if (event.isComposing) return;
  const { element } = textEditing;
  const selection = window.getSelection();
  const caret = selection?.focusNode && element.contains(selection.focusNode)
    ? textOffset(element, selection.focusNode, selection.focusOffset)
    : element.textContent.length;
  writeTypedText(element.textContent, caret);
};
// A page script that rebuilds the content between keystrokes leaves the
// caret elsewhere; it goes back to its place in the text.
const keepCaretThroughRebuilds = () => new MutationObserver(() => {
  if (!textEditing || textEditing.typing || textEditing.caret === undefined || document.activeElement !== textEditing.element) return;
  placeCaret(textEditing.element, textEditing.caret);
});

// While its text is edited the element looks like a Studio text field
// whatever the page's colours: dark text in a white box with the focus
// colour's ring, in place of the selection overlays drawn over the letters.
// Shadows widen the fill without moving the layout. The ring is also drawn
// over the page, so a container that clips its content cannot cut it.
const TEXT_EDITING = 'data-viewport-parade-text-editing';
const textEditStyle = document.createElement('style');
// Split text is often shown letter by letter from a hidden container, and a
// hidden element takes no focus: the field is always visible.
textEditStyle.textContent = `[${TEXT_EDITING}] { visibility: visible !important; opacity: 1 !important; background: #ffffff !important; color: #18181b !important; -webkit-text-fill-color: #18181b !important; text-shadow: none !important; box-shadow: 0 0 0 4px #ffffff, 0 0 0 6px #2563eb !important; outline: none !important; }`;
const showTextEditField = (element) => {
  [marginOverlay, paddingOverlay, gutterLayer].forEach((overlay) => { overlay.style.display = 'none'; });
  hideSpacing();
  const box = element.getBoundingClientRect();
  contentOverlay.style.border = '2px solid #2563eb';
  contentOverlay.style.background = 'transparent';
  setRect(contentOverlay, box.left - 6, box.top - 6, box.width + 12, box.height + 12);
};

const onTextEditKey = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    finishTextEdit(true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishTextEdit(false);
  }
  // The page hears none of the typing (its own shortcuts, a button's Space).
  event.stopImmediatePropagation();
};

const startTextEdit = async (element) => {
  if (textEditing) finishTextEdit(true);
  await selectLayerElement(element, { exact: true });
  const before = element.textContent;
  // Taken before the element turns editable, so its attributes stay out of it.
  const change = textChangeFor(element, editedTexts.has(element) ? editedTexts.get(element) : before, before);
  textEditing = { element, before, text: before, change, previewed: false };
  element.setAttribute(TEXT_EDITING, '');
  showTextEditField(element);
  element.setAttribute('contenteditable', 'plaintext-only');
  element.addEventListener('keydown', onTextEditKey, true);
  element.addEventListener('beforeinput', onTextEditBeforeInput);
  element.addEventListener('input', onTextEditInput);
  element.addEventListener('compositionend', onTextEditInput);
  textEditing.rebuilds = keepCaretThroughRebuilds();
  textEditing.rebuilds.observe(element, { childList: true, characterData: true, subtree: true });
  element.focus({ preventScroll: true });
  // All of it is selected, so typing replaces it.
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

const finishTextEdit = (keep) => {
  if (!textEditing) return;
  const { element, before, text, previewed, rebuilds } = textEditing;
  rebuilds?.disconnect();
  if (!keep && previewed) previewTextEdit(before);
  textEditing = null;
  element.removeEventListener('keydown', onTextEditKey, true);
  element.removeEventListener('beforeinput', onTextEditBeforeInput);
  element.removeEventListener('input', onTextEditInput);
  element.removeEventListener('compositionend', onTextEditInput);
  element.removeAttribute('contenteditable');
  element.removeAttribute(TEXT_EDITING);
  element.blur();
  window.getSelection()?.removeAllRanges();
  const after = keep ? text : before;
  if (element.textContent !== after) element.textContent = after;
  if (keep && after !== before) {
    const original = editedTexts.has(element) ? editedTexts.get(element) : before;
    if (after === original) editedTexts.delete(element);
    else editedTexts.set(element, original);
    // Back to the original text: Studio drops the change.
    reportTextChange(element, original, after);
  }
  if (selectedElement) show(selectedElement, 'size');
};

// A recorded text change, from another preview or after a reload. Wrapped
// text is wrapped again by the text it has in the source.
const textChangeElement = ({ selector, element, wrapText }) => {
  if (wrapText && typeof wrapText === 'object') {
    rewrapText(wrapText);
    return document.querySelector(textWrapperSelector(wrapText.id));
  }
  return elementForChange({ selector, element });
};

const applyRecordedText = (change) => {
  const element = textChangeElement(change);
  if (!element || element === textEditing?.element) return;
  // The page's own text: after the agent changed the source it already is
  // the new one, and the change counts as done (reconcile.js).
  if (!editedTexts.has(element)) editedTexts.set(element, element.textContent);
  element.textContent = String(change.value ?? '');
  if (element.textContent === editedTexts.get(element)) editedTexts.delete(element);
};

const resetRecordedText = (change) => {
  const element = textChangeElement(change);
  if (!element) return;
  const original = editedTexts.has(element) ? editedTexts.get(element) : change.from;
  if (typeof original === 'string') element.textContent = original;
  editedTexts.delete(element);
};

// An image's alt text, edited in the Inspector. Like text it is the page's
// content: the same at every width, and found again by its element.
// The page's own alt of each image changed here (null: it had none).
const editedAlts = new Map();
const pageAltOf = (element) => (editedAlts.has(element) ? editedAlts.get(element) : element.getAttribute('alt'));
const setAlt = (element, value) => {
  if (!editedAlts.has(element)) editedAlts.set(element, element.getAttribute('alt'));
  element.setAttribute('alt', value);
  if (value === editedAlts.get(element)) editedAlts.delete(element);
};

const applyAltEdit = (value) => {
  const element = selectedElement;
  if (!(element instanceof HTMLImageElement)) return;
  const from = element.getAttribute('alt') ?? '';
  if (value === from) return;
  setAlt(element, value);
  window.parent.postMessage({
    source: 'viewport-parade',
    type: 'inspector-style-change',
    change: {
      url: location.href,
      selector: stableSelectorFor(element),
      property: 'alt',
      from,
      to: value,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      route: `${location.pathname}${location.search}${location.hash}`,
      element: elementContextFor(element),
      steps: [...(element === selectedElement ? selectionViewSteps : viewStepsFor(element)), ...stateStepsFor(element)]
    }
  }, extensionOrigin);
};

const applyRecordedAlt = (change) => {
  const element = elementForChange(change);
  if (element instanceof HTMLImageElement) setAlt(element, String(change.value ?? ''));
};

const resetRecordedAlt = (change) => {
  const element = elementForChange(change);
  if (!(element instanceof HTMLImageElement)) return;
  const original = editedAlts.has(element) ? editedAlts.get(element) : change.from;
  if (original === null) element.removeAttribute('alt');
  else if (typeof original === 'string') element.setAttribute('alt', original);
  editedAlts.delete(element);
};

// Puts this part into the page; install() calls it once, on Studio's first request.
const installTextEditing = () => {
  textEditStyle.dataset.viewportParadeOverlay = '';
  document.documentElement.append(textEditStyle);
  // Leaving the Inspector keeps what was typed.
  window.addEventListener('message', (event) => {
    if (isStudioMessage(event, 'toggle-inspector') && !event.data.enabled) finishTextEdit(true);
  });
};
