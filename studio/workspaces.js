// Presets and the site’s own breakpoints.

// The dialog sits under the + button, centred on it, and follows it while
// the window is resized; it stays inside the window.
function workspaceViewports(workspace) {
  return workspace.viewports.map((viewport) => (viewport.device ? STOCK_DEVICES[viewport.device] : viewport));
}

// Site breakpoints: the width media queries in the open page's CSS, read the
// way the Code panel reads it (linked files from other origins included).
// Every query marks where styles switch; one preview opens per range between
// switches, at the range's first width, and one below the first switch.
// "(min-width: 768px)" and "(max-width: 767.98px)" are the same switch, 768.
const SITE_BREAKPOINTS_PLACEHOLDER = [375, 768, 1024, 1440].map((width) => breakpointViewport('', width));
const SITE_BREAKPOINTS_LIMIT = 16;

function mediaWidthSwitches(query) {
  const px = (value, unit) => Number(value) * (/r?em/i.test(unit) ? 16 : 1);
  // "Below b" switches at b, "b and below" just after b.
  const upTo = (value, inclusive) => (inclusive ? Math.floor(value) + 1 : Math.ceil(value));
  const from = (value, inclusive) => (inclusive ? Math.ceil(value) : Math.floor(value) + 1);
  const switches = [];
  String(query).split(',').forEach((part) => {
    if (/^\s*(only\s+)?print\b/i.test(part) || /^\s*not\b/i.test(part)) return;
    for (const match of part.matchAll(/\(\s*(min|max)-width\s*:\s*([\d.]+)(px|r?em)\s*\)/gi)) {
      const value = px(match[2], match[3]);
      switches.push(match[1].toLowerCase() === 'min' ? from(value, true) : upTo(value, true));
    }
    // Range syntax: (width >= 768px), (400px < width <= 900px).
    for (const match of part.matchAll(/\(([^()]*\bwidth\b[^()]*)\)/gi)) {
      const tokens = match[1].match(/[\d.]+(?:px|r?em)|<=|>=|<|>|\bwidth\b/gi) || [];
      const at = tokens.findIndex((token) => token.toLowerCase() === 'width');
      if (at < 0 || /-width/i.test(match[1])) continue;
      const side = (operator, value, widthOnLeft) => {
        const [, number, unit] = value.match(/([\d.]+)(px|r?em)/i);
        const limit = px(number, unit);
        const below = widthOnLeft ? operator.startsWith('<') : operator.startsWith('>');
        switches.push(below ? upTo(limit, operator.includes('=')) : from(limit, operator.includes('=')));
      };
      if (tokens[at + 1] && tokens[at + 2]) side(tokens[at + 1], tokens[at + 2], true);
      if (at >= 2) side(tokens[at - 1], tokens[at - 2], false);
    }
  });
  return switches;
}

