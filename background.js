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

// Shared by review scripts that run inside the captured page. It resolves an
// element recorded in the studio back to the same node on a fresh load.
const REVIEW_ELEMENT_HELPERS = `
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
      if (context.id && element.id !== context.id) return false;
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
    const elementFor = (entry = {}) => {
      const context = entry.element || entry || {};
      if (context.id) {
        const byId = document.getElementById(context.id);
        if (byId && matchesContext(byId, context)) return byId;
      }
      const attributes = context.attributes || {};
      for (const name of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'name', 'role', 'aria-label', 'href', 'type']) {
        const value = attributes[name];
        if (value === null || value === undefined || value === '') continue;
        const match = queryOne('[' + CSS.escape(name) + '=\"' + CSS.escape(String(value)) + '\"]');
        if (match && matchesContext(match, context)) return match;
      }
      const byIndexPath = elementAtIndexPath(context.indexPath);
      if (byIndexPath && matchesContext(byIndexPath, context)) return byIndexPath;
      const candidates = [];
      for (const selector of [context.domPath, context.selector, entry.selector]) {
        const matches = queryAll(selector).filter((element) => matchesContext(element, context));
        if (matches.length === 1) return matches[0];
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
      return best || (candidates.length === 1 ? candidates[0] : null);
    };
`;

