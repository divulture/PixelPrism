// The agent review and the Markdown report.

// What agents get: comments with text, without their images. An image-only
// comment is for the people reading the review; it says nothing to an agent.
// Edit entries are left out: the edits themselves go in changeSet.
// The device name rides along with the size; the workspace stays out.
function agentComments() {
  return siteComments()
    .filter((comment) => !comment.change && comment.comment.trim())
    .map(({ attachments, workspace, device, ...comment }) => ({
      ...comment,
      viewport: { ...comment.viewport, ...(deviceOf({ ...comment, workspace, device }) ? { device: deviceOf({ ...comment, workspace, device }) } : {}) }
    }));
}

function formatChangeReport() {
  const notes = agentComments();
  const createdAt = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium', timeStyle: 'short'
  }).format(new Date());
  const byPage = new Map();
  activeChanges().forEach((change) => {
    const page = byPage.get(change.url) || new Map();
    const viewportKey = viewportLabel(change, { workspace: false });
    const viewportChanges = page.get(viewportKey) || [];
    viewportChanges.push(change);
    page.set(viewportKey, viewportChanges);
    byPage.set(change.url, page);
  });
  const viewportCount = [...byPage.values()].reduce((count, viewports) => count + viewports.size, 0);
  const lines = [
    '# PixelPrism — Changes report',
    '',
    `Created: ${createdAt}`,
    `Style changes: ${activeChanges().length}`,
    `Comments: ${notes.length}`,
    `Viewports: ${viewportCount}`,
    '',
    'This file contains every saved inspector change across all pages and viewports in this session.'
  ];
  [...byPage.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([url, viewports]) => {
    lines.push('', '## Page', `<${url}>`);
    [...viewports.entries()].sort(([, [left]], [, [right]]) => left.viewport.width - right.viewport.width || left.viewport.height - right.viewport.height).forEach(([viewport, changes]) => {
      lines.push('', `### Viewport: ${viewport}`);
      const bySelector = new Map();
      changes.forEach((change) => {
        const properties = bySelector.get(change.selector) || [];
        properties.push(change);
        bySelector.set(change.selector, properties);
      });
      [...bySelector.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([selector, properties]) => {
        const wrap = properties[0]?.wrapText;
        lines.push('', wrap
          ? `- text “${wrap.text}” in \`${escapeInlineCode(wrap.parent || '')}\`: wrap it in a span and style the span`
          : `- \`${escapeInlineCode(selector)}\`${changeState(properties[0]) ? ` · ${INSPECTOR_STATE_LABELS[changeState(properties[0])]}` : ''}`);
        properties.forEach((change) => {
          const from = change.from || 'removed';
          const to = change.to || 'removed';
          lines.push(change.property === 'text'
            ? `  - text: “${change.from}” → “${change.to}” (edit the text in the source, not CSS)`
            : change.property === 'alt'
              ? `  - alt: “${change.from}” → “${change.to}” (set the image's alt attribute in the source, not CSS)`
              : `  - \`${escapeInlineCode(change.property)}\`: \`${escapeInlineCode(from)}\` → \`${escapeInlineCode(to)}\`${change.newDeclaration ? ' (new declaration: not in the project CSS yet)' : ''}`);
        });
      });
    });
  });
  if (notes.length) {
    lines.push('', '## Comments');
    notes.forEach((comment) => {
      const target = comment.element?.selector ? ` · \`${escapeInlineCode(comment.element.selector)}\`` : ' · page-level';
      const rect = comment.pin ? { x: comment.pin.x, y: comment.pin.y } : comment.element?.rect;
      const position = rect ? ` · at ${rect.x}, ${rect.y}${Number.isFinite(rect.width) ? `, ${rect.width} × ${rect.height}` : ''}` : '';
      lines.push(`- ${comment.comment} (${viewportLabel(comment, { workspace: false })}${target}${position})`);
    });
  }
  return `${lines.join('\n')}\n`;
}

function reportFilename() {
  const now = new Date();
  const part = (value) => String(value).padStart(2, '0');
  return `pixelprism-changes-${now.getFullYear()}-${part(now.getMonth() + 1)}-${part(now.getDate())}-${part(now.getHours())}${part(now.getMinutes())}.md`;
}

