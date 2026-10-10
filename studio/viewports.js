// Preview cards: the device picker, sizes, resizing, zoom, screenshots and rendering.

function setSelected(id, forceSingle = false) {
  if (forceSingle) {
    selected = new Set([id]);
    mode = 'single';
    singleWidth = DEVICES[id].width;
  } else if (selected.has(id)) {
    if (selected.size === 1) {
      speak('At least one viewport must remain selected.');
      return;
    }
    selected.delete(id);
  } else {
    selected.add(id);
  }
  if (!forceSingle) mode = 'multi';
  render();
}

function cardScale(device, count) {
  return zoom;
}

function nearestBreakpoint(width) {
  return MAIN_BREAKPOINTS.reduce((nearest, candidate) =>
    Math.abs(candidate.width - width) < Math.abs(nearest.width - width) ? candidate : nearest
  );
}

function deviceGlyph(id, width) {
  if (id === 'phone' || width <= 450) return 'phone';
  if (id === 'phoneWide' || width <= 620) return 'phone-wide';
  if (id === 'tablet' || width <= 900) return 'tablet';
  if (id === 'laptop' || width <= 1200) return 'laptop';
  return 'desktop';
}

function deviceIcon(kind) {
  const icons = {
    phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path>',
    'phone-wide': '<g transform="rotate(90 12 12)"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path></g>',
    tablet: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"></rect><path d="M12 18h.01"></path>',
    laptop: '<path d="M20 16V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10"></path><path d="M2 16h20"></path><path d="M6 20h12"></path>',
    desktop: '<rect width="20" height="14" x="2" y="3" rx="2"></rect><path d="M8 21h8"></path><path d="M12 17v4"></path>'
  };
  return `<svg class="device-icon" aria-hidden="true" viewBox="0 0 24 24">${icons[kind]}</svg>`;
}

function syncDevicePickerOverflow() {
  const controlbar = devicePicker.closest('.controlbar');
  const scroller = devicePicker.parentElement;
  controlbar.classList.remove('is-overflowing');
  // The buttons' own width: scrollWidth would also count their tooltips.
  controlbar.classList.toggle('is-overflowing', devicePicker.offsetWidth > scroller.clientWidth + 1);
}
window.addEventListener('resize', syncDevicePickerOverflow);

function renderDevicePicker() {
  devicePicker.replaceChildren();
  Object.entries(DEVICES)
    .sort(([, a], [, b]) => a.width - b.width)
    .forEach(([id, device]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'device-button';
      button.dataset.device = id;
      const tooltip = `${device.name} ${device.width}`;
      button.dataset.tooltip = tooltip;
      button.setAttribute('aria-label', tooltip);
      button.setAttribute('aria-pressed', String(selected.has(id)));
      const customMark = id.startsWith('custom-') ? '<span class="device-custom-mark" aria-hidden="true">*</span>' : '';
      button.innerHTML = `${deviceIcon(deviceGlyph(id, device.width))}${customMark}`;
      if (selected.has(id)) button.classList.add('is-selected');
      devicePicker.append(button);
    });
  syncDevicePickerOverflow();
}

function updateCardDimensions(card, device, width, height, scale) {
  const visualWidth = Math.round(width * scale);
  const visualHeight = Math.round(height * scale);
  const ruler = rulerOffset(card);
  card.style.setProperty('--frame-width', `${visualWidth + ruler}px`);
  card.dataset.viewportWidth = String(width);
  card.dataset.viewportHeight = String(height);
  const frame = card.querySelector('.viewport-frame');
  const scaleNode = card.querySelector('.viewport-scale');
  frame.style.height = `${visualHeight + ruler}px`;
  scaleNode.style.width = `${width}px`;
  scaleNode.style.height = `${height}px`;
  scaleNode.style.transform = `scale(${scale})`;
  card.querySelector('.viewport-width').textContent = String(width);
  card.querySelector('.viewport-height').textContent = ` × ${height}`;

  const nearest = nearestBreakpoint(width);
  const widthEdge = card.querySelector('.resize-edge');
  widthEdge?.setAttribute('aria-valuenow', String(width));
  widthEdge?.setAttribute('aria-valuetext', `${width} pixels`);
  const widthCallout = card.querySelector('.breakpoint-callout');
  if (widthCallout) {
    widthCallout.querySelector('strong').textContent = `${width} px`;
    widthCallout.querySelector('span').textContent = `Nearest: ${nearest.label} · ${nearest.width}px`;
  }

  const heightEdge = card.querySelector('.resize-bottom');
  heightEdge?.setAttribute('aria-valuenow', String(height));
  heightEdge?.setAttribute('aria-valuetext', `${height} pixels`);
  const heightCallout = card.querySelector('.height-callout');
  if (heightCallout) heightCallout.textContent = `${height} px`;
  renderRulers(card);
  renderGridOverlay(card);
  if (gridDialogCard === card) syncGridDialog();
}