function reviewPreparationExpression({ changes = [], target, marker }) {
  const payload = JSON.stringify({ changes, target, marker });
  return `(async () => {
    const payload = ${payload};
    ${REVIEW_ELEMENT_HELPERS}

    payload.changes.forEach((change) => {
      const element = elementFor(change);
      if (!element || !change.property) return;
      if (String(change.to ?? '').trim()) element.style.setProperty(change.property, String(change.to), 'important');
      else element.style.removeProperty(change.property);
    });

    document.querySelectorAll('[data-pixelprism-review-highlight]').forEach((element) => element.remove());
    // Review tabs stay in the background, where requestAnimationFrame may never fire.
    await new Promise((resolve) => { requestAnimationFrame(resolve); setTimeout(resolve, 60); });
    const targetElement = payload.target ? elementFor(payload.target) : null;
    if (targetElement) {
      targetElement.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 120));
      const rect = targetElement.getBoundingClientRect();
      const left = Math.max(6, Math.min(window.innerWidth - 18, rect.left));
      const top = Math.max(6, Math.min(window.innerHeight - 18, rect.top));
      const right = Math.max(left + 12, Math.min(window.innerWidth - 6, rect.right));
      const bottom = Math.max(top + 12, Math.min(window.innerHeight - 6, rect.bottom));
      const overlay = document.createElement('div');
      overlay.setAttribute('data-pixelprism-review-highlight', '');
      overlay.style.cssText = [
        'position:fixed', 'pointer-events:none', 'box-sizing:border-box',
        'left:' + left + 'px', 'top:' + top + 'px',
        'width:' + Math.max(12, right - left) + 'px', 'height:' + Math.max(12, bottom - top) + 'px',
        'border:4px solid #2563eb', 'border-radius:6px',
        'box-shadow:0 0 0 4px rgba(37,99,235,.22),0 8px 24px rgba(15,23,42,.22)',
        'z-index:2147483646'
      ].join(';');
      const badge = document.createElement('span');
      badge.textContent = String(payload.marker || '');
      badge.style.cssText = [
        'position:absolute', 'left:-4px', 'top:-30px', 'min-width:26px', 'height:26px',
        'padding:0 7px', 'display:grid', 'place-items:center', 'box-sizing:border-box',
        'border-radius:6px', 'background:#2563eb', 'color:#fff',
        'font:700 13px/1 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif'
      ].join(';');
      overlay.append(badge);
      document.documentElement.append(overlay);
    } else if (!payload.target) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    return { highlighted: Boolean(targetElement), scrollX: window.scrollX, scrollY: window.scrollY };
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

async function captureReviewContext({ url, width, height, changes, targets = [], returnWindowId }) {
  const viewportWidth = Math.max(1, Math.round(width));
  const viewportHeight = Math.max(1, Math.round(height));
  const previewTab = await chrome.tabs.create({ url: 'about:blank', active: false });
  const debuggee = { tabId: previewTab.id };
  let network = null;
  try {
    if (!previewTab?.id) throw new Error('Unable to open a temporary review viewport.');
    await backgroundPromiseTimeout(chrome.debugger.attach(debuggee, '1.3'), 4000, 'Chrome debugger did not start in time.');
    await reviewDebuggerCommand(debuggee, 'Page.enable');
    await reviewDebuggerCommand(debuggee, 'Runtime.enable');
    await reviewDebuggerCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
      mobile: false
    });
    network = trackReviewNetwork(debuggee);
    await reviewDebuggerCommand(debuggee, 'Network.enable').catch(() => {});
    await navigateDebuggerPage(debuggee, url);
    await waitForReviewCaptureReady(debuggee);
    await waitForReviewTargets(debuggee, targets, changes);
    await waitForReviewPageSettled(debuggee, network);
    const identity = await reviewIdentityFor(debuggee, url).catch(() => ({ name: '', logoDataUrl: '' }));
    const changesApplied = await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
      expression: reviewPreparationExpression({ changes, target: null, marker: null }),
      awaitPromise: true,
      returnByValue: true
    });
    if (changesApplied?.exceptionDetails) throw new Error('The reviewed page could not be prepared for capture.');

    const captures = [];
    for (const entry of targets) {
      const prepared = await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
        expression: reviewPreparationExpression({ changes: [], target: entry.target, marker: entry.marker }),
        awaitPromise: true,
        returnByValue: true
      });
      if (prepared?.exceptionDetails) throw new Error('A review target could not be prepared for capture.');
      const result = await reviewDebuggerCommand(debuggee, 'Page.captureScreenshot', {
        format: 'jpeg',
        quality: 84,
        clip: { x: prepared?.result?.value?.scrollX || 0, y: prepared?.result?.value?.scrollY || 0, width: viewportWidth, height: viewportHeight, scale: 1 },
        captureBeyondViewport: false,
        fromSurface: true
      });
      if (!result?.data) throw new Error('Chrome did not return a review screenshot.');
      captures.push({
        id: entry.id,
        dataUrl: `data:image/jpeg;base64,${result.data}`,
        highlighted: prepared?.result?.value?.highlighted === true
      });
    }
    return { captures, identity };
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

// Clicks the view switches (tabs, panels) recorded with a comment, in order,
// so the capture shows the view the comment was left in. A switch already
// in its recorded state is left alone.
function reviewStepsExpression(steps) {
  const payload = JSON.stringify(steps.map((step) => ({ kind: step.kind, element: step.element, expanded: step.expanded, open: step.open })));
  return `(async () => {
    const steps = ${payload};
    ${REVIEW_ELEMENT_HELPERS}
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    // Same popup test as the studio: dialogs, menus, and floating modals.
    const popupSelector = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], [role="menu"], [role="listbox"], [popover], [class*="modal" i], [class*="dialog" i], [class*="drawer" i], [class*="popover" i], [class*="popup" i], [class*="dropdown-menu" i]';
    const visiblePopups = () => [...document.querySelectorAll(popupSelector)].filter((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      if (rect.width < 1 || rect.height < 1 || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) <= 0.05) return false;
      if (node.matches('dialog, [role], [aria-modal], [popover]')) return !node.matches('[popover]') || node.matches(':popover-open');
      return style.position === 'fixed' || style.position === 'absolute';
    });
    for (const step of steps) {
      let control = null;
      for (let attempt = 0; attempt < 30 && !control; attempt += 1) {
        control = elementFor({ element: step.element });
        if (!control) await wait(100);
      }
      if (!control) continue;
      if (step.kind === 'open') {
        // Open the popup and wait for it (and its animation) before going on.
        const before = new Set(visiblePopups());
        control.click();
        for (let attempt = 0; attempt < 25; attempt += 1) {
          await wait(100);
          if (visiblePopups().some((node) => !before.has(node))) break;
        }
        await wait(300);
        continue;
      }
      if (step.expanded && control.getAttribute('aria-expanded') === step.expanded) continue;
      if (typeof step.open === 'boolean' && control.parentElement instanceof HTMLDetailsElement && control.parentElement.open === step.open) continue;
      if (!step.expanded && typeof step.open !== 'boolean' && control.getAttribute('aria-selected') === 'true') continue;
      control.click();
      await wait(400);
    }
    return true;
  })()`;
}

function reviewMeasureExpression(targets) {
  const payload = JSON.stringify(targets.map(({ id, target }) => ({ id, target })));
  return `(() => {
    const targets = ${payload};
    ${REVIEW_ELEMENT_HELPERS}
    const isFixed = (element) => {
      for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
        if (getComputedStyle(node).position === 'fixed') return true;
      }
      return false;
    };
    const root = document.documentElement;
    return {
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      documentHeight: Math.max(root.scrollHeight, document.body?.scrollHeight || 0, root.clientHeight),
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
          fixed: isFixed(element),
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
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

async function captureReviewShot(debuggee, targets, scrollY, width, height) {
  await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
    expression: `window.scrollTo({ top: ${scrollY}, left: 0, behavior: 'instant' })`
  });
  await settleReviewFrames(debuggee);
  await waitForReviewImages(debuggee);
  await settleReviewFrames(debuggee, 2);
  const measurement = await measureReviewTargets(debuggee, targets);
  // Clip coordinates are document-relative, so the clip follows the scroll.
  const result = await reviewDebuggerCommand(debuggee, 'Page.captureScreenshot', {
    format: 'jpeg',
    quality: 84,
    clip: { x: 0, y: measurement.scrollY, width, height, scale: 1 },
    captureBeyondViewport: false,
    fromSurface: true
  });
  if (!result?.data) throw new Error('Chrome did not return a review screenshot.');
  return { measurement, dataUrl: `data:image/jpeg;base64,${result.data}` };
}

