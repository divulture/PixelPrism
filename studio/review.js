// The HTML and PDF design reviews.

function reviewElementKey(element, selector = '') {
  if (!element) return 'page';
  return element.domPath || (element.id ? `#${element.id}` : '') || element.selector || selector || 'element';
}

function promiseWithTimeout(promise, timeout, message) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeout);
    Promise.resolve(promise).then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });
}

function reviewFilename() {
  const now = new Date();
  const part = (value) => String(value).padStart(2, '0');
  return `pixelprism-review-${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}.pdf`;
}

function loadReviewImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('A review screenshot could not be decoded.'));
    image.src = dataUrl;
  });
}

function wrappedCanvasLines(context, value, maxWidth) {
  const paragraphs = String(value ?? '').split(/\r?\n/);
  const lines = [];
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (!paragraph) {
      lines.push('');
      return;
    }
    const words = paragraph.split(/\s+/);
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate;
        return;
      }
      if (line) lines.push(line);
      if (context.measureText(word).width <= maxWidth) {
        line = word;
        return;
      }
      let fragment = '';
      [...word].forEach((character) => {
        if (fragment && context.measureText(fragment + character).width > maxWidth) {
          lines.push(fragment);
          fragment = character;
        } else fragment += character;
      });
      line = fragment;
    });
    if (line) lines.push(line);
    if (paragraphIndex < paragraphs.length - 1 && paragraph) lines.push('');
  });
  return lines;
}

function drawReviewLines(context, lines, x, y, lineHeight, color = '#27272a') {
  context.fillStyle = color;
  lines.forEach((line, index) => context.fillText(line, x, y + (index * lineHeight)));
  return y + (lines.length * lineHeight);
}

// Web addresses in a comment are links, by the HTML review's rule:
// punctuation that ends a sentence stays outside the link, as does a
// closing bracket the address never opened: "(see https://a.b/c)".
const REVIEW_URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi;

function reviewTextLinks(text) {
  const links = [];
  for (const match of text.matchAll(REVIEW_URL_PATTERN)) {
    let end = match[0].length;
    while (end > 0) {
      const character = match[0][end - 1];
      if ('.,;:!?\'"'.includes(character)) { end -= 1; continue; }
      const pair = { ')': '(', ']': '[', '}': '{' }[character];
      if (pair) {
        const head = match[0].slice(0, end);
        if (head.split(pair).length < head.split(character).length) { end -= 1; continue; }
      }
      break;
    }
    const url = match[0].slice(0, end);
    if (url) links.push({ start: match.index, end: match.index + end, href: /^www\./i.test(url) ? `https://${url}` : url });
  }
  return links;
}

// Wraps a comment the way the HTML review shows it (its own line breaks
// kept) and notes where its web addresses fall on each line.
function richCanvasLines(context, value, maxWidth) {
  const lines = [];
  String(value ?? '').split(/\r?\n/).forEach((paragraph) => {
    const links = reviewTextLinks(paragraph);
    let line = null;
    const push = () => {
      if (line) lines.push(line);
      line = null;
    };
    const append = (text, start) => {
      if (!line) line = { text: '', links: [] };
      const offset = line.text ? line.text.length + 1 : 0;
      line.text = line.text ? `${line.text} ${text}` : text;
      links.forEach((link) => {
        const from = Math.max(link.start, start);
        const to = Math.min(link.end, start + text.length);
        if (from < to) line.links.push({ start: offset + from - start, end: offset + to - start, href: link.href });
      });
    };
    for (const word of paragraph.matchAll(/\S+/g)) {
      const candidate = line ? `${line.text} ${word[0]}` : word[0];
      if (context.measureText(candidate).width <= maxWidth) {
        append(word[0], word.index);
        continue;
      }
      push();
      if (context.measureText(word[0]).width <= maxWidth) {
        append(word[0], word.index);
        continue;
      }
      let fragment = '';
      let fragmentStart = word.index;
      for (const character of word[0]) {
        if (fragment && context.measureText(fragment + character).width > maxWidth) {
          append(fragment, fragmentStart);
          push();
          fragmentStart += fragment.length;
          fragment = '';
        }
        fragment += character;
      }
      append(fragment, fragmentStart);
    }
    // An empty line of the comment stays an empty line.
    if (!line) line = { text: '', links: [] };
    push();
  });
  return lines;
}

// Draws one wrapped line; its links are blue, underlined and clickable.
function drawRichLine(page, line, x, y, lineHeight, fontSize, color) {
  const { context } = page;
  const segments = [];
  let cursor = 0;
  line.links.forEach((link) => {
    if (link.start > cursor) segments.push({ start: cursor, end: link.start });
    segments.push(link);
    cursor = link.end;
  });
  if (cursor < line.text.length) segments.push({ start: cursor, end: line.text.length });
  segments.forEach((segment) => {
    const text = line.text.slice(segment.start, segment.end);
    const left = x + context.measureText(line.text.slice(0, segment.start)).width;
    context.fillStyle = segment.href ? '#2563eb' : color;
    context.fillText(text, left, y);
    if (!segment.href) return;
    const width = context.measureText(text).width;
    context.fillRect(left, y + fontSize + 2, width, 1.5);
    page.links.push({ x: left, y: y - 4, width, height: lineHeight, href: segment.href });
  });
}

function reviewPageLabel(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'file:') return decodeURIComponent(parsed.pathname.split('/').pop() || parsed.pathname);
    return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

