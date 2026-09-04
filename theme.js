// Applied in <head>, before the studio paints, so a dark studio does not
// flash light first. studio.js switches the theme afterwards.
try {
  if (localStorage.getItem('pixelprism-theme') === 'dark') document.documentElement.dataset.theme = 'dark';
} catch { /* Storage unavailable: the light theme stays. */ }
