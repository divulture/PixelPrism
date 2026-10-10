// Applied in <head>, before the studio paints, so a dark studio does not
// flash light first, nor compact previews start roomy. studio/toolbar.js
// switches both afterwards.
try {
  if (localStorage.getItem('pixelprism-theme') === 'dark') document.documentElement.dataset.theme = 'dark';
  if (localStorage.getItem('pixelprism-previews') === 'compact') document.documentElement.dataset.viewports = 'compact';
} catch { /* Storage unavailable: the light theme and roomy previews stay. */ }