async function captureReviewPage({ url, width, height, changes, targets = [], steps = [], returnWindowId }) {
  const viewportWidth = Math.max(1, Math.round(width));
  const viewportHeight = Math.max(1, Math.round(height));
  const previewTab = await chrome.tabs.create({ url: 'about:blank', active: false });
  const debuggee = { tabId: previewTab.id };
  let network = null;
  try {
    if (!previewTab?.id) throw new Error('Unable to open a temporary review viewport.');
    await backgroundPromiseTimeout(chrome.debugger.attach(debuggee, '1.3'), 4000, 'Chrome debugger did not start in time.');
    await reviewDebuggerCommand(debuggee, 'Page.enable');
    await reviewDebuggerCommand(debuggee, 'Runtime.enable');
    await reviewDebuggerCommand(debuggee, 'Emulation.setDeviceMetricsOverride', {
      width: viewportWidth,
      height: viewportHeight,
      deviceScaleFactor: 1,
      mobile: false
    });
    network = trackReviewNetwork(debuggee);
    await reviewDebuggerCommand(debuggee, 'Network.enable').catch(() => {});
    await navigateDebuggerPage(debuggee, url);
    await waitForReviewCaptureReady(debuggee);
    if (Array.isArray(steps) && steps.length) {
      // Let the page render its default view before switching away from it.
      await waitForReviewPageSettled(debuggee, network, 6000);
      await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
        expression: reviewStepsExpression(steps),
        awaitPromise: true,
        returnByValue: true
      }, 20000).catch(() => null);
    }
    await waitForReviewTargets(debuggee, targets, changes);
    await waitForReviewPageSettled(debuggee, network);
    const identity = await reviewIdentityFor(debuggee, url).catch(() => ({ name: '', logoDataUrl: '' }));
    const changesApplied = await reviewDebuggerCommand(debuggee, 'Runtime.evaluate', {
      expression: reviewPreparationExpression({ changes, target: null, marker: null }),
      awaitPromise: true,
      returnByValue: true
    });
    if (changesApplied?.exceptionDetails) throw new Error('The reviewed page could not be prepared for capture.');

    // Load images first so the layout used for planning matches the captures.
    await forceEagerReviewLoading(debuggee);
    await settleReviewFrames(debuggee, 2);
    await waitForReviewImages(debuggee);
    const initial = await measureReviewTargets(debuggee, targets);
    const plan = planReviewShots(initial);
    const planned = new Set(plan.flatMap((shot) => shot.ids));

    const captures = [];
    for (const shot of plan) {
      const captured = await captureReviewShot(debuggee, targets, shot.scrollY, viewportWidth, viewportHeight);
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
    return { shots, unplaced, identity };
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
  if (message?.type === 'capture-review-page') {
    captureReviewPage(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'capture-review-context') {
    captureReviewContext(message)
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
