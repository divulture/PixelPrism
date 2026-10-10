// Rulers and guides, the layout grid and the grid overlay.

function setContrastState(card, enabled) {
  const button = card.querySelector('.contrast-button');
  button.setAttribute('aria-pressed', String(enabled));
  button.setAttribute('aria-label', enabled ? 'Disable monochrome layout mode' : 'Enable monochrome layout mode');
  button.title = enabled ? 'Disable monochrome layout mode' : 'Monochrome layout mode';
}

function isLayoutContrastOn(card) {
  return card.querySelector('.contrast-button').getAttribute('aria-pressed') === 'true';
}

function toggleLayoutContrast(card, enabled = !isLayoutContrastOn(card)) {
  if (!hasExtensionRuntime) {
    notify('Visual editing is available in the PixelPrism Chrome extension, not this Codex preview.', 'error');
    return;
  }
  const iframe = card.querySelector('iframe');
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage({ source: 'viewport-parade', type: 'toggle-layout-contrast', enabled }, '*');
  setContrastState(card, enabled);
  speak(enabled ? 'Layout grid enabled.' : 'Layout grid disabled.');
}

// Rulers and guides belong to one preview card and live only in the studio:
// they are drawn over the preview, never inside the page, and stay out of
// the reports and reviews. A guide keeps its position in page pixels, so it
// moves with the page when the page scrolls.
const RULER_SIZE = 20;
const RULER_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

function rulerState(card) {
  card.rulers ||= { shown: false, guides: [], scrollX: 0, scrollY: 0, activeGuide: null };
  return card.rulers;
}

function rulerOffset(card) {
  return card.rulers?.shown ? RULER_SIZE : 0;
}

function ensureRulerLayer(card) {
  let layer = card.querySelector('.ruler-layer');
  if (layer) return layer;
  layer = document.createElement('div');
  layer.className = 'ruler-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = '<div class="ruler-guides"></div><canvas class="ruler ruler-top"></canvas><canvas class="ruler ruler-left"></canvas><span class="ruler-corner"></span>';
  card.querySelector('.viewport-frame').append(layer);
  // A drag from the top ruler pulls out a horizontal guide, from the left
  // ruler a vertical one; every drag adds a new guide.
  layer.querySelector('.ruler-top').addEventListener('pointerdown', (event) => pullGuide(card, 'y', event));
  layer.querySelector('.ruler-left').addEventListener('pointerdown', (event) => pullGuide(card, 'x', event));
  layer.querySelector('.ruler-guides').addEventListener('pointerdown', (event) => {
    const element = event.target.closest('.ruler-guide');
    const guide = element && rulerState(card).guides[Number(element.dataset.index)];
    if (guide) dragGuide(card, guide, event);
  });
  return layer;
}

function pullGuide(card, axis, event) {
  if (event.button !== 0) return;
  const guide = { axis, position: 0 };
  rulerState(card).guides.push(guide);
  dragGuide(card, guide, event);
}

// The guide follows the pointer in whole page pixels. Dropped back on its
// ruler, it is removed.
function dragGuide(card, guide, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  const state = rulerState(card);
  const target = event.currentTarget;
  const scale = Number(card.dataset.scale) || zoom;
  const area = card.querySelector('.ruler-guides');
  const move = (pointer) => {
    const rect = area.getBoundingClientRect();
    const vertical = guide.axis === 'x';
    const offset = vertical ? pointer.clientX - rect.left : pointer.clientY - rect.top;
    const length = vertical ? rect.width : rect.height;
    guide.overRuler = offset < 0;
    const scroll = vertical ? state.scrollX : state.scrollY;
    guide.position = Math.round(scroll + Math.min(Math.max(offset, 0), length) / scale);
    renderRulers(card);
  };
  const finish = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', finish);
    target.removeEventListener('pointercancel', finish);
    document.body.classList.remove('is-dragging-guide', `is-dragging-guide-${guide.axis}`);
    if (guide.overRuler) state.guides.splice(state.guides.indexOf(guide), 1);
    delete guide.overRuler;
    state.activeGuide = null;
    renderRulers(card);
  };
  state.activeGuide = guide;
  document.body.classList.add('is-dragging-guide', `is-dragging-guide-${guide.axis}`);
  target.setPointerCapture(event.pointerId);
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);
  move(event);
}

