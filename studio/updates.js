// Studio checks published extension archives. Free uses its public GitHub
// releases; Pro can use a different source when its distribution is ready.
let updateReleaseSource = {
  api: 'https://api.github.com/repos/divulture/PixelPrism/releases/latest',
  page: 'https://github.com/divulture/PixelPrism/releases/tag/'
};

const UPDATE_CACHE_KEY = 'pixelprism-update-check';
const UPDATE_DISMISSED_KEY = 'pixelprism-update-dismissed';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
const updateCheckButton = document.querySelector('#update-check');
const updateCheckStatus = document.querySelector('#update-check-status');
const updateDownload = document.querySelector('#update-download');
const updateNotice = document.querySelector('#update-notice');
const updateNoticeText = document.querySelector('#update-notice-text');
const updateNoticeDownload = document.querySelector('#update-notice-download');
const installedUpdateVersion = globalThis.chrome?.runtime?.getManifest?.()?.version || null;
let latestUpdateTag = null;
let updateRequest = null;

function updateVersionParts(tag) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/.exec(tag || '');
  return match ? match.slice(1).map((part) => Number(part || 0)) : null;
}

function updateIsNewer(tag) {
  const remote = updateVersionParts(tag);
  const installed = updateVersionParts(installedUpdateVersion);
  if (!remote || !installed) return false;
  for (let index = 0; index < 4; index += 1) {
    if (remote[index] !== installed[index]) return remote[index] > installed[index];
  }
  return false;
}

function updateStoredValue(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function saveUpdateValue(key, value) {
  try { localStorage.setItem(key, value); } catch { /* The current tab still shows the result. */ }
}

function updateReleaseUrl(tag) {
  return `${updateReleaseSource.page}${encodeURIComponent(tag)}`;
}

function renderUpdateAvailability() {
  const available = updateIsNewer(latestUpdateTag);
  helpFabToggle.dataset.updateAvailable = String(available);
  helpFabToggle.setAttribute('aria-label', available ? 'Help, update available' : 'Help');
  updateDownload.hidden = !available;
  updateNotice.hidden = !available || updateStoredValue(UPDATE_DISMISSED_KEY) === latestUpdateTag;
  if (!available) return;
  const version = latestUpdateTag.replace(/^v/, '');
  const url = updateReleaseUrl(latestUpdateTag);
  updateDownload.textContent = `Download update · v${version}`;
  updateDownload.href = url;
  updateNoticeText.textContent = `PixelPrism v${version} is ready to download.`;
  updateNoticeDownload.href = url;
}

function setUpdateCheckStatus(message) {
  updateCheckStatus.textContent = message;
  updateCheckStatus.hidden = !message;
}

async function fetchLatestUpdate() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(updateReleaseSource.api, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal
    });
    if (response.status === 404) return null; // The first Free release has not been published yet.
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const release = await response.json();
    if (!updateVersionParts(release.tag_name)) throw new Error('The release tag is not an extension version');
    if (!release.assets?.some((asset) => asset.state === 'uploaded' && /\.zip$/i.test(asset.name))) {
      throw new Error('The release has no extension archive');
    }
    return release.tag_name;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkForUpdates(manual = false) {
  if (manual) trackProductEvent('update_check_requested');
  if (!installedUpdateVersion) {
    if (manual) setUpdateCheckStatus('Open Studio from the installed extension to check for updates.');
    return;
  }
  if (!updateReleaseSource) {
    if (manual) setUpdateCheckStatus('Update checks are not available for Pro yet.');
    return;
  }
  if (manual) {
    setUpdateCheckStatus('Checking for updates…');
    updateCheckButton.disabled = true;
  }
  try {
    updateRequest ||= fetchLatestUpdate();
    latestUpdateTag = await updateRequest;
    saveUpdateValue(UPDATE_CACHE_KEY, JSON.stringify({ source: updateReleaseSource.api, checkedAt: Date.now(), tag: latestUpdateTag }));
    renderUpdateAvailability();
    if (manual) {
      setUpdateCheckStatus(latestUpdateTag === null
        ? 'No releases are available yet.'
        : updateIsNewer(latestUpdateTag) ? 'A new update is available.' : 'You’re up to date.');
    }
  } catch {
    if (manual) setUpdateCheckStatus('Couldn’t check for updates. Try again later.');
  } finally {
    updateRequest = null;
    updateCheckButton.disabled = false;
  }
}

document.querySelector('#update-notice-close').addEventListener('click', () => {
  if (latestUpdateTag) saveUpdateValue(UPDATE_DISMISSED_KEY, latestUpdateTag);
  updateNotice.hidden = true;
});
updateCheckButton.addEventListener('click', () => checkForUpdates(true));

if (installedUpdateVersion && updateReleaseSource) {
  try {
    const cached = JSON.parse(updateStoredValue(UPDATE_CACHE_KEY) || 'null');
    if (cached?.source === updateReleaseSource.api && Number.isFinite(cached.checkedAt)
      && (cached.tag === null || updateVersionParts(cached.tag))) {
      latestUpdateTag = cached.tag;
      renderUpdateAvailability();
      if (cached.checkedAt > Date.now() || cached.checkedAt <= Date.now() - UPDATE_CHECK_INTERVAL) checkForUpdates();
    } else {
      checkForUpdates();
    }
  } catch {
    checkForUpdates();
  }
}
