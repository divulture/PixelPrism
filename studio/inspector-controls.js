// The Inspector’s controls: spacing, alignment, grid, type, shadows, borders and more.

// Weight and style are one typed value here, written the way CSS declares
// them: "700", "700 italic". Hidden inputs carry each property through the
// usual change pipeline, so font-weight and font-style are sent separately.
const FONT_WEIGHT_NAMES = { 100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Normal', 500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black' };

function parseFontWeightStyle(text) {
  const tokens = String(text).trim().toLowerCase().split(/\s+/).filter(Boolean);
  let weight = '';
  const style = [];
  tokens.forEach((token) => {
    const number = Number(token);
    if (!weight && ((Number.isFinite(number) && number >= 1 && number <= 1000) || ['bold', 'bolder', 'lighter'].includes(token))) weight = token;
    else if (['italic', 'oblique'].includes(token) || (style[0] === 'oblique' && /deg$/.test(token))) style.push(token);
    else if (token !== 'normal') weight = 'invalid';
  });
  if (weight === 'invalid' || !tokens.length) return null;
  return { weight: weight || 'normal', style: style.join(' ') || 'normal' };
}

// "700 italic" → "Bold Italic"; empty for weights without a common name.
function fontWeightStyleName(text) {
  const parsed = parseFontWeightStyle(text);
  const weight = { normal: '400', bold: '700' }[parsed?.weight] || parsed?.weight;
  const name = FONT_WEIGHT_NAMES[weight];
  if (!name) return '';
  return parsed.style === 'italic' ? `${name} Italic` : name;
}

function fontWeightStyleControl(input, values) {
  const combined = (weight, style) => (style === 'normal' ? weight : `${weight} ${style}`);
  const [weightInput, styleInput] = [['fontWeight', String(values?.fontWeight ?? '')], ['fontStyle', String(values?.fontStyle || 'normal')]].map(([property, value]) => {
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = property;
    hidden.dataset.property = property;
    hidden.value = value;
    hidden.dataset.previousValue = value;
    return hidden;
  });
  const current = () => combined(weightInput.value, styleInput.value);
  input.removeAttribute('name');
  delete input.dataset.property;
  delete input.dataset.previousValue;
  const nameLabel = document.createElement('span');
  nameLabel.className = 'inspector-weight-name';
  nameLabel.setAttribute('aria-hidden', 'true');
  const show = () => {
    input.value = current();
    nameLabel.textContent = fontWeightStyleName(input.value);
  };
  show();
  const apply = (text) => {
    const parsed = parseFontWeightStyle(text);
    if (parsed) {
      [[weightInput, parsed.weight], [styleInput, parsed.style]].forEach(([hidden, value]) => {
        if (hidden.value === value) return;
        hidden.value = value;
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    show();
  };
  input.addEventListener('change', () => apply(input.value));

  const shell = document.createElement('span');
  shell.className = 'inspector-input-shell is-weight';
  // The weight is what a variable can stand for; style stays its own.
  shell.dataset.properties = 'fontWeight';
  shell.showValues = show;
  shell.append(input, nameLabel);
  return [shell, weightInput, styleInput];
}

// While a control is hovered or focused, its zone of the selected element
// (margin, padding, rowGap, columnGap) is highlighted on the page.
function highlightZoneWhileActive(control, zone) {
  let hovered = false;
  let focused = false;
  const send = () => {
    inspectorFrame?.contentWindow?.postMessage({ source: 'viewport-parade', type: 'inspector-highlight-zone', zone: hovered || focused ? zone : null }, '*');
  };
  control.addEventListener('pointerenter', () => { hovered = true; send(); });
  control.addEventListener('pointerleave', () => { hovered = false; send(); });
  control.addEventListener('focusin', () => { focused = true; send(); });
  control.addEventListener('focusout', (event) => {
    focused = control.contains(event.relatedTarget);
    send();
  });
}

// Margin or padding as two fields, left & right and top & bottom, or as all
// four sides once expanded. A pair shows one value when both sides match and
// "0, 48" when they differ; typing one value sets both sides, two set each.
// Hidden inputs carry each side through the usual change pipeline.
function spacingControl(kind, values) {
  const title = kind === 'margin' ? 'Margin' : 'Padding';
  const control = document.createElement('div');
  control.className = 'inspector-field inspector-spacing';
  const hidden = {};
  ['Top', 'Right', 'Bottom', 'Left'].forEach((side) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = `${kind}${side}`;
    input.dataset.property = `${kind}${side}`;
    input.value = String(values?.[`${kind}${side}`] ?? '');
    input.dataset.previousValue = input.value;
    hidden[side] = input;
  });
  const setSide = (side, value, type) => {
    hidden[side].value = value;
    hidden[side].dispatchEvent(new Event(type, { bubbles: true }));
  };
  const field = (icon, label, properties, read, write) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = label;
    shell.dataset.properties = properties.join(' ');
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.innerHTML = inspectorIcon(icon);
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', label);
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => write(input.value, 'input'));
    input.addEventListener('change', () => {
      write(input.value, 'change');
      sync();
    });
    shell.append(prefix, input);
    return { shell, input, read };
  };
  const pair = (sides, icon, label) => field(icon, `${title} ${label}`, sides.map((side) => `${kind}${side}`), () => {
    const [a, b] = sides.map((side) => hidden[side].value);
    return a === b ? a : `${a}, ${b}`;
  }, (text, type) => {
    const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.length || parts.length > 2) return;
    sides.forEach((side, index) => setSide(side, parts[index] ?? parts[0], type));
  });
  const single = (side) => field(INSPECTOR_ICON_PATHS.spacing[side], `${title} ${side.toLowerCase()}`, [`${kind}${side}`], () => hidden[side].value, (text, type) => {
    if (text.trim()) setSide(side, text.trim(), type);
  });
  const collapsed = [pair(['Left', 'Right'], INSPECTOR_ICON_PATHS.spacing.x, 'left and right'), pair(['Top', 'Bottom'], INSPECTOR_ICON_PATHS.spacing.y, 'top and bottom')];
  const expanded = ['Left', 'Top', 'Right', 'Bottom'].map(single);
  const fields = [...collapsed, ...expanded];
  const sync = () => fields.forEach(({ input, read }) => { input.value = read(); });
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inspector-spacing-toggle';
  toggle.title = `${title} for each side`;
  toggle.setAttribute('aria-label', toggle.title);
  toggle.innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.spacing.sides);
  const setExpanded = (open) => {
    control.classList.toggle('is-expanded', open);
    toggle.setAttribute('aria-pressed', String(open));
    collapsed.forEach(({ shell }) => { shell.hidden = open; });
    expanded.forEach(({ shell }) => { shell.hidden = !open; });
  };
  toggle.addEventListener('click', () => {
    const open = !control.classList.contains('is-expanded');
    if (open) expandedSpacingControls.add(kind);
    else expandedSpacingControls.delete(kind);
    setExpanded(open);
  });
  highlightZoneWhileActive(control, kind);
  // Grid order: the toggle closes the first row in both layouts.
  control.append(collapsed[0].shell, collapsed[1].shell, expanded[0].shell, expanded[1].shell, toggle, expanded[2].shell, expanded[3].shell, ...Object.values(hidden));
  sync();
  // A variable picked or detached sets the sides from outside.
  control.showValues = sync;
  setExpanded(expandedSpacingControls.has(kind));
  return control;
}

// Flex direction and wrap as one control. The two single-line flows are
// tabs; every other pair sits in the third tab's menu, grouped by the way
// items run, with the CSS it sets shown on hover.
const FLEX_FLOW_MENU = [
  ['Left to right', [['row', 'wrap', 'Wrap down'], ['row', 'wrap-reverse', 'Wrap up']]],
  ['Right to left', [['row-reverse', 'nowrap', 'Single row'], ['row-reverse', 'wrap', 'Wrap down'], ['row-reverse', 'wrap-reverse', 'Wrap up']]],
  ['Top to bottom', [['column', 'wrap', 'Wrap right'], ['column', 'wrap-reverse', 'Wrap left']]],
  ['Bottom to top', [['column-reverse', 'nowrap', 'Single column'], ['column-reverse', 'wrap', 'Wrap right'], ['column-reverse', 'wrap-reverse', 'Wrap left']]]
];
const FLEX_FLOW_HINT = 'Hover an option to see direction and wrap values.';
// The left-to-right icons mirrored or transposed into each direction; the
// second entry also flips wrap-reverse to the other side.
const FLEX_FLOW_TRANSFORMS = {
  row: ['', 'matrix(1 0 0 -1 0 16)'],
  'row-reverse': ['matrix(-1 0 0 1 16 0)', 'matrix(-1 0 0 -1 16 16)'],
  column: ['matrix(0 1 1 0 0 0)', 'matrix(0 1 -1 0 16 0)'],
  'column-reverse': ['matrix(0 -1 1 0 0 16)', 'matrix(0 -1 -1 0 16 16)']
};

function flexFlowIcon(direction, wrap) {
  const path = wrap === 'nowrap' ? INSPECTOR_ICON_PATHS.flexFlow.line : INSPECTOR_ICON_PATHS.flexFlow.wrap;
  const transform = FLEX_FLOW_TRANSFORMS[direction]?.[wrap === 'wrap-reverse' ? 1 : 0];
  return `<svg class="inspector-line-icon" aria-hidden="true" viewBox="0 0 16 16"><path${transform ? ` transform="${transform}"` : ''} d="${path}"></path></svg>`;
}

function flexFlowControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-tabs is-wide inspector-flex-flow';
  const [directionInput, wrapInput] = [['flexDirection', values?.flexDirection || 'row'], ['flexWrap', values?.flexWrap || 'nowrap']].map(([property, value]) => hiddenInspectorInput(property, value));
  const tabs = document.createElement('span');
  tabs.className = 'inspector-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Direction and wrap');
  const tab = (title) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inspector-tab is-icon';
    if (title) button.title = title;
    button.setAttribute('aria-label', title);
    tabs.append(button);
    return button;
  };
  const rowTab = tab('Row');
  const columnTab = tab('Column');
  const flowTab = tab('Wrap and reverse');
  rowTab.innerHTML = flexFlowIcon('row', 'nowrap');
  columnTab.innerHTML = flexFlowIcon('column', 'nowrap');

  const sync = () => {
    const direction = directionInput.value;
    const wrap = wrapInput.value;
    const isRow = direction === 'row' && wrap === 'nowrap';
    const isColumn = direction === 'column' && wrap === 'nowrap';
    rowTab.setAttribute('aria-pressed', String(isRow));
    columnTab.setAttribute('aria-pressed', String(isColumn));
    flowTab.setAttribute('aria-pressed', String(!isRow && !isColumn));
    flowTab.innerHTML = `${isRow || isColumn ? flexFlowIcon('row', 'wrap') : flexFlowIcon(direction, wrap)}${INSPECTOR_MENU_CARET}`;
  };
  const set = (direction, wrap) => {
    [[directionInput, direction], [wrapInput, wrap]].forEach(([input, value]) => {
      if (input.value === value) return;
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    sync();
  };
  inspectorMenu(flowTab, control, () => ({
    hint: FLEX_FLOW_HINT,
    groups: FLEX_FLOW_MENU.map(([label, options]) => ({
      label,
      items: options.map(([direction, wrap, text]) => ({
        icon: flexFlowIcon(direction, wrap),
        text,
        hint: `flex-direction: ${direction}; flex-wrap: ${wrap}`,
        checked: directionInput.value === direction && wrapInput.value === wrap,
        pick: () => set(direction, wrap)
      }))
    }))
  }));

  rowTab.addEventListener('click', () => set('row', 'nowrap'));
  columnTab.addEventListener('click', () => set('column', 'nowrap'));
  sync();
  control.append(tabs, directionInput, wrapInput);
  return control;
}

function hiddenInspectorInput(property, value) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = property;
  input.dataset.property = property;
  input.value = value;
  input.dataset.previousValue = value;
  return input;
}

const INSPECTOR_MENU_CARET = '<svg class="inspector-menu-caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"></path></svg>';

// A popover of controls under trigger, framed as the menus are: a click on
// trigger opens or closes it, as do a click outside container, Escape and the
// panel scrolling. content is kept between openings.
function inspectorPopover(trigger, container, content) {
  const popover = document.createElement('div');
  popover.className = 'inspector-popover';
  popover.setAttribute('role', 'dialog');
  popover.hidden = true;
  popover.append(content);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const closeOnOutside = (event) => {
    if (!container.contains(event.target)) close();
  };
  const closeOnEscape = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
    trigger.focus();
  };
  const close = () => {
    popover.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', closeOnOutside, true);
    document.removeEventListener('keydown', closeOnEscape, true);
    inspectorPanel.removeEventListener('scroll', close);
  };
  // As wide as the panel's content, inside its side paddings: the wide field
  // that holds container. Placed again when its content changes size.
  const place = () => {
    const box = trigger.getBoundingClientRect();
    const panel = (container.closest('.inspector-field') || container).getBoundingClientRect();
    popover.style.inlineSize = `${panel.width}px`;
    const below = box.bottom + 4;
    const top = below + popover.offsetHeight > innerHeight - 8 ? Math.max(8, box.top - 4 - popover.offsetHeight) : below;
    popover.style.top = `${top}px`;
    popover.style.left = `${panel.left}px`;
  };
  new ResizeObserver(() => {
    if (!popover.hidden) place();
  }).observe(popover);
  const open = () => {
    popover.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    place();
    document.addEventListener('pointerdown', closeOnOutside, true);
    document.addEventListener('keydown', closeOnEscape, true);
    inspectorPanel.addEventListener('scroll', close);
  };
  trigger.addEventListener('click', () => (popover.hidden ? open() : close()));
  container.append(popover);
}