function rulerStep(scale) {
  return RULER_STEPS.find((step) => step * scale >= 50) || RULER_STEPS.at(-1);
}

function drawRuler(canvas, { vertical, length, scroll, scale, guides, active }) {
  const ratio = window.devicePixelRatio || 1;
  const width = vertical ? RULER_SIZE : length;
  const height = vertical ? length : RULER_SIZE;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  // Read on the ruler itself: the guide colours are set on its card.
  const theme = getComputedStyle(canvas);
  const color = (token) => theme.getPropertyValue(token).trim();
  // Compact previews: the ruler is a strip with an edge towards the page.
  if (document.documentElement.dataset.viewports === 'compact') {
    context.fillStyle = color('--line');
    if (vertical) context.fillRect(RULER_SIZE - 1, 0, 1, length);
    else context.fillRect(0, RULER_SIZE - 1, length, 1);
  }
  context.font = '500 9px Inter, ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const label = (text, at, color) => {
    context.fillStyle = color;
    if (vertical) {
      context.save();
      context.translate(8, at);
      context.rotate(-Math.PI / 2);
      context.fillText(text, 0, 0);
      context.restore();
    } else {
      context.fillText(text, at, 8);
    }
  };
  const step = rulerStep(scale);
  for (let value = Math.floor(scroll / step) * step; (value - scroll) * scale <= length; value += step) {
    const at = Math.round((value - scroll) * scale);
    if (at < 0) continue;
    context.fillStyle = color('--fg-a1a1aa');
    if (vertical) context.fillRect(RULER_SIZE - 5, at, 4, 1);
    else context.fillRect(at, RULER_SIZE - 5, 1, 4);
    // A number cut by the ruler's start is left out; its tick stays.
    const half = context.measureText(String(value)).width / 2;
    if (at - half >= 0 && at + half <= length) label(String(value), at + 0.5, color('--muted'));
  }
  // Each guide's value stays on its ruler, over the numbers it covers; the
  // dragged one is brighter.
  guides.forEach((guide) => {
    const at = Math.round((guide.position - scroll) * scale) + 0.5;
    if (at < 0 || at > length) return;
    const text = String(guide.position);
    const size = Math.ceil(context.measureText(text).width) + 8;
    context.fillStyle = color(guide === active ? '--guide-active' : '--guide');
    context.beginPath();
    if (vertical) context.roundRect(2, at - size / 2, RULER_SIZE - 5, size, 4);
    else context.roundRect(at - size / 2, 2, size, RULER_SIZE - 5, 4);
    context.fill();
    label(text, at, '#fff');
  });
}

function renderRulers(card) {
  const state = card.rulers;
  if (!state?.shown) return;
  const layer = ensureRulerLayer(card);
  const scale = Number(card.dataset.scale) || zoom;
  const area = layer.querySelector('.ruler-guides');
  const width = area.clientWidth;
  const height = area.clientHeight;
  const active = state.activeGuide && !state.activeGuide.overRuler ? state.activeGuide : null;
  const shown = state.guides.filter((guide) => !guide.overRuler);
  drawRuler(layer.querySelector('.ruler-top'), {
    vertical: false, length: width, scroll: state.scrollX, scale, guides: shown.filter((guide) => guide.axis === 'x'), active
  });
  drawRuler(layer.querySelector('.ruler-left'), {
    vertical: true, length: height, scroll: state.scrollY, scale, guides: shown.filter((guide) => guide.axis === 'y'), active
  });
  const elements = [...area.children];
  state.guides.forEach((guide, index) => {
    let element = elements[index];
    if (!element) {
      element = document.createElement('div');
      area.append(element);
    }
    const vertical = guide.axis === 'x';
    const at = (guide.position - (vertical ? state.scrollX : state.scrollY)) * scale;
    element.className = `ruler-guide is-${guide.axis}`;
    element.classList.toggle('is-dragging', guide === state.activeGuide);
    element.dataset.index = String(index);
    element.hidden = guide.overRuler || at < 0 || at > (vertical ? width : height);
    element.style.left = vertical ? `${Math.round(at)}px` : '';
    element.style.top = vertical ? '' : `${Math.round(at)}px`;
  });
  elements.slice(state.guides.length).forEach((element) => element.remove());
}