const CODEX_INSTRUCTION = [
  'Apply the visual changes from PixelPrism to the current source repository. PixelPrism values are visual targets, not instructions to hardcode pixels, colors, or font sizes. For every changed property: (1) locate the rendered element using route, DOM context, text, attributes, selector, surrounding markup, and parent context; (2) trace the current rendered value to its declaration and abstraction chain before editing: CSS custom property, design token/theme, parent/theme variable scope, Tailwind utility/config, preprocessor variable, mixin/helper, component prop, variant/state, shared component style, then local CSS/inline style only when truly local; (3) determine whether intent is global, component, variant, instance, or viewport/breakpoint, including responsive utilities, media/container queries, and responsive props; (4) reuse an existing appropriate token, utility, prop, variant, or scoped variable. Never replace an existing CSS variable, design token, theme value, component prop, Tailwind utility, or shared abstraction with a hardcoded value without evidence it is local. Before changing a token, inspect its usages: change it only for demonstrated global intent; otherwise use the narrowest existing abstraction. Do not create a token for a one-off unless it is semantically reusable and consistent with project conventions. sourceHint is optional browser evidence, not authoritative; verify it in source. A group with state (hover, focus or active) applies only while the element is in that state: put its changes in the element’s state styles (its :hover, :focus-visible or :active rule, a hover:/focus:/active: utility, or the component’s state variant), never in the default styles; ruleSelector is the rule PixelPrism previewed them in. A change with newDeclaration: true has no declaration in the project CSS for this element yet: add one in the narrowest place that styles this element (its component, class, or utility), instead of searching for an existing rule to edit; its before value is only the browser default. An element with wrapText does not exist in the source: it is text that sits directly inside the element at wrapText.parentSelector, beside other children. Wrap exactly that text (wrapText.text) in a span there, give it a class that fits the project’s naming, and apply the changes to that span; the selector PixelPrism used for it is temporary. Preserve the project’s styling architecture (Tailwind, CSS Modules, SCSS, styled-components, CSS variables, themes, or design system) and make the smallest source-level change. Apply only final beforeComputed/afterComputed values. Do not add generated CSS overrides, framework adapters, MCP, AST infrastructure, or unrelated refactors; report genuinely ambiguous matches rather than guessing.',
  'A change with property text replaces the element’s visible text: change the text where the source defines it (markup, component, content or translation file), not with CSS; before is the old text. A change with property alt sets an image’s alt attribute: change it where the source defines it (markup, component prop, content or translation file); before is the old alt text, empty when the image had none; an empty after marks the image as decorative (alt="").',
].join(' ');

function codexChangeSet() {
  const groups = new Map();
  activeChanges().forEach((change) => {
    const element = change.element || {};
    const state = changeState(change);
    // An element's edits in the default state and in Hover are separate groups.
    const key = [change.url, change.route, change.viewport.width, change.viewport.height, element.domPath || change.selector, state || ''].join('\u0000');
    let group = groups.get(key);
    if (!group) {
      const { parent, ...elementDetails } = element;
      group = {
        route: change.route || '/',
        pageUrl: change.url,
        viewport: { ...change.viewport, ...(deviceOf(change) ? { device: deviceOf(change) } : {}) },
        element: {
          tag: elementDetails.tag || null,
          id: elementDetails.id || null,
          classes: elementDetails.classes || [],
          selector: elementDetails.selector || change.selector,
          domPath: elementDetails.domPath || null,
          text: elementDetails.text || '',
          attributes: elementDetails.attributes || {},
          htmlSnippet: elementDetails.htmlSnippet || ''
        },
        parent: parent || null,
        ...(state ? { state, ruleSelector: change.selector } : {}),
        ...(change.wrapText ? { wrapText: { text: change.wrapText.text, parentSelector: change.wrapText.parent, parentDomPath: change.wrapText.parentDomPath } } : {}),
        changes: []
      };
      groups.set(key, group);
    }
    group.changes.push({
      property: change.property,
      before: change.from,
      after: change.to,
      // The old names stay intact for existing consumers; the computed names
      // make their browser-side meaning explicit for source-tracing agents.
      beforeComputed: change.from,
      afterComputed: change.to,
      ...(change.sourceHint ? { sourceHint: change.sourceHint } : {}),
      ...(change.newDeclaration ? { newDeclaration: true } : {})
    });
  });
  groups.forEach((group) => { group.changes = collapseShorthandChanges(group.changes); });
  return [...groups.values()];
}

