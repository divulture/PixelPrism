// Product analytics shared by both editions, loaded after Studio tools and before main.js.
const PRODUCT_ANALYTICS_TOKEN = 'phc_pzugTkc9DHUZbz2AJzXHN9ceUSgxk9YA8AcKqy6ERDr9';
const PRODUCT_ANALYTICS_ENDPOINT = 'https://us.i.posthog.com/i/v0/e/';
const PRODUCT_ANALYTICS_ID_KEY = 'pixelprism-analytics-id';
const PRODUCT_ANALYTICS_ENABLED_KEY = 'pixelprism-analytics-enabled';
const PRODUCT_ANALYTICS_SESSION_ID = crypto.randomUUID();
const PRODUCT_ANALYTICS_EVENTS = {
  studio_opened: {},
  preview_ready: {},
  preview_failed: { reason: ['local_file', 'embed_blocked'] },
  inspector_opened: {},
  inspector_edit_created: {},
  layers_opened: {},
  layer_selected: {},
  comments_opened: {},
  comment_created: {},
  handoff_copied: {},
  review_exported: { format: ['html', 'pdf'], screenshots: ['complete', 'partial'] },
  update_check_requested: {},
  viewports_changed: { action: ['single', 'added', 'removed', 'custom_added', 'resized', 'preset'] },
  studio_visible_period: { duration_seconds: 'positive_integer' }
};
const PRODUCT_ANALYTICS_ONCE = new Set([
  'studio_opened', 'preview_ready', 'inspector_opened', 'inspector_edit_created',
  'layers_opened', 'layer_selected', 'comments_opened', 'comment_created'
]);
const productAnalyticsSeen = new Set();
let productAnalyticsEnabled = true;
let productAnalyticsId = null;
let productAnalyticsVisibleSince = document.visibilityState === 'visible' ? performance.now() : null;

try { productAnalyticsEnabled = localStorage.getItem(PRODUCT_ANALYTICS_ENABLED_KEY) !== 'off'; } catch { /* Use the default. */ }

function productAnalyticsDistinctId() {
  if (productAnalyticsId) return productAnalyticsId;
  try { productAnalyticsId = localStorage.getItem(PRODUCT_ANALYTICS_ID_KEY); } catch { /* Use a tab-local ID. */ }
  if (!productAnalyticsId) {
    productAnalyticsId = crypto.randomUUID();
    try { localStorage.setItem(PRODUCT_ANALYTICS_ID_KEY, productAnalyticsId); } catch { /* Retention needs storage. */ }
  }
  return productAnalyticsId;
}

function productAnalyticsProperties(event, properties) {
  const allowed = PRODUCT_ANALYTICS_EVENTS[event];
  if (!allowed) return null;
  const safe = {};
  for (const [name, values] of Object.entries(allowed)) {
    const value = properties?.[name];
    if (values === 'positive_integer' && Number.isInteger(value) && value > 0 && value <= 3600) safe[name] = value;
    else if (Array.isArray(values) && values.includes(value)) safe[name] = value;
  }
  return safe;
}

function productAnalyticsCapture(event, properties = {}) {
  if (!productAnalyticsEnabled) return;
  const safe = productAnalyticsProperties(event, properties);
  if (!safe) return;
  const onceKey = event === 'preview_failed' ? `${event}:${safe.reason}`
    : event === 'viewports_changed' ? `${event}:${safe.action}` : event;
  if ((PRODUCT_ANALYTICS_ONCE.has(event) || event === 'preview_failed' || event === 'viewports_changed') && productAnalyticsSeen.has(onceKey)) return;
  productAnalyticsSeen.add(onceKey);
  const payload = {
    api_key: PRODUCT_ANALYTICS_TOKEN,
    event,
    distinct_id: productAnalyticsDistinctId(),
    properties: {
      ...safe,
      $process_person_profile: false,
      $session_id: PRODUCT_ANALYTICS_SESSION_ID,
      edition: chrome.runtime.getManifest().name === 'PixelPrism' ? 'free' : 'pro',
      extension_version: chrome.runtime.getManifest().version
    }
  };
  fetch(PRODUCT_ANALYTICS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    keepalive: true
  }).catch(() => { /* Analytics must not interrupt Studio. */ });
}

trackProductEvent = productAnalyticsCapture;

function productAnalyticsFlushVisiblePeriod() {
  if (productAnalyticsVisibleSince === null) return;
  const duration = Math.round((performance.now() - productAnalyticsVisibleSince) / 1000);
  productAnalyticsVisibleSince = document.visibilityState === 'visible' ? performance.now() : null;
  if (duration > 0) productAnalyticsCapture('studio_visible_period', { duration_seconds: Math.min(duration, 3600) });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') productAnalyticsVisibleSince = performance.now();
  else productAnalyticsFlushVisiblePeriod();
});
window.addEventListener('pagehide', productAnalyticsFlushVisiblePeriod);
// A long foreground session is recorded even if Chrome closes unexpectedly.
setInterval(productAnalyticsFlushVisiblePeriod, 10 * 60 * 1000);

// The Help menu opens a panel that says what is collected, with the switch.
const productAnalyticsToggle = document.querySelector('#analytics-toggle');
const productAnalyticsState = document.querySelector('#analytics-state');
function productAnalyticsSyncToggle() {
  productAnalyticsState.textContent = productAnalyticsEnabled ? 'Analytics is on' : 'Analytics is off';
  productAnalyticsToggle.textContent = productAnalyticsEnabled ? 'Turn off' : 'Turn on';
}
productAnalyticsSyncToggle();
productAnalyticsToggle.addEventListener('click', () => {
  productAnalyticsEnabled = !productAnalyticsEnabled;
  try { localStorage.setItem(PRODUCT_ANALYTICS_ENABLED_KEY, productAnalyticsEnabled ? 'on' : 'off'); } catch { /* Current tab still honours the choice. */ }
  if (!productAnalyticsEnabled) {
    productAnalyticsId = null;
    productAnalyticsVisibleSince = null;
    productAnalyticsSeen.clear();
    try { localStorage.removeItem(PRODUCT_ANALYTICS_ID_KEY); } catch { /* No stored ID. */ }
  } else {
    productAnalyticsVisibleSince = document.visibilityState === 'visible' ? performance.now() : null;
    productAnalyticsCapture('studio_opened');
  }
  productAnalyticsSyncToggle();
});

function setAnalyticsPanelOpen(open) {
  if (open) {
    setLayersOpen(false);
    setCommentsOpen(false);
  }
  analyticsPanel.hidden = !open;
}
document.querySelector('#analytics-open').addEventListener('click', () => setAnalyticsPanelOpen(true));
document.querySelector('#analytics-panel-close').addEventListener('click', () => setAnalyticsPanelOpen(false));