// A dropdown of options in the comments menu's style, opened by trigger.
// build() runs on every open and returns { hint, groups: [{ label, items:
// [{ icon, text, hint, checked, disabled, cursor, pick, preview }] }], previewEnd,
// compact }; compact gives items one icon column and the check at the row's
// end, and keeps the menu as narrow as its items. The footer
// shows the hovered item's hint, or the default one. preview runs while an
// item is hovered or focused, previewEnd when the pointer leaves or it closes. The menu is fixed to the viewport so the
// panel's scroll box can't clip it, and opens upward when there's no room.
function inspectorMenu(trigger, container, build) {
  const menu = document.createElement('div');
  menu.className = 'menu comment-menu inspector-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  const hint = document.createElement('p');
  hint.className = 'inspector-menu-hint';
  let defaultHint = '';
  let previewEnd;
  const render = () => {
    const { hint: text, groups, previewEnd: end, compact } = build();
    defaultHint = text || '';
    previewEnd = end;
    menu.replaceChildren();
    menu.classList.toggle('is-compact', Boolean(compact));
    // A menu of plain names (no icons, nothing checked) leaves out the space
    // for them.
    const plain = groups.every(({ items }) => items.every((option) => !option.icon && !option.checked));
    groups.forEach(({ label, items }, index) => {
      if (label) {
        const heading = document.createElement('p');
        heading.className = 'inspector-menu-group';
        heading.textContent = label;
        menu.append(heading);
      } else if (index) {
        const separator = document.createElement('hr');
        separator.className = 'menu-divider';
        menu.append(separator);
      }
      items.forEach((option) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(Boolean(option.checked)));
        item.disabled = Boolean(option.disabled);
        if (option.cursor) item.style.cursor = option.cursor;
        if (compact) item.innerHTML = option.icon || inspectorIcon('');
        else if (!plain) item.innerHTML = `${inspectorIcon(INSPECTOR_ICON_PATHS.check)}${option.icon || ''}`;
        item.append(option.text);
        if (compact && option.checked) item.insertAdjacentHTML('beforeend', inspectorIcon(INSPECTOR_ICON_PATHS.check).replace('class="', 'class="inspector-menu-check '));
        ['pointerenter', 'focus'].forEach((type) => item.addEventListener(type, () => {
          hint.textContent = option.hint || defaultHint;
          option.preview?.();
        }));
        item.addEventListener('click', () => {
          option.pick();
          close();
          trigger.focus();
        });
        menu.append(item);
      });
    });
    hint.textContent = defaultHint;
    hint.hidden = !defaultHint;
    menu.append(hint);
  };
  const closeOnOutside = (event) => {
    if (!container.contains(event.target)) close();
  };
  const closeOnEscape = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close();
    trigger.focus();
  };
  const close = () => {
    if (!menu.hidden) previewEnd?.();
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', closeOnOutside, true);
    document.removeEventListener('keydown', closeOnEscape, true);
    inspectorPanel.removeEventListener('scroll', close);
  };
  const open = () => {
    render();
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    const box = trigger.getBoundingClientRect();
    placeMenuBy(menu, box, inspectorPanel.getBoundingClientRect().top + 8);
    menu.style.left = `${Math.max(8, Math.min(box.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
    document.addEventListener('pointerdown', closeOnOutside, true);
    document.addEventListener('keydown', closeOnEscape, true);
    inspectorPanel.addEventListener('scroll', close);
  };
  menu.addEventListener('pointerleave', () => {
    hint.textContent = defaultHint;
    previewEnd?.();
  });
  trigger.addEventListener('click', () => (menu.hidden ? open() : close()));
  container.append(menu);
}

// Flex alignment as a 3 × 3 matrix plus an X and a Y menu. The matrix sets
// both axes in one click; the menus also reach space-between/around (main
// axis) and stretch/baseline (cross axis). X and Y are screen axes: which of
// justify-content and align-items each one drives follows flex-direction, and
// flex-start/flex-end are flipped for -reverse directions and wrap-reverse,
// so "Left" always means left.
const ALIGN_EDGE_LABELS = { x: { start: 'Left', center: 'Center', end: 'Right' }, y: { start: 'Top', center: 'Center', end: 'Bottom' } };
const ALIGN_OTHER_LABELS = { 'space-between': 'Space between', 'space-around': 'Space around', 'space-evenly': 'Space evenly', stretch: 'Stretch', baseline: 'Baseline' };

// Visual position of a justify-content / align-items value: start, center,
// end, or the value itself (space-between, stretch, …).
function alignVisual(value, role, flips) {
  let keyword = String(value || '').trim();
  if (keyword === 'normal') keyword = role === 'main' ? 'flex-start' : 'stretch';
  if (keyword === 'flex-start') return flips ? 'end' : 'start';
  if (keyword === 'flex-end') return flips ? 'start' : 'end';
  if (['start', 'self-start', 'left'].includes(keyword)) return 'start';
  if (['end', 'self-end', 'right'].includes(keyword)) return 'end';
  if (keyword.endsWith('baseline')) return 'baseline';
  return keyword;
}

function alignCssValue(visual, flips) {
  if (visual === 'start') return flips ? 'flex-end' : 'flex-start';
  if (visual === 'end') return flips ? 'flex-start' : 'flex-end';
  return visual;
}

// The matrix and the X / Y menus, shared by flex and grid. config gives:
//   inputs: the hidden inputs the control owns,
//   state(): whatever the mapping needs from the rest of the panel,
//   inputFor(axis, state): the input that axis drives right now,
//   visual(axis, state): start | center | end | stretch | baseline | space-…,
//   options(axis, state): [positions, extras] for the axis menu,
//   set(axis, visual, state), hint(axis, visual, state),
//   children(x, y, state, className): SVG for the matrix drawing.
function alignMatrixControl(config) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide inspector-align';
  const state = () => config.state(control);
  const positions = ['start', 'center', 'end'];

  const matrix = document.createElement('div');
  matrix.className = 'inspector-align-matrix';
  const drawing = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  drawing.setAttribute('viewBox', '0 0 60 60');
  drawing.setAttribute('aria-hidden', 'true');
  const cells = document.createElement('div');
  cells.className = 'inspector-align-cells';
  cells.setAttribute('role', 'group');
  cells.setAttribute('aria-label', 'Alignment');
  const cellButtons = [];
  positions.forEach((y) => positions.forEach((x) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.title = `${ALIGN_EDGE_LABELS.y[y]} ${ALIGN_EDGE_LABELS.x[x].toLowerCase()}`.replace('Center center', 'Center');
    cell.setAttribute('aria-label', cell.title);
    cell.addEventListener('click', () => {
      const current = state();
      config.set('x', x, current);
      config.set('y', y, current);
      sync();
    });
    cell.addEventListener('pointerenter', () => draw({ x, y }));
    cell.addEventListener('pointerleave', () => draw());
    cellButtons.push({ cell, x, y });
    cells.append(cell);
  }));
  matrix.append(drawing, cells);

  const draw = (preview) => {
    const current = state();
    const centres = { start: 10, center: 30, end: 50 };
    const dots = positions.flatMap((y) => positions.map((x) => `<circle cx="${centres[x]}" cy="${centres[y]}" r="1.3" class="inspector-align-dot"></circle>`)).join('');
    const now = config.children(config.visual('x', current), config.visual('y', current), current, 'inspector-align-child');
    const ghost = preview ? config.children(preview.x, preview.y, current, 'inspector-align-child is-preview') : '';
    drawing.innerHTML = `${dots}${now}${ghost}`;
  };

  const selects = document.createElement('div');
  selects.className = 'inspector-align-selects';
  const axisSelect = (axis) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inspector-input-shell inspector-menu-select';
    button.title = `${axis.toUpperCase()} alignment`;
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = axis.toUpperCase();
    const value = document.createElement('span');
    value.className = 'inspector-menu-value';
    button.append(prefix, value);
    button.insertAdjacentHTML('beforeend', INSPECTOR_MENU_CARET);
    inspectorMenu(button, control, () => {
      const current = state();
      const visual = config.visual(axis, current);
      return {
        hint: config.hint(axis, visual, current),
        groups: config.options(axis, current).map((options) => ({
          items: options.map((option) => ({
            icon: alignOptionIcon(axis, option),
            text: ALIGN_EDGE_LABELS[axis][option] || ALIGN_OTHER_LABELS[option],
            hint: config.hint(axis, option, current),
            checked: visual === option,
            pick: () => {
              config.set(axis, option, current);
              sync();
            }
          }))
        }))
      };
    });
    selects.append(button);
    return { button, value };
  };
  const axes = { x: axisSelect('x'), y: axisSelect('y') };

  const sync = () => {
    const current = state();
    const visual = {};
    Object.entries(axes).forEach(([axis, { button, value }]) => {
      const input = config.inputFor(axis, current);
      visual[axis] = config.visual(axis, current);
      value.textContent = ALIGN_EDGE_LABELS[axis][visual[axis]] || ALIGN_OTHER_LABELS[visual[axis]] || input.value;
      // The change dot follows the property this menu drives right now.
      button.dataset.properties = input.dataset.property;
    });
    cellButtons.forEach(({ cell, x, y }) => cell.setAttribute('aria-pressed', String(visual.x === x && visual.y === y)));
    draw();
  };
  // Something it depends on changed elsewhere in the panel: re-read it and
  // move the change dots to the right menu.
  control.classList.add('inspector-syncs');
  control.refreshFromPanel = () => {
    sync();
    control.querySelectorAll('.inspector-change-dot').forEach((dot) => {
      dot.parentElement.classList.remove('has-change-dot');
      dot.remove();
    });
    const changed = changedInspectorProperties.get(inspectorChangeKey);
    config.inputs.forEach(({ dataset }) => { if (changed?.has(dataset.property)) markInspectorFieldChanged(dataset.property); });
  };
  sync();
  control.append(matrix, selects, ...config.inputs);
  return control;
}

// The current value of another control in the panel, or the opening value
// while the control isn't in the panel yet.
function panelValue(control, property, fallback) {
  return (control.isConnected ? inspectorPanelFields.querySelector(`[data-property="${property}"]`)?.value : null) || fallback;
}

function setInputValue(input, value) {
  if (input.value === value) return;
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Flex: X and Y are screen axes; which of justify-content and align-items
// each one drives follows flex-direction, and flex-start/flex-end are flipped
// for -reverse directions and wrap-reverse, so "Left" always means left.
function flexAlignControl(values) {
  const inputs = {
    main: hiddenInspectorInput('justifyContent', values?.justifyContent || 'normal'),
    cross: hiddenInspectorInput('alignItems', values?.alignItems || 'normal')
  };
  const roleOf = (axis, state) => ((axis === 'x') !== state.isColumn ? 'main' : 'cross');
  return alignMatrixControl({
    inputs: Object.values(inputs),
    state: (control) => {
      const direction = panelValue(control, 'flexDirection', values?.flexDirection || 'row');
      return {
        isColumn: direction.startsWith('column'),
        flips: { main: direction.endsWith('-reverse'), cross: panelValue(control, 'flexWrap', values?.flexWrap || 'nowrap') === 'wrap-reverse' }
      };
    },
    inputFor: (axis, state) => inputs[roleOf(axis, state)],
    visual: (axis, state) => {
      const role = roleOf(axis, state);
      return alignVisual(inputs[role].value, role, state.flips[role]);
    },
    options: (axis, state) => [['start', 'center', 'end'], roleOf(axis, state) === 'main' ? ['space-between', 'space-around'] : ['stretch', 'baseline']],
    set: (axis, visual, state) => {
      const role = roleOf(axis, state);
      setInputValue(inputs[role], alignCssValue(visual, state.flips[role]));
    },
    hint: (axis, visual, state) => {
      const line = state.isColumn ? 'column' : 'row';
      if (ALIGN_EDGE_LABELS[axis][visual]) return `Align children to the ${ALIGN_EDGE_LABELS[axis][visual].toLowerCase()} of the ${line}.`;
      if (visual === 'space-between') return `Spread children along the ${line}, the first and last at its ends.`;
      if (visual === 'space-around') return `Spread children along the ${line} with equal space around each.`;
      if (visual === 'stretch') return `Stretch children to fill the ${line}'s ${state.isColumn ? 'width' : 'height'}.`;
      if (visual === 'baseline') return 'Line children up along their text baseline.';
      return '';
    },
    // Three children of different lengths, placed the way the values put them.
    children: (x, y, state, className) => {
      const [main, cross] = state.isColumn ? [y, x] : [x, y];
      const along = { start: [4.5, 10, 15.5], center: [24.5, 30, 35.5], end: [44.5, 50, 55.5], 'space-between': [4.5, 30, 55.5], 'space-around': [12, 30, 48], 'space-evenly': [15, 30, 45] }[main] || [24.5, 30, 35.5];
      return [12, 17, 8].map((length, index) => {
        const [from, to] = {
          start: [3, 3 + length],
          center: [30 - length / 2, 30 + length / 2],
          end: [57 - length, 57],
          stretch: [3, 57],
          baseline: [19 - length, 19]
        }[cross] || [30 - length / 2, 30 + length / 2];
        const [left, top, width, height] = state.isColumn
          ? [from, along[index] - 1.5, to - from, 3]
          : [along[index] - 1.5, from, 3, to - from];
        return `<rect x="${left}" y="${top}" width="${width}" height="${height}" rx="1" class="${className}"></rect>`;
      }).join('');
    }
  });
}

// Grid: X is justify-items and Y is align-items, the place of each child in
// its cell; start and end are the writing-mode edges, so no flipping.
function gridAlignControl(values) {
  const inputs = {
    x: hiddenInspectorInput('justifyItems', values?.justifyItems || 'normal'),
    y: hiddenInspectorInput('alignItems', values?.alignItems || 'normal')
  };
  const visualOf = (value) => {
    const keyword = String(value || '').trim().replace(/^legacy\s*/, '') || 'normal';
    if (['normal', 'legacy'].includes(keyword)) return 'stretch';
    return alignVisual(keyword, 'cross', false);
  };
  return alignMatrixControl({
    inputs: Object.values(inputs),
    state: () => ({}),
    inputFor: (axis) => inputs[axis],
    visual: (axis) => visualOf(inputs[axis].value),
    options: () => [['start', 'center', 'end'], ['stretch', 'baseline']],
    set: (axis, visual) => setInputValue(inputs[axis], visual),
    hint: (axis, visual) => {
      if (ALIGN_EDGE_LABELS[axis][visual]) return `Align children to the ${ALIGN_EDGE_LABELS[axis][visual].toLowerCase()} of their cell.`;
      if (visual === 'stretch') return `Stretch children to fill their cell's ${axis === 'x' ? 'width' : 'height'}.`;
      if (visual === 'baseline') return 'Line children up along their text baseline.';
      return '';
    },
    // One child in its cell: a short bar, or the full side when stretched.
    children: (x, y, state, className) => {
      const span = (visual, size) => ({ start: [4, 4 + size], center: [30 - size / 2, 30 + size / 2], end: [56 - size, 56], stretch: [4, 56], baseline: [4, 4 + size] })[visual] || [4, 56];
      const [left, right] = span(x, 18);
      const [top, bottom] = span(y, 10);
      return `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" rx="1.5" class="${className} is-cell"></rect>`;
    }
  });
}

