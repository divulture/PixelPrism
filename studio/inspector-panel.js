// The Inspector panel: showing the selected element and sending edits to the preview.

function showInspectorPanel(editor, source) {
  // The right panel is a property editor for the selected layer, not a
  // readout of the zone that happened to be clicked. Normalise messages from
  // both current and previously injected inspectors to the complete editor.
  const editorMode = 'component';
  const fields = INSPECTOR_FIELDS[editorMode];
  const frame = [...document.querySelectorAll('.viewport-card iframe')].find((iframe) => iframe.contentWindow === source);
  if (!frame) return;
  inspectorFrame = frame;
  setLayersFrame(frame.contentWindow);
  inspectorModeActive = true;
  setCursorModeActive(false);
  inspectorToggle.setAttribute('aria-pressed', 'true');
  setCommentsOpen(false);
  // What the edits go to, under the title: "all .card" for every element a
  // shared class styles, or the one element ("img", "div#hero").
  const target = String(editor.title || '').split(' · ').slice(1).join(' · ');
  inspectorPanelTitle.textContent = editor.context?.textOf ? 'Text' : 'Element';
  inspectorPanelSelector.textContent = target;
  // Beside the title, with the icon Layers gives this kind of element.
  document.querySelector('#inspector-target').hidden = !target;
  document.querySelector('#inspector-target-icon').innerHTML = inspectorIcon(LAYER_ICONS[editor.context?.layerKind] || LAYER_ICONS.box);
  const panelGroups = [];
  let currentGroup;
  const startGroup = (name, layoutFor) => {
    currentGroup = document.createElement('section');
    currentGroup.className = 'inspector-group';
    currentGroup.dataset.name = name;
    if (layoutFor) currentGroup.dataset.layoutFor = layoutFor;
    const group = currentGroup;
    const heading = document.createElement('h3');
    heading.className = 'inspector-group-label';
    heading.hidden = !name;
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'inspector-group-toggle';
    const setCollapsed = (collapsed) => {
      group.classList.toggle('is-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.innerHTML = window.phosphorIcon(collapsed ? 'caret-right' : 'caret-down');
      // Shown by CSS while the section is folded with changes inside.
      const dot = document.createElement('span');
      dot.className = 'inspector-group-dot';
      dot.title = 'Reset changes in this section';
      toggle.append(name, dot);
    };
    group.setCollapsed = (collapsed) => {
      if (collapsed) collapsedInspectorGroups.add(name);
      else collapsedInspectorGroups.delete(name);
      setCollapsed(collapsed);
    };
    toggle.addEventListener('click', (event) => {
      if (event.target.closest('.inspector-group-dot')) {
        resetInspectorProperties([...new Set([...fields.querySelectorAll('[data-property]')].map((input) => input.dataset.property))]);
        return;
      }
      const collapsed = !group.classList.contains('is-collapsed');
      group.setCollapsed(collapsed);
      if (!collapsed && inspectorFocusMode) inspectorGroups().forEach((other) => { if (other !== group) other.setCollapsed(true); });
    });
    setCollapsed(collapsedInspectorGroups.has(name));
    heading.append(toggle);
    const fields = document.createElement('div');
    fields.className = 'inspector-group-fields';
    currentGroup.append(heading, fields);
    panelGroups.push(currentGroup);
    return fields;
  };
  // Written for the display the panel shows now, so switching Display
  // doesn't leave a note about the old one.
  const layoutNoteFor = (display = editor.values?.display) => {
    const context = editor.context || {};
    const values = editor.values || {};
    const notes = [];
    const isFlex = display === 'flex';
    if (isFlex && values.width === 'auto' && values.height === 'auto') {
      notes.push('Flex is active, but this element is auto-sized, so alignment has little free space to move children.');
    }
    if (String(context.parentDisplay || '').includes('grid')) {
      notes.push('This element is positioned by its parent grid; use Grid Child below or edit the parent grid to move it.');
    }
    if (isFlex && Number(context.childElementCount) < 2) {
      notes.push('Flex controls are most visible when the selected element has multiple child elements.');
    }
    return notes.join(' ');
  };
  const parentDisplay = String(editor.context?.parentDisplay || '');
  const parentKind = parentDisplay.includes('grid') ? 'grid' : parentDisplay.includes('flex') ? 'flex' : null;
  // The element's interaction states: the preview shows the chosen one, and
  // the panel reads and edits its rule (".button:hover"). A dot marks a
  // state with edits.
  if (Array.isArray(editor.states) && editor.states.length) {
    const stateFields = startGroup('State');
    const field = document.createElement('div');
    field.className = 'inspector-field is-wide is-tabs';
    const tabs = document.createElement('span');
    tabs.className = 'inspector-tabs inspector-state-tabs';
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'State');
    const current = editor.state || 'default';
    ['default', ...editor.states].filter((state) => INSPECTOR_STATE_LABELS[state]).forEach((state) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'inspector-tab';
      tab.textContent = INSPECTOR_STATE_LABELS[state];
      tab.setAttribute('aria-pressed', String(state === current));
      if (editor.stateChanges?.includes(state)) {
        const dot = document.createElement('span');
        dot.className = 'inspector-change-dot inspector-state-dot';
        dot.setAttribute('aria-hidden', 'true');
        tab.append(dot);
        tab.title = `${INSPECTOR_STATE_LABELS[state]}: changed`;
      }
      tab.addEventListener('click', () => {
        if (tab.getAttribute('aria-pressed') === 'true') return;
        tabs.querySelectorAll('.inspector-tab').forEach((other) => other.setAttribute('aria-pressed', String(other === tab)));
        frame.contentWindow?.postMessage({ source: 'viewport-parade', type: 'inspector-set-state', state }, '*');
      });
      tabs.append(tab);
    });
    field.append(tabs);
    stateFields.append(field);
    currentGroup = undefined;
  }
  let borderSideFields;
  fields.forEach(([property, label, type, wide, layoutFor, options]) => {
    if (property === 'childLayout') {
      if (!parentKind) return;
      const childFields = startGroup(parentKind === 'grid' ? 'Grid Child' : 'Flex Child');
      childFields.append(...childLayoutFields(parentKind, editor.values, editor.context, currentGroup));
      // Fields after this belong to the next section only.
      currentGroup = undefined;
      return;
    }
    const groupStarts = {
      display: ['Layout'],
      width: ['Dimensions'],
      marginTop: ['Spacing'],
      position: ['Position'],
      backgroundColor: ['Background'],
      borderWidth: ['Border'],
      fontFamily: ['Typography'],
      boxShadow: ['Effects']
    };
    const groupStart = groupStarts[property];
    const groupFields = groupStart ? startGroup(...groupStart) : currentGroup?.querySelector('.inspector-group-fields');
    if (groupStart?.[0] === 'Layout') {
      const noteNode = document.createElement('p');
      noteNode.className = 'inspector-note is-layout-note';
      noteNode.refreshNote = (display) => {
        noteNode.textContent = layoutNoteFor(display);
        noteNode.hidden = !noteNode.textContent;
      };
      noteNode.refreshNote();
      currentGroup.insertBefore(noteNode, groupFields);
    }
    if (!groupFields) return;
    // Margin and padding share the Spacing section, each under its own caption.
    const subgroupLabel = ({ marginTop: 'Margin', paddingTop: 'Padding' })[property];
    if (subgroupLabel) {
      const caption = document.createElement('p');
      caption.className = 'inspector-subgroup-label';
      caption.textContent = subgroupLabel;
      groupFields.append(caption);
    }
    // The four sides of margin and padding render as one control at Top.
    const spacingSide = /^(margin|padding)(Top|Right|Bottom|Left)$/.exec(property);
    if (spacingSide) {
      if (spacingSide[2] === 'Top') groupFields.append(spacingControl(spacingSide[1], editor.values));
      return;
    }
    if (property === 'borderRadius') {
      groupFields.append(radiusControl(editor.values));
      return;
    }
    // Width and its side menu take the width's place; the side fields go
    // under the width and color row.
    if (property === 'borderWidth') {
      const [width, sides] = borderWidthControls(editor.values);
      groupFields.append(width);
      borderSideFields = sides;
      return;
    }
    const gridControls = { gridTracks: gridTracksControl, gridAutoFlow: gridFlowControl, gridAlign: gridAlignControl, columnGap: gapControl, gridMoreAlign: gridMoreAlignControl };
    if (gridControls[property]) {
      const control = gridControls[property](editor.values);
      control.dataset.layoutFor = layoutFor;
      groupFields.append(control);
      return;
    }
    if (property === 'alignContent') {
      const control = alignContentField(editor.values);
      control.dataset.layoutFor = layoutFor;
      groupFields.append(control);
      return;
    }
    // Justify content and align items render as the alignment control.
    if (property === 'justifyContent') {
      const control = flexAlignControl(editor.values);
      control.dataset.layoutFor = layoutFor;
      groupFields.append(control);
      return;
    }
    if (property === 'imageSettings') {
      groupFields.append(...imageSettingsFields(editor.values, editor.context));
      return;
    }
    if (property === 'position') {
      groupFields.append(...positionFields(editor.values, editor.context));
      return;
    }
    if (property === 'overflow') {
      groupFields.append(overflowField(editor.values));
      return;
    }
    if (property === 'cursor') {
      groupFields.append(cursorField(editor.values));
      return;
    }
    if (property === 'boxShadow') {
      groupFields.append(boxShadowsField(editor.values));
      return;
    }
    if (property === 'filter') {
      groupFields.append(filtersField(editor.values));
      return;
    }
    if (property === 'backdropFilter') {
      groupFields.append(filtersField(editor.values, 'backdropFilter', 'Backdrop filters'));
      return;
    }
    // Direction and wrap render as one control at Direction.
    if (property === 'flexWrap') return;
    if (property === 'flexDirection') {
      const control = flexFlowControl(editor.values);
      control.dataset.layoutFor = layoutFor;
      groupFields.append(control);
      return;
    }
    if (MORE_OPTIONS_FIELDS.has(property) && !groupFields.querySelector('.inspector-more-toggle')) {
      const group = currentGroup;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'inspector-group-toggle inspector-more-toggle';
      const setOpen = (open) => {
        group.classList.toggle('is-showing-more', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.innerHTML = window.phosphorIcon(open ? 'caret-down' : 'caret-right');
        toggle.append('More options');
      };
      toggle.addEventListener('click', () => {
        const open = !group.classList.contains('is-showing-more');
        if (open) openMoreOptions.add(group.dataset.name);
        else openMoreOptions.delete(group.dataset.name);
        setOpen(open);
      });
      setOpen(openMoreOptions.has(group.dataset.name));
      groupFields.append(toggle);
    }
    if (property === 'aspectRatio') {
      const control = aspectRatioField(editor.values, editor.context);
      control.classList.add('is-more');
      groupFields.append(control);
      control.refreshFromPanel();
      return;
    }
    if (TYPE_MORE_CONTROLS[property]) {
      const typeFields = [].concat(TYPE_MORE_CONTROLS[property](editor.values));
      typeFields.forEach((typeFieldNode) => typeFieldNode.classList.add('is-more'));
      groupFields.append(...typeFields);
      return;
    }
    // A few exclusive choices read better as tabs than as a dropdown.
    const asTabs = INSPECTOR_TAB_FIELDS.has(property);
    const field = document.createElement(asTabs ? 'div' : 'label');
    field.className = `inspector-field${wide ? ' is-wide' : ''}`;
    if (layoutFor) field.dataset.layoutFor = layoutFor;
    const dimensionPrefix = ({ width: 'W', height: 'H', minWidth: 'W min', maxWidth: 'W max', minHeight: 'H min', maxHeight: 'H max' })[property];
    const isDimension = Boolean(dimensionPrefix);
    const isTypography = editorMode === 'typography';
    const isColorField = COLOR_FIELDS.has(property);
    const compactTypeControl = isTypography && ['fontStyle', 'fontSize'].includes(property);
    const typeIcon = ['lineHeight', 'letterSpacing', 'opacity', 'borderWidth'].includes(property) ? INSPECTOR_ICON_PATHS[property] : '';
    const unlabeled = UNLABELED_FIELDS.has(property);
    const inlinePrefix = typeIcon;
    if (isDimension) field.classList.add('is-dimension');
    if (isColorField) field.classList.add('is-color');
    if (isTypography) field.classList.add(`is-type-${property}`);
    if (typeIcon) field.classList.add('is-type-icon');
    if (MORE_OPTIONS_FIELDS.has(property)) field.classList.add('is-more');
    if (typeIcon || (unlabeled && !asTabs)) field.title = label;
    if (!isDimension && !compactTypeControl && !typeIcon && !unlabeled) field.textContent = label;
    if (compactTypeControl || isDimension || typeIcon || unlabeled) {
      const accessibleLabel = document.createElement('span');
      accessibleLabel.className = 'sr-only';
      accessibleLabel.textContent = label;
      field.append(accessibleLabel);
    }
    const input = type === 'select' ? document.createElement('select') : document.createElement('input');
    if (type !== 'select') {
      input.type = CSS_LENGTH_FIELDS.has(property) ? 'text' : type;
      if (CSS_LENGTH_FIELDS.has(property)) input.inputMode = 'decimal';
    }
    input.name = property;
    input.dataset.property = property;
    // A preview can retain an older injected inspector script until its page is
    // reloaded. Keep CSS size defaults visible rather than rendering empty
    // controls while that preview catches up.
    const cssSizeDefaults = { width: 'auto', height: 'auto', minWidth: '0px', maxWidth: 'none', minHeight: '0px', maxHeight: 'none' };
    const currentValue = String(editor.values?.[property] ?? cssSizeDefaults[property] ?? '');
    input.value = currentValue;
    if (type === 'number') input.step = 'any';
    if (type === 'select') {
      (options || []).forEach(([value, text]) => input.add(new Option(text, value)));
      if (![...input.options].some((option) => option.value === currentValue)) input.add(new Option(currentValue, currentValue));
      input.value = currentValue;
    }
    input.dataset.previousValue = input.value;
    let colorPicker;
    if (input instanceof HTMLInputElement) {
      input.addEventListener('pointerdown', () => {
        input.dataset.selectOnFocus = String(document.activeElement !== input);
      });
      input.addEventListener('pointerup', () => {
        if (input.dataset.selectOnFocus !== 'true' || document.activeElement !== input) return;
        delete input.dataset.selectOnFocus;
        input.select();
      });
      input.addEventListener('focus', () => {
        if (input.dataset.selectOnFocus === 'false') return;
        requestAnimationFrame(() => {
          if (document.activeElement === input) input.select();
        });
      });
      input.addEventListener('blur', () => {
        delete input.dataset.selectOnFocus;
      });
      if (isColorField) {
        colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.className = 'inspector-color-picker';
        colorPicker.value = cssColorToHex(currentValue) || '#000000';
        colorPicker.setAttribute('aria-label', `${label} picker`);
        colorPicker.dataset.colorPickerFor = property;
        colorPicker.addEventListener('input', () => {
          input.value = colorPicker.value.toUpperCase();
          input.dispatchEvent(new InputEvent('input', { bubbles: true }));
        });
        colorPicker.addEventListener('change', () => {
          input.value = colorPicker.value.toUpperCase();
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        input.addEventListener('input', () => {
          const nextColor = cssColorToHex(input.value);
          if (nextColor) colorPicker.value = nextColor;
        });
      }
    }
    if (isDimension || inlinePrefix) {
      const shell = document.createElement('span');
      shell.className = 'inspector-input-shell';
      const prefix = document.createElement('span');
      prefix.className = 'inspector-input-prefix';
      prefix.setAttribute('aria-hidden', 'true');
      if (typeIcon) prefix.innerHTML = inspectorIcon(typeIcon);
      else prefix.textContent = dimensionPrefix || inlinePrefix;
      shell.append(prefix, input);
      field.append(shell);
      if (property === 'letterSpacing') field.append(lengthUnitControl(shell, input, LENGTH_UNITS));
      if (property === 'lineHeight') field.append(lengthUnitControl(shell, input, LINE_HEIGHT_UNITS));
      if (isDimension) field.append(lengthUnitControl(shell, input, SIZE_UNITS));
      if (property === 'borderWidth') field.append(lengthUnitControl(shell, input, LENGTH_UNITS));
    } else if (colorPicker) {
      const shell = document.createElement('span');
      shell.className = 'inspector-color-shell';
      shell.append(input, colorPicker);
      field.append(shell);
    } else if (property === 'fontWeight') {
      field.append(...fontWeightStyleControl(input, editor.values));
    } else if (asTabs) {
      // The hidden select keeps the value, so the change pipeline and the
      // layout visibility check read it as before.
      field.classList.add('is-tabs');
      input.hidden = true;
      const tabs = document.createElement('span');
      tabs.className = 'inspector-tabs';
      tabs.setAttribute('role', 'group');
      tabs.setAttribute('aria-label', label);
      // A value outside the options (a border style that differs per side,
      // "none none solid none") gets no tab of its own: none is pressed, and
      // the field's tooltip says what it is.
      if (![...input.options].slice(0, (options || []).length).some((option) => option.value === input.value)) field.title = `${label}: ${input.value}`;
      [...input.options].slice(0, (options || []).length).forEach((option) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'inspector-tab';
        const iconPath = INSPECTOR_ICON_PATHS[property]?.[option.value];
        if (iconPath) {
          tab.classList.add('is-icon');
          tab.innerHTML = inspectorIcon(iconPath);
          tab.title = option.text;
          tab.setAttribute('aria-label', option.text);
        } else {
          tab.textContent = option.text;
        }
        tab.setAttribute('aria-pressed', String(option.value === input.value));
        tab.dataset.value = option.value;
        tab.addEventListener('click', () => {
          if (input.value === option.value) return;
          input.value = option.value;
          tabs.querySelectorAll('.inspector-tab').forEach((other) => other.setAttribute('aria-pressed', String(other === tab)));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        tabs.append(tab);
      });
      // Another control can set the value (border sides set a style).
      field.classList.add('inspector-syncs');
      field.refreshFromPanel = () => {
        const tabList = [...tabs.querySelectorAll('.inspector-tab')];
        tabList.forEach((tab) => tab.setAttribute('aria-pressed', String(tab.dataset.value === input.value)));
        field.title = tabList.some((tab) => tab.dataset.value === input.value) ? '' : `${label}: ${input.value}`;
      };
      field.append(input, tabs);
    } else {
      field.append(input);
    }
    const source = editor.valueSources?.[property];
    if (source?.kind === 'declared' && ['gridTemplateColumns', 'gridTemplateRows', 'gridAutoColumns', 'gridAutoRows', 'gridAutoFlow', 'gridColumn', 'gridRow'].includes(property)) {
      const sourceNode = document.createElement('span');
      sourceNode.className = `inspector-source is-${source.kind}`;
      sourceNode.textContent = `declared${source.selector ? ` · ${source.selector}` : ''}`;
      field.append(sourceNode);
    }
    groupFields.append(field);
    if (property === 'borderColor' && borderSideFields) groupFields.append(borderSideFields);
  });
  if (frame.closest('.viewport-card')?.dataset.inspectorOutdated === 'true') {
    const outdated = document.createElement('p');
    outdated.className = 'inspector-note';
    outdated.textContent = 'This preview runs an older PixelPrism page script, so some controls won\'t reach the page. Reload PixelPrism in chrome://extensions, then reopen Studio.';
    panelGroups.unshift(outdated);
  }
  // Text without a tag or class of its own shows its parent's values; the
  // first edit wraps it in a span that takes the change.
  if (editor.context?.textOf) {
    const note = document.createElement('p');
    note.className = 'inspector-note';
    note.textContent = `This text has no tag or class of its own: its values come from ${editor.context.textOf}. A change wraps it in a span, which the agent adds to the source.`;
    panelGroups.unshift(note);
  }
  inspectorPanelFields.replaceChildren(...panelGroups);
  if (inspectorFocusMode) focusInspectorGroups();
  // The page script knows what it overrides; one that predates editor.changed
  // falls back to what this Studio sent for the same preview and selector.
  inspectorChangeKey = `${frame.closest('.viewport-card')?.dataset.device}|${editor.title}`;
  const card = frame.closest('.viewport-card');
  inspectorChangeTarget = {
    selector: editor.selector || String(editor.title || '').replace(/^[^·]*·\s*(all\s+)?/, ''),
    url: canonicalInspectorUrl(card?.dataset.loadedUrl || targetUrl),
    width: Math.round(Number(card?.dataset.viewportWidth)),
    height: Math.round(Number(card?.dataset.viewportHeight))
  };
  const changed = new Set(Array.isArray(editor.changed) ? editor.changed : changedInspectorProperties.get(inspectorChangeKey) || []);
  changedInspectorProperties.set(inspectorChangeKey, changed);
  changeDotResizeObserver.disconnect();
  updateLayoutFieldVisibility();
  inspectorPanel.hidden = false;
  changed.forEach(markInspectorFieldChanged);
}

function updateLayoutFieldVisibility() {
  const valueOf = (property) => inspectorPanelFields.querySelector(`[data-property="${property}"]`)?.value;
  const display = valueOf('display');
  inspectorPanelFields.querySelector('.is-layout-note')?.refreshNote(display);
  const singleLine = display === 'flex' && valueOf('flexWrap') === 'nowrap';
  inspectorPanelFields.querySelectorAll('[data-layout-for]').forEach((field) => {
    let applies = field.dataset.layoutFor === display || (field.dataset.layoutFor === 'flex-grid' && ['flex', 'grid'].includes(display));
    // align-content spreads lines; one flex line that doesn't wrap has none.
    if (applies && singleLine && field.matches('[data-layout-for="flex"]') && field.querySelector('[data-property="alignContent"]')) applies = false;
    field.hidden = !applies;
  });
  markHiddenChangesInactive();
}

// A change whose layout field the panel hides doesn't go to the agent; it
// comes back with the field (Flex again, wrapping again).
function markHiddenChangesInactive() {
  const target = inspectorChangeTarget;
  if (!target) return;
  const shown = new Set();
  const hidden = new Set();
  const cssName = (input) => input.dataset.property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  // Hidden because it doesn't apply: a layout field for another display, or
  // a part a control marks irrelevant. Folded-away parts still count.
  inspectorPanelFields.querySelectorAll('[data-property]').forEach((input) => {
    const irrelevant = input.closest('[data-layout-for][hidden], [data-irrelevant="true"]');
    (irrelevant ? hidden : shown).add(cssName(input));
  });
  changeLog.forEach((change) => {
    if (change.selector !== target.selector
      || canonicalInspectorUrl(change.url) !== target.url
      || change.viewport.width !== target.width
      || change.viewport.height !== target.height) return;
    change.inactive = hidden.has(change.property) && !shown.has(change.property);
  });
  syncChangeUi();
}

// Clicks inside a preview are handled by its own document. A click anywhere in
// Studio around the previews is an explicit way to leave the current edit.
document.addEventListener('pointerdown', (event) => {
  if (event.target instanceof Element && event.target.closest('iframe, #inspector-panel, .code-panel, #comments-panel, #layers-panel, .mode-dock, .toolbar, #custom-dialog, .breadcrumbs')) return;
  clearInspectorSelections();
}, true);

function sendInspectorFieldChange(event) {
  const input = event.target.closest('input[data-property], select[data-property]');
  if (!input || !inspectorFrame?.contentWindow) return;
  const value = CSS_LENGTH_FIELDS.has(input.dataset.property) ? normalizeCssLength(input.value) : input.value;
  // Rewrite the field only once editing is done, so the caret stays put while typing.
  if (event.type === 'change') input.value = value;
  const previousValue = input.dataset.previousValue ?? '';
  if (event.type === 'change' && value === previousValue) return;
  inspectorFrame.contentWindow.postMessage({
    source: 'viewport-parade',
    type: 'inspector-editor-input',
    property: input.dataset.property,
    value,
    previousValue
  }, '*');
  input.dataset.previousValue = value;
  const changed = changedInspectorProperties.get(inspectorChangeKey) || new Set();
  changedInspectorProperties.set(inspectorChangeKey, changed);
  // align-items backs both the flex alignment control and the grid's Align
  // items field: keep every copy on the same value, then let controls that
  // draw from panel values redraw.
  inspectorPanelFields.querySelectorAll(`[data-property="${input.dataset.property}"]`).forEach((other) => {
    if (other === input) return;
    if (other instanceof HTMLSelectElement && ![...other.options].some((option) => option.value === value)) other.add(new Option(value, value));
    other.value = value;
    other.dataset.previousValue = value;
    other.showValue?.(value);
  });
  // An emptied field drops the override, which is the same as a reset.
  if (value.trim()) {
    changed.add(input.dataset.property);
    markInspectorFieldChanged(input.dataset.property);
  } else {
    changed.delete(input.dataset.property);
    unmarkInspectorFieldChanged(input.dataset.property);
  }
  inspectorPanelFields.querySelectorAll('.inspector-syncs').forEach((control) => {
    if (!control.contains(input)) control.refreshFromPanel();
  });
  if (['display', 'flexDirection', 'flexWrap'].includes(input.dataset.property)) updateLayoutFieldVisibility();
  else markHiddenChangesInactive();
}

// A changed value gets a blue dot right after it, on what shows it: the side
// or corner field of a split control, otherwise the field's own box. The
// dot resets the value to what the page declares.
function markInspectorFieldChanged(property) {
  const shells = [...inspectorPanelFields.querySelectorAll(`[data-properties~="${property}"]`)];
  const fields = new Set([...inspectorPanelFields.querySelectorAll(`[data-property="${property}"]`)].map((input) => input.closest('.inspector-field')));
  const hosts = [...shells];
  fields.forEach((field) => {
    if (!field || shells.some((shell) => field.contains(shell))) return;
    const box = field.querySelector('.inspector-input-shell, .inspector-color-shell, .inspector-tabs, :scope > input:not([type="hidden"]), :scope > select');
    if (box) hosts.push(box.matches('input, select') ? field : box);
  });
  hosts.forEach((host) => {
    if (host.querySelector(':scope > .inspector-change-dot')) return;
    const properties = host.dataset.properties
      ? host.dataset.properties.split(' ')
      : [...host.closest('.inspector-field').querySelectorAll('[data-property]')].map((input) => input.dataset.property);
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'inspector-change-dot';
    dot.title = 'Reset to the page value';
    dot.setAttribute('aria-label', dot.title);
    dot.addEventListener('pointerdown', (event) => event.preventDefault());
    dot.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      resetInspectorProperties(properties);
    });
    host.classList.add('has-change-dot');
    host.append(dot);
    changeDotResizeObserver.observe(host);
    placeChangeDot(dot);
  });
}

function unmarkInspectorFieldChanged(property) {
  const changed = changedInspectorProperties.get(inspectorChangeKey);
  inspectorPanelFields.querySelectorAll('.inspector-change-dot').forEach((dot) => {
    const host = dot.parentElement;
    const properties = host.dataset.properties
      ? host.dataset.properties.split(' ')
      : [...host.closest('.inspector-field').querySelectorAll('[data-property]')].map((input) => input.dataset.property);
    if (!properties.includes(property) || properties.some((other) => changed?.has(other))) return;
    host.classList.remove('has-change-dot');
    dot.remove();
  });
}

const changeDotMeasure = document.createElement('canvas').getContext('2d');
// The line box centre sits below the middle of digits and capitals; move the
// dot onto that middle so it lines up with the value, not the box.
function changeDotLift(style) {
  changeDotMeasure.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const font = changeDotMeasure.measureText('0');
  return (font.fontBoundingBoxAscent - font.fontBoundingBoxDescent) / 2 - (font.actualBoundingBoxAscent - font.actualBoundingBoxDescent) / 2;
}

function placeChangeDot(dot) {
  const host = dot.parentElement;
  if (!host) return;
  const hostBox = host.getBoundingClientRect();
  const tab = host.querySelector('.inspector-tab[aria-pressed="true"]');
  if (tab) {
    const tabBox = tab.getBoundingClientRect();
    const content = document.createRange();
    content.selectNodeContents(tab);
    const lift = tab.classList.contains('is-icon') ? 0 : changeDotLift(getComputedStyle(tab));
    dot.style.left = `${Math.min(content.getBoundingClientRect().right + 7, tabBox.right - 5) - hostBox.left}px`;
    dot.style.top = `${tabBox.top + tabBox.height / 2 + lift - hostBox.top}px`;
    return;
  }
  const target = host.querySelector('input:not([type="hidden"]):not([type="color"]), select:not(.inspector-unit-select), .inspector-menu-value');
  if (!target) return;
  const style = getComputedStyle(target);
  const text = target instanceof HTMLSelectElement ? target.selectedOptions[0]?.text || '' : target.value ?? target.textContent;
  const lift = changeDotLift(style);
  const box = target.getBoundingClientRect();
  const start = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
  const end = box.right - parseFloat(style.paddingRight) - 3;
  dot.style.left = `${Math.min(start + changeDotMeasure.measureText(text).width + 7, end) - hostBox.left}px`;
  dot.style.top = `${box.top + box.height / 2 + lift - hostBox.top}px`;
}

const placeChangeDots = () => inspectorPanelFields.querySelectorAll('.inspector-change-dot').forEach(placeChangeDot);
const changeDotResizeObserver = new ResizeObserver(placeChangeDots);
['input', 'change'].forEach((type) => inspectorPanelFields.addEventListener(type, () => requestAnimationFrame(placeChangeDots)));

// Removing the override brings back the page's own value; the panel is then
// rebuilt from the page so every control shows it.
function resetInspectorProperties(properties) {
  const frame = inspectorFrame?.contentWindow;
  const changed = changedInspectorProperties.get(inspectorChangeKey);
  if (!frame || !changed) return;
  properties.filter((property) => changed.has(property)).forEach((property) => {
    const input = inspectorPanelFields.querySelector(`[data-property="${property}"]`);
    frame.postMessage({ source: 'viewport-parade', type: 'inspector-editor-input', property, value: '', previousValue: input?.value ?? '' }, '*');
    changed.delete(property);
    unmarkInspectorFieldChanged(property);
  });
  if (selectedLayerPath !== undefined) {
    frame.postMessage({ source: 'viewport-parade', type: 'layers-select', path: layerPathArray(selectedLayerPath) }, '*');
  }
}

inspectorPanelFields.addEventListener('input', sendInspectorFieldChange);
inspectorPanelFields.addEventListener('change', sendInspectorFieldChange);

// The panel's sections, State included.
function inspectorGroups() {
  return [...inspectorPanelFields.querySelectorAll('.inspector-group')].filter((group) => group.setCollapsed);
}

// Leaves the first open section open and folds the others.
function focusInspectorGroups() {
  const open = inspectorGroups().filter((group) => !group.classList.contains('is-collapsed'));
  open.slice(1).forEach((group) => group.setCollapsed(true));
}

inspectorMenu(inspectorPanelMore, inspectorPanelMore.parentElement, () => {
  const groups = inspectorGroups();
  const collapsed = groups.filter((group) => group.classList.contains('is-collapsed'));
  return {
    compact: true,
    groups: [{
      items: [
        // Several open sections are what focus mode rules out.
        { icon: inspectorIcon(INSPECTOR_ICON_PATHS.sections.expand), text: 'Expand all', disabled: inspectorFocusMode || !collapsed.length, pick: () => groups.forEach((group) => group.setCollapsed(false)) },
        { icon: inspectorIcon(INSPECTOR_ICON_PATHS.sections.collapse), text: 'Collapse all', disabled: collapsed.length === groups.length, pick: () => groups.forEach((group) => group.setCollapsed(true)) }
      ]
    }, {
      items: [{
        icon: inspectorIcon(INSPECTOR_ICON_PATHS.sections.focus),
        text: 'Focus mode',
        checked: inspectorFocusMode,
        pick: () => {
          inspectorFocusMode = !inspectorFocusMode;
          try { localStorage.setItem(INSPECTOR_FOCUS_KEY, String(inspectorFocusMode)); } catch { /* Not remembered. */ }
          if (inspectorFocusMode) focusInspectorGroups();
        }
      }]
    }]
  };
});

inspectorPanelClose.addEventListener('click', () => {
  clearInspectorSelections();
  hideInspectorPanel();
});
