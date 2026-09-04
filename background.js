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
  // Menu items survive extension reloads and updates, so recreate from scratch
  // instead of failing on the duplicate id.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: contextMenuId,
      title: 'Открыть в PixelPrism',
      contexts: ['page']
    }, () => {
      // Reading lastError marks a rare duplicate-id race as handled.
      void chrome.runtime.lastError;
    });
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

// A background tab rasters its layers lazily: the first full-size capture
// can miss whole layers, such as a sticky sidebar or table of contents that
// are in the DOM but not painted yet. That capture makes Chrome paint them,
// so screenshots are taken until two in a row match.
async function captureStableScreenshot(capture) {
  let result = await capture();
  for (let attempt = 0; attempt < 4 && result?.data; attempt += 1) {
    await pause(150);
    const next = await capture();
    if (!next?.data || next.data === result.data) break;
    result = next;
  }
  return result;
}

async function stylesheetTextFromDebugger(tabId, url) {
  const debuggee = { tabId };
  const headers = [];
  const sameStylesheet = (sourceUrl) => {
    if (!sourceUrl) return false;
    if (sourceUrl === url) return true;
    try {
      const left = new URL(sourceUrl);
      const right = new URL(url);
      left.hash = '';
      right.hash = '';
      return left.href === right.href || (left.search = '', right.search = '', left.href === right.href);
    } catch {
      return sourceUrl.split('?')[0] === url.split('?')[0];
    }
  };
  const onEvent = (source, method, params) => {
    if (source.tabId === tabId && method === 'CSS.styleSheetAdded' && params?.header) {
      headers.push(params.header);
    }
  };
  chrome.debugger.onEvent.addListener(onEvent);
  try {
    await chrome.debugger.attach(debuggee, '1.3');
    await chrome.debugger.sendCommand(debuggee, 'DOM.enable').catch(() => {});
    await chrome.debugger.sendCommand(debuggee, 'CSS.enable');
    await pause(120);
    const header = headers.find((candidate) => sameStylesheet(candidate.sourceURL));
    if (!header?.styleSheetId) throw new Error('Stylesheet was not reported by DevTools.');
    const result = await chrome.debugger.sendCommand(debuggee, 'CSS.getStyleSheetText', {
      styleSheetId: header.styleSheetId
    });
    if (typeof result?.text !== 'string') throw new Error('DevTools did not return stylesheet text.');
    return result.text;
  } finally {
    chrome.debugger.onEvent.removeListener(onEvent);
    await chrome.debugger.detach(debuggee).catch(() => {});
  }
}

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
    const result = await captureStableScreenshot(() => chrome.debugger.sendCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: viewportWidth, height: viewportHeight, scale: 1 },
      captureBeyondViewport: true,
      fromSurface: true
    }));
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

// Shared by review scripts that run inside the captured page. It resolves an
// element recorded in the studio back to the same node on a fresh load.
const REVIEW_ELEMENT_HELPERS = `
    // Mirrors the popup helpers in inspector.js (isPopupLayer, popupLayerFor,
    // shownPopupLayers): popups are named ones, or floating layers high above
    // the page, or in the top layer.
    const GENERATED_ID = /[:«»]|^(radix-|headlessui-|mui-\\d|react-aria|react-select-\\d|rc[_-]|downshift-\\d|floating-ui-|base-ui-|ember\\d)|[0-9a-f]{8}-[0-9a-f]{4}-/i;
    const POPUP_SELECTOR = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], [role="listbox"], [popover], [class*="modal" i], [class*="dialog" i], [class*="drawer" i], [class*="popover" i], [class*="popup" i], [class*="dropdown-menu" i]';
    const isShown = (node) => {
      if (!node.isConnected) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
    };
    const visiblePopups = () => {
      const nodes = [...document.querySelectorAll(POPUP_SELECTOR)].filter((node) => {
        if (node.closest('[data-viewport-parade-overlay]') || !isShown(node)) return false;
        if (node.matches('dialog, [role], [aria-modal], [popover]')) return !node.matches('[popover]') || node.matches(':popover-open');
        return ['fixed', 'absolute'].includes(getComputedStyle(node).position);
      });
      return nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
    };
    const isPopupLayer = (node, loose = false) => {
      if (node.matches(':popover-open, dialog[open]')) return true;
      const style = getComputedStyle(node);
      const floating = style.position === 'fixed' || style.position === 'absolute';
      if (node.matches(POPUP_SELECTOR)) return node.matches('dialog, [role], [aria-modal], [popover]') || floating;
      if (!floating) return false;
      const z = Number.parseInt(style.zIndex, 10);
      return loose || (Number.isFinite(z) && z >= 10);
    };
    const popupLayerFor = (node, trigger = null, loose = false) => {
      let layer = null;
      for (let current = node instanceof Element ? node : node && node.parentElement; current && current !== document.body && current !== document.documentElement; current = current.parentElement) {
        if (current.hasAttribute('data-viewport-parade-overlay')) return null;
        if (trigger && current.contains(trigger)) break;
        if (isPopupLayer(current, loose)) layer = current;
      }
      return layer;
    };
    const shownPopupLayers = () => {
      const layers = new Set(visiblePopups());
      const visit = (node, depth) => {
        if (depth > 4 || !node || node.hasAttribute('data-viewport-parade-overlay')) return;
        if (isPopupLayer(node) && isShown(node)) {
          layers.add(node);
          return;
        }
        [...node.children].forEach((child) => visit(child, depth + 1));
      };
      [...(document.body ? document.body.children : [])].forEach((child) => visit(child, 0));
      return [...layers];
    };
    const queryOne = (selector) => {
      if (!selector || typeof selector !== 'string') return null;
      try {
        const matches = document.querySelectorAll(selector);
        return matches.length === 1 ? matches[0] : null;
      } catch { return null; }
    };
    const matchesContext = (element, context = {}) => {
      if (!(element instanceof Element)) return false;
      if (context.tag && element.tagName.toLowerCase() !== context.tag) return false;
      if (context.id && !GENERATED_ID.test(context.id) && element.id !== context.id) return false;
      return !Array.isArray(context.classes) || !context.classes.length
        || context.classes.every((name) => element.classList.contains(name));
    };
    const queryAll = (selector) => {
      if (!selector || typeof selector !== 'string') return [];
      try { return [...document.querySelectorAll(selector)].slice(0, 400); } catch { return []; }
    };
    const normalizeText = (value) => String(value ?? '').replace(/\\s+/g, ' ').trim();
    const snippetFor = (element) => {
      const clone = element.cloneNode(true);
      [...clone.attributes].forEach((attribute) => {
        if (attribute.name.startsWith('data-viewport-parade-') || attribute.name.startsWith('data-pixelprism-')) clone.removeAttribute(attribute.name);
      });
      if (clone.children.length) clone.replaceChildren(document.createTextNode('…'));
      return normalizeText(clone.outerHTML);
    };
    // Child indices from <html>, recorded by the inspector. Studio overlays
    // are skipped so they do not shift the positions.
    const elementAtIndexPath = (path) => {
      if (!Array.isArray(path) || !path.length) return null;
      let node = document.documentElement;
      for (const index of path) {
        const children = [...node.children].filter((child) => !child.hasAttribute('data-viewport-parade-overlay'));
        node = children[index];
        if (!node) return null;
      }
      return node;
    };
    // Items of a popup share their markup and a portal moves around the page
    // between loads, so they are checked by text too (textAgrees in inspector.js).
    const textAgrees = (element, context) => {
      if (!context || !context.popup || !context.text) return true;
      const text = normalizeText(context.text).replace(/…$/, '');
      const own = normalizeText(element.textContent);
      return own === text || own.startsWith(text);
    };
    const elementInPopups = (context) => {
      if (!context || !context.popup || !Array.isArray(context.popup.path)) return null;
      for (const layer of shownPopupLayers()) {
        let node = layer;
        for (const index of context.popup.path) node = node && node.children[index];
        if (node && matchesContext(node, context) && textAgrees(node, context)) return node;
      }
      return null;
    };
    const elementFor = (entry = {}) => {
      const context = entry.element || entry || {};
      if (context.id && !GENERATED_ID.test(context.id)) {
        const byId = document.getElementById(context.id);
        if (byId && matchesContext(byId, context)) return byId;
      }
      const attributes = context.attributes || {};
      for (const name of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'role', 'aria-label', 'href', 'type']) {
        const value = attributes[name];
        if (value === null || value === undefined || value === '') continue;
        const match = queryOne('[' + CSS.escape(name) + '=\"' + CSS.escape(String(value)) + '\"]');
        if (match && matchesContext(match, context) && textAgrees(match, context)) return match;
      }
      const inPopup = elementInPopups(context);
      if (inPopup) return inPopup;
      const byIndexPath = elementAtIndexPath(context.indexPath);
      if (byIndexPath && matchesContext(byIndexPath, context) && textAgrees(byIndexPath, context)) return byIndexPath;
      const candidates = [];
      for (const selector of [context.domPath, context.selector, entry.selector]) {
        const matches = queryAll(selector).filter((element) => matchesContext(element, context));
        if (matches.length === 1 && textAgrees(matches[0], context)) return matches[0];
        matches.forEach((element) => { if (!candidates.includes(element)) candidates.push(element); });
      }
      if (!candidates.length) return null;
      // Several elements share the selector (cards, list items, images):
      // prefer the one whose markup and text match what was recorded.
      const snippet = normalizeText(context.htmlSnippet).replace(/…$/, '');
      const text = normalizeText(context.text).replace(/…$/, '');
      let best = null;
      let bestScore = 0;
      candidates.forEach((element) => {
        let score = 0;
        if (snippet) {
          const candidateSnippet = snippetFor(element);
          if (candidateSnippet === snippet) score += 4;
          else if (candidateSnippet.startsWith(snippet) || snippet.startsWith(candidateSnippet.slice(0, 80))) score += 2;
        }
        if (text) {
          const candidateText = normalizeText(element.textContent);
          if (candidateText === text) score += 3;
          else if (candidateText.startsWith(text)) score += 2;
        }
        if (score > bestScore) { best = element; bestScore = score; }
      });
      return best || (candidates.length === 1 && textAgrees(candidates[0], context) ? candidates[0] : null);
    };
`;