// Track counts for columns and rows. A count change keeps the template's own
// tracks: repeat(n, …) changes n, a list adds copies of its last track or
// drops tracks from the end, an empty template becomes repeat(n, 1fr). The
// wrench shows the templates and the implicit track sizes as written.
let gridTemplatesOpen = false;
function gridTracksControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide inspector-grid-tracks';
  const template = (property, prefixText) => {
    const field = childInput(property, prefixText, String(values?.[property] || 'none'));
    field.input.inputMode = 'text';
    field.shell.classList.add('is-full');
    return field;
  };
  const templates = {
    columns: template('gridTemplateColumns', 'Columns'),
    rows: template('gridTemplateRows', 'Rows'),
    autoColumns: template('gridAutoColumns', 'Auto cols'),
    autoRows: template('gridAutoRows', 'Auto rows')
  };
  const tracks = (text) => {
    const value = String(text || '').trim();
    if (!value || value === 'none') return { list: [] };
    const repeat = /^repeat\(\s*(\d+)\s*,\s*(.+)\)$/.exec(value);
    if (repeat) return { repeat: repeat[2].trim(), count: Number(repeat[1]) };
    const list = [];
    let depth = 0;
    let token = '';
    [...`${value} `].forEach((char) => {
      if ('(['.includes(char)) depth += 1;
      if (')]'.includes(char)) depth -= 1;
      if (char === ' ' && depth === 0) {
        if (token && !token.startsWith('[')) list.push(token);
        token = '';
      } else {
        token += char;
      }
    });
    // repeat(auto-fill, …) and friends have no fixed count.
    return list.some((track) => /^repeat\(\s*auto/.test(track)) ? { auto: true } : { list };
  };
  const countOf = (text) => {
    const parsed = tracks(text);
    if (parsed.auto) return '';
    return String(parsed.count ?? parsed.list.length);
  };
  const withCount = (text, count) => {
    const parsed = tracks(text);
    if (parsed.repeat) return `repeat(${count}, ${parsed.repeat})`;
    if (!parsed.list?.length) return `repeat(${count}, 1fr)`;
    const list = parsed.list.slice(0, count);
    while (list.length < count) list.push(list.at(-1));
    return list.join(' ');
  };
  const counter = (axis, prefixText) => {
    const { shell, input } = childInput(null, prefixText, countOf(templates[axis].dataInput.value));
    input.type = 'number';
    input.min = '1';
    input.placeholder = 'auto';
    input.addEventListener('change', () => {
      const count = Math.max(1, Math.round(Number(input.value)) || 1);
      input.value = String(count);
      setInputValue(templates[axis].dataInput, withCount(templates[axis].dataInput.value, count));
    });
    return { shell, input };
  };
  const counts = { columns: counter('columns', 'Columns'), rows: counter('rows', 'Rows') };
  const wrench = document.createElement('button');
  wrench.type = 'button';
  wrench.className = 'inspector-spacing-toggle';
  wrench.title = 'Edit grid templates';
  wrench.setAttribute('aria-label', wrench.title);
  wrench.innerHTML = inspectorIcon('M10.5 2.5a3 3 0 0 0-2.8 4.1L2.5 11.8l1.7 1.7 5.2-5.2a3 3 0 0 0 4.1-2.8l-1.8 1.8-1.8-.4-.4-1.8z');
  const raw = document.createElement('div');
  raw.className = 'inspector-child-inputs inspector-grid-templates';
  raw.append(...Object.values(templates).map(({ shell }) => shell));
  const setOpen = (open) => {
    raw.hidden = !open;
    wrench.setAttribute('aria-pressed', String(open));
  };
  wrench.addEventListener('click', () => {
    gridTemplatesOpen = raw.hidden;
    setOpen(gridTemplatesOpen);
  });
  // A template typed by hand updates its count.
  raw.addEventListener('change', () => {
    counts.columns.input.value = countOf(templates.columns.dataInput.value);
    counts.rows.input.value = countOf(templates.rows.dataInput.value);
  });
  setOpen(gridTemplatesOpen);
  control.append(counts.columns.shell, counts.rows.shell, wrench, raw);
  return control;
}

// grid-auto-flow: rows or columns as tabs, dense as a toggle beside them.
function gridFlowControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide is-tabs inspector-grid-flow';
  const input = hiddenInspectorInput('gridAutoFlow', String(values?.gridAutoFlow || 'row'));
  const parse = () => {
    const words = input.value.split(/\s+/);
    return { direction: words.includes('column') ? 'column' : 'row', dense: words.includes('dense') };
  };
  const write = (direction, dense) => setInputValue(input, dense ? `${direction} dense` : direction);
  const { tabs, press } = childTabs('Direction', [
    { key: 'row', icon: flexFlowIcon('row', 'wrap'), title: 'Rows: fill each row, then the next' },
    { key: 'column', icon: flexFlowIcon('column', 'wrap'), title: 'Columns: fill each column, then the next' }
  ], (key) => {
    write(key, parse().dense);
    sync();
  });
  const dense = document.createElement('button');
  dense.type = 'button';
  dense.className = 'inspector-spacing-toggle';
  dense.title = 'Dense: fill earlier gaps with later children';
  dense.setAttribute('aria-label', dense.title);
  dense.innerHTML = inspectorIcon('M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM11.5 9v5M9.5 12l2 2 2-2');
  dense.addEventListener('click', () => {
    const { direction, dense: on } = parse();
    write(direction, !on);
    sync();
  });
  const sync = () => {
    const { direction, dense: on } = parse();
    press(direction);
    dense.setAttribute('aria-pressed', String(on));
  };
  control.classList.add('inspector-syncs');
  control.refreshFromPanel = sync;
  sync();
  control.append(tabs, dense, input);
  return control;
}

// Column and row gaps. Where only one applies (flex that doesn't wrap) it is
// a single "Gap". Where both do, one field sets both until the split toggle
// shows them apart; it starts split when the two differ.
function gapControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide inspector-gap';
  const gap = (property) => {
    const field = childInput(property, '', String(values?.[property] ?? '0'), SIZE_UNITS);
    highlightZoneWhileActive(field.shell, property);
    return field;
  };
  const column = gap('columnGap');
  const row = gap('rowGap');
  let linked = String(column.dataInput.value) === String(row.dataInput.value);
  // The same split toggle as margin, padding and radius.
  const split = document.createElement('button');
  split.type = 'button';
  split.className = 'inspector-spacing-toggle';
  split.title = 'Gap for each axis';
  split.setAttribute('aria-label', split.title);
  split.innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.spacing.sides);
  split.addEventListener('click', () => {
    linked = !linked;
    if (linked) setInputValue(row.dataInput, column.dataInput.value);
    row.dataInput.showValue?.(row.dataInput.value);
    sync();
  });
  // While linked, the one field sets both.
  column.dataInput.addEventListener('change', () => {
    if (!linked || row.shell.dataset.irrelevant === 'true') return;
    setInputValue(row.dataInput, column.dataInput.value);
    row.dataInput.showValue?.(row.dataInput.value);
  });
  const prefixOf = (field) => field.shell.querySelector('.inspector-input-prefix');
  const sync = () => {
    const display = panelValue(control, 'display', values?.display);
    const singleLine = display === 'flex' && panelValue(control, 'flexWrap', values?.flexWrap || 'nowrap') === 'nowrap';
    const only = singleLine ? (panelValue(control, 'flexDirection', values?.flexDirection || 'row').startsWith('column') ? row : column) : null;
    // A gap that doesn't apply is marked so its change isn't handed over.
    column.shell.dataset.irrelevant = String(Boolean(only) && only !== column);
    row.shell.dataset.irrelevant = String(Boolean(only) && only !== row);
    const one = only || (linked ? column : null);
    column.shell.hidden = Boolean(one) && one !== column;
    row.shell.hidden = Boolean(one) && one !== row;
    control.classList.toggle('is-single', Boolean(one));
    prefixOf(column).textContent = one ? 'Gap' : 'Gap col';
    prefixOf(row).textContent = one ? 'Gap' : 'Gap row';
    column.shell.dataset.properties = one === column && !only ? 'columnGap rowGap' : 'columnGap';
    row.shell.dataset.properties = 'rowGap';
    split.hidden = Boolean(only);
    split.setAttribute('aria-pressed', String(!linked));
  };
  control.classList.add('inspector-syncs');
  control.refreshFromPanel = () => {
    sync();
    control.querySelectorAll('.inspector-change-dot').forEach((dot) => {
      dot.parentElement.classList.remove('has-change-dot');
      dot.remove();
    });
    const changed = changedInspectorProperties.get(inspectorChangeKey);
    ['columnGap', 'rowGap'].forEach((property) => { if (changed?.has(property)) markInspectorFieldChanged(property); });
  };
  sync();
  control.append(column.shell, row.shell, split);
  return control;
}

// Grid content alignment, folded away: justify-content places the columns
// and align-content the rows when the grid is smaller than the element.
let gridMoreAlignmentOpen = false;
let gridContentNoteDismissed = false;
function gridMoreAlignControl(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field is-wide inspector-grid-more';
  const options = ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'];
  const titles = { start: 'Start', center: 'Center', end: 'End', 'space-between': 'Space between', 'space-around': 'Space around', 'space-evenly': 'Space evenly' };
  const contentRow = (property, label, axis) => {
    const row = childRow(label);
    const input = hiddenInspectorInput(property, String(values?.[property] || 'normal'));
    const keyOf = (value) => ({ 'flex-start': 'start', 'flex-end': 'end', left: 'start', right: 'end' })[value] || value;
    const { tabs, press } = childTabs(label, options.map((key) => ({ key, icon: alignOptionIcon(axis, key), title: titles[key] })), (key) => {
      setInputValue(input, key);
      press(key);
    });
    const sync = () => press(keyOf(input.value));
    row.classList.add('inspector-syncs');
    row.refreshFromPanel = sync;
    sync();
    row.append(tabs, input);
    return row;
  };
  const rows = [contentRow('justifyContent', 'Columns', 'x'), contentRow('alignContent', 'Rows', 'y')];
  const note = document.createElement('p');
  note.className = 'inspector-note inspector-dismissible-note';
  note.textContent = 'Aligning columns and rows only shows when the element is larger than all the columns or rows it contains.';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'inspector-note-close';
  close.title = 'Dismiss';
  close.setAttribute('aria-label', close.title);
  close.innerHTML = window.phosphorIcon('x');
  close.addEventListener('click', () => {
    gridContentNoteDismissed = true;
    note.hidden = true;
  });
  note.append(close);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inspector-group-toggle inspector-more-toggle';
  if (['justifyContent', 'alignContent'].some((property) => !['normal', '', undefined].includes(values?.[property]))) gridMoreAlignmentOpen = true;
  const setOpen = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = window.phosphorIcon(open ? 'caret-down' : 'caret-right');
    toggle.append('More alignment options');
    rows.forEach((row) => { row.hidden = !open; });
    note.hidden = !open || gridContentNoteDismissed;
  };
  toggle.addEventListener('click', () => {
    gridMoreAlignmentOpen = toggle.getAttribute('aria-expanded') !== 'true';
    setOpen(gridMoreAlignmentOpen);
  });
  setOpen(gridMoreAlignmentOpen);
  control.append(toggle, ...rows, note);
  return control;
}

// Menu icons for alignment options, drawn for the X axis and turned for Y.
function alignOptionIcon(axis, visual) {
  const path = {
    start: 'M2.5 2v12M5 4h5v3H5zM5 9h8v3H5z',
    center: 'M8 2v12M5.5 4h5v3h-5zM4 9h8v3H4z',
    end: 'M13.5 2v12M6 4h5v3H6zM3 9h8v3H3z',
    'space-between': 'M2.5 2v12M13.5 2v12M4.5 5h2v6h-2zM9.5 5h2v6h-2z',
    'space-around': 'M2.5 2v12M13.5 2v12M5.5 5h1.5v6H5.5zM9 5h1.5v6H9z',
    'space-evenly': 'M2.5 2v12M13.5 2v12M5 5h1.5v6H5zM9.5 5h1.5v6H9.5z',
    stretch: 'M2.5 2v12M13.5 2v12M4.5 4h7v3h-7zM4.5 9h7v3h-7z',
    baseline: 'M11.5 2v12M4 4h7.5v3H4zM7 9h4.5v3H7z'
  }[visual];
  const transform = axis === 'y' ? ' transform="matrix(0 1 1 0 0 0)"' : '';
  return `<svg class="inspector-line-icon" aria-hidden="true" viewBox="0 0 16 16"><path${transform} d="${path}"></path></svg>`;
}

// How the element sits in its flex or grid parent, shown when the parent is
// one: a Flex Child or Grid Child section after Layout.
let childAlignmentOpen = false;
const CHILD_ICONS = {
  auto: 'M5 5l6 6M11 5l-6 6',
  shrink: 'M8 3v10M2 8h4.5M4.5 6l2 2-2 2M14 8H9.5M11.5 6l-2 2 2 2',
  grow: 'M2.5 3v10M13.5 3v10M4.5 8h7M6.5 6l-2 2 2 2M9.5 6l2 2-2 2',
  none: 'M2.5 3v10M13.5 3v10M6 6l4 4M10 6l-4 4',
  parent: 'M3 9V3h6M3 3l6 6M6 13h7V6'
};