// The page in a preview keeps running until the next one replaces it, and
// what it reports meanwhile (a router rewriting history on beforeunload) is
// about a page that is going away. Until the frame loads, it is ignored.
// A new fragment alone keeps the document and fires no load event.
function loadPreviewFrame(iframe, url) {
  const withoutHash = (value) => value.split('#')[0];
  if (!url.includes('#') || withoutHash(url) !== withoutHash(iframe.src)) iframe.dataset.navigating = 'true';
  iframe.src = url;
}

function enableNavigationSync(card) {
  const iframe = card.querySelector('iframe');
  iframe?.contentWindow?.postMessage({
    source: 'viewport-parade',
    type: 'enable-navigation-sync',
    expectedUrl: card.dataset.loadedUrl || targetUrl
  }, '*');
}

function promoteResizedCard(card, { deviceId, restoreWidth, restoreHeight }) {
  const width = Number(card.dataset.viewportWidth);
  const height = Number(card.dataset.viewportHeight);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;

  let customId = deviceId;
  if (!deviceId.startsWith('custom-')) {
    // A stock breakpoint is a preset. A manual resize must create a separate
    // Custom breakpoint rather than silently mutating Laptop/Tablet globally.
    DEVICES[deviceId].width = restoreWidth;
    DEVICES[deviceId].height = restoreHeight;
    customId = `custom-${++customDeviceCount}`;
    DEVICES[customId] = { name: 'Custom', width, height };
    selected = new Set([...selected].map((id) => (id === deviceId ? customId : id)));
    card.dataset.device = customId;
    if (selectedCardDevice === deviceId) selectedCardDevice = customId;
  } else {
    DEVICES[customId].width = width;
    DEVICES[customId].height = height;
  }

  if (mode === 'single') singleWidth = width;
  const custom = DEVICES[customId];
  card.querySelector('.viewport-name').textContent = custom.name;
  card.querySelector('iframe').title = `${custom.name}, ${width} pixels`;
  updateCardDimensions(card, custom, width, height, Number(card.dataset.scale) || zoom);
  renderDevicePicker();
}

function createResizeEdge() {
  const edge = document.createElement('div');
  edge.className = 'resize-edge';
  edge.setAttribute('role', 'slider');
  edge.tabIndex = 0;
  edge.setAttribute('aria-label', 'Resize viewport width');
  edge.setAttribute('aria-valuemin', String(MIN_VIEWPORT_WIDTH));
  edge.setAttribute('aria-valuemax', '100000');
  edge.innerHTML = '<div class="breakpoint-callout"><strong></strong><span></span></div>';
  return edge;
}

