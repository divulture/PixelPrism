// The extension's settings page (chrome://extensions → Details → Extension
// options). Each checkbox is saved as soon as it changes; icon-size.js in the
// service worker reacts to the stored value.

// Same key and shape as in icon-size.js.
const ICON_SIZE_KEY = 'pixelprism-icon-size';
const ICON_SIZE_DEFAULTS = { width: true, height: false, window: false };
const boxes = [...document.querySelectorAll('input[data-setting]')];

async function loadSettings() {
  const stored = await chrome.storage.local.get(ICON_SIZE_KEY);
  const settings = { ...ICON_SIZE_DEFAULTS, ...stored[ICON_SIZE_KEY] };
  boxes.forEach((box) => { box.checked = Boolean(settings[box.dataset.setting]); });
}

boxes.forEach((box) => box.addEventListener('change', () => {
  const settings = Object.fromEntries(boxes.map((item) => [item.dataset.setting, item.checked]));
  void chrome.storage.local.set({ [ICON_SIZE_KEY]: settings });
}));

void loadSettings();