function childLayoutFields(kind, values, context, group) {
  const fields = [];
  const selectParent = () => {
    if (selectedLayerPath === undefined) return;
    selectLayer(selectedLayerPath.includes('.') ? selectedLayerPath.slice(0, selectedLayerPath.lastIndexOf('.')) : '');
  };
  if (kind === 'flex') {
    const parentButton = document.createElement('button');
    parentButton.type = 'button';
    parentButton.className = 'inspector-group-action';
    parentButton.title = 'Select parent';
    parentButton.setAttribute('aria-label', parentButton.title);
    parentButton.innerHTML = inspectorIcon(CHILD_ICONS.parent);
    parentButton.addEventListener('click', selectParent);
    group.querySelector('.inspector-group-label').append(parentButton);
    fields.push(flexSizingField(values));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'inspector-group-toggle inspector-more-toggle inspector-child-toggle';
    const order = Number(values?.order) || 0;
    if ((values?.alignSelf && values.alignSelf !== 'auto') || order) childAlignmentOpen = true;
    const rows = [childAlignField('alignSelf', 'Align', context?.parentFlexDirection?.startsWith('column') ? 'x' : 'y', values, ['flex-start', 'center', 'flex-end', 'stretch', 'baseline']), childOrderField(values)];
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.innerHTML = window.phosphorIcon(open ? 'caret-down' : 'caret-right');
      toggle.append('Alignment and order');
      rows.forEach((row) => { row.hidden = !open; });
    };
    toggle.addEventListener('click', () => {
      childAlignmentOpen = toggle.getAttribute('aria-expanded') !== 'true';
      setOpen(childAlignmentOpen);
    });
    setOpen(childAlignmentOpen);
    fields.push(toggle, ...rows);
    return fields;
  }
  const parentButton = document.createElement('button');
  parentButton.type = 'button';
  parentButton.className = 'inspector-wide-button';
  parentButton.innerHTML = inspectorIcon(CHILD_ICONS.parent);
  parentButton.append('Edit parent grid');
  parentButton.addEventListener('click', selectParent);
  fields.push(
    parentButton,
    gridPositionField(values),
    childAlignField('alignSelf', 'Align', 'y', values, ['start', 'center', 'end', 'stretch', 'baseline']),
    childAlignField('justifySelf', 'Justify', 'x', values, ['start', 'center', 'end', 'stretch']),
    childOrderField(values)
  );
  return fields;
}

// A row with its caption on the left, as in the child sections.
function childRow(label) {
  const row = document.createElement('div');
  row.className = 'inspector-field is-wide inspector-child-row';
  const caption = document.createElement('span');
  caption.className = 'inspector-child-caption';
  caption.textContent = label;
  row.append(caption);
  return row;
}

// Tabs that each stand for a value; current() tells which one is pressed.
function childTabs(label, options, onPick) {
  const tabs = document.createElement('span');
  tabs.className = 'inspector-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', label);
  const buttons = options.map((option) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `inspector-tab${option.icon ? ' is-icon' : ''}`;
    tab.title = option.title;
    tab.setAttribute('aria-label', option.title);
    if (option.icon) tab.innerHTML = option.icon;
    else tab.textContent = option.text;
    tab.addEventListener('click', () => onPick(option.key));
    tabs.append(tab);
    return { tab, key: option.key };
  });
  const press = (key) => buttons.forEach(({ tab, key: own }) => tab.setAttribute('aria-pressed', String(own === key)));
  return { tabs, press };
}

function setChildValue(input, value) {
  if (input.value === value) return;
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.showValue?.(value);
}

// A small labelled input inside a child row; returns its data-property input.
function childInput(property, prefixText, value, units) {
  const shell = document.createElement('label');
  shell.className = 'inspector-input-shell';
  const prefix = document.createElement('span');
  prefix.className = 'inspector-input-prefix';
  prefix.textContent = prefixText;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.setAttribute('aria-label', prefixText);
  input.value = value;
  if (property) {
    input.name = property;
    input.dataset.property = property;
    input.dataset.previousValue = value;
  }
  shell.append(prefix, input);
  const dataInput = units ? lengthUnitControl(shell, input, units) : input;
  if (units) shell.append(dataInput);
  return { shell, input, dataInput };
}

// Shrink if needed (0 1 auto), grow if possible (1 1 0%), neither (0 0 auto),
// or any other grow / shrink / basis behind "···".
function flexSizingField(values) {
  const row = childRow('Sizing');
  const grow = childInput('flexGrow', 'Grow', String(values?.flexGrow ?? '0'));
  const shrink = childInput('flexShrink', 'Shrink', String(values?.flexShrink ?? '1'));
  const basis = childInput('flexBasis', 'Basis', String(values?.flexBasis || 'auto'), SIZE_UNITS);
  const presets = { shrink: ['0', '1', 'auto'], grow: ['1', '1', '0%'], none: ['0', '0', 'auto'] };
  const inputs = [grow.dataInput, shrink.dataInput, basis.dataInput];
  const custom = document.createElement('div');
  custom.className = 'inspector-child-inputs';
  basis.shell.classList.add('is-full');
  custom.append(grow.shell, shrink.shell, basis.shell);
  let customOpen = false;
  const presetNow = () => Object.keys(presets).find((key) => presets[key].every((value, index) => {
    const current = inputs[index].value.trim();
    return current === value || (value === '0%' && ['0', '0px'].includes(current));
  }));
  const { tabs, press } = childTabs('Sizing', [
    { key: 'shrink', icon: inspectorIcon(CHILD_ICONS.shrink), title: 'Shrink if needed' },
    { key: 'grow', icon: inspectorIcon(CHILD_ICONS.grow), title: 'Grow if possible' },
    { key: 'none', icon: inspectorIcon(CHILD_ICONS.none), title: "Don't shrink or grow" },
    { key: 'custom', text: '···', title: 'Customize' }
  ], (key) => {
    customOpen = key === 'custom';
    if (!customOpen) presets[key].forEach((value, index) => setChildValue(inputs[index], value));
    sync();
  });
  const sync = () => {
    const preset = presetNow();
    const key = customOpen || !preset ? 'custom' : preset;
    press(key);
    custom.hidden = key !== 'custom';
  };
  row.classList.add('inspector-syncs');
  row.refreshFromPanel = sync;
  row.addEventListener('change', () => requestAnimationFrame(sync));
  sync();
  row.append(tabs, custom);
  return row;
}

// align-self or justify-self: auto (×) and the edge, centre, stretch and
// baseline icons turned to the axis it works on.
function childAlignField(property, label, axis, values, options) {
  const row = childRow(label);
  const input = hiddenInspectorInput(property, String(values?.[property] || 'auto'));
  const visualOf = (value) => ({ 'flex-start': 'start', 'self-start': 'start', 'flex-end': 'end', 'self-end': 'end', normal: 'auto' })[value] || (String(value).endsWith('baseline') ? 'baseline' : value);
  const titles = { start: axis === 'x' ? 'Left' : 'Top', center: 'Center', end: axis === 'x' ? 'Right' : 'Bottom', stretch: 'Stretch', baseline: 'Baseline' };
  const { tabs, press } = childTabs(label, [
    { key: 'auto', icon: inspectorIcon(CHILD_ICONS.auto), title: 'Auto' },
    ...options.map((value) => ({ key: value, icon: alignOptionIcon(axis, visualOf(value)), title: titles[visualOf(value)] }))
  ], (key) => {
    setChildValue(input, key);
    press(key);
  });
  const sync = () => {
    const current = input.value;
    press(options.find((value) => visualOf(value) === visualOf(current)) || (visualOf(current) === 'auto' ? 'auto' : current));
  };
  row.classList.add('inspector-syncs');
  row.refreshFromPanel = sync;
  sync();
  row.append(tabs, input);
  return row;
}

// align-content as icon tabs, drawn on the axis it spreads lines along:
// across flex rows (vertical; horizontal for columns) or down the grid.
function alignContentField(values) {
  const field = document.createElement('div');
  field.className = 'inspector-field is-tabs is-wide';
  const input = hiddenInspectorInput('alignContent', String(values?.alignContent || 'normal'));
  const titles = { start: 'Start', center: 'Center', end: 'End', 'space-between': 'Space between', 'space-around': 'Space around', stretch: 'Stretch' };
  const keyOf = (value) => ({ 'flex-start': 'start', 'flex-end': 'end' })[value] || value;
  const axis = () => {
    const current = (property, fallback) => (field.isConnected ? inspectorPanelFields.querySelector(`[data-property="${property}"]`)?.value : null) || fallback;
    return current('display', values?.display) === 'flex' && current('flexDirection', values?.flexDirection || 'row').startsWith('column') ? 'x' : 'y';
  };
  let built;
  const build = () => {
    const drawnAxis = axis();
    const { tabs, press } = childTabs('Align content', [
      { key: 'normal', icon: inspectorIcon(CHILD_ICONS.auto), title: 'Normal' },
      ...Object.keys(titles).map((key) => ({ key, icon: alignOptionIcon(drawnAxis, key), title: titles[key] }))
    ], (key) => {
      setChildValue(input, key);
      press(key);
    });
    if (built) built.tabs.replaceWith(tabs);
    else field.prepend(tabs);
    built = { tabs, press, axis: drawnAxis };
    press(keyOf(input.value));
  };
  // Direction changed: turn the icons, and put back the change dot the old
  // tabs carried.
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => {
    if (axis() === built.axis) {
      built.press(keyOf(input.value));
      return;
    }
    build();
    if (changedInspectorProperties.get(inspectorChangeKey)?.has('alignContent')) markInspectorFieldChanged('alignContent');
  };
  build();
  field.append(input);
  return field;
}

// order: × is 0, First and Last put the element before or after siblings
// left at 0, ··· takes any number.
function childOrderField(values) {
  const row = childRow('Order');
  const order = childInput('order', 'Order', String(values?.order ?? '0'));
  const custom = document.createElement('div');
  custom.className = 'inspector-child-inputs';
  custom.append(order.shell);
  const presets = { auto: '0', first: '-1', last: '1' };
  let customOpen = false;
  const { tabs, press } = childTabs('Order', [
    { key: 'auto', icon: inspectorIcon(CHILD_ICONS.auto), title: 'Auto' },
    { key: 'first', text: 'First', title: 'First' },
    { key: 'last', text: 'Last', title: 'Last' },
    { key: 'custom', text: '···', title: 'Custom order' }
  ], (key) => {
    customOpen = key === 'custom';
    if (!customOpen) setChildValue(order.dataInput, presets[key]);
    sync();
  });
  const sync = () => {
    const preset = Object.keys(presets).find((key) => presets[key] === order.dataInput.value.trim());
    const key = customOpen || !preset ? 'custom' : preset;
    press(key);
    custom.hidden = key !== 'custom';
  };
  row.classList.add('inspector-syncs');
  row.refreshFromPanel = sync;
  row.addEventListener('change', () => requestAnimationFrame(sync));
  sync();
  row.append(tabs, custom);
  return row;
}

// Where a grid child goes: Auto (span counts), Area (a named grid area) or
// Manual (start / end lines). Area sets grid-area and drops the column and
// row overrides; the other two do the reverse.
function gridPositionField(values) {
  const row = childRow('Position');
  const [columnInput, rowInput, areaInput] = [['gridColumn', values?.gridColumn], ['gridRow', values?.gridRow], ['gridArea', values?.gridArea]]
    .map(([property, value]) => hiddenInspectorInput(property, String(value || 'auto')));
  const span = (value) => (/^span\s+(\d+)$/.exec(String(value).trim())?.[1]) || (String(value).trim() === 'auto' ? '1' : '');
  const lines = (value) => String(value).split('/').map((part) => part.trim());
  const isArea = (value) => /^[a-z_-][\w-]*$/i.test(String(value).trim()) && String(value).trim() !== 'auto';
  const modeOf = () => {
    if (isArea(columnInput.value) || isArea(areaInput.value.split('/')[0])) return 'area';
    return [columnInput.value, rowInput.value].every((value) => span(value)) ? 'auto' : 'manual';
  };
  let mode = modeOf();
  const panes = {};
  const field = (prefixText, value, write) => {
    const { shell, input } = childInput(null, prefixText, value);
    input.addEventListener('change', () => write(input.value.trim()));
    return { shell, input };
  };
  const columnSpan = field('Col span', span(columnInput.value) || '1', (value) => setChildValue(columnInput, `span ${value || 1}`));
  const rowSpan = field('Row span', span(rowInput.value) || '1', (value) => setChildValue(rowInput, `span ${value || 1}`));
  panes.auto = [columnSpan.shell, rowSpan.shell];
  const area = field('Area', isArea(areaInput.value.split('/')[0]) ? areaInput.value.split('/')[0].trim() : '', (value) => {
    if (!value) return;
    setChildValue(columnInput, '');
    setChildValue(rowInput, '');
    setChildValue(areaInput, value);
  });
  panes.area = [area.shell];
  // Manual starts from the current lines, or from line 1 across the span.
  const startEnd = (value) => {
    const count = span(value);
    if (count) return ['1', String(1 + Number(count))];
    const [start, end] = lines(value);
    return [start || '1', end || String(Number(start) + 1 || 2)];
  };
  const manualField = (prefixText, target, index) => field(prefixText, startEnd(target.value)[index], () => {
    const [start, end] = target === columnInput ? [columnStart, columnEnd] : [rowStart, rowEnd];
    setChildValue(target, `${start.input.value.trim() || 'auto'} / ${end.input.value.trim() || 'auto'}`);
  });
  const columnStart = manualField('Col start', columnInput, 0);
  const columnEnd = manualField('Col end', columnInput, 1);
  const rowStart = manualField('Row start', rowInput, 0);
  const rowEnd = manualField('Row end', rowInput, 1);
  panes.manual = [columnStart.shell, columnEnd.shell, rowStart.shell, rowEnd.shell];
  const inputs = document.createElement('div');
  inputs.className = 'inspector-child-inputs';
  inputs.append(...Object.values(panes).flat());
  const { tabs, press } = childTabs('Position', [
    { key: 'auto', text: 'Auto', title: 'Auto' },
    { key: 'area', text: 'Area', title: 'Area' },
    { key: 'manual', text: 'Manual', title: 'Manual' }
  ], (key) => {
    mode = key;
    if (key !== 'area' && areaInput.value && areaInput.value !== 'auto' && isArea(areaInput.value.split('/')[0])) setChildValue(areaInput, '');
    if (key === 'auto') {
      setChildValue(columnInput, `span ${columnSpan.input.value.trim() || 1}`);
      setChildValue(rowInput, `span ${rowSpan.input.value.trim() || 1}`);
    }
    if (key === 'manual') {
      setChildValue(columnInput, `${columnStart.input.value.trim()} / ${columnEnd.input.value.trim()}`);
      setChildValue(rowInput, `${rowStart.input.value.trim()} / ${rowEnd.input.value.trim()}`);
    }
    sync();
  });
  const sync = () => {
    press(mode);
    Object.entries(panes).forEach(([key, shells]) => shells.forEach((shell) => { shell.hidden = key !== mode; }));
  };
  sync();
  row.append(tabs, inputs, columnInput, rowInput, areaInput);
  return row;
}