// Hiding the rulers hides their guides too; showing them brings both back.
function setRulersShown(card, shown) {
  const state = rulerState(card);
  state.shown = shown;
  card.classList.toggle('has-rulers', shown);
  card.querySelector('.ruler-button').setAttribute('aria-pressed', String(shown));
  if (shown) ensureRulerLayer(card);
  card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'watch-ruler-scroll', enabled: shown }, '*');
  const width = Number(card.dataset.viewportWidth);
  const height = Number(card.dataset.viewportHeight);
  updateCardDimensions(card, DEVICES[card.dataset.device], width, height, Number(card.dataset.scale) || zoom);
}

// Shift+G turns off every shown layout grid, or turns them all on when none
// is shown.
function toggleAllLayoutContrast() {
  const cards = [...grid.querySelectorAll('.viewport-card')];
  const enabled = !cards.some(isLayoutContrastOn);
  cards.filter((card) => isLayoutContrastOn(card) !== enabled).forEach((card) => toggleLayoutContrast(card, enabled));
}

// Shift+R hides every shown ruler, or shows them all when none is shown.
function toggleAllRulers() {
  const cards = [...grid.querySelectorAll('.viewport-card')];
  const shown = !cards.some((card) => card.rulers?.shown);
  cards.forEach((card) => setRulersShown(card, shown));
  speak(shown ? 'Rulers shown.' : 'Rulers hidden.');
}

// Grid overlay: columns or rows over one card's preview, as in Figma's
// layout grids. Each card size keeps its own settings (remembered across
// sessions); like rulers, the grid is drawn by the studio over the preview,
// stays put while the page scrolls and never reaches screenshots or reports.
const GRID_STORAGE_KEY = 'pixelprism-grid-overlays';
const GRID_DEFAULTS = { shown: false, type: 'columns', count: 12, color: '#FF0000', opacity: 10, align: 'stretch', width: 60, margin: 24, gutter: 24 };
const GRID_ALIGN_LABELS = {
  columns: { stretch: 'Stretch', left: 'Left', center: 'Center', right: 'Right' },
  rows: { stretch: 'Stretch', left: 'Top', center: 'Center', right: 'Bottom' }
};
const gridDialog = document.querySelector('#grid-dialog');
let gridDialogCard = null;

function readGridSettings() {
  try { return JSON.parse(localStorage.getItem(GRID_STORAGE_KEY)) || {}; } catch { return {}; }
}

function gridSettingsFor(card) {
  return { ...GRID_DEFAULTS, ...readGridSettings()[card.dataset.device] };
}

function updateGridSettings(card, patch) {
  const all = readGridSettings();
  all[card.dataset.device] = { ...gridSettingsFor(card), ...patch };
  try { localStorage.setItem(GRID_STORAGE_KEY, JSON.stringify(all)); } catch { /* Kept for this render only. */ }
  renderGridOverlay(card, all[card.dataset.device]);
}

// Where each column (or row) starts and how long it is, in page pixels, as
// Figma lays them out: stretched between the margins, or a fixed width
// placed at the start, the end or the centre.
function gridBands(settings, length) {
  const count = Math.max(1, Math.round(settings.count));
  const gutter = Math.max(0, settings.gutter);
  const margin = Math.max(0, settings.margin);
  const size = settings.align === 'stretch' ? (length - margin * 2 - gutter * (count - 1)) / count : Math.max(0, settings.width);
  if (!(size > 0)) return [];
  const total = size * count + gutter * (count - 1);
  const start = { stretch: margin, left: margin, right: length - margin - total, center: (length - total) / 2 }[settings.align] ?? margin;
  return Array.from({ length: count }, (_, index) => ({ start: start + index * (size + gutter), size }));
}