// The element that scrolls the page. Usually the window, but app-like sites
// often keep the window still and scroll a full-screen container instead,
// sometimes only at some widths. Mirrors pageScroller() in inspector.js.
const REVIEW_SCROLLER_HELPERS = `
    const pageScroller = () => {
      const root = document.scrollingElement || document.documentElement;
      let range = root.scrollHeight - window.innerHeight;
      if (range > window.innerHeight / 4) return null;
      let best = null;
      for (const element of document.body ? document.body.querySelectorAll('*') : []) {
        const elementRange = element.scrollHeight - element.clientHeight;
        if (elementRange <= range || element.clientHeight < window.innerHeight / 2 || element.clientWidth < window.innerWidth / 2) continue;
        if (!/(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY)) continue;
        best = element;
        range = elementRange;
      }
      return best;
    };
`;

function reviewPreparationExpression({ changes = [], keepScroll = false }) {
  const payload = JSON.stringify({ changes, keepScroll });
  return `(async () => {
    const payload = ${payload};
    ${REVIEW_ELEMENT_HELPERS}
    ${REVIEW_SCROLLER_HELPERS}

    payload.changes.forEach((change) => {
      const element = elementFor(change);
      if (!element || !change.property) return;
      if (String(change.to ?? '').trim()) element.style.setProperty(change.property, String(change.to), 'important');
      else element.style.removeProperty(change.property);
    });

    // Review tabs stay in the background, where requestAnimationFrame may never fire.
    await new Promise((resolve) => { requestAnimationFrame(resolve); setTimeout(resolve, 60); });
    if (!payload.keepScroll) (pageScroller() || window).scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return { scrollX: window.scrollX, scrollY: window.scrollY };
  })()`;
}

function navigateDebuggerPage(debuggee, url, timeout = 6000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.debugger.onEvent.removeListener(onEvent);
      if (error) reject(error);
      else resolve();
    };
    const onEvent = (source, method) => {
      if (source.tabId === debuggee.tabId && method === 'Page.loadEventFired') finish();
    };
    const timer = setTimeout(finish, timeout);
    chrome.debugger.onEvent.addListener(onEvent);
    chrome.debugger.sendCommand(debuggee, 'Page.navigate', { url }).catch(finish);
  });
}

function backgroundPromiseTimeout(promise, timeout, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeout);
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function reviewDebuggerCommand(debuggee, method, params, timeout = 8000) {
  return backgroundPromiseTimeout(
    chrome.debugger.sendCommand(debuggee, method, params),
    timeout,
    `${method} timed out while preparing the review.`
  );
}

const reviewIdentityCache = new Map();

function bytesToDataUrl(bytes, mimeType) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function fetchReviewLogo(candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate) continue;
    if (candidate.startsWith('data:image/')) return candidate.length <= 2_000_000 ? candidate : '';
    if (!/^https?:\/\//i.test(candidate)) continue;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch(candidate, { cache: 'force-cache', signal: controller.signal });
      if (!response.ok) continue;
      const type = response.headers.get('content-type')?.split(';')[0] || 'image/png';
      if (!type.startsWith('image/')) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 1_500_000) continue;
      return bytesToDataUrl(bytes, type);
    } catch {
      // Try the next favicon candidate.
    } finally {
      clearTimeout(timer);
    }
  }
  return '';
}