function readableProperty(property) {
  return String(property || '')
    .replace(/-/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

function describeReviewChange(change) {
  const from = String(change.from || '').trim();
  const to = String(change.to || '').trim();
  if (!from) return `${readableProperty(change.property)}: set to ${to || 'empty'}`;
  if (!to) return `${readableProperty(change.property)}: removed (was ${from})`;
  return `${readableProperty(change.property)}: ${from} -> ${to}`;
}

// PDF pages are laid out on an A4 sheet of 1240 × 1754 and drawn at twice
// that, so screenshots keep their own pixels.
const REVIEW_PAGE = { width: 1240, height: 1754, margin: 80, scale: 2, bottom: 1644 };
const REVIEW_CONTENT_WIDTH = REVIEW_PAGE.width - (REVIEW_PAGE.margin * 2);
const PDF_PAGE = { width: 595, height: 842 };

function createReviewCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = REVIEW_PAGE.width * REVIEW_PAGE.scale;
  canvas.height = REVIEW_PAGE.height * REVIEW_PAGE.scale;
  const context = canvas.getContext('2d', { alpha: false });
  context.scale(REVIEW_PAGE.scale, REVIEW_PAGE.scale);
  context.fillStyle = '#f7f7f8';
  context.fillRect(0, 0, REVIEW_PAGE.width, REVIEW_PAGE.height);
  context.textBaseline = 'top';
  return { canvas, context };
}

// A page keeps the links drawn on it; the PDF makes them clickable.
function createReviewPage(url = '') {
  return { ...createReviewCanvas(), url, links: [] };
}

function reviewSiteName(item) {
  const provided = String(item?.siteIdentity?.name || '').trim();
  if (provided) return provided;
  try {
    return new URL(item?.url || '').hostname.replace(/^www\./, '') || 'Website';
  } catch {
    return 'Website';
  }
}

// "iOS devices · iPhone SE · 375 × 667 · Archive", as the HTML review names a size.
function reviewViewportName(viewport) {
  return [viewport.workspace, viewport.device, `${viewport.width} × ${viewport.height}`, viewport.state].filter(Boolean).join(' · ');
}

function ellipsizeCanvasText(context, value, maxWidth) {
  const text = String(value || '');
  if (context.measureText(text).width <= maxWidth) return text;
  let shortened = text;
  while (shortened && context.measureText(`${shortened}...`).width > maxWidth) shortened = shortened.slice(0, -1);
  return shortened ? `${shortened}...` : '';
}

function drawReviewDocumentMark(context, site) {
  const logo = site.logo;
  let textX = REVIEW_PAGE.margin;
  if (logo?.naturalWidth && logo?.naturalHeight) {
    const frameSize = 42;
    const scale = Math.min(frameSize / logo.naturalWidth, frameSize / logo.naturalHeight);
    const width = Math.max(1, Math.round(logo.naturalWidth * scale));
    const height = Math.max(1, Math.round(logo.naturalHeight * scale));
    context.drawImage(logo, REVIEW_PAGE.margin + ((frameSize - width) / 2), 72 + ((frameSize - height) / 2), width, height);
    textX += 58;
  }
  context.fillStyle = '#52525b';
  context.font = '600 18px Inter, sans-serif';
  context.fillText(ellipsizeCanvasText(context, site.name, 520), textX, 83);
}

function drawReviewCover(data, site) {
  const page = createReviewPage(data.pages[0]?.url || '');
  const { context } = page;
  drawReviewDocumentMark(context, site);
  context.fillStyle = '#18181b';
  context.font = '800 82px Inter, sans-serif';
  context.fillText('Design Review', REVIEW_PAGE.margin, 282);
  context.fillStyle = '#52525b';
  context.font = '500 28px Inter, sans-serif';
  context.fillText('A visual handoff of comments and design changes', REVIEW_PAGE.margin, 390);

  const viewports = data.pages.flatMap((reviewPage) => reviewPage.viewports);
  const entries = viewports.flatMap((viewport) => viewport.entries);
  const metrics = [
    ['Pages', data.pages.length],
    ['Screenshots', viewports.length],
    ['Comments', entries.filter((entry) => entry.kind !== 'change').length],
    ['CSS changes', entries.filter((entry) => entry.kind === 'change').length]
  ];
  let metricY = 560;
  metrics.forEach(([label, value]) => {
    context.fillStyle = '#e4e4e7';
    context.fillRect(REVIEW_PAGE.margin, metricY + 53, REVIEW_CONTENT_WIDTH, 2);
    context.fillStyle = '#71717a';
    context.font = '600 22px Inter, sans-serif';
    context.fillText(label, REVIEW_PAGE.margin, metricY);
    context.fillStyle = '#18181b';
    context.font = '700 30px Inter, sans-serif';
    context.textAlign = 'end';
    context.fillText(String(value), REVIEW_PAGE.width - REVIEW_PAGE.margin, metricY - 5);
    context.textAlign = 'start';
    metricY += 100;
  });

  context.fillStyle = '#71717a';
  context.font = '500 20px Inter, sans-serif';
  context.fillText(new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(data.createdAt)), REVIEW_PAGE.margin, 1490);
  context.fillText('Powered by PixelPrism', REVIEW_PAGE.margin, 1530);
  return page;
}