function gridColor(settings) {
  const hex = /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : GRID_DEFAULTS.color;
  const channel = (index) => Number.parseInt(hex.slice(index, index + 2), 16);
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${Math.min(100, Math.max(0, settings.opacity)) / 100})`;
}

function renderGridOverlay(card, settings = gridSettingsFor(card)) {
  card.querySelector('.grid-overlay-button')?.setAttribute('aria-pressed', String(settings.shown));
  let layer = card.querySelector('.grid-overlay');
  if (!settings.shown) {
    if (layer) layer.hidden = true;
    return;
  }
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'grid-overlay';
    layer.setAttribute('aria-hidden', 'true');
    card.querySelector('.viewport-scale').append(layer);
  }
  layer.hidden = false;
  const columns = settings.type !== 'rows';
  const length = Number(columns ? card.dataset.viewportWidth : card.dataset.viewportHeight) || 0;
  const color = gridColor(settings);
  layer.replaceChildren(...gridBands(settings, length).map(({ start, size }) => {
    const band = document.createElement('span');
    band.style.background = color;
    if (columns) Object.assign(band.style, { left: `${start}px`, width: `${size}px`, top: '0', bottom: '0' });
    else Object.assign(band.style, { top: `${start}px`, height: `${size}px`, left: '0', right: '0' });
    return band;
  }));
}

function setGridOverlayShown(card, shown) {
  updateGridSettings(card, { shown });
  if (gridDialogCard === card) syncGridDialog();
}

// Shift+C hides every shown grid, or shows them all when none is shown.
function toggleAllGridOverlays() {
  const cards = [...grid.querySelectorAll('.viewport-card')];
  const shown = !cards.some((card) => gridSettingsFor(card).shown);
  cards.forEach((card) => setGridOverlayShown(card, shown));
  speak(shown ? 'Grid overlay shown.' : 'Grid overlay hidden.');
}

function syncGridDialog() {
  const card = gridDialogCard;
  if (!card) return;
  const settings = gridSettingsFor(card);
  const device = DEVICES[card.dataset.device];
  gridDialog.querySelector('.grid-dialog-device').textContent = `${device?.name || ''} · ${card.dataset.viewportWidth} × ${card.dataset.viewportHeight}`;
  const visibility = gridDialog.querySelector('.grid-visibility');
  visibility.setAttribute('aria-pressed', String(settings.shown));
  visibility.setAttribute('aria-label', settings.shown ? 'Hide grid' : 'Show grid');
  visibility.title = settings.shown ? 'Hide grid' : 'Show grid';
  gridDialog.querySelectorAll('[data-grid-type]').forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.gridType === settings.type)));
  const align = gridDialog.querySelector('[name="align"]');
  align.replaceChildren(...Object.entries(GRID_ALIGN_LABELS[settings.type === 'rows' ? 'rows' : 'columns']).map(([value, text]) => new Option(text, value)));
  align.value = settings.align;
  const fields = gridDialog.querySelector('.grid-dialog-fields');
  ['count', 'width', 'margin', 'gutter', 'opacity'].forEach((name) => {
    const input = fields.querySelector(`[name="${name}"]`);
    if (document.activeElement !== input) input.value = String(settings[name]);
  });
  const colorInput = fields.querySelector('[name="color"]');
  if (document.activeElement !== colorInput) colorInput.value = settings.color.toUpperCase();
  fields.querySelector('[name="picker"]').value = settings.color.toLowerCase();
  // Only the settings that take effect are shown: a stretched grid has no
  // width of its own, and a centred one no margin.
  fields.querySelector('[data-grid-field="width"]').hidden = settings.align === 'stretch';
  fields.querySelector('[data-grid-field="margin"]').hidden = settings.align === 'center';
}

function placeGridDialog() {
  if (!gridDialogCard || !gridDialog.matches(':popover-open')) return;
  const trigger = gridDialogCard.querySelector('.grid-overlay-button').getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = gridDialog;
  gridDialog.style.left = `${Math.max(12, Math.min(trigger.left + trigger.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
  gridDialog.style.top = `${Math.max(12, Math.min(trigger.bottom + 8, window.innerHeight - height - 12))}px`;
}

function openGridDialog(card) {
  gridDialogCard = card;
  // An open dialog takes the place of its button's tooltip.
  card.querySelector('.grid-overlay-button').setAttribute('aria-expanded', 'true');
  syncGridDialog();
  gridDialog.showPopover();
  placeGridDialog();
}

window.addEventListener('resize', placeGridDialog);
gridDialog.addEventListener('toggle', (event) => {
  if (event.newState !== 'closed') return;
  gridDialogCard?.querySelector('.grid-overlay-button').setAttribute('aria-expanded', 'false');
  gridDialogCard = null;
});
gridDialog.querySelector('.dialog-close').addEventListener('click', () => gridDialog.hidePopover());
gridDialog.querySelector('.grid-visibility').addEventListener('click', () => {
  if (gridDialogCard) setGridOverlayShown(gridDialogCard, !gridSettingsFor(gridDialogCard).shown);
});

// Any change shows the grid: a setting is changed to be seen.
function changeGridSetting(patch) {
  if (!gridDialogCard) return;
  updateGridSettings(gridDialogCard, { ...patch, shown: true });
  syncGridDialog();
}

gridDialog.querySelectorAll('[data-grid-type]').forEach((tab) => {
  tab.addEventListener('click', () => changeGridSetting({ type: tab.dataset.gridType }));
});
gridDialog.querySelector('[name="align"]').addEventListener('change', (event) => changeGridSetting({ align: event.target.value }));

const GRID_NUMBER_LIMITS = { count: [1, 100], width: [1, 10000], margin: [0, 10000], gutter: [0, 10000], opacity: [0, 100] };
Object.entries(GRID_NUMBER_LIMITS).forEach(([name, [min, max]]) => {
  const input = gridDialog.querySelector(`[name="${name}"]`);
  const commit = (value) => {
    if (!Number.isFinite(value)) return;
    const clamped = Math.min(max, Math.max(min, Math.round(value)));
    changeGridSetting({ [name]: clamped });
    return clamped;
  };
  input.addEventListener('input', () => {
    if (input.value.trim() !== '') commit(Number(input.value));
  });
  // Arrow keys step by 1, or by 10 with Shift, as in the Inspector.
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const step = (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1);
    const value = commit((Number(input.value) || 0) + step);
    if (value !== undefined) input.value = String(value);
  });
  input.addEventListener('blur', syncGridDialog);
  input.addEventListener('focus', () => requestAnimationFrame(() => input.select()));
});

const gridColorInput = gridDialog.querySelector('[name="color"]');
gridColorInput.addEventListener('input', () => {
  const value = gridColorInput.value.trim().replace(/^#?/, '#');
  const full = /^#[0-9a-f]{3}$/i.test(value) ? `#${[...value.slice(1)].map((digit) => digit + digit).join('')}` : value;
  if (/^#[0-9a-f]{6}$/i.test(full)) changeGridSetting({ color: full.toUpperCase() });
});
gridColorInput.addEventListener('blur', syncGridDialog);
gridColorInput.addEventListener('focus', () => requestAnimationFrame(() => gridColorInput.select()));
gridDialog.querySelector('[name="picker"]').addEventListener('input', (event) => changeGridSetting({ color: event.target.value.toUpperCase() }));

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'ruler-scroll') return;
  const card = cardForFrame(event.source);
  if (!card?.rulers) return;
  card.rulers.scrollX = Number(event.data.x) || 0;
  card.rulers.scrollY = Number(event.data.y) || 0;
  renderRulers(card);
});
