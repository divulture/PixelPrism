// The size of the active tab on the toolbar icon, as the extension's settings
// ask (options.html). The badge shows a number only while the window is being
// resized, and goes away a moment after; the tooltip lists every value that
// is switched on at any time. Imported by background.js; the listeners are
// registered while the module loads, as a service worker needs.
//
// Chrome reports a window's new bounds only when a drag ends, so the page
// itself tells the worker its size on every `resize` event (watchResize).

// Same key and shape as in options.js.
const ICON_SIZE_KEY = 'pixelprism-icon-size';
const ICON_SIZE_DEFAULTS = { width: true, height: false, window: false };
// The plate says what the number counts: blue for the width, green for the
// height. A corner drag counts the axis it moves along more.
const WIDTH_COLOR = '#2563eb';
const HEIGHT_COLOR = '#16a34a';
// How long the number stays after the last change, to be read.
const LINGER_MS = 1000;
const BADGE_TEXT_COLOR = '#ffffff';
// A window resize reports bounds a little before the page has its new size.
const SETTLE_MS = 150;
const LIVE_MS = 50;

const defaultTitle = chrome.runtime.getManifest().action.default_title;
const settleTimers = new Map();
const liveTimers = new Map();
// Reads overlap while a window is dragged; only the newest may write.
const latestRead = new Map();
// Each tab's last size and the size its current drag started from.
const lastSize = new Map();
// Each tab's timer that takes the number away after a drag.
const hideTimers = new Map();
// What a page measured itself while its window was dragged, until it is shown.
const measured = new Map();

async function iconSizeSettings() {
  const stored = await chrome.storage.local.get(ICON_SIZE_KEY);
  return { ...ICON_SIZE_DEFAULTS, ...stored[ICON_SIZE_KEY] };
}

const iconSizeOn = (settings) => settings.width || settings.height || settings.window;

// The page's own viewport, which follows page zoom and an open DevTools.
// Pages the extension may not script (chrome://, the Web Store) fall back to
// the tab's size, which Chrome reports without any permission.
async function viewportOf(tab) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => [window.innerWidth, window.innerHeight]
    });
    if (Array.isArray(result?.result)) return { width: result.result[0], height: result.result[1] };
  } catch { /* Not scriptable: use the tab's size. */ }
  return { width: tab.width, height: tab.height };
}

// Puts a `resize` listener into the page, once. It reports the page's size
// as the window is dragged and removes itself when the worker says the
// setting is off. Pages the extension may not script are left to the events
// of onBoundsChanged.
async function watchResize(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (window.__pixelprismIconSize) return;
        window.__pixelprismIconSize = true;
        const stop = () => {
          window.removeEventListener('resize', report, { capture: true });
          window.__pixelprismIconSize = false;
        };
        // A failed send (the worker is waking up) must not end the watching;
        // only the setting being off, or a reloaded extension, does.
        const report = () => {
          try {
            chrome.runtime.sendMessage({
              type: 'icon-size-resize',
              width: window.innerWidth,
              height: window.innerHeight,
              windowWidth: window.outerWidth,
              windowHeight: window.outerHeight
            }).then((reply) => { if (reply?.active === false) stop(); })
              .catch((error) => { if (/context invalidated/i.test(String(error))) stop(); });
          } catch { stop(); }
        };
        // Capture runs before the page's own listeners, so a page that stops
        // the event for itself does not hide it from this one.
        window.addEventListener('resize', report, { capture: true });
      }
    });
  } catch { /* Not scriptable. */ }
}

async function clearIconSize(tabId) {
  lastSize.delete(tabId);
  clearTimeout(hideTimers.get(tabId));
  hideTimers.delete(tabId);
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text: '' }),
    chrome.action.setTitle({ tabId, title: defaultTitle })
  ]).catch(() => {});
}

// Which sides a read of `size` shows being dragged. A drag is a run of reads
// that differ from each other; its sides are judged against the size it
// started from. A read that finds the size unchanged ends the drag. `dw` and
// `dh` are how far each side moved since the last read: the direction of the
// pointer in a corner drag.
function dragOf(tabId, size) {
  const none = { width: false, height: false };
  if (!size?.width) return none;
  const state = lastSize.get(tabId);
  if (!state || (size.width === state.last.width && size.height === state.last.height)) {
    lastSize.set(tabId, { last: size, start: size });
    return none;
  }
  lastSize.set(tabId, { last: size, start: state.start });
  return {
    width: size.width !== state.start.width,
    height: size.height !== state.start.height,
    dw: Math.abs(size.width - state.last.width),
    dh: Math.abs(size.height - state.last.height)
  };
}