function wireWidthResize(card, device) {
  let resizeEdge = card.querySelector('.resize-edge');
  if (!resizeEdge) {
    resizeEdge = createResizeEdge();
    card.append(resizeEdge);
  }
  if (resizeEdge.dataset.wired === 'true') return;
  resizeEdge.dataset.wired = 'true';
  resizeEdge.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const deviceId = card.dataset.device;
    const liveDevice = DEVICES[deviceId];
    const isSingleCard = grid.children.length === 1;
    if (isSingleCard) mode = 'single';
    const startWidth = Number(card.dataset.viewportWidth) || liveDevice.width;
    if (isSingleCard) singleWidth = startWidth;
    const scale = Number(card.dataset.scale) || zoom;
    dragState = {
      type: 'width', card, deviceId, startX: event.clientX, startWidth, scale, isSingleCard,
      restoreWidth: liveDevice.width, restoreHeight: liveDevice.height
    };
    document.body.classList.add('is-resizing');
    resizeEdge.classList.add('is-dragging');
    resizeEdge.setPointerCapture(event.pointerId);
    card.querySelector('.breakpoint-callout').classList.add('is-visible');
  });
  resizeEdge.addEventListener('keydown', (event) => {
    const steps = { ArrowLeft: -10, ArrowRight: 10, Home: -1680, End: 1680 };
    if (!(event.key in steps)) return;
    event.preventDefault();
    const liveDevice = DEVICES[card.dataset.device];
    const nextWidth = Math.max(MIN_VIEWPORT_WIDTH, (Number(card.dataset.viewportWidth) || liveDevice.width) + steps[event.key]);
    const restoreWidth = liveDevice.width;
    const restoreHeight = liveDevice.height;
    if (grid.children.length === 1) {
      mode = 'single';
      singleWidth = nextWidth;
    } else {
      liveDevice.width = nextWidth;
    }
    updateCardDimensions(card, liveDevice, nextWidth, liveDevice.height, Number(card.dataset.scale) || zoom);
    promoteResizedCard(card, { deviceId: card.dataset.device, restoreWidth, restoreHeight });
    speak(`Viewport width: ${nextWidth} pixels.`);
  });
}

function openSeparately(card, device) {
  const deviceId = card.dataset.device;
  const liveDevice = DEVICES[deviceId] || device;
  selected = new Set([deviceId]);
  mode = 'single';
  singleWidth = Number(card.dataset.viewportWidth) || liveDevice.width;
  document.body.dataset.mode = mode;
  renderDevicePicker();
  [...grid.children].forEach((item) => { if (item !== card) item.remove(); });
  card.querySelector('.solo-button').hidden = true;
  wireWidthResize(card, liveDevice);
  speak(`Opened ${liveDevice.name} without reloading the page.`);
}

async function getStudioTab() {
  if (!window.chrome?.tabs?.getCurrent) return undefined;
  return window.chrome.tabs.getCurrent();
}

// Screenshots are taken in a temporary tab at the card's size: the visible
// area at the top of the page, the full page, or one picked element.
const CAPTURE_KINDS = {
  visible: { type: 'capture-viewport', file: 'viewport', saved: 'Visible-area screenshot saved.' },
  full: { type: 'capture-full-page', file: 'fullpage', saved: 'Full-page screenshot saved.' },
  element: { type: 'capture-element', file: 'element', saved: 'Element screenshot saved.' }
};

async function saveCapture(card, kind = 'visible', details = {}) {
  const menu = card.querySelector('.capture-actions');
  const capture = CAPTURE_KINDS[kind];
  if (!window.chrome?.runtime?.sendMessage) {
    notify('Screenshots are available after the extension is loaded in Chrome.', 'error');
    return;
  }
  if (menu.getAttribute('aria-busy') === 'true') return;
  menu.setAttribute('aria-busy', 'true');
  if (kind !== 'visible') notify(kind === 'full' ? 'Capturing the full page…' : 'Capturing the element…');
  // Lets the background tell this capture's countdown apart from another card's.
  const requestId = `${card.dataset.device}-${Date.now()}`;
  try {
    const studioTab = await getStudioTab();
    const response = await window.chrome.runtime.sendMessage({
      type: capture.type,
      url: kind === 'visible' ? targetUrl : canonicalInspectorUrl(card.dataset.loadedUrl || targetUrl),
      width: Number(card.dataset.viewportWidth),
      height: Number(card.dataset.viewportHeight),
      ...details,
      requestId,
      returnWindowId: studioTab?.windowId
    });
    if (!response?.ok) throw new Error(response?.error || 'Unable to capture the image.');
    const result = await window.chrome.runtime.sendMessage({
      type: 'save-capture',
      dataUrl: response.dataUrl,
      filename: `${capture.file}-${card.dataset.device}-${Date.now()}.png`
    });
    if (!result?.ok) throw new Error(result?.error || 'Unable to save the file.');
    if (response.truncated) notify(`Full-page screenshot saved: the page is cut at ${response.height} px, the longest image Chrome renders.`, 'success');
    else notify(capture.saved, 'success');
  } catch (error) {
    notify(`Screenshot was not saved: ${error.message}`, 'error');
  } finally {
    stopCaptureCountdown(requestId);
    menu.removeAttribute('aria-busy');
  }
}

