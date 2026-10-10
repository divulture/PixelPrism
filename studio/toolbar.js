// The settings menu next to the zoom control: the theme and preview style
// switches and the Code panel (wired in code-panel.js). The ? button in the
// corner: feedback, issues and the shortcuts dialog.

// Light or dark studio, remembered across sessions (theme.js applies it
// before the first paint). Previews keep the site's own colours.
const themeToggle = document.querySelector('#theme-toggle');

function syncThemeToggle() {
  const dark = document.documentElement.dataset.theme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.textContent = dark ? 'Light theme' : 'Dark theme';
}

function setTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('pixelprism-theme', theme); } catch { /* Not remembered. */ }
  syncThemeToggle();
  // Rulers are drawn on canvases and take the theme's colours when redrawn.
  document.querySelectorAll('.viewport-card').forEach((card) => renderRulers(card));
  speak(theme === 'dark' ? 'Dark theme.' : 'Light theme.');
}

syncThemeToggle();
themeToggle.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

// Roomy previews (rounded cards, the width in a pill) or compact ones (the
// earlier tight frame), remembered like the theme.
const compactToggle = document.querySelector('#compact-toggle');

function syncCompactToggle() {
  const compact = document.documentElement.dataset.viewports === 'compact';
  compactToggle.setAttribute('aria-pressed', String(compact));
  compactToggle.textContent = compact ? 'Roomy previews' : 'Compact previews';
}

function setCompactPreviews(compact) {
  if (compact) document.documentElement.dataset.viewports = 'compact';
  else delete document.documentElement.dataset.viewports;
  try { localStorage.setItem('pixelprism-previews', compact ? 'compact' : 'roomy'); } catch { /* Not remembered. */ }
  syncCompactToggle();
  // Compact rulers draw their edge line.
  document.querySelectorAll('.viewport-card').forEach((card) => renderRulers(card));
  speak(compact ? 'Compact previews.' : 'Roomy previews.');
}

syncCompactToggle();
compactToggle.addEventListener('click', () => setCompactPreviews(document.documentElement.dataset.viewports !== 'compact'));

const studioMenu = document.querySelector('#studio-menu');
// A chosen item closes the menu, as in a card's menu.
studioMenu.querySelectorAll('.more-actions-menu button').forEach((button) => {
  button.addEventListener('click', () => { studioMenu.open = false; });
});

const helpFab = document.querySelector('#help-fab');
const helpFabToggle = document.querySelector('#help-fab-toggle');
const helpFabMenu = document.querySelector('#help-fab-menu');

// The menu grows out of the ? button and shrinks back into it.
let helpFabCloseTimer = 0;

function setHelpFabOpen(open) {
  clearTimeout(helpFabCloseTimer);
  helpFabMenu.classList.remove('is-closing');
  if (open) {
    helpFabToggle.setAttribute('aria-expanded', 'true');
    helpFabMenu.hidden = false;
    return;
  }
  const finish = () => {
    helpFabMenu.classList.remove('is-closing');
    helpFabMenu.hidden = true;
    helpFabToggle.setAttribute('aria-expanded', 'false');
  };
  if (helpFabMenu.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }
  helpFabMenu.classList.add('is-closing');
  helpFabCloseTimer = setTimeout(finish, 240);
}

helpFabToggle.addEventListener('click', () => setHelpFabOpen(true));
helpFabMenu.querySelectorAll('a, button').forEach((item) => {
  item.addEventListener('click', () => setHelpFabOpen(false));
});
document.addEventListener('pointerdown', (event) => {
  if (!helpFabMenu.hidden && !helpFab.contains(event.target)) setHelpFabOpen(false);
}, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !helpFabMenu.hidden) setHelpFabOpen(false);
});
window.addEventListener('blur', () => setHelpFabOpen(false));

const helpDialog = document.querySelector('#help-dialog');

function placeHelpDialog() {
  if (!helpDialog.matches(':popover-open')) return;
  // Above the ? button, right edges lined up. The button sits at the bottom
  // of #help-fab, whose menu may still be shrinking back into it.
  const corner = helpFab.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = helpDialog;
  helpDialog.style.left = `${Math.max(12, Math.min(corner.right - width, window.innerWidth - width - 12))}px`;
  const buttonSize = parseFloat(getComputedStyle(helpFab).getPropertyValue('--help-fab-size')) || 32;
  helpDialog.style.top = `${Math.max(12, corner.bottom - buttonSize - height - 8)}px`;
}
window.addEventListener('resize', placeHelpDialog);
// The trigger opens and closes the popover itself (popovertarget).
helpDialog.addEventListener('toggle', (event) => {
  if (event.newState === 'open') placeHelpDialog();
});
helpDialog.querySelector('.dialog-close').addEventListener('click', () => helpDialog.hidePopover());