// The layers of a background-image value, split at top-level commas.
function cssLayers(value) {
  const layers = [];
  let depth = 0;
  let start = 0;
  [...value].forEach((char, index) => {
    if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      layers.push(value.slice(start, index).trim());
      start = index + 1;
    }
  });
  layers.push(value.slice(start).trim());
  return layers.filter(Boolean);
}

// Pictures by name under a label, a field per picture, as Filters lists
// its filters. They only show which pictures these are.
function pictureListField(label, rows) {
  const field = typeField(label, true);
  const list = document.createElement('div');
  list.className = 'inspector-shadow-list';
  list.replaceChildren(...rows.map((row) => {
    const line = document.createElement('div');
    line.className = 'inspector-input-shell inspector-picture-name';
    line.title = row.title;
    const text = document.createElement('span');
    text.className = 'inspector-menu-value';
    text.textContent = row.label;
    line.append(text);
    return line;
  }));
  field.append(list);
  return field;
}

// Picture settings in Background, each where it works: object-fit and
// object-position for an img or video (position not while it fills the box),
// and size, position and repeat for a background image. A field under a
// label names each picture (an img's with its own size); an img also gets its
// alt text.
function imageSettingsFields(values, context) {
  const fields = [];
  const fileName = (url) => {
    try {
      return decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()) || url;
    } catch {
      return url;
    }
  };
  const media = context?.media;
  const size = media?.naturalWidth && media?.naturalHeight ? `${media.naturalWidth} × ${media.naturalHeight}` : 'Not loaded';
  if (media) {
    fields.push(pictureListField(media.kind === 'image' ? 'Image' : 'Video', [{
      label: `${media.src ? fileName(media.src) : 'No source'} · ${size}`,
      title: media.src || ''
    }]));
    if (media.kind === 'image') {
      const altField = document.createElement('div');
      altField.className = 'inspector-field is-wide';
      const { shell, input: alt } = childInput('alt', 'Alt text', media.alt ?? '');
      alt.removeAttribute('inputmode');
      alt.placeholder = media.alt === null ? 'No alt attribute' : 'Empty: decorative image';
      altField.append(shell);
      fields.push(altField);
    }
    const fit = menuSelectField('objectFit', 'Fit', [
      ['fill', 'Fill', 'Stretch the picture to the box, ignoring its proportions.'],
      ['contain', 'Contain', 'Fit the whole picture inside the box; empty bands may remain.'],
      ['cover', 'Cover', 'Fill the box and crop what does not fit.'],
      ['none', 'None', 'Keep the picture at its own size, cropped by the box.'],
      ['scale-down', 'Scale down', 'Like None, or Contain when the picture is larger than the box.']
    ], String(values?.objectFit || 'fill'));
    const position = positionMatrixField('objectPosition', String(values?.objectPosition || '50% 50%'), 'picture');
    // With Fill the picture covers the whole box, so it has no position.
    const relevance = () => {
      const off = panelValue(position, 'objectFit', values?.objectFit || 'fill') === 'fill';
      position.hidden = off;
      position.dataset.irrelevant = String(off);
    };
    const refresh = position.refreshFromPanel;
    position.refreshFromPanel = () => {
      refresh();
      relevance();
    };
    relevance();
    fields.push(fit, position);
  }
  const backgroundImage = String(values?.backgroundImage || 'none');
  if (backgroundImage !== 'none') {
    const describe = (layer) => {
      const url = /^url\(\s*["']?(.*?)["']?\s*\)$/.exec(layer)?.[1];
      return url ? fileName(url) : layer.split('(')[0];
    };
    fields.push(pictureListField('Background image', cssLayers(backgroundImage).map((layer) => ({ label: describe(layer), title: layer }))));
  }
  if (backgroundImage !== 'none') {
    fields.push(menuSelectField('backgroundSize', 'Size', [
      ['auto', 'Auto', 'Keep the image at its own size.'],
      ['cover', 'Cover', 'Fill the element and crop what does not fit.'],
      ['contain', 'Contain', 'Fit the whole image inside the element.']
    ], String(values?.backgroundSize || 'auto')));
    fields.push(positionMatrixField('backgroundPosition', String(values?.backgroundPosition || '0% 0%'), 'image'));
    const repeatRow = document.createElement('div');
    repeatRow.className = 'inspector-field is-wide is-tabs';
    const repeat = hiddenInspectorInput('backgroundRepeat', String(values?.backgroundRepeat || 'repeat'));
    const { tabs, press } = childTabs('Repeat', [
      { key: 'repeat', text: 'Repeat', title: 'Tile in both directions' },
      { key: 'repeat-x', text: 'X', title: 'Tile across only' },
      { key: 'repeat-y', text: 'Y', title: 'Tile down only' },
      { key: 'no-repeat', text: 'None', title: 'Show the image once' }
    ], (key) => {
      setInputValue(repeat, key);
      press(key);
    });
    repeatRow.classList.add('inspector-syncs');
    repeatRow.refreshFromPanel = () => press(repeat.value);
    press(repeat.value);
    repeatRow.append(tabs, repeat);
    fields.push(repeatRow);
  }
  return fields;
}

// overflow as tabs. A value that differs per axis ("hidden auto") presses
// none and shows in the tooltip.
function overflowField(values) {
  const row = childRow('Overflow');
  const input = hiddenInspectorInput('overflow', String(values?.overflow || 'visible'));
  const { tabs, press } = childTabs('Overflow', [
    ...['visible', 'hidden', 'clip', 'scroll'].map((key) => ({ key, icon: inspectorIcon(INSPECTOR_ICON_PATHS.overflow[key]), title: key[0].toUpperCase() + key.slice(1) })),
    { key: 'auto', text: 'Auto', title: 'Auto' }
  ], (key) => {
    setChildValue(input, key);
    sync();
  });
  const sync = () => {
    press(input.value);
    row.title = ['visible', 'hidden', 'clip', 'scroll', 'auto'].includes(input.value) ? '' : `Overflow: ${input.value}`;
  };
  row.classList.add('inspector-syncs');
  row.refreshFromPanel = sync;
  sync();
  row.append(tabs, input);
  return row;
}

// aspect-ratio as a menu of common frames; Custom shows the ratio as a field
// beside it. A ratio does nothing when both width and height are set, so the
// field (and the More options that only hold it) steps aside then.
const ASPECT_RATIOS = [
  ['auto', 'Auto', 'Does not constrain dimensions. Ideal for layouts that need to adjust to varying widths and heights.'],
  ['2.39 / 1', 'Anamorphic (2.39:1)', 'The ultra-wide cinema frame, for hero banners and film stills.'],
  ['2 / 1', 'Univisium/Netflix (2:1)', 'A frame twice as wide as it is tall, as in streaming originals.'],
  ['16 / 9', 'Widescreen (16:9)', 'The standard frame for video, screens and embeds.'],
  ['3 / 2', 'Landscape (3:2)', 'The classic photo frame, for images and cards.'],
  ['2 / 3', 'Portrait (2:3)', 'A tall photo frame, for posters, covers and portraits.'],
  ['1 / 1', 'Square (1:1)', 'Equal width and height, for avatars, thumbnails and tiles.'],
  ['custom', 'Custom', 'Set your own width to height ratio.']
];

// "4:3", "4/3" or "1.5" as CSS: "4 / 3", "1.5 / 1".
function cssAspectRatio(text) {
  const parts = String(text).trim().split(/\s*[:/]\s*|\s+/).filter(Boolean).map(Number);
  if (!parts.length || parts.length > 2 || parts.some((part) => !(part > 0))) return null;
  return `${parts[0]} / ${parts[1] ?? 1}`;
}

// The element's rendered shape as a ratio: small whole numbers when it has
// them (320 × 180 → 16 / 9), otherwise to two decimals against 1.
function renderedAspectRatio(context) {
  const width = Math.round(context?.renderedWidth || 0);
  const height = Math.round(context?.renderedHeight || 0);
  if (!width || !height) return '1 / 1';
  const divisor = (a, b) => (b ? divisor(b, a % b) : a);
  const common = divisor(width, height);
  return width / common <= 32 && height / common <= 32 ? `${width / common} / ${height / common}` : `${Number((width / height).toFixed(2))} / 1`;
}

function aspectRatioField(values, context) {
  const field = typeField('Ratio', true);
  const input = hiddenInspectorInput('aspectRatio', String(values?.aspectRatio || 'auto'));
  const keyOf = (value) => (ASPECT_RATIOS.some(([key]) => key === value) ? value : 'custom');
  // Custom stays picked while its field is open, even on a frame's value.
  let customPicked = false;
  const current = () => (customPicked ? 'custom' : keyOf(input.value));
  const row = document.createElement('div');
  row.className = 'inspector-ratio-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inspector-input-shell inspector-menu-select';
  button.title = 'Ratio';
  button.dataset.properties = 'aspectRatio';
  const label = document.createElement('span');
  label.className = 'inspector-menu-value';
  button.append(label);
  button.insertAdjacentHTML('beforeend', INSPECTOR_MENU_CARET);
  const custom = childInput(null, 'W / H', '');
  custom.shell.classList.add('inspector-ratio-custom');
  custom.shell.title = 'Width to height: 4 / 3, 4:3 or 1.33';
  const sync = () => {
    label.textContent = ASPECT_RATIOS.find(([key]) => key === current())[1];
    custom.input.value = input.value;
    const shown = current() === 'custom';
    custom.shell.classList.toggle('is-shown', shown);
    custom.input.tabIndex = shown ? 0 : -1;
  };
  custom.input.addEventListener('change', () => {
    const ratio = cssAspectRatio(custom.input.value);
    if (ratio) setChildValue(input, ratio);
    sync();
  });
  inspectorMenu(button, field, () => ({
    hint: ASPECT_RATIOS.find(([key]) => key === current())[2],
    groups: [{
      items: ASPECT_RATIOS.map(([key, text, hint]) => ({
        text,
        hint,
        checked: current() === key,
        pick: () => {
          customPicked = key === 'custom';
          // Custom starts from the shape the element has now.
          if (!customPicked) setChildValue(input, key);
          else if (input.value === 'auto') setChildValue(input, renderedAspectRatio(context));
          sync();
          if (customPicked) requestAnimationFrame(() => custom.input.select());
        }
      }))
    }]
  }));
  const relevance = () => {
    const fixed = (property) => !['auto', ''].includes(panelValue(field, property, String(values?.[property] || 'auto')));
    const off = fixed('width') && fixed('height');
    field.hidden = off;
    field.dataset.irrelevant = String(off);
    // Nothing else waits behind Dimensions' More options.
    const toggle = field.parentElement?.querySelector('.inspector-more-toggle');
    if (toggle) toggle.hidden = off;
  };
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => {
    if (keyOf(input.value) !== 'custom') customPicked = false;
    sync();
    relevance();
  };
  sync();
  row.append(button, custom.shell);
  field.append(row, input);
  return field;
}

// More type options, labelled on top like the other More options fields and
// paired in the section's two columns. Each builder returns its fields; the
// render loop puts them behind Typography's More options.
const TYPE_MORE_CONTROLS = {
  columnCount: typeColumnsField,
  direction: typeDirectionField,
  overflowWrap: typeWrapField,
  wordBreak: typeBreakingFields,
  webkitTextStrokeWidth: typeStrokeFields,
  textOverflow: typeTruncateField,
  textShadow: textShadowsField
};

function typeField(label, wide) {
  const field = document.createElement('div');
  field.className = `inspector-field${wide ? ' is-wide' : ''}`;
  const caption = document.createElement('span');
  caption.className = 'inspector-type-label';
  caption.textContent = label;
  field.append(caption);
  return field;
}

// A menu field with the label on top instead of a prefix.
function typeMenuField(label, property, options, value, extra, wide) {
  const field = menuSelectField(property, '', options, value, extra);
  if (!wide) field.classList.remove('is-wide');
  field.querySelector('button').title = label;
  const caption = document.createElement('span');
  caption.className = 'inspector-type-label';
  caption.textContent = label;
  field.prepend(caption);
  return field;
}

// A color as text with a picker, as the panel's color fields are. With a
// property it carries that property; otherwise onChange gets the value.
function colorShell(property, label, value, onChange) {
  const shell = document.createElement('span');
  shell.className = 'inspector-color-shell';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.setAttribute('aria-label', label);
  if (property) {
    input.name = property;
    input.dataset.property = property;
    input.dataset.previousValue = value;
  }
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'inspector-color-picker';
  picker.setAttribute('aria-label', `${label} picker`);
  const showPicker = () => { picker.value = (cssColorToHex(input.value) || '#000000').slice(0, 7); };
  showPicker();
  const send = (type) => {
    if (property) input.dispatchEvent(new Event(type, { bubbles: true }));
    else if (type === 'change') onChange(input.value.trim());
  };
  picker.addEventListener('input', () => {
    input.value = picker.value.toUpperCase();
    send('input');
  });
  picker.addEventListener('change', () => {
    input.value = picker.value.toUpperCase();
    send('change');
  });
  input.addEventListener('input', showPicker);
  if (!property) input.addEventListener('change', () => send('change'));
  shell.append(input, picker);
  return { shell, input, showPicker };
}

// column-count: auto or a number of columns.
function typeColumnsField(values) {
  const field = typeField('Columns');
  const { shell } = childInput('columnCount', 'Columns', String(values?.columnCount || 'auto'));
  shell.title = 'Columns';
  shell.querySelector('.inspector-input-prefix').innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.type.columns);
  field.append(shell);
  return field;
}