// A delayed full-page screenshot counts down once the page has loaded in the
// temporary tab; the background says when the wait starts.
let captureCountdown = null;

function stopCaptureCountdown(requestId) {
  if (!captureCountdown || (requestId && captureCountdown.requestId !== requestId)) return;
  clearInterval(captureCountdown.timer);
  captureCountdown = null;
}

function startCaptureCountdown(requestId, seconds) {
  stopCaptureCountdown();
  let left = Math.round(seconds);
  const tick = () => {
    if (left <= 0) {
      stopCaptureCountdown(requestId);
      notify('Capturing the full page…');
      return;
    }
    notify(`Full-page screenshot in ${left} s…`);
    left -= 1;
  };
  captureCountdown = { requestId, timer: setInterval(tick, 1000) };
  tick();
}

window.chrome?.runtime?.onMessage?.addListener((message) => {
  if (message?.type !== 'capture-countdown' || typeof message.requestId !== 'string') return;
  startCaptureCountdown(message.requestId, Number(message.seconds) || 0);
});

// Card menus (screenshot, more actions) open one at a time, in any card, and
// close on a press outside them or in a preview.
// Card menus and the toolbar's ⋯ menu: one open at a time, closed by a
// press anywhere else.
function closeCardMenus(except) {
  document.querySelectorAll('.more-actions[open]').forEach((menu) => {
    if (menu !== except) menu.open = false;
  });
}

document.addEventListener('toggle', (event) => {
  if (event.target instanceof HTMLDetailsElement && event.target.matches('.more-actions') && event.target.open) closeCardMenus(event.target);
}, true);
document.addEventListener('pointerdown', (event) => {
  closeCardMenus(event.target instanceof Element ? event.target.closest('.more-actions') : null);
}, true);
// A press in a preview reaches only the iframe; the studio sees its focus leave.
window.addEventListener('blur', () => closeCardMenus());

// The card waiting for an element to be picked for a screenshot.
let capturePickCard = null;

function setCapturePicking(card) {
  const previous = capturePickCard;
  capturePickCard = card;
  if (previous && previous !== card) {
    previous.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'toggle-capture-picker', enabled: false }, '*');
  }
  [previous, card].filter(Boolean).forEach((item) => {
    const picking = item === capturePickCard;
    item.querySelector('.capture-actions').classList.toggle('is-picking', picking);
    item.querySelector('.capture-element-button').setAttribute('aria-pressed', String(picking));
  });
  if (!card) return;
  card.querySelector('iframe')?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'toggle-capture-picker', enabled: true }, '*');
  notify('Click an element in the preview to capture it. Esc cancels.');
}

function startElementCapture(card) {
  if (!hasExtensionRuntime) {
    notify('Screenshots are available after the extension is loaded in Chrome.', 'error');
    return;
  }
  if (card.dataset.previewReady !== 'true') {
    notify('Wait for the preview to load, then pick the element.', 'error');
    return;
  }
  setCapturePicking(capturePickCard === card ? null : card);
}

function cancelElementCapture() {
  if (!capturePickCard) return;
  setCapturePicking(null);
  speak('Element screenshot cancelled.');
}

function refreshPreview(card) {
  const iframe = card.querySelector('iframe');
  const refreshed = new URL(targetUrl);
  refreshed.searchParams.set('__viewport_parade_refresh', String(Date.now()));
  setInspectorState(card, false);
  setContrastState(card, false);
  loadPreviewFrame(iframe, refreshed.href);
}

function setInspectorState(card, enabled) {
  const button = card?.querySelector('.inspect-button');
  if (!button) return;
  button.setAttribute('aria-pressed', String(enabled));
}

