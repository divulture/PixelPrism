// Studio's tooltips. The system one is blocked everywhere: while the pointer
// is over an element, every title on it and its ancestors is put aside, so
// the browser has none to show. The nearest data-tooltip or title shows in
// one floating tooltip instead, in the look of .tooltip-trigger (which draws
// its own with CSS); it floats over everything, so a scrolling panel can't
// cut it off. The first one waits a moment; the next ones show at once.

const studioTooltip = document.createElement('div');
studioTooltip.className = 'studio-tooltip';
studioTooltip.setAttribute('role', 'tooltip');
studioTooltip.hidden = true;
document.body.append(studioTooltip);
let studioTooltipTimer = null;
// The elements whose title is put aside: [element, title].
let studioTooltipTitles = [];

function restoreStudioTitles() {
  // A title set while it was put aside is the newer one.
  studioTooltipTitles.forEach(([element, title]) => {
    if (!element.hasAttribute('title')) element.setAttribute('title', title);
  });
  studioTooltipTitles = [];
}
function hideStudioTooltip() {
  clearTimeout(studioTooltipTimer);
  studioTooltip.hidden = true;
}
function showStudioTooltip(owner, text) {
  clearTimeout(studioTooltipTimer);
  studioTooltipTimer = setTimeout(() => {
    if (!owner.isConnected || owner.getAttribute('aria-expanded') === 'true') return;
    studioTooltip.textContent = text;
    studioTooltip.hidden = false;
    const box = owner.getBoundingClientRect();
    const width = studioTooltip.offsetWidth;
    const height = studioTooltip.offsetHeight;
    studioTooltip.style.left = `${Math.max(8, Math.min(box.left + box.width / 2 - width / 2, innerWidth - width - 8))}px`;
    studioTooltip.style.top = `${box.bottom + 5 + height > innerHeight - 8 ? box.top - 5 - height : box.bottom + 5}px`;
  }, studioTooltip.hidden ? 350 : 0);
}

document.addEventListener('pointerover', (event) => {
  restoreStudioTitles();
  let owner = null;
  let text = '';
  for (let node = event.target instanceof Element ? event.target : null; node; node = node.parentElement) {
    // A preview's title names the frame for screen readers; it is not a tooltip.
    if (!owner && node.localName !== 'iframe' && (node.dataset?.tooltip || node.getAttribute('title'))) {
      owner = node;
      text = node.dataset?.tooltip || node.getAttribute('title');
    }
    if (node.hasAttribute('title')) {
      studioTooltipTitles.push([node, node.getAttribute('title')]);
      node.removeAttribute('title');
    }
  }
  // .tooltip-trigger draws its own from data-tooltip.
  if (owner && !(owner.matches('.tooltip-trigger') && owner.dataset.tooltip)) showStudioTooltip(owner, text);
  else hideStudioTooltip();
});
document.addEventListener('pointerout', (event) => {
  if (event.relatedTarget) return;
  restoreStudioTitles();
  hideStudioTooltip();
});
document.addEventListener('pointerdown', hideStudioTooltip, true);
document.addEventListener('keydown', hideStudioTooltip, true);
document.addEventListener('scroll', hideStudioTooltip, true);
