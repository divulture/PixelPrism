async function openStudioForTab(tab) {
  const url = tab.url && /^(?:https?|file):\/\//.test(tab.url) ? tab.url : '';
  const studioUrl = new URL(chrome.runtime.getURL('studio.html'));
  if (url) studioUrl.searchParams.set('url', url);
  if (url.startsWith('file://')) {
    const hasFileAccess = await chrome.extension.isAllowedFileSchemeAccess();
    studioUrl.searchParams.set('fileAccess', String(hasFileAccess));
  }
  if (tab.favIconUrl && /^https?:\/\//.test(tab.favIconUrl)) {
    studioUrl.searchParams.set('favicon', tab.favIconUrl);
  }
  await chrome.tabs.create({ url: studioUrl.href });
}

chrome.action.onClicked.addListener(openStudioForTab);

const contextMenuId = 'open-pixelprism';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: contextMenuId,
    title: 'Открыть в PixelPrism',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === contextMenuId && tab) {
    openStudioForTab(tab);
  }
});

function waitForTabLoad(tabId, timeout = 12000) {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
    };
    const timer = setTimeout(finish, timeout);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish();
    }).catch(finish);
  });
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForCaptureReady(debuggee) {
  // A load event does not mean the page is visually settled: fonts, image
  // decoding and entrance transitions can still be in progress.
  await chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `Promise.race([
      Promise.all([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        Promise.all([...document.images].map((image) => image.decode?.().catch(() => {}) || Promise.resolve()))
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ])`
  }).catch(() => {});
  await pause(650);
}

async function captureViewport({ url, width, height, returnWindowId }) {
  const viewportWidth = Math.max(1, Math.round(width));
  const viewportHeight = Math.max(1, Math.round(height));
  const previewTab = await chrome.tabs.create({ url: 'about:blank', active: false });
  const debuggee = { tabId: previewTab.id };
  try {
    if (!previewTab?.id) throw new Error('Unable to open a temporary viewport.');

    await chrome.debugger.attach(debuggee, '1.3');
    await chrome.debugger.sendCommand(debuggee, 'Page.enable');
    await chrome.debugger.sendCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
      mobile: false
    });
    await chrome.debugger.sendCommand(debuggee, 'Page.navigate', { url });
    await waitForTabLoad(previewTab.id);
    await waitForCaptureReady(debuggee);
    const result = await chrome.debugger.sendCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: viewportWidth, height: viewportHeight, scale: 1 },
      captureBeyondViewport: true,
      fromSurface: true
    });
    if (!result?.data) throw new Error('Chrome did not return an image for the screenshot.');
    return `data:image/png;base64,${result.data}`;
  } finally {
    if (previewTab.id !== undefined) {
      await chrome.debugger.detach(debuggee).catch(() => {});
      await chrome.tabs.remove(previewTab.id).catch(() => {});
    }
    if (Number.isInteger(returnWindowId)) {
      await chrome.windows.update(returnWindowId, { focused: true }).catch(() => {});
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'file-scheme-access') {
    chrome.extension.isAllowedFileSchemeAccess()
      .then((allowed) => sendResponse({ ok: true, allowed }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'save-change-report') {
    const markdown = typeof message.markdown === 'string' ? message.markdown : '';
    if (!markdown) {
      sendResponse({ ok: false, error: 'There are no changes in the log.' });
      return;
    }
    chrome.downloads.download({
      url: `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`,
      filename: message.filename || `pixelprism-changes-${Date.now()}.md`,
      saveAs: false
    })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'save-capture') {
    chrome.downloads.download({
      url: message.dataUrl,
      filename: message.filename,
      saveAs: false
    })
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'capture-viewport') {
    captureViewport(message)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  const tabId = sender.tab?.id ?? message?.tabId;
  if (!Number.isInteger(tabId)) return;
  if (message?.type === 'capture-studio') {
    chrome.tabs.get(tabId)
      .then((tab) => chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }))
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
});