function setInspectorMode(open) {
  inspectorModeActive = open;
  inspectorToggle.setAttribute('aria-pressed', String(open));
  if (open) {
    setCursorModeActive(false);
    setCommentsOpen(false);
  } else {
    hideInspectorPanel();
  }
  document.querySelectorAll('.viewport-card iframe').forEach((frame) => {
    frame.contentWindow?.postMessage({ source: 'viewport-parade', type: 'toggle-inspector', enabled: open }, '*');
  });
  speak(open ? 'Inspector enabled. Hover over an element and click it.' : 'Inspector disabled.');
}

function setCursorModeActive(active) {
  cursorToggle.setAttribute('aria-pressed', String(active));
}

function activateCursorMode() {
  setInspectorMode(false);
  setCommentsOpen(false);
  setLayersOpen(false);
  clearInspectorSelections();
  setCursorModeActive(true);
  speak('Cursor mode enabled. You can interact with the preview normally.');
}

// The viewport last clicked, on its frame or inside its page, has a stronger
// border (with a single viewport there is nothing to tell apart: studio.css)
// and is the one Layers and Code view show.
let selectedCardDevice = null;

function syncSelectedCard() {
  const cards = [...grid.querySelectorAll('.viewport-card')];
  if (!cards.some((card) => card.dataset.device === selectedCardDevice)) {
    const widest = cards.reduce((best, card) => (!best || Number(card.dataset.viewportWidth) > Number(best.dataset.viewportWidth) ? card : best), null);
    selectedCardDevice = widest?.dataset.device ?? null;
  }
  cards.forEach((card) => card.classList.toggle('is-selected', card.dataset.device === selectedCardDevice));
}

function selectViewportCard(card) {
  selectedCardDevice = card.dataset.device;
  syncSelectedCard();
  setLayersFrame(card.querySelector('iframe')?.contentWindow);
}

// Layers or Code view opening: they show the selected viewport, not the one
// the pointer last passed over.
function followSelectedCard() {
  const card = grid.querySelector('.viewport-card.is-selected');
  if (card) setLayersFrame(card.querySelector('iframe')?.contentWindow);
}