function typeDirectionField(values) {
  const field = typeField('Direction');
  const input = hiddenInspectorInput('direction', String(values?.direction || 'ltr'));
  const { tabs, press } = childTabs('Direction', [
    { key: 'ltr', icon: inspectorIcon(INSPECTOR_ICON_PATHS.type.ltr), title: 'Left to right' },
    { key: 'rtl', icon: inspectorIcon(INSPECTOR_ICON_PATHS.type.rtl), title: 'Right to left' }
  ], (key) => {
    setChildValue(input, key);
    press(key);
  });
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => press(input.value);
  press(input.value);
  field.append(tabs, input);
  return field;
}

function typeWrapField(values) {
  return typeMenuField('Wrap', 'overflowWrap', [
    ['normal', 'Normal', 'Breaks words only at allowed break points.'],
    ['anywhere', 'Anywhere', 'Breaks a long word anywhere so it fits; the box can also shrink below it.'],
    ['break-word', 'Break word', 'Breaks a long word only when it would otherwise overflow.']
  ], String(values?.overflowWrap || 'normal'));
}

// Where words may break (word-break) and how spaces and line breaks are
// kept (white-space).
function typeBreakingFields(values) {
  return [
    typeMenuField('Word break', 'wordBreak', [
      ['normal', 'Normal', 'Use the default rules for word breaking.'],
      ['break-all', 'Break all', 'Break words between any two letters so they do not overflow.'],
      ['keep-all', 'Keep all', 'Do not break words in Chinese, Japanese or Korean text.']
    ], String(values?.wordBreak || 'normal')),
    typeMenuField('Line break', 'whiteSpace', [
      ['normal', 'Normal', 'Text wraps when needed, and extra spaces collapse into one.'],
      ['nowrap', 'No wrap', 'Text stays on one line; extra spaces collapse into one.'],
      ['pre', 'Pre', 'Spaces and line breaks stay as written; text does not wrap.'],
      ['pre-wrap', 'Pre wrap', 'Spaces and line breaks stay as written, and text wraps when needed.'],
      ['pre-line', 'Pre line', 'Line breaks stay, extra spaces collapse, and text wraps when needed.'],
      ['break-spaces', 'Break spaces', 'Like Pre wrap, and spaces at the end of a line can wrap too.']
    ], String(values?.whiteSpace || 'normal'))
  ];
}

// -webkit-text-stroke as a width and a color.
function typeStrokeFields(values) {
  const width = typeField('Stroke width');
  const widthInput = childInput('webkitTextStrokeWidth', 'Stroke width', String(values?.webkitTextStrokeWidth || '0px'), LENGTH_UNITS);
  widthInput.shell.querySelector('.inspector-input-prefix').innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.borderWidth);
  width.append(widthInput.shell);
  const color = typeField('Stroke color');
  color.append(colorShell('webkitTextStrokeColor', 'Stroke color', String(values?.webkitTextStrokeColor || '#000000')).shell);
  return [width, color];
}

// filter (or backdrop-filter) as a list: + opens a menu of filter functions,
// and each one added is a line that opens its settings in a popover; −
// removes it. Functions the panel has no fields for (url(), opacity()) keep
// their text.
const FILTER_TYPES = {
  blur: { label: 'Blur', fresh: '5px', field: 'Radius', units: 'length' },
  'drop-shadow': { label: 'Drop shadow', fresh: '0px 2px 5px rgba(0, 0, 0, 0.2)' },
  brightness: { label: 'Brightness', fresh: '100%', field: 'Amount', units: 'amount' },
  contrast: { label: 'Contrast', fresh: '100%', field: 'Amount', units: 'amount' },
  'hue-rotate': { label: 'Hue rotate', fresh: '0deg', field: 'Angle', units: 'angle' },
  saturate: { label: 'Saturation', fresh: '100%', field: 'Amount', units: 'amount' },
  grayscale: { label: 'Grayscale', fresh: '100%', field: 'Amount', units: 'amount' },
  invert: { label: 'Invert', fresh: '100%', field: 'Amount', units: 'amount' },
  sepia: { label: 'Sepia', fresh: '100%', field: 'Amount', units: 'amount' }
};
const FILTER_GROUPS = [
  ['General', ['blur', 'drop-shadow']],
  ['Color adjustments', ['brightness', 'contrast', 'hue-rotate', 'saturate']],
  ['Color effects', ['grayscale', 'invert', 'sepia']]
];
const filterUnits = (kind) => ({ length: LENGTH_UNITS, amount: ['%', ''], angle: ['deg', 'turn', 'rad', 'grad'] })[kind];

function parseFilters(value) {
  if (String(value).trim() === 'none') return [];
  return [...String(value).matchAll(/([a-z-]+)\(((?:[^()]|\([^()]*\))*)\)/gi)].map(([, name, args]) => ({ name: name.toLowerCase(), args: args.trim() }));
}

function filtersField(values, property = 'filter', label = 'Filters') {
  const field = typeField(label, true);
  const input = hiddenInspectorInput(property, String(values?.[property] || 'none'));
  let filters = parseFilters(input.value);
  const compose = () => filters.map(({ name, args }) => `${name}(${args})`).join(' ') || 'none';
  const commit = () => setChildValue(input, compose());
  const lineButton = (path, title) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inspector-group-action';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = inspectorIcon(path);
    return button;
  };
  const shadowOf = (filter) => parseShadows(filter.args, 3)[0] || parseShadows(FILTER_TYPES['drop-shadow'].fresh, 3)[0];
  const summary = (filter) => {
    const type = FILTER_TYPES[filter.name];
    if (!type) return `${filter.name}(${filter.args})`;
    return `${type.label}: ${filter.name === 'drop-shadow' ? shadowOf(filter).lengths.join(' ') : filter.args}`;
  };
  // The menu of filter functions, for + and for a filter's type.
  const filterMenu = (trigger, container, current, pick) => inspectorMenu(trigger, container, () => ({
    groups: FILTER_GROUPS.map(([label, names]) => ({
      label,
      items: names.map((name) => ({ text: FILTER_TYPES[name].label, checked: current() === name, pick: () => pick(name) }))
    }))
  }));
  // A value with its unit, prefixed by what it is.
  const valueField = (prefixText, units, read, write) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = prefixText;
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = prefixText;
    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.inputMode = 'decimal';
    valueInput.setAttribute('aria-label', prefixText);
    shell.append(prefix, valueInput);
    const show = units
      ? attachUnitSelect(shell, valueInput, units, (value, type) => {
        if (type === 'change' && value.trim()) write(value.trim());
        return read();
      })
      : (value) => { valueInput.value = value; };
    if (!units) valueInput.addEventListener('change', () => write(valueInput.value.trim()));
    show(read());
    return shell;
  };
  // A filter's settings: its type, then its value (or the drop shadow's).
  const renderSettings = (filter, settings, showSummary) => {
    const update = () => {
      showSummary();
      commit();
    };
    const typeButton = document.createElement('button');
    typeButton.type = 'button';
    typeButton.className = 'inspector-input-shell inspector-menu-select is-full';
    typeButton.title = 'Filter';
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = 'Filter';
    const typeLabel = document.createElement('span');
    typeLabel.className = 'inspector-menu-value';
    typeLabel.textContent = FILTER_TYPES[filter.name]?.label || filter.name;
    typeButton.append(prefix, typeLabel);
    typeButton.insertAdjacentHTML('beforeend', INSPECTOR_MENU_CARET);
    settings.replaceChildren(typeButton);
    filterMenu(typeButton, settings, () => filter.name, (name) => {
      if (name === filter.name) return;
      filter.name = name;
      filter.args = FILTER_TYPES[name].fresh;
      renderSettings(filter, settings, showSummary);
      update();
    });
    const type = FILTER_TYPES[filter.name];
    if (filter.name === 'drop-shadow') {
      const lengthNames = [['X', 'X offset'], ['Y', 'Y offset'], ['Blur', 'Blur']];
      const write = (shadow) => {
        filter.args = `${shadow.lengths.join(' ')} ${shadow.color}`;
        update();
      };
      lengthNames.forEach(([prefixText], index) => settings.append(valueField(prefixText, LENGTH_UNITS, () => shadowOf(filter).lengths[index], (value) => {
        const shadow = shadowOf(filter);
        shadow.lengths[index] = value;
        write(shadow);
      })));
      const color = colorShell(null, 'Drop shadow color', shadowOf(filter).color, (value) => {
        if (!value) return;
        const shadow = shadowOf(filter);
        shadow.color = value;
        write(shadow);
      });
      settings.append(color.shell);
      return;
    }
    const value = valueField(type?.field || 'Value', type ? filterUnits(type.units) : null, () => filter.args, (text) => {
      filter.args = text;
      update();
    });
    value.classList.add('is-full');
    settings.append(value);
  };
  // The header carries the change dot, so it shows with no filter left too.
  const header = document.createElement('div');
  header.className = 'inspector-type-header';
  header.dataset.properties = property;
  const add = lineButton(INSPECTOR_ICON_PATHS.type.add, 'Add filter');
  header.append(field.querySelector('.inspector-type-label'), add);
  filterMenu(add, header, () => null, (name) => {
    filters.push({ name, args: FILTER_TYPES[name].fresh });
    commit();
    render();
  });
  const list = document.createElement('div');
  list.className = 'inspector-shadow-list';
  const render = () => {
    list.replaceChildren(...filters.map((filter, position) => {
      const row = document.createElement('div');
      row.className = 'inspector-shadow-row';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'inspector-input-shell inspector-shadow-summary';
      trigger.title = 'Edit filter';
      const text = document.createElement('span');
      text.className = 'inspector-menu-value';
      trigger.append(text);
      const showSummary = () => { text.textContent = summary(filter); };
      showSummary();
      const settings = document.createElement('div');
      settings.className = 'inspector-shadow-fields';
      renderSettings(filter, settings, showSummary);
      inspectorPopover(trigger, row, settings);
      const remove = lineButton(INSPECTOR_ICON_PATHS.type.remove, 'Remove filter');
      remove.addEventListener('click', () => {
        filters.splice(position, 1);
        commit();
        render();
      });
      row.prepend(trigger, remove);
      return row;
    }));
    list.hidden = !filters.length;
  };
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => {
    if (input.value === compose()) return;
    filters = parseFilters(input.value);
    render();
  };
  render();
  field.append(header, list, input);
  return field;
}

// cursor, in groups by what the pointer means; hovering an option shows it.
const CURSOR_GROUPS = [
  ['General', ['auto', 'default', 'none']],
  ['Links & Status', ['pointer', 'not-allowed', 'wait', 'progress', 'help', 'context-menu']],
  ['Selection', ['cell', 'crosshair', 'text', 'vertical-text']],
  ['Drag & Drop', ['grab', 'grabbing', 'alias', 'copy', 'move']],
  ['Zoom', ['zoom-in', 'zoom-out']],
  ['Resize', ['col-resize', 'row-resize', 'nesw-resize', 'nwse-resize', 'ew-resize', 'ns-resize', 'n-resize', 'w-resize', 's-resize', 'e-resize', 'nw-resize', 'ne-resize', 'sw-resize', 'se-resize']]
];

// Line drawings of the cursors, for the menu and the field. The small arrow
// is the pointer the composite cursors (progress, copy…) carry.
const CURSOR_ARROW = 'M4 2.5v10.2l2.7-2.5 1.8 3.8 1.7-.8-1.8-3.7h3.6z';
const CURSOR_SMALL_ARROW = 'M3 2v8l2.1-2 1.4 3 1.3-.6-1.4-2.9H9.3z';
const CURSOR_ICONS = {
  auto: CURSOR_ARROW,
  default: CURSOR_ARROW,
  none: `${CURSOR_ARROW}M2.5 2.5l11 11`,
  pointer: 'M6 8.5V3a1 1 0 0 1 2 0v4.5M8 7V6a1 1 0 0 1 2 0v1.5M10 7.5a1 1 0 0 1 2 0V10a4 4 0 0 1-4 4H7.5a3.5 3.5 0 0 1-2.8-1.4L3 10.2a1 1 0 0 1 1.5-1.3L6 10.5',
  'not-allowed': 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM4.1 4.1l7.8 7.8',
  wait: 'M8 2v2.5M8 11.5V14M2 8h2.5M11.5 8H14M3.8 3.8l1.8 1.8M10.4 10.4l1.8 1.8M3.8 12.2l1.8-1.8M10.4 5.6l1.8-1.8',
  progress: `${CURSOR_SMALL_ARROW}M11.5 8.5v1M11.5 13v1M9 11.25h1M13 11.25h1M9.7 9.5l.6.6M12.7 12.5l.6.6M9.7 13.1l.6-.6M12.7 10.1l.6-.6`,
  help: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM6.5 6.5a1.5 1.5 0 1 1 2.2 1.3c-.5.3-.7.6-.7 1.2M8 11h.01',
  'context-menu': `${CURSOR_SMALL_ARROW}M9.5 8.5h4.5v5.5H9.5zM11 10.25h1.5M11 12.25h1.5`,
  cell: 'M6 2.5h4v3.5h3.5v4H10v3.5H6V10H2.5V6H6z',
  crosshair: 'M8 2v12M2 8h12',
  text: 'M6 3h4M6 13h4M8 3v10',
  'vertical-text': 'M3 6v4M13 6v4M3 8h10',
  grab: 'M5.5 8V4.5a1 1 0 0 1 2 0v3M7.5 7V3.5a1 1 0 0 1 2 0v4M9.5 7.5V4.5a1 1 0 0 1 2 0V9M5.5 8a1 1 0 0 0-2 0v1.5a4.5 4.5 0 0 0 4.5 4.5h.5a3.5 3.5 0 0 0 3.5-3.5V9',
  grabbing: 'M4.5 7h7a1 1 0 0 1 1 1v2a4 4 0 0 1-4 4h-1a4 4 0 0 1-4-4V8a1 1 0 0 1 1-1zM6.5 7V5.5M8.5 7V5M10.5 7V5.5',
  alias: `${CURSOR_SMALL_ARROW}M9.5 14c0-2.5 1.5-4 4-4M12 8.5l1.5 1.5-1.5 1.5`,
  copy: `${CURSOR_SMALL_ARROW}M11.5 9.5v4M9.5 11.5h4`,
  move: 'M8 2v12M2 8h12M6.5 3.5 8 2l1.5 1.5M6.5 12.5 8 14l1.5-1.5M3.5 6.5 2 8l1.5 1.5M12.5 6.5 14 8l-1.5 1.5',
  'zoom-in': 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.2 10.2l3.3 3.3M5 7h4M7 5v4',
  'zoom-out': 'M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.2 10.2l3.3 3.3M5 7h4',
  'col-resize': 'M7 3v10M9 3v10M2.5 8h3M10.5 8h3M4 6.5 2.5 8 4 9.5M12 6.5l1.5 1.5-1.5 1.5',
  'row-resize': 'M3 7h10M3 9h10M8 2.5v3M8 10.5v3M6.5 4 8 2.5 9.5 4M6.5 12 8 13.5 9.5 12',
  'nesw-resize': 'M3.5 12.5l9-9M8.5 3.5h4v4M3.5 8.5v4h4',
  'nwse-resize': 'M3.5 3.5l9 9M3.5 7.5v-4h4M12.5 8.5v4h-4',
  'ew-resize': 'M2.5 8h11M4.5 6 2.5 8l2 2M11.5 6l2 2-2 2',
  'ns-resize': 'M8 2.5v11M6 4.5l2-2 2 2M6 11.5l2 2 2-2',
  'n-resize': 'M8 13.5V3M4.5 6.5 8 3l3.5 3.5',
  'w-resize': 'M13.5 8H3M6.5 4.5 3 8l3.5 3.5',
  's-resize': 'M8 2.5V13M4.5 9.5 8 13l3.5-3.5',
  'e-resize': 'M2.5 8H13M9.5 4.5 13 8l-3.5 3.5',
  'nw-resize': 'M12.5 12.5 3.5 3.5M3.5 8.5v-5h5',
  'ne-resize': 'M3.5 12.5l9-9M7.5 3.5h5v5',
  'sw-resize': 'M12.5 3.5l-9 9M3.5 7.5v5h5',
  'se-resize': 'M3.5 3.5l9 9M12.5 7.5v5h-5'
};