async function showIconSize(tabId) {
  const read = (latestRead.get(tabId) || 0) + 1;
  latestRead.set(tabId, read);
  const fromPage = measured.get(tabId);
  measured.delete(tabId);
  const settings = await iconSizeSettings();
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  if (!iconSizeOn(settings)) {
    await clearIconSize(tabId);
    return;
  }
  if (!tab.active) return;
  if (!fromPage) void watchResize(tabId);
  const viewport = fromPage ? fromPage : settings.width || settings.height ? await viewportOf(tab) : null;
  const win = !settings.window ? null : fromPage ? { width: fromPage.windowWidth, height: fromPage.windowHeight }
    : await chrome.windows.get(tab.windowId).catch(() => null);
  if (latestRead.get(tabId) !== read) return;

  const values = [];
  if (settings.width && viewport?.width) values.push({ line: `Viewport width: ${viewport.width} px` });
  if (settings.height && viewport?.height) values.push({ line: `Viewport height: ${viewport.height} px` });
  if (win?.width) values.push({ line: `Window: ${win.width} × ${win.height} px` });

  const title = [defaultTitle, ...values.map((value) => value.line)].join('\n');
  await chrome.action.setTitle({ tabId, title }).catch(() => {});

  // The badge fits about four digits, so it carries one value: the side being
  // dragged, of the viewport if that side is on, or else of the window if the
  // window is on. A corner drag moves both sides: it shows the width while the
  // pointer moves more along X, the height while it moves more along Y. A
  // read that finds no drag leaves a lingering number alone.
  const drag = dragOf(tabId, viewport || win);
  if (!drag.width && !drag.height) {
    if (!hideTimers.has(tabId)) await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    return;
  }
  const side = drag.width && drag.height ? (drag.dh > drag.dw ? 'height' : 'width') : drag.height ? 'height' : 'width';
  const shown = (settings[side] && viewport?.[side]) || win?.[side] || null;
  clearTimeout(hideTimers.get(tabId));
  hideTimers.delete(tabId);
  if (!shown) {
    await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    return;
  }
  hideTimers.set(tabId, setTimeout(() => {
    hideTimers.delete(tabId);
    void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }, LINGER_MS));
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text: String(shown) }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: side === 'height' ? HEIGHT_COLOR : WIDTH_COLOR }),
    chrome.action.setBadgeTextColor?.({ tabId, color: BADGE_TEXT_COLOR })
  ]).catch(() => {});
}

// Only the tab a person looks at needs the number; the others catch up when
// they are activated. While a window is dragged the number is read every
// LIVE_MS, and once the events stop it is read again after SETTLE_MS, when the
// page has surely taken its final size.
function settleIconSize(tabId, fromPage) {
  if (fromPage) measured.set(tabId, fromPage);
  if (!liveTimers.has(tabId)) {
    liveTimers.set(tabId, setTimeout(() => {
      liveTimers.delete(tabId);
      void showIconSize(tabId);
    }, LIVE_MS));
  }
  clearTimeout(settleTimers.get(tabId));
  settleTimers.set(tabId, setTimeout(() => {
    settleTimers.delete(tabId);
    void showIconSize(tabId);
  }, SETTLE_MS));
}

async function refreshActiveTabs() {
  const tabs = await chrome.tabs.query({ active: true });
  tabs.forEach((tab) => settleIconSize(tab.id));
}

async function clearAllTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => clearIconSize(tab.id)));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'icon-size-resize' || !sender.tab) return false;
  iconSizeSettings().then((settings) => {
    const active = Boolean(iconSizeOn(settings));
    sendResponse({ active });
    if (active && sender.tab.active) settleIconSize(sender.tab.id, message);
  });
  return true;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  lastSize.delete(tabId);
  settleIconSize(tabId);
});
chrome.tabs.onZoomChange?.addListener(({ tabId }) => settleIconSize(tabId));
// A navigation resets a tab's badge, so it is set again once the page loads.
// Whether the tab is the one in view is decided when the number is read.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status || changeInfo.url) settleIconSize(tabId);
});
chrome.windows.onBoundsChanged.addListener(async (win) => {
  const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
  tabs.forEach((tab) => settleIconSize(tab.id));
});

chrome.storage.onChanged.addListener((changes, area) => {
  const change = area === 'local' && changes[ICON_SIZE_KEY];
  if (!change) return;
  if (iconSizeOn({ ...ICON_SIZE_DEFAULTS, ...change.newValue })) void refreshActiveTabs();
  else void clearAllTabs();
});

// The worker also starts when the browser does, and after it was stopped.
void refreshActiveTabs();