function createViewportCard(device, width, scale) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector('.viewport-card');
  const iframe = node.querySelector('iframe');
  const blocked = isEmbedBlocked(targetUrl) || (isLocalFileUrl(targetUrl) && !fileAccessAllowed);
  card.dataset.device = device.id;
  card.dataset.loadedUrl = targetUrl;
  card.dataset.scale = String(scale);
  card.addEventListener('pointerdown', () => selectViewportCard(card));
  node.querySelector('.viewport-name').textContent = device.name;
  iframe.title = `${device.name}, ${width} pixels`;

  if (blocked) {
    card.classList.add('is-embed-blocked');
    iframe.hidden = true;
    const blockedMessage = node.querySelector('.embed-blocked');
    blockedMessage.hidden = false;
    if (isLocalFileUrl(targetUrl) && !fileAccessAllowed) {
      blockedMessage.querySelector('h2').textContent = 'No access to local files';
      blockedMessage.querySelector('p').textContent = 'Enable “Allow access to file URLs” in the extension settings and reload Studio.';
    }
  } else {
    loadPreviewFrame(iframe, targetUrl);
    waitForLocalPreview(card);
    iframe.addEventListener('load', () => {
      delete iframe.dataset.navigating;
      enableNavigationSync(card);
      // A reloaded page starts without the pick it was waiting for.
      if (capturePickCard === card) setCapturePicking(null);
    });
    iframe.addEventListener('pointerenter', () => {
      // With Layers or Code view open, their preview changes on a click only
      // (selectViewportCard): passing over another preview must not switch it.
      if (layersPanel.hidden && codePanel.hidden) setLayersFrame(iframe.contentWindow);
      iframe.contentWindow?.postMessage({ source: 'viewport-parade', type: 'inspector-pointer-entered' }, '*');
    });
    iframe.addEventListener('pointerleave', () => {
      iframe.contentWindow?.postMessage({ source: 'viewport-parade', type: 'inspector-pointer-left' }, '*');
    });
    iframe.addEventListener('load', () => {
      notice.hidden = true;
    }, { once: true });
  }

  node.querySelector('.ruler-button').addEventListener('click', () => setRulersShown(card, !rulerState(card).shown));
  node.querySelector('.contrast-button').addEventListener('click', () => toggleLayoutContrast(card));
  // The popover closes itself on the press outside it, before this click:
  // a click that finds it open for this card closes it instead of reopening.
  const gridButton = node.querySelector('.grid-overlay-button');
  let gridDialogWasOpen = false;
  gridButton.addEventListener('pointerdown', () => { gridDialogWasOpen = gridDialogCard === card; });
  gridButton.addEventListener('click', () => {
    if (gridDialogWasOpen || gridDialogCard === card) {
      gridDialogWasOpen = false;
      gridDialog.hidePopover();
    } else openGridDialog(card);
  });
  node.querySelector('.solo-button').addEventListener('click', () => openSeparately(card, DEVICES[device.id]));
  node.querySelector('.capture-visible-button').addEventListener('click', () => saveCapture(card, 'visible'));
  node.querySelectorAll('.capture-full-button').forEach((button) => {
    button.addEventListener('click', () => saveCapture(card, 'full', { delay: Number(button.dataset.delay) || 0 }));
  });
  node.querySelector('.capture-element-button').addEventListener('click', () => startElementCapture(card));
  node.querySelector('.capture-actions > summary').addEventListener('click', (event) => {
    if (card.querySelector('.capture-actions').getAttribute('aria-busy') === 'true') event.preventDefault();
  });
  node.querySelector('.apply-button').addEventListener('click', () => applyChangesToFile(card));
  node.querySelector('.refresh-button').addEventListener('click', () => refreshPreview(card));
  node.querySelectorAll('.more-actions-menu button').forEach((button) => {
    button.addEventListener('click', () => { button.closest('.more-actions').open = false; });
  });
  const resizeBottom = node.querySelector('.resize-bottom');
  resizeBottom.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const liveDevice = DEVICES[card.dataset.device];
    const activeWidth = Number(card.dataset.viewportWidth) || liveDevice.width;
    dragState = {
      type: 'height', card, deviceId: card.dataset.device, startY: event.clientY,
      startHeight: Number(card.dataset.viewportHeight) || liveDevice.height,
      scale: Number(card.dataset.scale) || zoom, width: activeWidth,
      restoreWidth: liveDevice.width, restoreHeight: liveDevice.height
    };
    document.body.classList.add('is-resizing');
    resizeBottom.classList.add('is-dragging');
    resizeBottom.setPointerCapture(event.pointerId);
    card.querySelector('.height-callout').classList.add('is-visible');
  });
  resizeBottom.addEventListener('keydown', (event) => {
    const steps = { ArrowUp: 10, ArrowDown: -10, Home: -2600, End: 2600 };
    if (!(event.key in steps)) return;
    event.preventDefault();
    const deviceId = card.dataset.device;
    const liveDevice = DEVICES[deviceId];
    const restoreWidth = liveDevice.width;
    const restoreHeight = liveDevice.height;
    liveDevice.height = Math.max(MIN_VIEWPORT_HEIGHT, liveDevice.height + steps[event.key]);
    const activeWidth = Number(card.dataset.viewportWidth) || liveDevice.width;
    updateCardDimensions(card, liveDevice, activeWidth, liveDevice.height, Number(card.dataset.scale) || zoom);
    promoteResizedCard(card, { deviceId, restoreWidth, restoreHeight });
    speak(`${liveDevice.name} height: ${liveDevice.height} pixels.`);
  });
  return card;
}

function updateViewportCard(card, device, width, scale, count) {
  card.dataset.scale = String(scale);
  // Flex order keeps smaller screens visually first without moving iframe nodes.
  // Moving an existing iframe can make Chromium navigate it again.
  card.style.order = String(width);
  card.querySelector('.viewport-name').textContent = device.name;
  card.querySelector('iframe').title = `${device.name}, ${width} pixels`;
  card.querySelector('.solo-button').hidden = count === 1;
  updateCardDimensions(card, device, width, device.height, scale);

  wireWidthResize(card, device);
}