// Queries come from the page's loaded rules; stylesheets it cannot read come
// as text.
function siteBreakpointViewports({ queries: loaded = [], texts = [] }) {
  const queries = [...loaded];
  texts.forEach((text) => {
    const css = String(text || '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const match of css.matchAll(/@media\s+([^{;]+)\{/gi)) queries.push(match[1]);
    for (const match of css.matchAll(/@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')\s*([^;]*);/gi)) if (match[1].trim()) queries.push(match[1]);
  });
  // Switches a pixel apart ("max-width: 768px" beside "min-width: 768px")
  // are one breakpoint written off by one, not a layout of its own.
  const switches = [...new Set(queries.flatMap(mediaWidthSwitches))]
    .filter((width) => width >= 200 && width <= 3840)
    .sort((left, right) => left - right)
    .filter((width, index, all) => index === 0 || width - all[index - 1] > 1);
  if (!switches.length) return { switches, viewports: [] };
  const viewports = [];
  if (switches[0] - 1 >= 200) viewports.push(breakpointViewport(`Up to ${switches[0] - 1}`, Math.max(200, Math.min(375, switches[0] - 1))));
  switches.forEach((width, index) => {
    const next = switches[index + 1];
    viewports.push(breakpointViewport(next ? `${width}–${next - 1}` : `${width}+`, width));
  });
  return { switches, viewports: viewports.slice(0, SITE_BREAKPOINTS_LIMIT) };
}

let siteBreakpointsRequest = null;

function detectSiteBreakpoints(workspace) {
  const frame = [...document.querySelectorAll('.viewport-card')]
    .find((card) => card.dataset.previewReady === 'true')?.querySelector('iframe');
  if (!frame?.contentWindow) {
    notify('Open a page and wait for its preview to load, then choose Site breakpoints.', 'error');
    return;
  }
  const requestId = String(Date.now());
  const done = (styles) => {
    if (siteBreakpointsRequest?.requestId !== requestId) return;
    clearTimeout(siteBreakpointsRequest.timer);
    siteBreakpointsRequest = null;
    renderWorkspaces();
    if (!styles) {
      notify('The preview did not answer. Refresh the preview and try again.', 'error');
      return;
    }
    const { switches, viewports } = siteBreakpointViewports(styles);
    if (!viewports.length) {
      notify('No width breakpoints were found in this page’s CSS.', 'error');
      return;
    }
    workspace.viewports = viewports;
    applyWorkspace(workspace);
    notify(`Breakpoints in this page’s CSS: ${switches.join(', ')} px.`, 'success');
  };
  siteBreakpointsRequest = { requestId, frame: frame.contentWindow, done, timer: setTimeout(() => done(null), 15000) };
  renderWorkspaces();
  frame.contentWindow.postMessage({ source: 'viewport-parade', type: 'breakpoints-request', requestId }, '*');
}

window.addEventListener('message', (event) => {
  if (event.data?.source !== 'viewport-parade' || event.data?.type !== 'breakpoints-styles') return;
  if (!siteBreakpointsRequest || event.source !== siteBreakpointsRequest.frame || event.data.requestId !== siteBreakpointsRequest.requestId) return;
  siteBreakpointsRequest.done({
    queries: Array.isArray(event.data.queries) ? event.data.queries.map(String) : [],
    texts: Array.isArray(event.data.texts) ? event.data.texts.map(String) : []
  });
});

// Each pane in proportion to its size, scaled so the whole set fits the card.
function workspacePreview(workspace) {
  const viewports = workspaceViewports(workspace).length ? workspaceViewports(workspace) : SITE_BREAKPOINTS_PLACEHOLDER;
  const gap = 3;
  const room = { width: 140, height: 50 };
  const totalWidth = viewports.reduce((sum, viewport) => sum + viewport.width, 0);
  const tallest = Math.max(...viewports.map((viewport) => viewport.height));
  const scale = Math.min((room.width - gap * (viewports.length - 1)) / totalWidth, room.height / tallest);
  const preview = document.createElement('span');
  preview.className = 'workspace-preview';
  preview.setAttribute('aria-hidden', 'true');
  viewports.forEach((viewport) => {
    const pane = document.createElement('i');
    pane.style.width = `${Math.max(2, Math.round(viewport.width * scale))}px`;
    pane.style.height = `${Math.max(2, Math.round(viewport.height * scale))}px`;
    preview.append(pane);
  });
  return preview;
}

function workspaceChanges(workspace) {
  return [...changeLog.values()].filter((change) => workspaceOf(change) === workspace);
}

// The blue dot on a workspace drops every style change made in it, as the
// dot next to an inspector field does for one property.
function resetWorkspaceChanges(workspace) {
  revertChanges(workspaceChanges(workspace));
  if (!inspectorPanel.hidden) {
    clearInspectorSelections();
    hideInspectorPanel();
  }
  renderWorkspaces();
  notify(`Style changes in ${workspace.name} reset.`, 'success');
}

function renderWorkspaces() {
  workspaceList.replaceChildren(...WORKSPACES.map((workspace, index) => {
    const item = document.createElement('div');
    item.className = 'workspace-item';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'workspace-option';
    button.dataset.workspace = String(index);
    button.setAttribute('aria-pressed', String(index === activeWorkspace));
    button.title = workspace.detected
      ? ['Finds the width breakpoints in this page’s CSS and opens a preview for each.', ...workspaceViewports(workspace).map(({ name, width, height }) => `${name} · ${width} × ${height}`)].join('\n')
      : workspaceViewports(workspace).map(({ name, width, height }) => `${name} · ${width} × ${height}`).join('\n');
    const name = document.createElement('span');
    name.className = 'workspace-name';
    const searching = workspace.detected && siteBreakpointsRequest;
    name.textContent = searching ? 'Reading CSS…' : workspace.name;
    if (searching) button.setAttribute('aria-busy', 'true');
    button.append(workspacePreview(workspace), name);
    item.append(button);
    if (workspaceChanges(workspace).length) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'inspector-change-dot workspace-change-dot';
      dot.dataset.workspace = String(index);
      dot.title = `Reset style changes in ${workspace.name}`;
      dot.setAttribute('aria-label', dot.title);
      item.append(dot);
    }
    return item;
  }));
}

function applyWorkspace(workspace) {
  const ids = workspace.viewports.map((viewport) => {
    if (viewport.device) {
      DEVICES[viewport.device] = { ...STOCK_DEVICES[viewport.device] };
      return viewport.device;
    }
    const id = `workspace-${viewport.width}x${viewport.height}`;
    DEVICES[id] = { name: viewport.name, width: viewport.width, height: viewport.height };
    return id;
  });
  Object.keys(DEVICES).forEach((id) => {
    if (!ids.includes(id)) delete DEVICES[id];
  });
  activeWorkspace = WORKSPACES.indexOf(workspace);
  selected = new Set(ids);
  mode = 'multi';
  workspaceDialog.hidePopover();
  render();
  speak(`Preset ${workspace.name}: ${ids.length} viewports.`);
}

function placeWorkspaceDialog() {
  if (!workspaceDialog.matches(':popover-open')) return;
  const trigger = workspaceTrigger.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = workspaceDialog;
  workspaceDialog.style.left = `${Math.max(12, Math.min(trigger.left + trigger.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
  workspaceDialog.style.top = `${Math.max(12, Math.min(trigger.bottom + 8, window.innerHeight - height - 12))}px`;
}
window.addEventListener('resize', placeWorkspaceDialog);
workspaceTrigger.addEventListener('click', () => {
  renderWorkspaces();
  workspaceDialog.showPopover();
  placeWorkspaceDialog();
  requestAnimationFrame(() => (workspaceList.querySelector('[aria-pressed="true"]') || workspaceList.firstElementChild)?.focus());
});
workspaceDialog.querySelector('.dialog-close').addEventListener('click', () => workspaceDialog.hidePopover());
workspaceList.addEventListener('click', (event) => {
  const dot = event.target.closest('.workspace-change-dot');
  if (dot) {
    resetWorkspaceChanges(WORKSPACES[Number(dot.dataset.workspace)]);
    return;
  }
  const button = event.target.closest('.workspace-option');
  if (!button) return;
  const workspace = WORKSPACES[Number(button.dataset.workspace)];
  if (workspace.detected) detectSiteBreakpoints(workspace);
  else applyWorkspace(workspace);
});