function cursorField(values) {
  const groups = CURSOR_GROUPS.map(([label, keys]) => ({ label, options: keys.map((key) => [key, key]) }));
  const icons = Object.fromEntries(Object.entries(CURSOR_ICONS).map(([key, path]) => [key, inspectorIcon(path)]));
  return typeMenuField('Cursor', 'cursor', groups, String(values?.cursor || 'auto'), { cursor: true, icons, hint: 'Hover an option to see its cursor.' }, true);
}

// text-overflow works on a box that clips (overflow other than visible) and
// keeps its text on one line (No wrap or Pre), so it shows only then.
function typeTruncateField(values) {
  const field = typeField('Truncate');
  const input = hiddenInspectorInput('textOverflow', String(values?.textOverflow || 'clip'));
  const { tabs, press } = childTabs('Truncate', [
    { key: 'clip', text: 'Clip', title: 'Clip' },
    { key: 'ellipsis', text: 'Ellipsis', title: 'Ellipsis' }
  ], (key) => {
    setChildValue(input, key);
    press(key);
  });
  const relevance = () => {
    const overflow = panelValue(field, 'overflow', values?.overflow || 'visible').split(/\s+/)[0];
    const off = overflow === 'visible' || !['nowrap', 'pre'].includes(panelValue(field, 'whiteSpace', values?.whiteSpace || 'normal'));
    field.hidden = off;
    field.dataset.irrelevant = String(off);
  };
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => {
    press(input.value);
    relevance();
  };
  press(input.value);
  relevance();
  field.append(tabs, input);
  return field;
}

// text-shadow and box-shadow as lists: + adds a shadow, and each one has
// its fields and a button that removes it. A box shadow also has Outside /
// Inside (inset) and a size (spread).
const SHADOW_COLOR = /(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)|#[0-9a-f]{3,8}\b/i;

function parseShadows(value, lengthCount) {
  if (String(value).trim() === 'none') return [];
  return String(value).split(/,(?![^(]*\))/).map((shadow) => shadow.trim()).filter(Boolean).map((shadow) => {
    const color = SHADOW_COLOR.exec(shadow)?.[0];
    const tokens = shadow.replace(SHADOW_COLOR, ' ').trim().split(/\s+/).filter(Boolean);
    const inset = tokens.includes('inset');
    const words = tokens.filter((token) => token !== 'inset');
    const lengths = words.filter((token) => /^[-+.\d]/.test(token));
    return {
      inset,
      lengths: Array.from({ length: lengthCount }, (_, index) => lengths[index] || '0px'),
      color: color || words.find((token) => !/^[-+.\d]/.test(token)) || 'currentcolor'
    };
  });
}

function textShadowsField(values) {
  return shadowListField({
    property: 'textShadow', label: 'Text shadows', noun: 'text shadow',
    value: String(values?.textShadow || 'none'),
    fresh: '0px 1px 2px rgba(0, 0, 0, 0.25)',
    lengths: [['X', 'X offset'], ['Y', 'Y offset'], ['Blur', 'blur']]
  });
}

function boxShadowsField(values) {
  return shadowListField({
    property: 'boxShadow', label: 'Box shadows', noun: 'box shadow',
    value: String(values?.boxShadow || 'none'),
    fresh: '0px 2px 5px 0px rgba(0, 0, 0, 0.2)',
    lengths: [['X', 'X offset'], ['Y', 'Y offset'], ['Blur', 'blur'], ['Size', 'size']],
    inset: true
  });
}

function shadowListField({ property, label, noun, value, fresh, lengths: lengthFields, inset }) {
  const field = typeField(label, true);
  const input = hiddenInspectorInput(property, value);
  const parse = (text) => parseShadows(text, lengthFields.length);
  let shadows = parse(input.value);
  const compose = () => shadows.map((shadow) => `${shadow.inset ? 'inset ' : ''}${shadow.lengths.join(' ')} ${shadow.color}`).join(', ') || 'none';
  const commit = () => setChildValue(input, compose());
  const lineButton = (path, title, onClick) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inspector-group-action';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = inspectorIcon(path);
    button.addEventListener('click', onClick);
    return button;
  };
  const Noun = noun[0].toUpperCase() + noun.slice(1);
  // The header carries the change dot, so it shows with no shadow left too.
  const header = document.createElement('div');
  header.className = 'inspector-type-header';
  header.dataset.properties = property;
  header.append(field.querySelector('.inspector-type-label'), lineButton(INSPECTOR_ICON_PATHS.type.add, `Add ${noun}`, () => {
    shadows.push(parse(fresh)[0]);
    commit();
    render();
  }));
  const list = document.createElement('div');
  list.className = 'inspector-shadow-list';
  const lengthField = (shadow, index, prefixText, title, changed) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = title;
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = prefixText;
    const lengthInput = document.createElement('input');
    lengthInput.type = 'text';
    lengthInput.inputMode = 'decimal';
    lengthInput.setAttribute('aria-label', title);
    shell.append(prefix, lengthInput);
    const show = attachUnitSelect(shell, lengthInput, LENGTH_UNITS, (text, type) => {
      if (type === 'change' && text.trim()) {
        shadow.lengths[index] = text.trim();
        changed();
        commit();
      }
      return shadow.lengths[index];
    });
    show(shadow.lengths[index]);
    return shell;
  };
  // Each shadow is one line, swatch and values, that opens its fields in a
  // popover; − removes it.
  const summary = (shadow) => `${inset ? `${shadow.inset ? 'Inside' : 'Outside'}: ` : ''}${shadow.lengths.join(' ')}`;
  const render = () => {
    list.replaceChildren(...shadows.map((shadow, position) => {
      const row = document.createElement('div');
      row.className = 'inspector-shadow-row';
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'inspector-input-shell inspector-shadow-summary';
      trigger.title = `Edit ${noun}`;
      const swatch = document.createElement('span');
      swatch.className = 'inspector-shadow-swatch';
      const text = document.createElement('span');
      text.className = 'inspector-menu-value';
      trigger.append(swatch, text);
      const showSummary = () => {
        swatch.style.setProperty('--swatch', shadow.color);
        text.textContent = summary(shadow);
      };
      showSummary();
      const fields = document.createElement('div');
      fields.className = 'inspector-shadow-fields';
      const update = () => {
        showSummary();
        commit();
      };
      if (inset) {
        const { tabs, press } = childTabs('Shadow type', [
          { key: 'outside', text: 'Outside', title: 'Outside' },
          { key: 'inside', text: 'Inside', title: 'Inside' }
        ], (key) => {
          shadow.inset = key === 'inside';
          press(key);
          update();
        });
        tabs.classList.add('is-full');
        press(shadow.inset ? 'inside' : 'outside');
        fields.append(tabs);
      }
      lengthFields.forEach(([prefixText, title], index) => fields.append(lengthField(shadow, index, prefixText, `${Noun} ${title}`, showSummary)));
      const color = colorShell(null, `${Noun} color`, shadow.color, (value) => {
        if (!value) return;
        shadow.color = value;
        update();
      });
      // With an even count of lengths the color takes a row of its own.
      if (lengthFields.length % 2 === 0) color.shell.classList.add('is-full');
      fields.append(color.shell);
      inspectorPopover(trigger, row, fields);
      row.prepend(trigger, lineButton(INSPECTOR_ICON_PATHS.type.remove, `Remove ${noun}`, () => {
        shadows.splice(position, 1);
        commit();
        render();
      }));
      return row;
    }));
    list.hidden = !shadows.length;
  };
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = () => {
    if (input.value === compose()) return;
    shadows = parse(input.value);
    render();
  };
  render();
  field.append(header, list, input);
  return field;
}

// position as a menu; the offsets and z-index show only for a positioned
// element, since a static one ignores them.
function positionFields(values, context) {
  const scheme = menuSelectField('position', 'Position', [
    ['static', 'Static', 'Static is the default: the element follows the normal flow and ignores offsets.'],
    ['relative', 'Relative', 'Stays in the flow; offsets shift it from where it would be. Absolute children are placed inside it.'],
    ['absolute', 'Absolute', 'Leaves the flow; offsets place it inside the nearest positioned ancestor.'],
    ['fixed', 'Fixed', 'Leaves the flow; offsets place it on the viewport, so it stays put while the page scrolls.'],
    ['sticky', 'Sticky', 'Scrolls with the flow until it reaches an offset, then sticks within its parent.']
  ], String(values?.position || 'static'));
  const field = (shell, wide) => {
    const node = document.createElement('div');
    node.className = `inspector-field${wide ? ' is-wide' : ''}`;
    node.append(shell);
    return node;
  };
  // Side order as in the spacing control's four fields.
  const offsets = ['Left', 'Top', 'Right', 'Bottom'].map((side) => {
    const property = side.toLowerCase();
    const { shell } = childInput(property, side, String(values?.[property] || 'auto'), SIZE_UNITS);
    shell.title = side;
    shell.querySelector('.inspector-input-prefix').innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.spacing[side]);
    return field(shell);
  });
  // Where the element's top-left corner is on the page. Disabled: it is
  // the result of layout, moved with the offsets below.
  const coordinates = [['X', context?.pageX], ['Y', context?.pageY]].map(([axis, value]) => {
    const { shell, input } = childInput(null, axis, String(value ?? 0));
    input.disabled = true;
    shell.title = `${axis} on the page, px`;
    return field(shell);
  });
  const zIndex = childInput('zIndex', 'Z index', String(values?.zIndex || 'auto'));
  zIndex.shell.title = 'Z index: higher numbers sit on top';
  const dependents = [...offsets, field(zIndex.shell, true)];
  const relevance = () => {
    const off = panelValue(scheme, 'position', values?.position || 'static') === 'static';
    dependents.forEach((node) => {
      node.hidden = off;
      node.dataset.irrelevant = String(off);
    });
  };
  const refresh = scheme.refreshFromPanel;
  scheme.refreshFromPanel = () => {
    refresh();
    relevance();
  };
  scheme.addEventListener('change', relevance);
  relevance();
  return [...coordinates, scheme, ...dependents];
}

// A field that opens a menu of fixed options for one property, in the style
// of the alignment X / Y menus. options: [[value, label, hint]], or groups of
// them: [{ label, options }]. extra: { hint } for the footer when the option
// has none, { cursor: true } to show each option's cursor on hover, and
// { icons: { value: svg } } drawn by each option and the chosen one, with
// the check at the end of the row as in the compact menu.
function menuSelectField(property, prefixText, options, value, extra = {}) {
  const groups = Array.isArray(options[0]) ? [{ options }] : options;
  options = groups.flatMap((group) => group.options);
  const field = document.createElement('div');
  field.className = 'inspector-field is-wide';
  const input = hiddenInspectorInput(property, value);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'inspector-input-shell inspector-menu-select';
  button.title = prefixText;
  button.dataset.properties = property;
  const label = document.createElement('span');
  label.className = 'inspector-menu-value';
  // A row caption can name the menu instead of a prefix.
  if (prefixText) {
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.textContent = prefixText;
    button.append(prefix);
  }
  const icon = document.createElement('span');
  icon.className = 'inspector-input-prefix';
  if (extra.icons) button.append(icon);
  button.append(label);
  button.insertAdjacentHTML('beforeend', INSPECTOR_MENU_CARET);
  const sync = () => {
    label.textContent = options.find(([key]) => key === input.value)?.[1] || input.value;
    icon.innerHTML = extra.icons?.[input.value] || '';
  };
  inspectorMenu(button, field, () => ({
    hint: options.find(([key]) => key === input.value)?.[2] || extra.hint || '',
    compact: Boolean(extra.icons),
    groups: groups.map((group) => ({
      label: group.label,
      items: group.options.map(([key, text, hint]) => ({
        text,
        hint,
        icon: extra.icons?.[key],
        cursor: extra.cursor ? key : undefined,
        checked: input.value === key,
        pick: () => {
          setInputValue(input, key);
          sync();
        }
      }))
    }))
  }));
  field.classList.add('inspector-syncs');
  field.refreshFromPanel = sync;
  sync();
  field.append(button, input);
  return field;
}

