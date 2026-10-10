// The demo page shown in the previews before a site is open. It is an
// extension page, so Chrome injects no content scripts into it: this script
// takes the Studio's theme and loads the Inspector itself.
(() => {
  const root = document.documentElement;

  // Same origin as Studio, so its stored theme is readable here and a switch
  // in Studio arrives as a storage event.
  const applyTheme = () => {
    try {
      if (localStorage.getItem('pixelprism-theme') === 'dark') root.dataset.theme = 'dark';
      else delete root.dataset.theme;
    } catch { /* Storage unavailable: the light theme stays. */ }
  };
  applyTheme();
  window.addEventListener('storage', (event) => {
    if (event.key === 'pixelprism-theme') applyTheme();
  });

  // Once a tool is in use the page holds still: an animation would otherwise
  // override an edit to the element it animates.
  const STILL_ON = ['toggle-inspector', 'toggle-comment-picker', 'toggle-capture-picker'];
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window.parent || data?.source !== 'viewport-parade') return;
    if ((STILL_ON.includes(data.type) && data.enabled) || data.type === 'inspector-editor-input') root.classList.add('is-still');
  });

  // Only inside a Studio preview, like inspector/boot.js on other pages.
  if (window.top === window || !window.chrome?.runtime?.sendMessage) return;
  const loadInspector = async () => {
    const response = await chrome.runtime.sendMessage({ type: 'inspector-scripts' }).catch(() => null);
    if (!response?.ok) return;
    response.scripts.forEach((path) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(path);
      // Dynamic scripts run as they arrive unless told to keep their order.
      script.async = false;
      document.head.append(script);
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadInspector, { once: true });
  else loadInspector();
})();
