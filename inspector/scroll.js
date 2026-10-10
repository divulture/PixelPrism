// The page’s scroller and the scroll position the rulers follow.

// The element that scrolls the page. Usually the window, but app-like sites
// often keep the window still and scroll a full-screen container instead,
// sometimes only at some widths. Page positions are kept in its scroll
// coordinates, as the review capture expects (REVIEW_SCROLLER_HELPERS in
// background.js). Cached briefly: markers ask on every scroll frame.
let pageScrollerCache = null;
const pageScroller = () => {
  const now = performance.now();
  if (pageScrollerCache && now - pageScrollerCache.time < 1000 && pageScrollerCache.element?.isConnected !== false) return pageScrollerCache.element;
  const root = document.scrollingElement || document.documentElement;
  let range = root.scrollHeight - window.innerHeight;
  let best = null;
  if (range <= window.innerHeight / 4) {
    for (const element of document.body ? document.body.querySelectorAll('*') : []) {
      const elementRange = element.scrollHeight - element.clientHeight;
      if (elementRange <= range || element.clientHeight < window.innerHeight / 2 || element.clientWidth < window.innerWidth / 2) continue;
      if (element.closest('[data-viewport-parade-overlay]') || !/(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY)) continue;
      best = element;
      range = elementRange;
    }
  }
  pageScrollerCache = { element: best, time: now };
  return best;
};
const pageScrollY = () => pageScroller()?.scrollTop ?? window.scrollY;
// Studio's rulers count page pixels, so while they are shown they follow
// the page's scroll position, at most once a frame.
let rulerScrollWatched = false;
let rulerScrollFrame = 0;
const reportRulerScroll = () => {
  rulerScrollFrame = 0;
  const scroller = pageScroller();
  window.parent.postMessage({
    source: 'viewport-parade',
    type: 'ruler-scroll',
    x: scroller ? scroller.scrollLeft : window.scrollX,
    y: scroller ? scroller.scrollTop : window.scrollY
  }, extensionOrigin);
};
const scheduleRulerScroll = () => {
  if (rulerScrollWatched && !rulerScrollFrame) rulerScrollFrame = requestAnimationFrame(reportRulerScroll);
};
window.addEventListener('scroll', scheduleRulerScroll, true);