// object-position or background-position as the alignment matrix: X and Y
// pick left / center / right and top / center / bottom; a value that isn't
// one of those shows as written.
function positionMatrixField(property, value, noun) {
  const input = hiddenInspectorInput(property, value);
  const keywords = { x: { start: 'left', center: 'center', end: 'right' }, y: { start: 'top', center: 'center', end: 'bottom' } };
  const visualOf = (token) => ({ 0: 'start', '0%': 'start', '0px': 'start', '50%': 'center', '100%': 'end', left: 'start', top: 'start', center: 'center', right: 'end', bottom: 'end' })[token] || token;
  const parts = () => {
    const [x = 'center', y = 'center'] = input.value.trim().split(/\s+/);
    return { x, y };
  };
  return alignMatrixControl({
    inputs: [input],
    state: () => ({}),
    inputFor: () => input,
    visual: (axis) => visualOf(parts()[axis]),
    options: () => [['start', 'center', 'end']],
    set: (axis, visual) => {
      const current = parts();
      current[axis] = keywords[axis][visual];
      const written = (side) => keywords[side][visualOf(current[side])] || current[side];
      setInputValue(input, `${written('x')} ${written('y')}`);
    },
    hint: (axis, visual) => (visual === 'center'
      ? `Center the ${noun} ${axis === 'x' ? 'across' : 'down'} its box.`
      : `Pin the ${noun} to the ${ALIGN_EDGE_LABELS[axis][visual]?.toLowerCase() || visual} of its box.`),
    // The picture as a small box placed in the frame.
    children: (x, y, state, className) => {
      const [left, top] = [{ start: 4, center: 17, end: 30 }[x] ?? 17, { start: 4, center: 20, end: 36 }[y] ?? 20];
      return `<rect x="${left}" y="${top}" width="26" height="20" rx="1.5" class="${className} is-cell"></rect>`;
    }
  });
}

// One radius for all corners, or one per corner behind the toggle, the way
// spacingControl splits margin and padding.
function radiusControl(values) {
  const corners = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'];
  const control = document.createElement('div');
  control.className = 'inspector-field inspector-spacing inspector-radius';
  const hidden = {};
  corners.forEach((corner) => {
    const property = `border${corner}Radius`;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = property;
    input.dataset.property = property;
    // An older injected inspector reports only the shorthand.
    input.value = String(values?.[property] ?? values?.borderRadius ?? '');
    input.dataset.previousValue = input.value;
    hidden[corner] = input;
  });
  const setCorner = (corner, value, type) => {
    hidden[corner].value = value;
    hidden[corner].dispatchEvent(new Event(type, { bubbles: true }));
  };
  const field = (icon, label, properties, read, write) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = label;
    shell.dataset.properties = properties.join(' ');
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.innerHTML = inspectorIcon(icon);
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', label);
    input.addEventListener('focus', () => input.select());
    shell.append(prefix, input);
    const show = attachUnitSelect(shell, input, SIZE_UNITS, (value, type) => {
      write(value, type);
      if (type === 'change') sync();
      return read();
    });
    return { shell, show, read };
  };
  // "4, 8" style lists follow the corner order of the border-radius shorthand.
  const all = field(INSPECTOR_ICON_PATHS.radius.all, 'Radius', corners.map((corner) => hidden[corner].name), () => {
    const list = corners.map((corner) => hidden[corner].value);
    return list.every((value) => value === list[0]) ? list[0] : list.join(', ');
  }, (text, type) => {
    const parts = text.split(',').map((part) => part.trim()).filter(Boolean);
    if (!parts.length || parts.length > 4) return;
    corners.forEach((corner, index) => setCorner(corner, parts[index] ?? parts[0], type));
  });
  all.shell.classList.add('inspector-radius-all');
  const single = (corner) => field(INSPECTOR_ICON_PATHS.radius[corner], `Radius ${corner.replace(/(?=[A-Z])/g, ' ').trim().toLowerCase()}`, [hidden[corner].name], () => hidden[corner].value, (text, type) => {
    if (text.trim()) setCorner(corner, text.trim(), type);
  });
  const [topLeft, topRight, bottomRight, bottomLeft] = corners.map(single);
  const fields = [all, topLeft, topRight, bottomRight, bottomLeft];
  const sync = () => fields.forEach(({ show, read }) => show(read()));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inspector-spacing-toggle';
  toggle.title = 'Radius for each corner';
  toggle.setAttribute('aria-label', toggle.title);
  toggle.innerHTML = inspectorIcon(INSPECTOR_ICON_PATHS.spacing.sides);
  const setExpanded = (open) => {
    control.classList.toggle('is-expanded', open);
    toggle.setAttribute('aria-pressed', String(open));
    all.shell.hidden = open;
    [topLeft, topRight, bottomRight, bottomLeft].forEach(({ shell }) => { shell.hidden = !open; });
  };
  toggle.addEventListener('click', () => {
    radiusCornersOpen = !control.classList.contains('is-expanded');
    setExpanded(radiusCornersOpen);
  });
  // Grid order: the toggle closes the first row in both layouts.
  control.append(all.shell, topLeft.shell, topRight.shell, toggle, bottomLeft.shell, bottomRight.shell, ...Object.values(hidden));
  sync();
  control.showValues = sync;
  setExpanded(radiusCornersOpen);
  return control;
}

// Border width on all sides, on one side only (the others 0), or on each side
// (Custom), picked in the menu next to the field. Hidden inputs carry each
// side through the usual change pipeline; color and style stay shared.
const BORDER_SIDES = ['Top', 'Right', 'Bottom', 'Left'];
// Custom stays picked across elements, as the radius corners do.
let borderSidesCustom = false;

// A box with the side the border goes on drawn solid.
function borderSideIcon(side) {
  const box = 'M3 3h10v10H3z';
  const line = { Top: 'M3 3h10', Right: 'M13 3v10', Bottom: 'M3 13h10', Left: 'M3 3v10' }[side];
  if (!line) return inspectorIcon(box);
  return `<svg class="inspector-line-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="${box}" opacity=".35"></path><path d="${line}"></path></svg>`;
}

function borderWidthControls(values) {
  const control = document.createElement('div');
  control.className = 'inspector-field inspector-border-width';
  const hidden = Object.fromEntries(BORDER_SIDES.map((side) => {
    // An older injected inspector reports only the shorthand.
    const value = String(values?.[`border${side}Width`] ?? values?.borderWidth ?? '0px');
    return [side, hiddenInspectorInput(`border${side}Width`, value)];
  }));
  const width = (side) => hidden[side].value;
  const isZero = (value) => /^[-+]?0*\.?0*([a-z]+|%)?$/i.test(String(value).trim());
  const naturalMode = () => {
    const list = BORDER_SIDES.map(width);
    if (list.every((value) => value === list[0])) return 'all';
    const drawn = BORDER_SIDES.filter((side) => !isZero(width(side)));
    return drawn.length === 1 ? drawn[0] : 'custom';
  };
  let mode = borderSidesCustom && naturalMode() === 'all' ? 'custom' : naturalMode();
  const setSide = (side, value, type) => {
    if (type === 'change' && hidden[side].value === value && hidden[side].dataset.previousValue === value) return;
    hidden[side].value = value;
    hidden[side].dispatchEvent(new Event(type, { bubbles: true }));
  };
  // A side with style none draws no border at any width: give the sides the
  // style drawn on another side, or solid. The other sides that had none now
  // draw their default medium width, so they are set to 0.
  const drawStyle = (targets) => {
    const styleInput = inspectorPanelFields.querySelector('[data-property="borderStyle"]');
    if (!styleInput) return;
    const [top, right = top, bottom = top, left = right] = styleInput.value.trim().split(/\s+/);
    const styles = { Top: top, Right: right, Bottom: bottom, Left: left };
    const off = (side) => ['none', 'hidden'].includes(styles[side]);
    if (!targets.some(off)) return;
    setInputValue(styleInput, BORDER_SIDES.map((side) => styles[side]).find((style) => !['none', 'hidden'].includes(style)) || 'solid');
    styleInput.closest('.inspector-field')?.refreshFromPanel?.();
    BORDER_SIDES.filter((side) => off(side) && !targets.includes(side)).forEach((side) => {
      hidden[side].dataset.previousValue = 'medium';
      setSide(side, '0px', 'change');
    });
  };
  const field = (icon, label, properties, read, write) => {
    const shell = document.createElement('label');
    shell.className = 'inspector-input-shell';
    shell.title = label;
    shell.dataset.properties = properties.join(' ');
    const prefix = document.createElement('span');
    prefix.className = 'inspector-input-prefix';
    prefix.innerHTML = icon;
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', label);
    input.addEventListener('focus', () => input.select());
    shell.append(prefix, input);
    const show = attachUnitSelect(shell, input, LENGTH_UNITS, (value, type) => {
      if (value.trim()) write(value.trim(), type);
      if (type === 'change') sync();
      return read();
    });
    return { shell, prefix, show, read };
  };
  // All sides, or the one side the menu picked; Custom shows the sides below
  // and here "Mixed", which a typed value turns back into All.
  const main = field(inspectorIcon(INSPECTOR_ICON_PATHS.borderWidth), 'Border width', BORDER_SIDES.map((side) => hidden[side].name), () => {
    if (mode === 'custom') return 'Mixed';
    return width(mode === 'all' ? 'Top' : mode);
  }, (value, type) => {
    if (mode === 'custom') mode = 'all';
    if (type === 'change' && !isZero(value)) drawStyle(mode === 'all' ? BORDER_SIDES : [mode]);
    BORDER_SIDES.forEach((side) => setSide(side, mode === 'all' || mode === side ? value : '0px', type));
  });
  const sides = document.createElement('div');
  sides.className = 'inspector-field is-wide inspector-border-sides';
  const sideFields = ['Left', 'Top', 'Right', 'Bottom'].map((side) => field(borderSideIcon(side), `Border ${side.toLowerCase()} width`, [hidden[side].name], () => width(side), (value, type) => {
    if (type === 'change' && !isZero(value)) drawStyle([side]);
    setSide(side, value, type);
  }));
  sides.append(...sideFields.map(({ shell }) => shell));
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inspector-spacing-toggle';
  toggle.title = 'Border sides';
  toggle.setAttribute('aria-label', toggle.title);
  const MODE_ICONS = { custom: inspectorIcon(INSPECTOR_ICON_PATHS.borderSides.custom) };
  const sync = () => {
    [main, ...sideFields].forEach(({ show, read }) => show(read()));
    toggle.innerHTML = MODE_ICONS[mode] || borderSideIcon(mode);
    toggle.setAttribute('aria-pressed', String(mode !== 'all'));
    sides.hidden = mode !== 'custom';
  };
  // Switching keeps the width already drawn: the picked side's, else any
  // side's, else 1px.
  const pickMode = (next) => {
    const drawn = BORDER_SIDES.map(width).find((value) => !isZero(value));
    const value = (next !== 'all' && next !== 'custom' && !isZero(width(next)) ? width(next) : drawn) || '1px';
    mode = next;
    borderSidesCustom = next === 'custom';
    if (next !== 'custom') {
      drawStyle(next === 'all' ? BORDER_SIDES : [next]);
      BORDER_SIDES.forEach((side) => setSide(side, next === 'all' || next === side ? value : '0px', 'change'));
    }
    sync();
  };
  inspectorMenu(toggle, control, () => ({
    compact: true,
    groups: [{
      items: ['all', 'Top', 'Bottom', 'Left', 'Right'].map((key) => ({
        icon: borderSideIcon(key),
        text: key === 'all' ? 'All' : key,
        checked: mode === key,
        pick: () => pickMode(key)
      }))
    }, {
      items: [{ icon: MODE_ICONS.custom, text: 'Custom', checked: mode === 'custom', pick: () => pickMode('custom') }]
    }]
  }));
  control.append(main.shell, toggle, ...Object.values(hidden));
  sync();
  return [control, sides];
}

function lengthUnitControl(shell, input, units) {
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.name = input.name;
  hidden.dataset.property = input.dataset.property;
  hidden.value = input.value;
  hidden.dataset.previousValue = input.dataset.previousValue;
  input.removeAttribute('name');
  delete input.dataset.property;
  delete input.dataset.previousValue;
  // The box still says which property it shows (variables, change dots).
  if (!shell.dataset.properties) shell.dataset.properties = hidden.dataset.property;
  const show = attachUnitSelect(shell, input, units, (value, type) => {
    hidden.value = value;
    hidden.dispatchEvent(new Event(type, { bubbles: true }));
    return hidden.value;
  });
  show(hidden.value);
  // Lets a control that sets the value itself refresh the field.
  hidden.showValue = show;
  return hidden;
}

// Splits a value into the field's number and a unit select at its end.
// send(value, type) gets the joined CSS value and returns the value to show
// once editing is done; the returned show() puts a value back in the field.
function attachUnitSelect(shell, input, units, send) {
  const unitSelect = document.createElement('select');
  unitSelect.className = 'inspector-unit-select';
  unitSelect.setAttribute('aria-label', 'Unit');
  // No unit (line-height 1.6: times the font size) reads as a dash.
  units.forEach((unit) => unitSelect.add(new Option(unit || '-', unit)));
  const bareUnit = units.includes('') ? '' : 'px';
  const split = (text) => String(text).trim().match(/^([-+]?\d*\.?\d+)\s*([a-z]+|%)?$/i);
  const show = (value) => {
    const match = split(value);
    unitSelect.hidden = !match;
    if (!match) {
      input.value = value;
      return;
    }
    const unit = (match[2] || bareUnit).toLowerCase();
    if (![...unitSelect.options].some((option) => option.value === unit)) unitSelect.add(new Option(unit));
    unitSelect.value = unit;
    input.value = match[1];
  };
  const compose = () => {
    const match = split(input.value);
    return match ? `${match[1]}${(match[2] ?? unitSelect.value).toLowerCase()}` : input.value.trim();
  };
  input.addEventListener('input', () => send(compose(), 'input'));
  input.addEventListener('change', () => show(send(compose(), 'change')));
  unitSelect.addEventListener('change', () => show(send(compose(), 'change')));
  shell.append(unitSelect);
  return show;
}

// "2 em" is how people type a length but not valid CSS; join number and unit.
function normalizeCssLength(value) {
  return value.replace(/^\s*([-+]?\d*\.?\d+)\s+([a-z]+|%)\s*$/i, (match, number, unit) => `${number}${unit.toLowerCase()}`);
}