function render() {
  const entries = deviceEntries();
  if (mode === 'single' && entries[0]) entries[0].width = singleWidth;
  document.body.dataset.mode = mode;
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  renderDevicePicker();

  const currentCards = new Map([...grid.children].map((card) => [card.dataset.device, card]));
  const selectedIds = new Set(entries.map((device) => device.id));
  currentCards.forEach((card, id) => {
    if (!selectedIds.has(id)) card.remove();
  });

  entries.forEach((device) => {
    const width = mode === 'single' ? singleWidth : device.width;
    const scale = cardScale(device, entries.length);
    let card = currentCards.get(device.id);
    if (!card) {
      card = createViewportCard(device, width, scale);
    } else if (card.dataset.loadedUrl !== targetUrl) {
      card.dataset.loadedUrl = targetUrl;
      const iframe = card.querySelector('iframe');
      setInspectorState(card, false);
      setContrastState(card, false);
      loadPreviewFrame(iframe, targetUrl);
      waitForLocalPreview(card);
      iframe.addEventListener('load', () => {
        notice.hidden = true;
      }, { once: true });
    }
    updateViewportCard(card, DEVICES[device.id], width, scale, entries.length);
    // Do not re-append existing cards: moving an iframe node can reload it in
    // Chromium. Only a genuinely new viewport is appended.
    if (!card.isConnected) grid.append(card);
  });
  syncSelectedCard();
  syncCommentMarkers();
  if (!commentsPanel.hidden) renderComments();
  syncCodeFrame();
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const nextUrl = normalizeUrl(urlInput.value);
  if (!nextUrl) {
    targetUrl = DEMO_URL;
    history.replaceState({}, '', location.pathname);
    setFavicon();
    render();
    return;
  }
  openPreviewUrl(nextUrl);
});

devicePicker.addEventListener('click', (event) => {
  const button = event.target.closest('[data-device]');
  if (!button) return;
  setSelected(button.dataset.device);
});