async function readReviewIdentity(debuggee, url) {
  const result = await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const icons = [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')]
        .map((link) => {
          const sizes = [...(link.sizes || [])].map((size) => Number(size.split('x')[0]) || 0);
          const score = Math.max(0, ...sizes, link.rel.includes('apple-touch') ? 180 : 0);
          return { href: link.href, score };
        })
        .filter((icon) => icon.href)
        .sort((left, right) => right.score - left.score);
      const name = document.querySelector('meta[property="og:site_name"]')?.content
        || document.querySelector('meta[name="application-name"]')?.content
        || document.title;
      return { name: String(name || '').trim(), icons: icons.map((icon) => icon.href) };
    })()`
  }, 3000).catch(() => null);
  const value = result?.result?.value || {};
  let fallbackName = '';
  let fallbackIcon = '';
  try {
    const parsed = new URL(url);
    fallbackName = parsed.hostname.replace(/^www\./, '');
    if (/^https?:$/.test(parsed.protocol)) fallbackIcon = new URL('/favicon.ico', parsed.origin).href;
  } catch {
    fallbackName = String(url || '');
  }
  const logoDataUrl = await fetchReviewLogo([...(Array.isArray(value.icons) ? value.icons : []), fallbackIcon]);
  return { name: value.name || fallbackName || 'Website', logoDataUrl };
}

function reviewIdentityFor(debuggee, url) {
  const key = String(url || '').split('#')[0];
  if (!reviewIdentityCache.has(key)) {
    const promise = readReviewIdentity(debuggee, url).catch((error) => {
      reviewIdentityCache.delete(key);
      throw error;
    });
    reviewIdentityCache.set(key, promise);
  }
  return reviewIdentityCache.get(key);
}

async function waitForReviewCaptureReady(debuggee) {
  await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
    awaitPromise: true,
    returnByValue: true,
    expression: `Promise.race([
      Promise.all([
        document.fonts ? document.fonts.ready : Promise.resolve(),
        Promise.all([...document.images].map((image) => image.decode?.().catch(() => {}) || Promise.resolve()))
      ]),
      new Promise((resolve) => setTimeout(resolve, 900))
    ])`
  }, 2200).catch(() => {});
  await pause(160);
}

// Counts in-flight requests of the review tab. Must start before navigation
// so the page's own API calls are seen from the first request.
function trackReviewNetwork(debuggee) {
  const pending = new Map();
  let lastActivity = Date.now();
  const onEvent = (source, method, params) => {
    if (source.tabId !== debuggee.tabId || !params?.requestId) return;
    if (method === 'Network.requestWillBeSent') {
      // Streams never finish; they must not hold the capture back.
      if (params.type === 'WebSocket' || params.type === 'EventSource') return;
      pending.set(params.requestId, Date.now());
      lastActivity = Date.now();
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      if (pending.delete(params.requestId)) lastActivity = Date.now();
    }
  };
  chrome.debugger.onEvent.addListener(onEvent);
  return {
    // Idle like "networkidle": nothing in flight for a moment, or only a
    // couple of long-lived requests (long polling, analytics) left alone.
    isIdle() {
      const quiet = Date.now() - lastActivity;
      return (pending.size === 0 && quiet >= 500) || (pending.size <= 2 && quiet >= 1500);
    },
    dispose() {
      chrome.debugger.onEvent.removeListener(onEvent);
    }
  };
}

const REVIEW_LOADING_EXPRESSION = `(() => {
  const selector = '[aria-busy="true"], [class*="skeleton" i], [class*="shimmer" i], [class*="spinner" i], [class*="loader" i], [class*="loading" i], [class*="placeholder-glow" i], [class*="placeholder-wave" i]';
  const loaders = [...document.querySelectorAll(selector)].filter((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
  }).length;
  const body = document.body;
  return {
    loaders,
    signature: body ? body.getElementsByTagName('*').length + ':' + body.innerText.length : ''
  };
})()`;

// Skeleton screens render right away and are replaced when the data arrives,
// so "elements exist" is not enough. Wait until the network is quiet, the DOM
// stops changing and visible loaders are gone. Loader-like classes that stay
// forever only delay the capture until the DOM has been stable for a while.
async function waitForReviewPageSettled(debuggee, network, timeout = 12000) {
  const deadline = Date.now() + timeout;
  let lastSignature = '';
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    // Background tabs do not paint, so rAF-driven rendering would stall.
    await renderReviewFrame(debuggee);
    const result = await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
      expression: REVIEW_LOADING_EXPRESSION,
      returnByValue: true
    }, 3000).catch(() => null);
    const state = result?.result?.value;
    if (state) {
      if (state.signature !== lastSignature) {
        lastSignature = state.signature;
        stableSince = Date.now();
      }
      const stableFor = Date.now() - stableSince;
      if (network.isIdle() && ((state.loaders === 0 && stableFor >= 600) || stableFor >= 2500)) return;
    }
    await pause(200);
  }
}

// Single-page apps fire the load event long before they render (auth checks,
// API calls), so reviewed elements can appear seconds later. Wait until every
// recorded element is present, or until the found set stops growing.
async function waitForReviewTargets(debuggee, targets, changes = [], timeout = 10000) {
  const lookups = [
    ...targets.map(({ id, target }) => ({ id, target })),
    ...changes.map((change, index) => ({ id: `change:${index}`, target: change }))
  ].filter(({ target }) => target);
  if (!lookups.length) return;
  const deadline = Date.now() + timeout;
  let lastFound = -1;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const measurement = await measureReviewTargets(debuggee, lookups).catch(() => null);
    const found = measurement ? measurement.rects.filter((rect) => rect.found).length : 0;
    if (found === lookups.length) return;
    if (found !== lastFound) {
      lastFound = found;
      stableSince = Date.now();
    } else if (found > 0 && Date.now() - stableSince >= 2000) {
      // Some elements are gone for good (edited page, other route); the
      // rest have rendered, so do not wait for the full timeout.
      return;
    }
    await renderReviewFrame(debuggee);
    await pause(250);
  }
}

// The view a comment was left in is brought back step by step: tabs and
// panels switched, menus and selects opened, hover menus and states held.
// Each step gets real input first (Chrome's own mouse, as a person would
// press), then the press as page events, then the keys that open menus and
// selects; it counts once the popup is seen open or the switch reads as
// switched. Mirrors replayViewSteps in inspector.js.
async function evaluateReviewValue(debuggee, expression, timeout = 8000) {
  const result = await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
  return result?.result?.value;
}

// Finds the step's control, scrolls it to the middle of the screen and
// starts watching for the popup a press opens (watchForPopup in inspector.js).
function reviewStepLocateExpression(step) {
  return `(async () => {
    const step = ${JSON.stringify({ kind: step.kind, element: step.element, expanded: step.expanded, open: step.open })};
    ${REVIEW_ELEMENT_HELPERS}
    const control = elementFor({ element: step.element });
    if (!control) return { found: false };
    window.__pixelPrismReviewControl = control;
    if (step.kind !== 'open' && step.kind !== 'hover') {
      if (step.expanded && control.getAttribute('aria-expanded') === step.expanded) return { found: true, done: true };
      if (typeof step.open === 'boolean' && control.parentElement instanceof HTMLDetailsElement && control.parentElement.open === step.open) return { found: true, done: true };
      if (!step.expanded && typeof step.open !== 'boolean' && control.getAttribute('aria-selected') === 'true') return { found: true, done: true };
    }
    control.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    await new Promise((resolve) => setTimeout(resolve, 60));
    const rect = control.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (window.__pixelPrismPopupWatch) window.__pixelPrismPopupWatch.stop();
    const changed = new Set();
    const observer = new MutationObserver((records) => records.forEach((record) => {
      if (record.type === 'childList') record.addedNodes.forEach((node) => changed.add(node));
      else changed.add(record.target);
    }));
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'data-state', 'aria-expanded'] });
    window.__pixelPrismPopupWatch = { changed, before: new Set(visiblePopups()), stop: () => observer.disconnect() };
    // A menu button is hovered before it is pressed: a menu that opens on
    // hover (Webflow) would close again on the press.
    const hoverFirst = step.expanded === 'true' || control.hasAttribute('aria-haspopup');
    return { found: true, done: false, x, y, hoverFirst, hit: Boolean(hit && (hit === control || control.contains(hit))) };
  })()`;
}

// Whether the step took: a popup opened by the press, or the switch in its
// recorded state (null when the switch has no readable state).
function reviewStepCheckExpression(step) {
  return `(() => {
    const step = ${JSON.stringify({ kind: step.kind, expanded: step.expanded, open: step.open })};
    ${REVIEW_ELEMENT_HELPERS}
    const control = window.__pixelPrismReviewControl;
    const watch = window.__pixelPrismPopupWatch;
    if (!control || !watch) return { popup: false, expanded: false, matched: null };
    const expanded = control.getAttribute('aria-expanded');
    const isSizable = (node) => {
      const rect = node.getBoundingClientRect();
      return rect.width >= 24 && rect.height >= 16;
    };
    const findPopup = () => {
      if (expanded !== 'false') {
        const ids = ((control.getAttribute('aria-controls') || '') + ' ' + (control.getAttribute('aria-owns') || '')).split(/\\s+/).filter(Boolean);
        for (const id of ids) {
          const named = document.getElementById(id);
          const layer = named && popupLayerFor(named, control, true);
          if (layer && isShown(layer)) return layer;
        }
      }
      const checked = new Set();
      for (const node of watch.changed) {
        const element = node instanceof Element ? node : node.parentElement;
        if (!element || !element.isConnected || checked.has(element) || checked.size > 300) continue;
        checked.add(element);
        // A portal is added as a plain wrapper with the popup a few levels inside.
        let inside = null;
        if (!control.contains(element)) {
          const queue = [[element, 0]];
          for (let index = 0; index < queue.length && index < 200 && !inside; index += 1) {
            const [candidate, depth] = queue[index];
            if (candidate !== element && isPopupLayer(candidate) && isShown(candidate)) inside = candidate;
            else if (depth < 4) [...candidate.children].forEach((child) => queue.push([child, depth + 1]));
          }
        }
        const layer = popupLayerFor(element, control) || (inside && popupLayerFor(inside, control));
        if (layer && !watch.before.has(layer) && isShown(layer) && isSizable(layer)) return layer;
      }
      return visiblePopups().find((node) => !watch.before.has(node) && !node.contains(control)) || null;
    };
    let matched = null;
    if (step.expanded) matched = expanded === step.expanded;
    else if (typeof step.open === 'boolean' && control.parentElement instanceof HTMLDetailsElement) matched = control.parentElement.open === step.open;
    else {
      const selected = control.getAttribute('aria-selected');
      if (selected === 'true' || selected === 'false') matched = selected === 'true';
      else if (control.matches('input[type="radio"]')) matched = control.checked;
    }
    return { popup: Boolean(findPopup()), expanded: expanded === 'true', matched };
  })()`;
}

const REVIEW_KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 }
};

async function pressReviewControl(debuggee, method, located) {
  if (method === 'hover') {
    if (located.hit) {
      await reviewDebuggerCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: located.x, y: located.y });
      return;
    }
    await evaluateReviewValue(debuggee, `(() => {
      const control = window.__pixelPrismReviewControl;
      if (!control) return false;
      const box = control.getBoundingClientRect();
      const nodes = [];
      for (let node = control; node; node = node.parentElement) nodes.unshift(node);
      const send = (node, type, bubbles) => {
        const init = { bubbles, cancelable: true, composed: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, button: 0, buttons: 0, relatedTarget: null };
        node.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, init));
      };
      send(control, 'pointerover', true);
      nodes.forEach((node) => send(node, 'pointerenter', false));
      send(control, 'mouseover', true);
      nodes.forEach((node) => send(node, 'mouseenter', false));
      return true;
    })()`);
    return;
  }
  if (method === 'mouse') {
    const point = { x: located.x, y: located.y };
    await reviewDebuggerCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await reviewDebuggerCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    await reviewDebuggerCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    return;
  }
  if (method === 'events') {
    // The press as page events (pressControl in inspector.js), for a control
    // that something else covers at its middle.
    await evaluateReviewValue(debuggee, `(() => {
      const control = window.__pixelPrismReviewControl;
      if (!control) return false;
      const box = control.getBoundingClientRect();
      const send = (type, bubbles, buttons = 0) => {
        const init = { bubbles, cancelable: true, composed: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, button: 0, buttons, relatedTarget: null };
        control.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, init));
      };
      send('pointerover', true);
      send('pointerenter', false);
      send('mouseover', true);
      send('mouseenter', false);
      send('pointerdown', true, 1);
      send('mousedown', true, 1);
      if (control.focus) control.focus({ preventScroll: true });
      send('pointerup', true);
      send('mouseup', true);
      control.click();
      return true;
    })()`);
    return;
  }
  const key = REVIEW_KEYS[method];
  if (!key) return;
  await evaluateReviewValue(debuggee, `(() => { const control = window.__pixelPrismReviewControl; if (control && control.focus) control.focus({ preventScroll: true }); return true; })()`);
  await reviewDebuggerCommand(debuggee, 'Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await reviewDebuggerCommand(debuggee, 'Input.dispatchKeyEvent', { type: 'keyUp', key: key.key, code: key.code, windowsVirtualKeyCode: key.windowsVirtualKeyCode });
}

// Background tabs paint no frames, so each check renders one: menus that
// animate in (opacity, Framer Motion, Headless UI) get to finish.
async function waitForReviewStep(debuggee, step, timeout) {
  const opens = step.kind === 'open' || step.kind === 'hover';
  const deadline = Date.now() + timeout;
  let last = {};
  do {
    await renderReviewFrame(debuggee);
    last = await evaluateReviewValue(debuggee, reviewStepCheckExpression(step), 3000).catch(() => null) || last;
    if (opens ? last.popup || last.expanded : last.matched === true) return last;
    await pause(120);
  } while (Date.now() < deadline);
  return last;
}

async function locateReviewStep(debuggee, step) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const located = await evaluateReviewValue(debuggee, reviewStepLocateExpression(step), 4000).catch(() => null);
    if (located?.found) return located;
    await renderReviewFrame(debuggee);
    await pause(200);
  }
  return null;
}

// Plays one step; resolves with { ok, popup }.
async function replayReviewStep(debuggee, step) {
  let located = await locateReviewStep(debuggee, step);
  if (!located) return { ok: false, popup: false };
  if (located.done) return { ok: true, popup: false };
  if (step.kind === 'hover') {
    await forceReviewState(debuggee, { state: 'hover', element: step.element });
    const result = await waitForReviewStep(debuggee, step, 1500);
    return { ok: Boolean(result.popup || result.expanded), popup: Boolean(result.popup) };
  }
  const opens = step.kind === 'open';
  const methods = [located.hoverFirst ? 'hover' : null, located.hit ? 'mouse' : null, 'events', 'Enter', 'ArrowDown'].filter(Boolean);
  for (const [index, method] of methods.entries()) {
    // A fresh watch for each try, so it compares with the page just before.
    if (index > 0) {
      located = await locateReviewStep(debuggee, step) || located;
      if (located.done) return { ok: true, popup: false };
    }
    await pressReviewControl(debuggee, method, located).catch(() => {});
    const result = await waitForReviewStep(debuggee, step, method === 'hover' ? 800 : opens ? (method === 'Enter' || method === 'ArrowDown' ? 1000 : 2000) : 500);
    // Hovering counts only when something is seen to open.
    const took = method === 'hover'
      ? result.popup || result.expanded || result.matched === true
      : opens ? result.popup || result.expanded : result.matched !== false;
    if (took) {
      if (result.popup) await settleReviewFrames(debuggee, 3);
      return { ok: true, popup: Boolean(result.popup) };
    }
  }
  return { ok: false, popup: false };
}

// Resolves with the labels of steps that could not be brought back, and
// whether the view is a popup (then captured without scrolling, which
// closes or moves many popups).
async function replayReviewSteps(debuggee, steps) {
  const failed = [];
  let popup = false;
  if (steps.some((step) => step.kind === 'state' || step.kind === 'hover')) {
    await reviewDebuggerCommand(debuggee, 'DOM.enable');
    await reviewDebuggerCommand(debuggee, 'CSS.enable');
    await reviewDebuggerCommand(debuggee, 'DOM.getDocument', { depth: 0 });
  }
  for (const step of steps) {
    if (step.kind === 'state') {
      await forceReviewState(debuggee, step).catch(() => null);
      continue;
    }
    const result = await replayReviewStep(debuggee, step).catch(() => ({ ok: false, popup: false }));
    if (!result.ok) failed.push(step.label || 'a hidden view');
    if (result.popup || step.kind === 'open' || step.kind === 'hover') popup = true;
  }
  await evaluateReviewValue(debuggee, `(() => { if (window.__pixelPrismPopupWatch) window.__pixelPrismPopupWatch.stop(); return true; })()`).catch(() => {});
  return { failed, popup };
}

// A comment left on a state (Hover, Focus, Pressed) is captured with the
// element in it: Chrome forces the pseudo-classes, as DevTools does. Hover
// and press reach the ancestors too, as with a real pointer. States a script
// draws (Framer Motion, React) get the pointer or focus events, as in Studio.
// DOM and CSS are enabled by replayReviewSteps.
const REVIEW_FORCED_STATES = {
  hover: { element: ['hover'], ancestors: ['hover'] },
  focus: { element: ['focus', 'focus-visible', 'focus-within'], ancestors: ['focus-within'] },
  active: { element: ['hover', 'active'], ancestors: ['hover', 'active'] }
};

async function forceReviewState(debuggee, step) {
  const forced = REVIEW_FORCED_STATES[step?.state];
  if (!forced) return;
  await forcePseudoClasses(debuggee, `(() => {
      const step = ${JSON.stringify({ element: step.element, state: step.state })};
      ${REVIEW_ELEMENT_HELPERS}
      const nodes = [];
      for (let node = elementFor(step); node; node = node.parentElement) nodes.push(node);
      const element = nodes[0];
      if (!element) return nodes;
      if (step.state === 'focus') {
        // A tab selects itself on focus (sendStateEvents in inspector.js).
        if (element.matches('[role="tab"]')) return nodes;
        element.dispatchEvent(new FocusEvent('focus', { composed: true }));
        element.dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
        return nodes;
      }
      const box = element.getBoundingClientRect();
      const send = (node, type, bubbles, buttons = 0) => {
        const init = { bubbles, cancelable: true, composed: true, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, button: 0, buttons, relatedTarget: null };
        node.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, init));
      };
      send(element, 'pointerover', true);
      nodes.slice().reverse().forEach((node) => send(node, 'pointerenter', false));
      send(element, 'mouseover', true);
      nodes.slice().reverse().forEach((node) => send(node, 'mouseenter', false));
      if (step.state === 'active') send(element, 'pointerdown', true, 1);
      return nodes;
    })()`, forced.element, forced.ancestors);
  // Let transitions and script animations finish before the capture.
  await settleReviewFrames(debuggee, 6);
}

function reviewMeasureExpression(targets) {
  const payload = JSON.stringify(targets.map(({ id, target }) => ({ id, target })));
  return `(() => {
    const targets = ${payload};
    ${REVIEW_ELEMENT_HELPERS}
    ${REVIEW_SCROLLER_HELPERS}
    const isFixed = (element) => {
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
        if (getComputedStyle(node).position === 'fixed') return true;
      }
      return false;
    };
    const root = document.documentElement;
    const scroller = pageScroller();
    // scrollY is the page scroll that places elements; clipY is where the
    // screenshot clip starts, which stays with the window.
    const scrollY = scroller ? scroller.scrollTop : window.scrollY;
    return {
      scrollY,
      clipY: window.scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentHeight: scroller
        ? window.innerHeight + scroller.scrollHeight - scroller.clientHeight
        : Math.max(root.scrollHeight, document.body?.scrollHeight || 0, root.clientHeight),
      rects: targets.map(({ id, target }) => {
        // A point placed by hand in a review, in document coordinates.
        const pin = target && target.pin;
        if (pin && Number.isFinite(pin.x) && Number.isFinite(pin.y)) {
          return { id, found: true, visible: true, fixed: false, x: pin.x, y: pin.y, width: 0, height: 0 };
        }
        const element = elementFor(target);
        if (!element) {
          // Gone from the page: mark where the element was when commented.
          const recorded = target && target.element && target.element.rect;
          if (recorded && [recorded.x, recorded.y, recorded.width, recorded.height].every(Number.isFinite)) {
            return { id, found: true, visible: true, fixed: false, x: recorded.x, y: recorded.y, width: recorded.width, height: recorded.height };
          }
          return { id, found: false };
        }
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const visible = rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        return {
          id,
          found: true,
          visible,
          // Outside the scrolling container an element stays put, like a fixed one.
          fixed: isFixed(element) || Boolean(scroller && !scroller.contains(element)),
          x: rect.left + window.scrollX,
          y: rect.top + scrollY,
          width: rect.width,
          height: rect.height
        };
      })
    };
  })()`;
}

// A rendered frame runs IntersectionObserver callbacks and advances CSS
// transitions, which a background tab otherwise never does.
function renderReviewFrame(debuggee) {
  return reviewDebuggerCommand(debuggee, 'Page.captureScreenshot', {
    format: 'jpeg',
    quality: 1,
    clip: { x: 0, y: 0, width: 1, height: 1, scale: 1 },
    fromSurface: true
  }, 4000).catch(() => {});
}

// Lets scroll-driven headers and transitions reach their resting state.
async function settleReviewFrames(debuggee, count = 4) {
  for (let index = 0; index < count; index += 1) {
    await renderReviewFrame(debuggee);
    await pause(120);
  }
}

// Native lazy loading waits for the element to approach a rendered viewport,
// which a background tab never has; load everything up front instead.
function forceEagerReviewLoading(debuggee) {
  return reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
    expression: `document.querySelectorAll('img[loading="lazy"], iframe[loading="lazy"]').forEach((element) => { element.loading = 'eager'; })`
  }, 3000).catch(() => {});
}

// Gives started image downloads a bounded chance to finish and decode.
async function waitForReviewImages(debuggee, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
      expression: `[...document.images].filter((image) => image.currentSrc && !image.complete).length`,
      returnByValue: true
    }, 3000).catch(() => null);
    if (!result?.result?.value) break;
    await pause(250);
  }
  await waitForReviewCaptureReady(debuggee);
  await renderReviewFrame(debuggee);
}

function measureReviewTargets(debuggee, targets) {
  return reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
    expression: reviewMeasureExpression(targets),
    returnByValue: true
  }).then((result) => {
    if (result?.exceptionDetails || !result?.result?.value) throw new Error('Review targets could not be measured.');
    return result.result.value;
  });
}

// Groups located elements into screens. Elements that fit into one viewport
// share a screenshot; the rest get their own, so a page is never captured
// as a single tall image.
function planReviewShots(measurement) {
  const viewportHeight = measurement.viewportHeight;
  const maxScroll = Math.max(0, measurement.documentHeight - viewportHeight);
  const placed = measurement.rects
    .filter((rect) => rect.found && rect.visible && !rect.fixed)
    .sort((left, right) => left.y - right.y || left.x - right.x);
  const groups = [];
  placed.forEach((rect) => {
    // Only the top of an element taller than the screen matters for placement;
    // scrolling to fit it would hide everything else behind the screen edge.
    const bottom = rect.y + (rect.height > viewportHeight ? viewportHeight / 2 : rect.height);
    const current = groups[groups.length - 1];
    if (current && Math.max(current.bottom, bottom) - current.top <= viewportHeight) {
      current.bottom = Math.max(current.bottom, bottom);
      current.ids.push(rect.id);
    } else {
      groups.push({ top: rect.y, bottom, ids: [rect.id] });
    }
  });
  const shots = [];
  groups.forEach((group) => {
    const span = group.bottom - group.top;
    let scrollY = 0;
    if (group.bottom > viewportHeight) {
      // Tall elements start near the top of the screen; smaller groups are centered.
      scrollY = span >= viewportHeight ? group.top - 16 : group.top - ((viewportHeight - span) / 2);
    }
    scrollY = Math.round(Math.max(0, Math.min(maxScroll, scrollY)));
    const same = shots.find((shot) => shot.scrollY === scrollY);
    if (same) same.ids.push(...group.ids);
    else shots.push({ scrollY, ids: [...group.ids] });
  });
  if (!shots.length) shots.push({ scrollY: 0, ids: [] });
  // Fixed elements are visible on every screen; show them on the first one.
  const fixedIds = measurement.rects.filter((rect) => rect.found && rect.visible && rect.fixed).map((rect) => rect.id);
  shots[0].ids.push(...fixedIds);
  return shots;
}

function reviewRectForShot(rect, scrollY) {
  if (!rect?.found || !rect.visible) return { id: rect?.id, found: Boolean(rect?.found), visible: false };
  return {
    id: rect.id,
    found: true,
    visible: true,
    x: Math.round(rect.x * 10) / 10,
    y: Math.round((rect.y - scrollY) * 10) / 10,
    width: Math.round(rect.width * 10) / 10,
    height: Math.round(rect.height * 10) / 10
  };
}

async function captureReviewShot(debuggee, targets, scrollY, width, height, scroll = true) {
  if (scroll) {
    await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
      expression: `(() => {
        ${REVIEW_SCROLLER_HELPERS}
        (pageScroller() || window).scrollTo({ top: ${scrollY}, left: 0, behavior: 'instant' });
      })()`
    });
  }
  await settleReviewFrames(debuggee);
  await waitForReviewImages(debuggee);
  await settleReviewFrames(debuggee, 2);
  const measurement = await measureReviewTargets(debuggee, targets);
  // Clip coordinates are document-relative, so the clip follows the window scroll.
  const result = await captureStableScreenshot(() => reviewDebuggerCommand(debuggee, 'Page.captureScreenshot', {
    format: 'jpeg',
    quality: 84,
    clip: { x: 0, y: measurement.clipY, width, height, scale: 1 },
    captureBeyondViewport: false,
    fromSurface: true
  }));
  if (!result?.data) throw new Error('Chrome did not return a review screenshot.');
  return { measurement, dataUrl: `data:image/jpeg;base64,${result.data}` };
}

// Writes the copy into the tab (loaded without the page's scripts) and
// brings back what HTML cannot hold, once its styles and images are in.
async function renderViewSnapshot(debuggee, network, snapshot) {
  const { frameTree } = await reviewDebuggerCommand(debuggee, 'Page.getFrameTree');
  await reviewDebuggerCommand(debuggee, 'Page.setDocumentContent', { frameId: frameTree.frame.id, html: snapshot.html }, 20000);
  await waitForSnapshotResources(debuggee, network);
  await evaluateReviewValue(debuggee, snapshotRestoreExpression(snapshot), 10000);
  // CSS animations of the copy start over (a menu fading in); let them end.
  await settleReviewFrames(debuggee, 3);
}

// A page with comments left on a view it does not load in comes with a copy
// of that view (pageSnapshot in inspector.js): the copy is rendered instead
// of the page, so nothing has to be clicked open again. Without one, the
// page is loaded and its recorded steps are replayed.
async function captureReviewPage({ url, width, height, changes, targets = [], steps = [], snapshot = null, returnWindowId }) {
  const fromSnapshot = typeof snapshot?.html === 'string';
  return withCaptureTab({ url, width, height, returnWindowId, staticPage: fromSnapshot }, async (debuggee, network, viewport) => {
    const viewportWidth = viewport.width;
    const viewportHeight = viewport.height;
    const viewSteps = Array.isArray(steps) ? steps : [];
    let replay = { failed: [], popup: false };
    if (fromSnapshot) {
      await renderViewSnapshot(debuggee, network, snapshot);
      await waitForReviewTargets(debuggee, targets, changes, 3000);
      // A CSS hover menu shows only under the pointer the preview had.
      const shown = await measureReviewTargets(debuggee, targets).catch(() => null);
      if (shown?.rects.some((rect) => rect.found && !rect.visible)) await forceSnapshotPointerStates(debuggee);
    } else {
      if (viewSteps.length) {
        // Let the page render its default view before switching away from it.
        await waitForReviewPageSettled(debuggee, network, 6000);
        replay = await replayReviewSteps(debuggee, viewSteps);
      }
      await waitForReviewTargets(debuggee, targets, changes);
      await waitForReviewPageSettled(debuggee, network);
      // A popup that closed while the page settled is opened once more.
      if (replay.popup && targets.length) {
        const settled = await measureReviewTargets(debuggee, targets).catch(() => null);
        if (settled && !settled.rects.some((rect) => rect.found && rect.visible)) replay = await replayReviewSteps(debuggee, viewSteps);
      }
    }
    const identity = await reviewIdentityFor(debuggee, url).catch(() => ({ name: '', logoDataUrl: '' }));
    const changesApplied = await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
      expression: reviewPreparationExpression({ changes, keepScroll: replay.popup || fromSnapshot }),
      awaitPromise: true,
      returnByValue: true
    });
    if (changesApplied?.exceptionDetails) throw new Error('The reviewed page could not be prepared for capture.');

    // Load images first so the layout used for planning matches the captures.
    await forceEagerReviewLoading(debuggee);
    await settleReviewFrames(debuggee, 2);
    await waitForReviewImages(debuggee);
    const initial = await measureReviewTargets(debuggee, targets);
    // A popup is captured where it was opened, on one screen: scrolling
    // closes many popups or moves them away from their button. A copy keeps
    // the preview's scroll while it shows every element, as a menu placed
    // fixed beside its button (Radix, Floating UI) stays where it was.
    const shown = initial.rects.filter((rect) => rect.found && rect.visible);
    const inView = (rect) => rect.fixed || (rect.y >= initial.scrollY && rect.y + rect.height <= initial.scrollY + viewportHeight);
    const keepView = replay.popup || (fromSnapshot && shown.every(inView));
    const plan = keepView
      ? [{ scrollY: initial.scrollY, ids: shown.map((rect) => rect.id) }]
      : planReviewShots(initial);
    const planned = new Set(plan.flatMap((shot) => shot.ids));

    const captures = [];
    for (const shot of plan) {
      const captured = await captureReviewShot(debuggee, targets, shot.scrollY, viewportWidth, viewportHeight, !keepView);
      captures.push({ ...captured, rects: new Map(captured.measurement.rects.map((rect) => [rect.id, rect])) });
    }
    // Layout can move while screens are captured (sticky or collapsing
    // headers, late content). Keep each element on the screen that actually
    // shows it, falling back to the planned one.
    const visiblePart = (capture, id) => {
      const rect = capture.rects.get(id);
      if (!rect?.found || !rect.visible) return 0;
      const top = rect.y - capture.measurement.scrollY;
      return Math.max(0, Math.min(top + rect.height, viewportHeight) - Math.max(top, 0));
    };
    const assigned = captures.map(() => []);
    plan.forEach((shot, plannedIndex) => shot.ids.forEach((id) => {
      const height = captures[plannedIndex].rects.get(id)?.height || 0;
      let index = plannedIndex;
      if (visiblePart(captures[plannedIndex], id) < Math.min(height, 24)) {
        const best = captures
          .map((capture, candidate) => ({ candidate, part: visiblePart(capture, id) }))
          .sort((left, right) => right.part - left.part)[0];
        if (best?.part > 0) index = best.candidate;
      }
      assigned[index].push(id);
    }));
    const allShots = captures
      .map((capture, index) => ({
        dataUrl: capture.dataUrl,
        width: viewportWidth,
        height: viewportHeight,
        scrollY: capture.measurement.scrollY,
        rects: assigned[index].map((id) => reviewRectForShot(capture.rects.get(id), capture.measurement.scrollY))
      }));
    // Drop screens left without elements; the top screen stays for page-level notes.
    const shots = allShots.filter((shot) => shot.rects.length || shot.scrollY === 0);
    if (!shots.length) shots.push(allShots[0]);
    const unplaced = initial.rects
      .filter((rect) => !planned.has(rect.id))
      .map((rect) => ({ id: rect.id, found: Boolean(rect.found), visible: false }));
    return { shots, unplaced, identity, failedSteps: replay.failed };
  });
}

// Reviews and full-page and element screenshots open the page in a
// temporary tab at the card's size and close it afterwards. A static page
// (a review of a view's copy) is loaded without running the page's scripts
// and its content security policy, so only the copy written into it renders.
async function withCaptureTab({ url, width, height, returnWindowId, staticPage = false }, capture) {
  const viewport = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  const previewTab = await chrome.tabs.create({ url: 'about:blank', active: false });
  const debuggee = { tabId: previewTab.id };
  let network = null;
  try {
    if (!previewTab?.id) throw new Error('Unable to open a temporary viewport.');
    await backgroundPromiseTimeout(chrome.debugger.attach(debuggee, '1.3'), 4000, 'Chrome debugger did not start in time.');
    await reviewDebuggerCommand(debuggee, 'Page.enable');
    await reviewDebuggerCommand(debuggee, 'Runtime.enable');
    await reviewDebuggerCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await reviewDebuggerCommand(debuggee, 'Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    if (staticPage) {
      await reviewDebuggerCommand(debuggee, 'Page.setBypassCSP', { enabled: true });
      await reviewDebuggerCommand(debuggee, 'Emulation.setScriptExecutionDisabled', { value: true });
    }
    network = trackReviewNetwork(debuggee);
    await reviewDebuggerCommand(debuggee, 'Network.enable').catch(() => {});
    await navigateDebuggerPage(debuggee, url);
    // The page's own scripts never ran; the copy has none of its own.
    if (staticPage) await reviewDebuggerCommand(debuggee, 'Emulation.setScriptExecutionDisabled', { value: false });
    else await waitForReviewCaptureReady(debuggee);
    return await capture(debuggee, network, viewport);
  } finally {
    network?.dispose();
    if (previewTab.id !== undefined) {
      await chrome.debugger.detach(debuggee).catch(() => {});
      await chrome.tabs.remove(previewTab.id).catch(() => {});
    }
    if (Number.isInteger(returnWindowId)) {
      await chrome.windows.update(returnWindowId, { focused: true }).catch(() => {});
    }
  }
}

// Content that appears on scroll (lazy images, reveal animations, infinite
// sections) is brought in by going down the page once, then back to the top.
async function scrollThroughCapturePage(debuggee) {
  const screens = await evaluateReviewValue(debuggee, `(() => {
    ${REVIEW_SCROLLER_HELPERS}
    const scroller = pageScroller();
    const total = scroller ? scroller.scrollHeight : document.documentElement.scrollHeight;
    return Math.min(40, Math.ceil(total / Math.max(1, window.innerHeight)));
  })()`).catch(() => 0);
  for (let screen = 1; screen < screens; screen += 1) {
    await evaluateReviewValue(debuggee, `(() => {
      ${REVIEW_SCROLLER_HELPERS}
      (pageScroller() || window).scrollTo({ top: ${screen} * window.innerHeight, left: 0, behavior: 'instant' });
      return true;
    })()`).catch(() => {});
    await settleReviewFrames(debuggee, 2);
  }
  await evaluateReviewValue(debuggee, `(() => {
    ${REVIEW_SCROLLER_HELPERS}
    (pageScroller() || window).scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return true;
  })()`).catch(() => {});
  await settleReviewFrames(debuggee, 2);
}

// Chrome cannot render a taller image in one piece; longer pages are cut here.
const FULL_PAGE_MAX_HEIGHT = 16384;

// A delay waits after the page has loaded, for content that shows up late
// (timed popups, banners, slow animations). Frames are rendered meanwhile,
// as a background tab would not advance animations on its own.
async function waitCaptureDelay(debuggee, seconds, requestId) {
  const delay = [5, 10].includes(seconds) ? seconds : 0;
  if (!delay) return;
  chrome.runtime.sendMessage({ type: 'capture-countdown', requestId, seconds: delay }).catch(() => {});
  const deadline = Date.now() + delay * 1000;
  while (Date.now() < deadline) {
    await renderReviewFrame(debuggee);
    await pause(Math.min(200, Math.max(0, deadline - Date.now())));
  }
}

async function captureFullPage({ delay = 0, requestId = '', ...options }) {
  return withCaptureTab(options, async (debuggee, network, viewport) => {
    await waitForReviewPageSettled(debuggee, network);
    await forceEagerReviewLoading(debuggee);
    await scrollThroughCapturePage(debuggee);
    await waitForReviewImages(debuggee);
    if (delay) {
      await waitCaptureDelay(debuggee, Number(delay), requestId);
      await waitForReviewImages(debuggee);
    }
    const pageHeight = await evaluateReviewValue(debuggee, `(() => {
      const root = document.documentElement;
      return Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0, root.clientHeight);
    })()`).catch(() => viewport.height);
    const fullHeight = Math.max(viewport.height, Math.ceil(Number(pageHeight) || 0));
    const captureHeight = Math.min(fullHeight, FULL_PAGE_MAX_HEIGHT);
    // The page keeps its viewport width; only the height grows to the document.
    const result = await captureStableScreenshot(() => reviewDebuggerCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: viewport.width, height: captureHeight, scale: 1 },
      captureBeyondViewport: true,
      fromSurface: true
    }, 30000));
    if (!result?.data) throw new Error('Chrome did not return an image for the screenshot.');
    return { dataUrl: `data:image/png;base64,${result.data}`, height: captureHeight, truncated: fullHeight > captureHeight };
  });
}

// Finds the picked element, brings it into view and returns its box in
// document coordinates for the screenshot clip. A popup's element is not
// scrolled to, as scrolling closes many popups.
function captureElementBoxExpression(target, keepScroll) {
  return `(async () => {
    const target = ${JSON.stringify(target)};
    ${REVIEW_ELEMENT_HELPERS}
    const element = elementFor(target);
    if (!element) return { found: false };
    const shown = () => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width >= 1 && rect.height >= 1 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    if (!shown()) return { found: true, visible: false };
    if (!${keepScroll}) {
      const box = element.getBoundingClientRect();
      // An element that fits is brought to the middle of the window. A larger
      // one is captured from the unscrolled page, so a sticky or fixed header
      // stays at the top of the page instead of covering the element.
      if (box.height <= window.innerHeight && box.width <= window.innerWidth) element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      await new Promise((resolve) => { requestAnimationFrame(resolve); setTimeout(resolve, 120); });
    }
    const rect = element.getBoundingClientRect();
    const root = document.documentElement;
    const pageWidth = Math.max(root.scrollWidth, window.innerWidth);
    const pageHeight = Math.max(root.scrollHeight, window.innerHeight);
    const left = Math.max(0, Math.floor(rect.left + window.scrollX));
    const top = Math.max(0, Math.floor(rect.top + window.scrollY));
    const right = Math.min(pageWidth, Math.ceil(rect.right + window.scrollX));
    const bottom = Math.min(pageHeight, Math.ceil(rect.bottom + window.scrollY));
    if (right - left < 1 || bottom - top < 1) return { found: true, visible: false };
    // Parts outside the window are rendered only when asked for.
    const outside = rect.left < 0 || rect.top < 0 || rect.right > window.innerWidth || rect.bottom > window.innerHeight;
    return { found: true, visible: true, x: left, y: top, width: right - left, height: bottom - top, beyond: outside };
  })()`;
}

// The copy of a view a comment was left in (pageSnapshot in inspector.js):
// its shadow roots are all written open, and marks (data-pixelprism-*) say
// what to restore.
const SNAPSHOT_HELPERS = `
    const deepAll = (selector) => {
      const found = [];
      const visit = (root) => {
        root.querySelectorAll(selector).forEach((element) => found.push(element));
        root.querySelectorAll('*').forEach((element) => { if (element.shadowRoot) visit(element.shadowRoot); });
      };
      visit(document);
      return found;
    };
    const composedParent = (node) => node.assignedSlot || node.parentElement
      || (node.getRootNode() instanceof ShadowRoot ? node.getRootNode().host : null);