// Controls that set several longhands at once (flex sizing, all corners,
// all sides) would hand over one line per longhand. When every part of a
// shorthand changed, they go as that one shorthand, the way source writes it.
const HANDOFF_SHORTHANDS = [
  ['flex', ['flex-grow', 'flex-shrink', 'flex-basis']],
  ['border-radius', ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius']],
  ['margin', ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']],
  ['padding', ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']],
  ['gap', ['row-gap', 'column-gap']]
];

function collapseShorthandChanges(changes) {
  let result = changes;
  HANDOFF_SHORTHANDS.forEach(([shorthand, longhands]) => {
    const parts = longhands.map((longhand) => result.find((change) => change.property === longhand));
    if (parts.some((part) => !part)) return;
    // "8px 8px 8px 8px" is written "8px"; flex keeps its three parts.
    const joined = (key) => {
      const values = parts.map((part) => part[key]);
      return shorthand !== 'flex' && values.every((value) => value === values[0]) ? values[0] : values.join(' ');
    };
    const sourceHint = parts.find((part) => part.sourceHint)?.sourceHint;
    const merged = {
      property: shorthand,
      before: joined('before'),
      after: joined('after'),
      beforeComputed: joined('beforeComputed'),
      afterComputed: joined('afterComputed'),
      ...(sourceHint ? { sourceHint } : {}),
      ...(parts.every((part) => part.newDeclaration) ? { newDeclaration: true } : {})
    };
    const at = result.indexOf(parts[0]);
    result = result.filter((change) => !parts.includes(change));
    result.splice(Math.min(at, result.length), 0, merged);
  });
  return result;
}

function codexHandoff() {
  return {
    source: 'PixelPrism',
    version: 2,
    instruction: CODEX_INSTRUCTION,
    changeSet: codexChangeSet(),
    comments: agentComments()
  };
}

// Edits, token changes or comments with text: what an agent can act on. The
// Agents handoff button lights up while there is some. It runs after every
// edit (syncChangeUi), so it only looks at the text, as agentComments filters.
function hasAgentHandoff() {
  return activeChanges().length > 0 || siteComments().some((comment) => !comment.change && String(comment.comment || '').trim());
}

// A handoff tool with nothing to work on yet shows how to get there: a short
// clip of the steps and what to do, above its button. The button again, Esc
// or a click elsewhere closes it.
function buttonHint(hint, button) {
  const video = hint.querySelector('video');
  // A click elsewhere closes the hint before the button's click runs, so the
  // button checks whether it was open when pressed.
  let openAtPress = false;
  button.addEventListener('pointerdown', () => {
    openAtPress = hint.matches(':popover-open');
  });
  hint.addEventListener('toggle', (event) => {
    const open = event.newState === 'open';
    if (open) button.setAttribute('aria-expanded', 'true');
    else button.removeAttribute('aria-expanded');
    if (!open) {
      video.pause();
      return;
    }
    video.currentTime = 0;
    video.preload = 'auto';
    // Without motion the clip waits for its own play button.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) video.controls = true;
    else video.play().catch(() => {});
  });
  return function toggle() {
    const wasOpen = openAtPress || hint.matches(':popover-open');
    openAtPress = false;
    if (wasOpen) {
      if (hint.matches(':popover-open')) hint.hidePopover();
      return;
    }
    hint.showPopover({ source: button });
    const box = button.getBoundingClientRect();
    const width = hint.offsetWidth;
    hint.style.left = `${Math.min(Math.max(box.left + box.width / 2 - width / 2, 12), window.innerWidth - width - 12)}px`;
    hint.style.bottom = `${window.innerHeight - box.top + 14}px`;
  };
}

const toggleHandoffHint = buttonHint(document.querySelector('#handoff-hint'), agentsHandoffButton);
const toggleExportHint = buttonHint(document.querySelector('#export-hint'), exportReviewMenu.querySelector('summary'));

async function copyForCodex() {
  if (!hasAgentHandoff()) {
    // Image-only comments explain themselves in the Comments panel.
    toggleHandoffHint();
    return;
  }
  const payload = JSON.stringify(codexHandoff(), null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    // Copying is half the job: say where the review goes next.
    notify('Review copied. Paste it into your AI agent (Claude Code, Codex, Cursor) to apply the changes.', 'success', agentsHandoffButton);
  } catch {
    const area = document.createElement('textarea');
    area.value = payload;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if (copied) notify('Review copied. Paste it into your AI agent (Claude Code, Codex, Cursor) to apply the changes.', 'success', agentsHandoffButton);
    else notify('Unable to copy the review.', 'error', agentsHandoffButton);
  }
}

async function downloadChangeReport() {
  if (!activeChanges().length) return;
  if (!window.chrome?.runtime?.sendMessage) {
    notify('Downloads are available after the extension is loaded in Chrome.', 'error');
    return;
  }
  changeReportButton.disabled = true;
  try {
    const result = await window.chrome.runtime.sendMessage({
      type: 'save-change-report',
      markdown: formatChangeReport(),
      filename: reportFilename()
    });
    if (!result?.ok) throw new Error(result?.error || 'Unable to save the file.');
    notify('The Markdown changes report was downloaded.', 'success');
  } catch (error) {
    notify(`Changes report was not saved: ${error.message}`, 'error');
  } finally {
    changeReportButton.disabled = false;
  }
}

agentsHandoffButton.addEventListener('click', copyForCodex);

// Export review opens its menu only when there is something to export (else
// its hint), and not while an export runs (its progress shows on the button).
exportReviewMenu.querySelector('summary').addEventListener('click', (event) => {
  if (exportReviewMenu.open) return;
  if (exportReviewMenu.getAttribute('aria-busy') === 'true') {
    event.preventDefault();
    return;
  }
  if (!reviewHtmlContexts().length) {
    event.preventDefault();
    toggleExportHint();
  }
});
// The Markdown report is hidden from the menu for now; its button and
// downloadChangeReport stay so it can come back.
changeReportButton.addEventListener('click', () => {
  exportReviewMenu.open = false;
  downloadChangeReport();
});
reviewExportButton.addEventListener('click', () => {
  exportReviewMenu.open = false;
  downloadReviewHtml();
});
reviewPdfExportButton.addEventListener('click', () => {
  exportReviewMenu.open = false;
  downloadReviewPdf();
});