function placeCustomDialog() {
  if (!customDialog.matches(':popover-open')) return;
  const trigger = customTrigger.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = customDialog;
  customDialog.style.left = `${Math.max(12, Math.min(trigger.left + trigger.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
  customDialog.style.top = `${Math.max(12, Math.min(trigger.bottom + 8, window.innerHeight - height - 12))}px`;
}
window.addEventListener('resize', placeCustomDialog);
// The cards look like the Presets ones. A size card adds that viewport at
// once; the Custom card holds its own width and height fields.
function renderCustomSizes() {
  const option = (name, title, preview) => {
    const item = document.createElement('div');
    item.className = 'workspace-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'workspace-option';
    if (title) button.title = title;
    const label = document.createElement('span');
    label.className = 'workspace-name';
    label.textContent = name;
    button.append(preview, label);
    item.append(button);
    return { item, button };
  };
  const icon = (markup) => {
    const preview = document.createElement('span');
    preview.className = 'workspace-preview is-icon';
    preview.setAttribute('aria-hidden', 'true');
    preview.innerHTML = markup;
    return preview;
  };
  // A screen with its resolution's badge on it.
  const monitor = (badge) => `<svg class="workspace-icon-monitor" viewBox="0 0 64 48"><rect x="4" y="3" width="56" height="33" rx="3"/><path d="M32 36v6M22 44h20"/><text x="32" y="20">${badge}</text></svg>`;
  customSizeList.replaceChildren(...CUSTOM_PRESETS.map((preset, index) => {
    const { item, button } = option(`${preset.name} · ${preset.width} × ${preset.height}`, '', icon(monitor(preset.badge)));
    button.dataset.size = String(index);
    return item;
  }), customForm);
}

function addViewport(name, width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < MIN_VIEWPORT_WIDTH || height < MIN_VIEWPORT_HEIGHT) {
    notify(`Minimum viewport size is ${MIN_VIEWPORT_WIDTH} × ${MIN_VIEWPORT_HEIGHT}px.`, 'error');
    return;
  }
  const id = `custom-${++customDeviceCount}`;
  DEVICES[id] = { name, width, height };
  selected.add(id);
  if (selected.size > 1) mode = 'multi';
  customDialog.hidePopover();
  speak(`Added viewport: ${width} × ${height} pixels.`);
  render();
}

customTrigger.addEventListener('click', () => {
  renderCustomSizes();
  customDialog.showPopover();
  placeCustomDialog();
  requestAnimationFrame(() => customSizeList.querySelector('.workspace-option')?.focus());
});
customSizeList.addEventListener('click', (event) => {
  const button = event.target.closest('button.workspace-option');
  if (!button) return;
  const preset = CUSTOM_PRESETS[Number(button.dataset.size)];
  addViewport(preset.name, preset.width, preset.height);
});
customDialog.querySelector('.dialog-close').addEventListener('click', () => customDialog.hidePopover());
// A click on the Custom card around its fields goes to the width.
customForm.addEventListener('click', (event) => {
  if (!event.target.closest('input, button, label')) customWidth.focus();
});
customForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(customForm);
  addViewport('Custom', Math.round(Number(formData.get('width'))), Math.round(Number(formData.get('height'))));
});
// One zoom for every preview: − and + step by 10% between 50% and 200%,
// and a click on the percentage resets it to 100%.
function setZoom(nextZoom) {
  if (nextZoom === zoom) return;
  zoom = nextZoom;
  zoomValue.textContent = `${Math.round(zoom * 100)}%`;
  document.querySelectorAll('.viewport-card').forEach((card) => {
    const device = DEVICES[card.dataset.device];
    const width = Number(card.dataset.viewportWidth) || device.width;
    const height = Number(card.dataset.viewportHeight) || device.height;
    card.dataset.scale = String(zoom);
    updateCardDimensions(card, device, width, height, zoom);
  });
  speak(`Overall zoom: ${Math.round(zoom * 100)}%.`);
}

document.querySelectorAll('[data-zoom]').forEach((button) => {
  button.addEventListener('click', () => {
    const direction = button.dataset.zoom === 'in' ? 1 : -1;
    setZoom(Math.min(2, Math.max(0.5, Number((zoom + direction * 0.1).toFixed(1)))));
  });
});
zoomValue.addEventListener('click', () => setZoom(1));
window.addEventListener('pointermove', (event) => {
  if (!dragState) return;
  const device = DEVICES[dragState.deviceId];
  if (dragState.type === 'width') {
    const width = Math.max(MIN_VIEWPORT_WIDTH, Math.round(dragState.startWidth + (event.clientX - dragState.startX) / dragState.scale));
    if (dragState.isSingleCard) singleWidth = width;
    else device.width = width;
    updateCardDimensions(dragState.card, device, width, device.height, dragState.scale);
    dragState.card.querySelector('.breakpoint-callout')?.classList.add('is-visible');
  } else {
    const height = Math.max(MIN_VIEWPORT_HEIGHT, Math.round(dragState.startHeight + (event.clientY - dragState.startY) / dragState.scale));
    device.height = height;
    updateCardDimensions(dragState.card, device, dragState.width, height, dragState.scale);
    dragState.card.querySelector('.height-callout')?.classList.add('is-visible');
  }
});
window.addEventListener('pointerup', () => {
  if (!dragState) return;
  const state = dragState;
  const { type, card, deviceId } = state;
  const width = Number(card.dataset.viewportWidth);
  const height = Number(card.dataset.viewportHeight);
  const changed = type === 'width'
    ? width !== state.startWidth
    : height !== state.startHeight;
  if (changed) {
    promoteResizedCard(card, {
      deviceId,
      restoreWidth: state.restoreWidth,
      restoreHeight: state.restoreHeight
    });
  }
  dragState = null;
  document.body.classList.remove('is-resizing');
  card.querySelectorAll('.is-dragging').forEach((handle) => handle.classList.remove('is-dragging'));
  card.querySelector('.breakpoint-callout')?.classList.remove('is-visible');
  card.querySelector('.height-callout')?.classList.remove('is-visible');
  speak(type === 'width'
    ? `Viewport width: ${width} pixels.`
    : `Viewport height: ${height} pixels.`);
});
window.addEventListener('resize', () => { if (mode === 'single') render(); });