`;

// Brings back what the HTML cannot hold: modal dialogs and popovers in the
// top layer, canvas pixels, and scroll positions, set last as they depend on
// the layout once styles and images are in.
function snapshotRestoreExpression(snapshot) {
  const payload = JSON.stringify({ canvases: snapshot.canvases || [], scrollX: snapshot.scrollX || 0, scrollY: snapshot.scrollY || 0 });
  return `(async () => {
    const snapshot = ${payload};
    ${SNAPSHOT_HELPERS}
    deepAll('dialog[data-pixelprism-modal]').forEach((dialog) => {
      if (dialog.matches(':modal')) return;
      dialog.removeAttribute('open');
      try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
    });
    deepAll('[data-pixelprism-popover]').forEach((popover) => {
      try { if (!popover.matches(':popover-open')) popover.showPopover(); } catch { /* Not a popover in this browser. */ }
    });
    await Promise.all(deepAll('canvas[data-pixelprism-canvas]').map((canvas) => new Promise((resolve) => {
      const source = snapshot.canvases[Number(canvas.dataset.pixelprismCanvas)];
      const context = canvas.getContext('2d');
      if (!source || !context) return resolve();
      const image = new Image();
      image.onload = () => { context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0); resolve(); };
      image.onerror = resolve;
      image.src = source;
    })));
    deepAll('[data-pixelprism-scroll]').forEach((element) => {
      const [left, top] = element.dataset.pixelprismScroll.split(',').map(Number);
      element.scrollTo({ left, top, behavior: 'instant' });
    });
    window.scrollTo({ left: snapshot.scrollX, top: snapshot.scrollY, behavior: 'instant' });
    return true;
  })()`;
}

// Forces a pseudo-class on the elements an expression returns (an array):
// the first gets `own`, the rest `rest`. DOM and CSS must be enabled.
async function forcePseudoClasses(debuggee, expression, own, rest) {
  const found = await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', { expression, returnByValue: false });
  const listId = found?.result?.objectId;
  if (!listId) return;
  const { result: items = [] } = await reviewDebuggerCommand(debuggee, 'Runtime.getProperties', { objectId: listId, ownProperties: true });
  const nodes = items.filter((item) => /^\d+$/.test(item.name) && item.value?.objectId).sort((left, right) => Number(left.name) - Number(right.name));
  for (const [index, item] of nodes.entries()) {
    const { nodeId } = await reviewDebuggerCommand(debuggee, 'DOM.requestNode', { objectId: item.value.objectId });
    if (nodeId) await reviewDebuggerCommand(debuggee, 'CSS.forcePseudoState', { nodeId, forcedPseudoClasses: index === 0 ? own : rest });
  }
}

// The pointer and focus the preview had when the comment's element was
// picked, for elements shown only while they last: a CSS hover menu
// (li:hover > ul), or one open while its button has focus.
async function forceSnapshotPointerStates(debuggee) {
  await reviewDebuggerCommand(debuggee, 'DOM.enable');
  await reviewDebuggerCommand(debuggee, 'CSS.enable');
  await reviewDebuggerCommand(debuggee, 'DOM.getDocument', { depth: 0 });
  await forcePseudoClasses(debuggee, `(() => {
    ${SNAPSHOT_HELPERS}
    return deepAll('[data-pixelprism-hover]');
  })()`, ['hover'], ['hover']);
  await forcePseudoClasses(debuggee, `(() => {
    ${SNAPSHOT_HELPERS}
    const nodes = [];
    for (let node = deepAll('[data-pixelprism-focus]')[0]; node; node = composedParent(node)) nodes.push(node);
    return nodes;
  })()`, ['focus', 'focus-within'], ['focus-within']);
  await settleReviewFrames(debuggee, 4);
}

// Waits for the copy's stylesheets, fonts and images, fetched again from
// the site (from the cache, mostly).
async function waitForSnapshotResources(debuggee, network, timeout = 10000) {
  const deadline = Date.now() + timeout;
  await pause(300);
  while (Date.now() < deadline && !network.isIdle()) {
    await renderReviewFrame(debuggee);
    await pause(150);
  }
  await waitForReviewImages(debuggee, Math.max(1000, deadline - Date.now()));
}

async function captureElement({ target, steps = [], ...options }) {
  if (!target?.element) throw new Error('No element was picked.');
  return withCaptureTab(options, async (debuggee, network) => {
    const viewSteps = Array.isArray(steps) ? steps : [];
    let replay = { failed: [], popup: false };
    if (viewSteps.length) {
      // Let the page render its default view before switching away from it.
      await waitForReviewPageSettled(debuggee, network, 6000);
      replay = await replayReviewSteps(debuggee, viewSteps);
    }
    await waitForReviewPageSettled(debuggee, network);
    await forceEagerReviewLoading(debuggee);
    await waitForReviewImages(debuggee);
    // Single-page apps can render the element seconds after the load.
    let box = null;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      box = await evaluateReviewValue(debuggee, captureElementBoxExpression(target, replay.popup), 4000).catch(() => null);
      if (box?.visible) break;
      // A popup that closed while the page settled is opened once more.
      if (attempt === 10 && replay.popup) replay = await replayReviewSteps(debuggee, viewSteps);
      await renderReviewFrame(debuggee);
      await pause(300);
    }
    if (!box?.found) throw new Error('The element was not found when the page was opened again.');
    if (!box.visible) {
      const failed = replay.failed.length ? ` (could not open ${replay.failed.map((label) => `“${label}”`).join(', ')})` : '';
      throw new Error(`The element is hidden when the page is opened again${failed}.`);
    }
    await settleReviewFrames(debuggee, 2);
    await waitForReviewImages(debuggee);
    const result = await captureStableScreenshot(() => reviewDebuggerCommand(debuggee, 'Page.captureScreenshot', {
      format: 'png',
      clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 },
      captureBeyondViewport: box.beyond,
      fromSurface: true
    }, 30000));
    if (!result?.data) throw new Error('Chrome did not return an image for the screenshot.');
    return { dataUrl: `data:image/png;base64,${result.data}`, width: box.width, height: box.height };
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'file-scheme-access') {
    chrome.extension.isAllowedFileSchemeAccess()
      .then((allowed) => sendResponse({ ok: true, allowed }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'load-stylesheet') {
    const url = typeof message.url === 'string' ? message.url : '';
    if (!/^(?:https?|file):\/\//.test(url)) {
      sendResponse({ ok: false, error: 'Unsupported stylesheet URL.' });
      return;
    }
    const tabId = sender.tab?.id;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .catch((error) => {
        if (!Number.isInteger(tabId)) throw error;
        return stylesheetTextFromDebugger(tabId, url);
      })
      .then((css) => sendResponse({ ok: true, css }))
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
  if (message?.type === 'capture-full-page') {
    captureFullPage(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'capture-element') {
    captureElement(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'capture-review-page') {
    captureReviewPage(message)
      .then((result) => sendResponse({ ok: true, ...result }))
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