// Every page of a screenshot opens with its page, size and view.
function drawReviewViewportHeader(page, section, continued) {
  const { context } = page;
  drawReviewDocumentMark(context, section.site);
  const count = (index, total) => `${String(index + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
  context.fillStyle = '#71717a';
  context.font = '800 18px Inter, sans-serif';
  context.fillText([
    `PAGE ${count(section.pageIndex, section.pageCount)}`,
    `SCREENSHOT ${count(section.viewportIndex, section.page.viewports.length)}`,
    continued ? 'CONTINUED' : ''
  ].filter(Boolean).join(' · '), REVIEW_PAGE.margin, 170);
  context.font = '800 42px Inter, sans-serif';
  const titleLines = wrappedCanvasLines(context, section.page.label, REVIEW_CONTENT_WIDTH).slice(0, 2);
  drawReviewLines(context, titleLines, REVIEW_PAGE.margin, 210, 50, '#18181b');
  page.links.push({
    x: REVIEW_PAGE.margin,
    y: 206,
    width: Math.max(...titleLines.map((line) => context.measureText(line).width)),
    height: titleLines.length * 50,
    href: section.page.url
  });
  let y = 210 + (titleLines.length * 50) + 10;
  context.fillStyle = '#71717a';
  context.font = '600 19px Inter, sans-serif';
  context.fillText(ellipsizeCanvasText(context, reviewViewportName(section.viewport), REVIEW_CONTENT_WIDTH), REVIEW_PAGE.margin, y);
  // A tab, menu or popup the capture could not open.
  if (section.viewport.warning) {
    y += 30;
    context.fillStyle = '#b91c1c';
    context.fillText(ellipsizeCanvasText(context, section.viewport.warning, REVIEW_CONTENT_WIDTH), REVIEW_PAGE.margin, y);
  }
  return Math.max(360, y + 58);
}

function drawReviewScreenshotError(context, message, y) {
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.roundRect(REVIEW_PAGE.margin, y, REVIEW_CONTENT_WIDTH, 190, 10);
  context.fill();
  context.strokeStyle = '#d4d4d8';
  context.strokeRect(REVIEW_PAGE.margin, y, REVIEW_CONTENT_WIDTH, 190);
  context.fillStyle = '#18181b';
  context.font = '700 22px Inter, sans-serif';
  context.fillText('Screenshot unavailable', REVIEW_PAGE.margin + 28, y + 38);
  context.font = '500 18px Inter, sans-serif';
  const lines = wrappedCanvasLines(context, message, REVIEW_CONTENT_WIDTH - 56);
  drawReviewLines(context, lines.slice(0, 3), REVIEW_PAGE.margin + 28, y + 82, 27, '#71717a');
  return y + 228;
}

// The numbered marker of the HTML review: red where it sits on the
// screenshot, grey for a comment whose element is not on it.
function drawReviewBadge(context, x, y, number, placed) {
  context.save();
  context.font = '600 15px Inter, sans-serif';
  const radius = Math.max(15, (context.measureText(String(number)).width / 2) + 7);
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.shadowColor = 'rgba(24, 24, 27, .3)';
  context.shadowBlur = 4;
  context.shadowOffsetY = 1;
  context.fillStyle = placed ? '#ef4444' : '#a1a1aa';
  context.fill();
  context.shadowColor = 'transparent';
  context.lineWidth = 3;
  context.strokeStyle = '#ffffff';
  context.stroke();
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(number), x, y + 1);
  context.restore();
}

const REVIEW_SHOT_MAX_HEIGHT = 900;

function reviewShotScale(shot) {
  return Math.min(REVIEW_CONTENT_WIDTH / shot.width, REVIEW_SHOT_MAX_HEIGHT / shot.height, 2);
}

// A screenshot with its elements outlined and its comments' markers on it.
function drawReviewShot(context, image, shot, entries, y) {
  const scale = reviewShotScale(shot);
  const width = Math.round(shot.width * scale);
  const height = Math.round(shot.height * scale);
  const x = Math.round((REVIEW_PAGE.width - width) / 2);
  context.fillStyle = '#e4e4e7';
  context.beginPath();
  context.roundRect(x - 2, y - 2, width + 4, height + 4, 8);
  context.fill();
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, 6);
  context.clip();
  context.drawImage(image, x, y, width, height);
  const outlined = new Set();
  context.strokeStyle = 'rgba(239, 68, 68, .85)';
  context.lineWidth = 2;
  entries.forEach(({ target, rect }) => {
    if (target !== 'element' || !rect?.width || !rect?.height) return;
    const key = [rect.x, rect.y, rect.width, rect.height].join();
    if (outlined.has(key)) return;
    outlined.add(key);
    context.strokeRect(x + (rect.x * scale), y + (rect.y * scale), rect.width * scale, rect.height * scale);
  });
  context.restore();
  entries.forEach(({ marker, number }) => {
    if (!marker) return;
    const markerX = Math.min(x + width - 16, Math.max(x + 16, x + (marker.x * scale) + ((marker.offset || 0) * 32)));
    const markerY = Math.min(y + height - 16, Math.max(y + 16, y + (marker.y * scale)));
    drawReviewBadge(context, markerX, markerY, number, true);
  });
  return y + height;
}

function reviewEntryTarget(entry) {
  if (entry.target === 'page') return 'Whole page';
  if (entry.target === 'pin') return 'Point placed by hand';
  const status = { missing: 'Not found', hidden: 'Hidden' }[entry.target];
  return [entry.selector || 'Element', status].filter(Boolean).join(' · ');
}

// One page, size and view of the review: each of its screens with the
// comments placed on it listed below, under the same numbers.
async function drawReviewViewportPages(section, finish) {
  let page = null;
  let top = 0;
  let y = 0;
  const open = async (continued) => {
    if (page) await finish(page);
    page = createReviewPage(section.page.url);
    top = drawReviewViewportHeader(page, section, continued);
    y = top;
  };
  const ensure = async (height) => {
    if (y > top && y + height > REVIEW_PAGE.bottom) await open(true);
  };

  const entryX = REVIEW_PAGE.margin + 48;
  const entryWidth = REVIEW_CONTENT_WIDTH - 48;
  const drawEntry = async (entry) => {
    const change = entry.kind === 'change';
    const font = change ? '500 19px ui-monospace, SFMono-Regular, Menlo, monospace' : '500 21px Inter, sans-serif';
    const fontSize = change ? 19 : 21;
    const lineHeight = 31;
    const gap = 12;
    page.context.font = font;
    const text = change ? `${entry.property}: ${entry.from || 'none'} → ${entry.to || 'removed'}` : entry.text || '';
    const lines = text ? richCanvasLines(page.context, text, entryWidth) : [];

    // Images attached to the comment sit under its text, in rows.
    const images = (await Promise.all((entry.attachments || [])
      .filter((attachment) => attachment?.src)
      .map((attachment) => loadReviewImage(attachment.src).catch(() => null))))
      .filter(Boolean);
    const rows = [];
    const maxHeight = images.length === 1 ? 560 : 300;
    images.forEach((image) => {
      const scale = Math.min(entryWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
      const tile = { image, width: Math.max(1, image.naturalWidth * scale), height: Math.max(1, image.naturalHeight * scale) };
      const row = rows[rows.length - 1];
      if (row && row.width + gap + tile.width <= entryWidth) {
        row.tiles.push(tile);
        row.width += gap + tile.width;
        row.height = Math.max(row.height, tile.height);
      } else rows.push({ tiles: [tile], width: tile.width, height: tile.height });
    });

    // A comment that fits on a page is not split: its images stay with
    // its text. One that does not fit repeats its number where it goes on.
    const height = (change ? 26 : 0) + (lines.length * lineHeight) + (rows.length && lines.length ? 8 : 0)
      + rows.reduce((total, row) => total + row.height + gap, 0) + 30;
    if (height <= REVIEW_PAGE.bottom - top) await ensure(height);
    const badge = () => drawReviewBadge(page.context, REVIEW_PAGE.margin + 16, y + (change ? 9 : 12), entry.number, Boolean(entry.marker));
    const room = async (needed) => {
      const before = page;
      await ensure(needed);
      if (page !== before) badge();
    };
    await ensure((change ? 26 : 0) + (lines.length ? lineHeight : 0) + 60);
    badge();
    if (change) {
      page.context.fillStyle = '#71717a';
      page.context.font = '700 15px Inter, sans-serif';
      page.context.fillText(entry.state ? `CSS CHANGE · ${entry.state.toUpperCase()}` : 'CSS CHANGE', entryX, y);
      y += 26;
    }
    for (const line of lines) {
      await room(lineHeight);
      page.context.font = font;
      drawRichLine(page, line, entryX, y, lineHeight, fontSize, '#27272a');
      y += lineHeight;
    }
    y += rows.length && lines.length ? 8 : 0;
    for (const row of rows) {
      await room(row.height + gap);
      let x = entryX;
      row.tiles.forEach(({ image, width, height: tileHeight }) => {
        const { context } = page;
        context.fillStyle = '#e4e4e7';
        context.beginPath();
        context.roundRect(x - 1, y - 1, width + 2, tileHeight + 2, 7);
        context.fill();
        context.save();
        context.beginPath();
        context.roundRect(x, y, width, tileHeight, 6);
        context.clip();
        context.fillStyle = '#ffffff';
        context.fillRect(x, y, width, tileHeight);
        context.drawImage(image, x, y, width, tileHeight);
        context.restore();
        x += width + gap;
      });
      y += row.height + gap;
    }

    await room(26);
    page.context.fillStyle = '#71717a';
    page.context.font = '500 17px Inter, sans-serif';
    page.context.fillText(ellipsizeCanvasText(page.context, reviewEntryTarget(entry), entryWidth), entryX, y + 4);
    y += 62;
  };

  await open(false);
  const { viewport } = section;
  const byNumber = (left, right) => left.number - right.number;
  if (!viewport.shots.length) {
    y = drawReviewScreenshotError(page.context, viewport.error || 'Chrome did not return an image.', y);
    for (const entry of [...viewport.entries].sort(byNumber)) await drawEntry(entry);
  }
  for (const [index, shot] of viewport.shots.entries()) {
    const entries = viewport.entries.filter((entry) => entry.shot === index).sort(byNumber);
    if (!entries.length) continue;
    const label = viewport.shots.length > 1 ? `SCREEN ${index + 1}/${viewport.shots.length}` : '';
    // A screen starts a new PDF page unless it fits whole with a comment under it.
    await ensure((label ? 34 : 0) + Math.round(shot.height * reviewShotScale(shot)) + 140);
    if (label) {
      page.context.fillStyle = '#71717a';
      page.context.font = '800 17px Inter, sans-serif';
      page.context.fillText(label, REVIEW_PAGE.margin, y);
      y += 34;
    }
    const image = await loadReviewImage(shot.src).catch(() => null);
    y = image
      ? drawReviewShot(page.context, image, shot, entries, y) + 44
      : drawReviewScreenshotError(page.context, 'The screenshot could not be decoded.', y);
    for (const entry of entries) await drawEntry(entry);
  }
  await finish(page);
}

function canvasToJpegPage(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('A PDF page could not be rendered.'));
        return;
      }
      resolve({
        width: canvas.width,
        height: canvas.height,
        bytes: new Uint8Array(await blob.arrayBuffer())
      });
    }, 'image/jpeg', 0.88);
  });
}

// A finished page gets its footer and leaves only its JPEG behind: pages
// drawn at twice the size would not all fit in memory as canvases.
async function finishReviewPage(page) {
  const { canvas, context } = page;
  if (page.url) {
    context.save();
    context.globalAlpha = 0.5;
    context.fillStyle = '#71717a';
    context.font = '500 16px Inter, sans-serif';
    const text = ellipsizeCanvasText(context, page.url, REVIEW_CONTENT_WIDTH - 150);
    context.fillText(text, REVIEW_PAGE.margin, REVIEW_PAGE.height - 58);
    page.links.push({ x: REVIEW_PAGE.margin, y: REVIEW_PAGE.height - 62, width: context.measureText(text).width, height: 26, href: page.url });
    context.restore();
  }
  const jpeg = await canvasToJpegPage(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return { ...jpeg, links: page.links };
}

function joinByteArrays(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function pdfFromJpegPages(pages, { title = '', outline = [] } = {}) {
  const encode = (value) => new TextEncoder().encode(value);
  // Titles can be in any script: UTF-16 with a byte order mark.
  const pdfText = (value) => {
    const text = String(value || '');
    let hex = 'FEFF';
    for (let index = 0; index < text.length; index += 1) hex += text.charCodeAt(index).toString(16).padStart(4, '0');
    return `<${hex}>`;
  };
  const pdfUri = (value) => {
    let uri;
    try { uri = new URL(value).href; } catch { uri = encodeURI(String(value || '')); }
    return `(${uri.replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '\\$&')})`;
  };
  const toPdfX = (x) => (x * PDF_PAGE.width) / REVIEW_PAGE.width;
  const toPdfY = (y) => PDF_PAGE.height - ((y * PDF_PAGE.height) / REVIEW_PAGE.height);
  const objects = [];
  const reserve = () => objects.push(null);
  const define = (id, ...parts) => { objects[id - 1] = parts.map((part) => (typeof part === 'string' ? encode(part) : part)); };

  const catalogId = reserve();
  const pagesId = reserve();
  const fontId = reserve();
  const infoId = reserve();
  define(fontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  define(infoId, `<< /Title ${pdfText(title)} /Producer (PixelPrism) >>`);
  const pageIds = pages.map((page, index) => {
    const pageId = reserve();
    const imageId = reserve();
    const contentId = reserve();
    const annotationIds = page.links.map((link) => {
      const id = reserve();
      const rect = [toPdfX(link.x), toPdfY(link.y + link.height), toPdfX(link.x + link.width), toPdfY(link.y)].map((value) => value.toFixed(2));
      define(id, `<< /Type /Annot /Subtype /Link /Rect [${rect.join(' ')}] /Border [0 0 0] /A << /S /URI /URI ${pdfUri(link.href)} >> >>`);
      return id;
    });
    // The page number is PDF text: the page count is known only once
    // every page is drawn. Helvetica Bold widths: digits 556, space and slash 278.
    const number = `${index + 1} / ${pages.length}`;
    const size = (16 * PDF_PAGE.width) / REVIEW_PAGE.width;
    const numberWidth = ([...number].reduce((total, character) => total + (/\d/.test(character) ? 556 : 278), 0) * size) / 1000;
    const numberX = toPdfX(REVIEW_PAGE.width - REVIEW_PAGE.margin) - numberWidth;
    const content = encode(`q\n${PDF_PAGE.width} 0 0 ${PDF_PAGE.height} 0 0 cm\n/Im0 Do\nQ\nBT\n/F1 ${size.toFixed(2)} Tf\n0.631 0.631 0.667 rg\n${numberX.toFixed(2)} ${toPdfY(REVIEW_PAGE.height - 46).toFixed(2)} Td\n(${number}) Tj\nET\n`);
    const annotations = annotationIds.length ? `/Annots [${annotationIds.map((id) => `${id} 0 R`).join(' ')}] ` : '';
    define(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PDF_PAGE.width} ${PDF_PAGE.height}] ${annotations}/Resources << /XObject << /Im0 ${imageId} 0 R >> /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    define(
      imageId,
      `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`,
      page.bytes,
      '\nendstream'
    );
    define(contentId, `<< /Length ${content.length} >>\nstream\n`, content, 'endstream');
    return pageId;
  });
  define(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);

  // The outline is the PDF viewer's sidebar, like the HTML review's pages
  // list: each page, and each size of a page captured at several.
  let outlineEntry = '';
  if (outline.length) {
    const outlineId = reserve();
    let visible = 0;
    const defineItems = (items, parentId) => {
      const ids = items.map(() => reserve());
      visible += items.length;
      items.forEach((item, index) => {
        const children = item.children?.length ? defineItems(item.children, ids[index]) : [];
        define(ids[index], [
          `<< /Title ${pdfText(item.title)} /Parent ${parentId} 0 R`,
          index ? `/Prev ${ids[index - 1]} 0 R` : '',
          index < ids.length - 1 ? `/Next ${ids[index + 1]} 0 R` : '',
          children.length ? `/First ${children[0]} 0 R /Last ${children[children.length - 1]} 0 R /Count ${children.length}` : '',
          `/Dest [${pageIds[item.page]} 0 R /Fit] >>`
        ].filter(Boolean).join(' '));
      });
      return ids;
    };
    const ids = defineItems(outline, outlineId);
    define(outlineId, `<< /Type /Outlines /First ${ids[0]} 0 R /Last ${ids[ids.length - 1]} 0 R /Count ${visible} >>`);
    outlineEntry = ` /Outlines ${outlineId} 0 R /PageMode /UseOutlines`;
  }
  define(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R${outlineEntry} >>`);

  const parts = [encode('%PDF-1.4\n%âãÏÓ\n')];
  const offsets = [0];
  let length = parts[0].length;
  objects.forEach((objectParts, index) => {
    offsets.push(length);
    const wrapped = [encode(`${index + 1} 0 obj\n`), ...objectParts, encode('\nendobj\n')];
    parts.push(...wrapped);
    length += wrapped.reduce((total, part) => total + part.length, 0);
  });
  const xrefOffset = length;
  parts.push(encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  offsets.slice(1).forEach((offset) => parts.push(encode(`${String(offset).padStart(10, '0')} 00000 n \n`)));
  parts.push(encode(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return new Blob([joinByteArrays(parts)], { type: 'application/pdf' });
}

async function buildReviewPdf(data) {
  // Canvas text draws with whatever font is loaded at that moment.
  await Promise.all(['500', '600', '700', '800'].map((weight) => document.fonts?.load(`${weight} 20px Inter`)));
  const site = {
    name: data.site.name,
    logo: data.site.logo ? await loadReviewImage(data.site.logo).catch(() => null) : null
  };
  const pages = [];
  const finish = async (page) => { pages.push(await finishReviewPage(page)); };
  await finish(drawReviewCover(data, site));
  const outline = [];
  for (const [pageIndex, reviewPage] of data.pages.entries()) {
    const item = { title: reviewPage.label, page: pages.length, children: [] };
    for (const [viewportIndex, viewport] of reviewPage.viewports.entries()) {
      if (reviewPage.viewports.length > 1) item.children.push({ title: reviewViewportName(viewport), page: pages.length });
      await drawReviewViewportPages({ site, page: reviewPage, pageIndex, pageCount: data.pages.length, viewport, viewportIndex }, finish);
    }
    outline.push(item);
  }
  return pdfFromJpegPages(pages, { title: `Design Review · ${data.site.name}`, outline });
}

async function downloadReviewPdf() {
  const contexts = reviewHtmlContexts();
  if (!contexts.length) return;
  if (!window.chrome?.runtime?.sendMessage || !window.chrome?.downloads?.download) {
    notify('Review export is available after the extension is loaded in Chrome.', 'error', exportReviewMenu);
    return;
  }
  setReviewExportProgress('Preparing the review...', 0);
  try {
    const data = await captureReviewData(contexts);
    setReviewExportProgress('Building PDF...', .9);
    const pdf = await buildReviewPdf(data);
    const objectUrl = URL.createObjectURL(pdf);
    try {
      await window.chrome.downloads.download({ url: objectUrl, filename: reviewFilename(), saveAs: false });
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
    const missing = contexts.filter((context) => context.captureError).length;
    notify(missing
      ? `Review PDF downloaded. ${missing} screenshot${missing === 1 ? '' : 's'} could not be captured.`
      : 'Review PDF downloaded.', missing ? 'error' : 'success', exportReviewMenu);
  } catch (error) {
    notify(`Review PDF was not saved: ${error.message}`, 'error', exportReviewMenu);
  } finally {
    endReviewExportProgress();
  }
}

// Design review (HTML and PDF): one capture per page/viewport, with every
// comment and CSS change of that viewport placed on it as a numbered marker.
// Views with the same switches share a capture. The place in the page tells
// apart icon buttons that share a domPath (Export and Settings), so each
// opens its own capture.
function reviewStepsKey(steps) {
  return JSON.stringify(steps.map((step) => `${step.kind === 'state' ? `${step.state}@` : ''}${step.element?.domPath || step.element?.selector || ''}${Array.isArray(step.element?.indexPath) ? `@${step.element.indexPath.join('.')}` : ''}`));
}

function reviewHtmlContexts() {
  const contexts = new Map();
  const contextFor = (item) => {
    const { url, viewport, steps } = item;
    const canonicalUrl = canonicalInspectorUrl(url || targetUrl);
    const width = Math.round(Number(viewport?.width) || 0);
    const height = Math.round(Number(viewport?.height) || 0);
    // Each tab or panel of a page is captured on its own: from the copy of
    // the view the comment was left in, or after its recorded switches are
    // clicked again. Comments left on one view share its copy.
    const viewSteps = Array.isArray(steps) ? steps : [];
    const snapshot = typeof item.snapshot === 'string' ? item.snapshot : '';
    const key = [canonicalUrl, width, height, snapshot || reviewStepsKey(viewSteps)].join('\u0000');
    if (!contexts.has(key)) {
      const state = viewSteps.length ? viewStepsLabel(viewSteps) : '';
      // A size shared by several workspaces is named after the one the
      // first note on it was made in.
      const source = { workspace: item.workspace, device: item.device, viewport: { width, height } };
      contexts.set(key, {
        url: canonicalUrl, viewport: { width, height }, workspace: workspaceOf(source)?.name || '', device: deviceOf(source),
        steps: viewSteps, snapshot, state, entries: [], targets: new Map()
      });
    }
    return contexts.get(key);
  };
  const addEntry = (source, entry) => {
    const context = contextFor(source);
    const element = source.element || null;
    const selector = element?.selector || source.selector || '';
    // A point placed by hand in a review wins over the recorded element,
    // which may be missing or the wrong one of several look-alikes.
    const pin = source.pin ? { x: Math.round(source.pin.x), y: Math.round(source.pin.y) } : null;
    let targetId = null;
    if (pin) {
      targetId = `pin:${pin.x},${pin.y}`;
      if (!context.targets.has(targetId)) context.targets.set(targetId, { element: null, selector: '', pin });
    } else if (element || selector) {
      targetId = reviewElementKey(element, selector);
      if (!context.targets.has(targetId)) context.targets.set(targetId, { element, selector });
    }
    const offset = !pin && source.offset && Number.isFinite(source.offset.x) && Number.isFinite(source.offset.y) ? source.offset : null;
    context.entries.push({ ...entry, selector: entry.ruleSelector || selector, element, pin, offset, targetId, order: context.entries.length });
  };

  // Edit entries stay out: the review shows the edits themselves below.
  // Every entry keeps the number it has in Studio's list; an edit takes the
  // number of its entry there.
  const unlisted = siteComments().length;
  siteComments().filter((comment) => !comment.change).forEach((comment) => addEntry(comment, {
    kind: 'comment',
    number: commentNumber(comment),
    // Not written into the review: lets the export correct the comment.
    record: comment,
    text: comment.comment,
    ...(commentAttachments(comment).length ? { attachments: commentAttachments(comment) } : {})
  }));
  // An edit to a state (".button:hover") goes on a capture in that state.
  // Edits recorded before they kept their view get the state from the rule.
  const withStateStep = (change) => {
    const steps = Array.isArray(change.steps) ? change.steps : [];
    const state = Object.keys(INSPECTOR_STATE_SUFFIXES).find((name) => String(change.selector || '').endsWith(INSPECTOR_STATE_SUFFIXES[name]));
    return state && change.element && !steps.some((step) => step.kind === 'state')
      ? { ...change, steps: [...steps, { kind: 'state', state, element: change.element, label: INSPECTOR_STATE_LABELS[state] }] }
      : change;
  };
  activeChanges().map(withStateStep).forEach((change, index) => addEntry(change, {
    kind: 'change',
    number: commentNumber(comments.find((note) => note.change === changeNoteKey(change))) || unlisted + index + 1,
    // The rule the edit goes to (".button:hover"), and its state by name.
    ruleSelector: change.selector,
    ...(change.steps?.find((step) => step.kind === 'state') ? { state: change.steps.find((step) => step.kind === 'state').label } : {}),
    property: change.property,
    from: String(change.from || '').trim(),
    to: String(change.to || '').trim(),
    text: change.wrapText ? `${describeReviewChange(change)} (text “${change.wrapText.text}”: wrap it in a span)` : describeReviewChange(change)
  }));

  return [...contexts.values()]
    .map((context) => ({
      ...context,
      targets: [...context.targets].map(([id, target]) => ({ id, target }))
    }))
    .sort((left, right) => (
      left.url.localeCompare(right.url)
      || workspaceRank(left) - workspaceRank(right)
      || left.viewport.width - right.viewport.width
      || left.viewport.height - right.viewport.height
    ));
}

// Review sizes follow the workspaces' order; sizes of no workspace go last.
function workspaceRank({ workspace }) {
  const index = WORKSPACES.findIndex((candidate) => candidate.name === workspace);
  return index === -1 ? WORKSPACES.length : index;
}

function reviewHtmlViewport(context, pageIndex, viewportIndex) {
  const shots = [...(context.shots || [])].sort((left, right) => left.scrollY - right.scrollY);
  const placements = new Map();
  shots.forEach((shot, shotIndex) => shot.rects.forEach((rect) => {
    if (rect.found && rect.visible && !placements.has(rect.id)) placements.set(rect.id, { shot: shotIndex, rect });
  }));
  const unplaced = new Map((context.unplaced || []).map((rect) => [rect.id, rect]));
  const topShot = Math.max(0, shots.findIndex((shot) => shot.scrollY === 0));
  const placed = context.entries.map((entry) => {
    if (!entry.targetId) return { entry, target: 'page', shot: topShot };
    const placement = placements.get(entry.targetId);
    if (placement) {
      const { x, y, width, height } = placement.rect;
      return { entry, target: 'element', shot: placement.shot, rect: { x, y, width, height } };
    }
    return { entry, target: unplaced.get(entry.targetId)?.found ? 'hidden' : 'missing', shot: 0 };
  });
  // Listed in Studio's order, so the numbers read as they do there.
  placed.sort((left, right) => left.entry.number - right.entry.number || left.entry.order - right.entry.order);
  const markersPerTarget = new Map();
  const entries = placed.map(({ entry, target, shot, rect }, index) => {
    const { number } = entry;
    const result = {
      // Edits share their entry's number; the index keeps ids apart.
      id: `${pageIndex}.${viewportIndex}.${number}.${index}`,
      number,
      kind: entry.kind,
      text: entry.text,
      selector: entry.selector,
      target,
      shot
    };
    if (entry.kind === 'change') Object.assign(result, { property: entry.property, from: entry.from, to: entry.to, ...(entry.state ? { state: entry.state } : {}) });
    if (entry.attachments?.length) result.attachments = entry.attachments;
    // Kept so the review can be imported back without losing the binding.
    if (entry.element) result.element = entry.element;
    if (entry.pin) {
      result.pin = entry.pin;
      if (target === 'element') result.target = 'pin';
    }
    if (entry.offset) result.offset = entry.offset;
    if (rect) {
      const { width, height } = shots[shot];
      // A marker moved within its element keeps that spot; others stack
      // side by side on the element's corner.
      const offset = entry.offset ? 0 : markersPerTarget.get(entry.targetId) || 0;
      if (!entry.offset) markersPerTarget.set(entry.targetId, offset + 1);
      const x = rect.x + (entry.offset ? Math.min(Math.max(entry.offset.x, 0), rect.width) : 0);
      const y = rect.y + (entry.offset ? Math.min(Math.max(entry.offset.y, 0), rect.height) : 0);
      const inset = 13;
      result.rect = rect;
      result.marker = {
        x: Math.min(Math.max(x, inset), Math.max(inset, width - inset - (offset * 24))),
        y: Math.min(Math.max(y, inset), Math.max(inset, height - inset)),
        offset
      };
    }
    return result;
  });
  return {
    width: context.viewport.width,
    height: context.viewport.height,
    ...(context.workspace ? { workspace: context.workspace } : {}),
    ...(context.device ? { device: context.device } : {}),
    ...(context.state ? { state: context.state, steps: context.steps } : {}),
    // A tab, menu or popup the capture could not open: its comments are not on the screen.
    ...(context.failedSteps?.length ? { warning: `Could not open ${context.failedSteps.map((label) => `“${label}”`).join(', ')}` } : {}),
    shots: shots.map((shot) => ({ src: shot.dataUrl, width: shot.width, height: shot.height, scrollY: shot.scrollY })),
    error: shots.length ? undefined : (context.captureError || 'Chrome did not return an image.'),
    entries
  };
}

function reviewHtmlData(contexts) {
  const pages = [];
  const pagesByUrl = new Map();
  contexts.forEach((context) => {
    if (!pagesByUrl.has(context.url)) {
      const page = { url: context.url, label: reviewPageLabel(context.url), contexts: [] };
      pagesByUrl.set(context.url, page);
      pages.push(page);
    }
    pagesByUrl.get(context.url).contexts.push(context);
  });
  const identity = contexts.find((context) => context.identity?.name || context.identity?.logoDataUrl)?.identity;
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    site: {
      name: reviewSiteName({ url: pages[0]?.url, siteIdentity: identity }),
      logo: identity?.logoDataUrl || ''
    },
    pages: pages.map((page, pageIndex) => ({
      url: page.url,
      label: page.label,
      viewports: page.contexts.map((context, viewportIndex) => reviewHtmlViewport(context, pageIndex, viewportIndex))
    }))
  };
}

async function buildReviewHtml(data) {
  const response = await fetch(chrome.runtime.getURL('review-viewer.html'));
  if (!response.ok) throw new Error('The review template could not be loaded.');
  const template = await response.text();
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
  // Keep the embedded JSON from closing its <script> element early.
  const json = JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return template
    .replace('{{PIXELPRISM_REVIEW_TITLE}}', () => escapeHtml(`Design Review · ${data.site.name}`))
    .replace('{{PIXELPRISM_REVIEW_DATA}}', () => json);
}

function reviewHtmlFilename() {
  return reviewFilename().replace(/\.pdf$/, '.html');
}

// While a review is exported, the Export review button draws a ring that
// fills up and a toast says which step is running.
function setReviewExportProgress(message, fraction) {
  exportReviewMenu.setAttribute('aria-busy', 'true');
  exportReviewMenu.style.setProperty('--progress', String(Math.round(Math.max(.04, fraction) * 100)));
  showProgress(message, exportReviewMenu);
}

function endReviewExportProgress() {
  exportReviewMenu.removeAttribute('aria-busy');
  exportReviewMenu.style.removeProperty('--progress');
}

// Both review files are built from the same captures and data. Captures take
// most of the time: they fill the progress up to 85%.
async function captureReviewContext(context) {
  try {
    // A copy lost from storage leaves the recorded steps to replay.
    const snapshot = context.snapshot ? await loadViewSnapshot(context.snapshot) : null;
    const response = await promiseWithTimeout(window.chrome.runtime.sendMessage({
      type: 'capture-review-page',
      url: context.url,
      width: context.viewport.width,
      height: context.viewport.height,
      // Screenshots show the live site as it is; edits are listed as before/after notes.
      changes: [],
      targets: context.targets,
      steps: context.steps,
      snapshot
    }), 45000 + (context.targets.length * 12000), 'The page took too long to prepare.');
    if (!response?.ok) throw new Error(response?.error || 'Unable to capture this page.');
    context.shots = response.shots;
    context.unplaced = response.unplaced;
    context.identity = response.identity;
    context.failedSteps = Array.isArray(response.failedSteps) ? response.failedSteps : [];
    context.covered = Array.isArray(response.covered) ? response.covered : [];
    context.popupSteps = Array.isArray(response.popupSteps) ? response.popupSteps : [];
    delete context.captureError;
    return true;
  } catch (error) {
    context.captureError = error.message;
    return false;
  }
}

// Comments recorded before they kept only the popups they are in can carry
// a modal they were left behind: on its capture they sit under its
// backdrop. They go to the page without that popup (the tabs stay), on the
// capture of that view when there is one, once they are seen there.
async function moveCoveredReviewEntries(contexts) {
  for (const context of [...contexts]) {
    const covered = new Set(context.covered || []);
    const popupSteps = new Set(context.popupSteps || []);
    if (!covered.size || !popupSteps.size || context.captureError) continue;
    const moving = context.entries.filter((entry) => covered.has(entry.targetId));
    if (!moving.length) continue;
    const steps = context.steps.filter((_, index) => !popupSteps.has(index));
    const stepsKey = reviewStepsKey(steps);
    const existing = contexts.find((other) => other !== context && !other.snapshot && !other.captureError
      && other.url === context.url && other.viewport.width === context.viewport.width && other.viewport.height === context.viewport.height
      && reviewStepsKey(other.steps) === stepsKey);
    // Captured as a copy, so a failed capture leaves the review as it was.
    const base = existing
      ? { ...existing }
      : { ...context, steps, snapshot: '', state: steps.length ? viewStepsLabel(steps) : '', entries: [], targets: [], failedSteps: [], covered: [], popupSteps: [] };
    const known = new Set(base.targets.map((target) => target.id));
    base.targets = [...base.targets, ...context.targets.filter((target) => covered.has(target.id) && !known.has(target.id))];
    if (!await captureReviewContext(base)) continue;
    const shown = new Set(base.shots.flatMap((shot) => shot.rects.filter((rect) => rect.visible).map((rect) => rect.id)));
    const moved = moving.filter((entry) => shown.has(entry.targetId));
    if (!moved.length) continue;
    // The comments themselves forget the popup, in the list and in later exports.
    moved.forEach(({ record }) => {
      if (!record || !comments.includes(record)) return;
      if (steps.length) record.steps = steps;
      else delete record.steps;
      delete record.snapshot;
    });
    if (moved.some(({ record }) => record)) {
      saveComments();
      syncCommentMarkers();
      if (!commentsPanel.hidden) renderComments();
    }
    context.entries = context.entries.filter((entry) => !moved.includes(entry));
    base.entries = [...base.entries, ...moved.map((entry, index) => ({ ...entry, order: base.entries.length + index }))];
    if (existing) Object.assign(existing, base);
    else contexts.splice(contexts.indexOf(context), 0, base);
    if (!context.entries.length) contexts.splice(contexts.indexOf(context), 1);
  }
}

async function captureReviewData(contexts) {
  let nextContext = 0;
  let captured = 0;
  setReviewExportProgress(`Capturing screenshots: 0 of ${contexts.length}...`, 0);
  const captureNextContext = async () => {
    while (nextContext < contexts.length) {
      const context = contexts[nextContext];
      nextContext += 1;
      await captureReviewContext(context);
      captured += 1;
      setReviewExportProgress(`Capturing screenshots: ${captured} of ${contexts.length}...`, (captured / contexts.length) * .85);
      speak(`${captured} of ${contexts.length} review screenshots prepared.`);
    }
  };
  const workerCount = Math.min(2, contexts.length);
  await Promise.all(Array.from({ length: workerCount }, () => captureNextContext()));
  if (contexts.some((context) => context.covered?.length)) {
    setReviewExportProgress('Capturing comments under popups...', .85);
    await moveCoveredReviewEntries(contexts);
  }

  setReviewExportProgress('Building the review...', .85);
  for (const context of contexts) {
    for (const entry of context.entries) {
      if (entry.attachments?.length) entry.attachments = await embeddedAttachments(entry.attachments);
    }
  }
  return reviewHtmlData(contexts);
}

async function downloadReviewHtml() {
  const contexts = reviewHtmlContexts();
  if (!contexts.length) return;
  if (!window.chrome?.runtime?.sendMessage || !window.chrome?.downloads?.download) {
    notify('Review export is available after the extension is loaded in Chrome.', 'error', exportReviewMenu);
    return;
  }
  setReviewExportProgress('Preparing the review...', 0);
  try {
    const html = await buildReviewHtml(await captureReviewData(contexts));
    const objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    try {
      await window.chrome.downloads.download({ url: objectUrl, filename: reviewHtmlFilename(), saveAs: false });
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    }
    const missing = contexts.filter((context) => context.captureError).length;
    notify(missing
      ? `Design review downloaded. ${missing} screenshot${missing === 1 ? '' : 's'} could not be captured.`
      : 'Design review downloaded.', missing ? 'error' : 'success', exportReviewMenu);
  } catch (error) {
    notify(`Design review was not saved: ${error.message}`, 'error', exportReviewMenu);
  } finally {
    endReviewExportProgress();
  }
}
