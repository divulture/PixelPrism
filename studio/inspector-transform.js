// Transform: the rotation, flips, the point the element turns around and the
// transform functions as written. Rotate and Flip edit the rotate and scale properties,
// which apply on top of transform, so a rotation the site wrote in transform
// stays visible in its own field instead of being overwritten.

const ANGLE_UNITS = ['deg', 'turn', 'rad', 'grad'];
// An arrow turning clockwise; triangles mirrored across a vertical and a
// horizontal axis.
const TRANSFORM_ICON_PATHS = {
  rotate: 'M13 8a5 5 0 1 1-1.46-3.54M13.5 2v3h-3',
  flipX: 'M8 2v12M6 4 2.5 12H6zM10 4l3.5 8H10z',
  flipY: 'M2 8h12M4 6l8-3.5V6zM4 10l8 3.5V10z'
};

// scale as its X and Y factors: "none" is 1 1, one factor is both.
const scaleFactors = (value) => {
  const parts = String(value || 'none').trim().split(/\s+/);
  return parts[0] === 'none' ? ['1', '1'] : [parts[0], parts[1] ?? parts[0], ...parts.slice(2)];
};
const scaleValue = (factors) => (factors.every((factor) => factor === '1')
  ? 'none'
  : factors.length === 2 && factors[0] === factors[1] ? factors[0] : factors.join(' '));

// The angle of the one rotate() or rotateZ() in a transform; null when there
// is none, or more than one to choose from.
const TRANSFORM_ROTATION = /\brotateZ?\(\s*([^()]*?)\s*\)/gi;
const transformRotation = (value) => {
  const found = [...String(value).matchAll(TRANSFORM_ROTATION)];
  return found.length === 1 ? found[0][1] : null;
};
const withTransformRotation = (value, angle) => (transformRotation(value) === null
  ? null
  : String(value).replace(TRANSFORM_ROTATION, (match) => match.replace(/\(.*\)/, `(${angle})`)));

function transformFields(values) {
  const transformValue = String(values?.transform || 'none');
  const transform = typeField('Functions', true);
  const written = childInput('transform', 'Transform functions', transformValue);
  written.shell.querySelector('.inspector-input-prefix').remove();
  transform.append(written.shell);
  // Only a transform the site set has something to show; new turns and
  // flips go to Rotate and Flip.
  transform.hidden = transformValue === 'none';

  const rotate = typeField('Rotate');
  rotate.title = 'Rotate';
  const rotateValue = String(values?.rotate || 'none');
  // Sites mostly turn elements with transform: rotate(…). Without a rotate
  // property, Rotate shows that angle and edits it inside the transform, so
  // the two never add up to a turn nobody wrote.
  const inTransform = rotateValue === 'none' && transformRotation(transformValue) !== null;
  const angle = childInput(inTransform ? '' : 'rotate', 'Rotate', inTransform ? transformRotation(transformValue) : rotateValue === 'none' ? '0deg' : rotateValue, ANGLE_UNITS);
  angle.shell.querySelector('.inspector-input-prefix').innerHTML = inspectorIcon(TRANSFORM_ICON_PATHS.rotate);
  if (inTransform) {
    rotate.title = 'Rotate: the rotate() in Functions';
    // The angle is no property of its own: Functions sends the change.
    delete angle.dataInput.dataset.property;
    delete angle.dataInput.dataset.previousValue;
    angle.shell.dataset.properties = 'transform';
    angle.dataInput.addEventListener('change', () => {
      const next = withTransformRotation(written.dataInput.value, angle.dataInput.value.trim() || '0deg');
      if (next) setInputValue(written.dataInput, next);
    });
    rotate.classList.add('inspector-syncs');
    rotate.refreshFromPanel = () => {
      const current = transformRotation(written.dataInput.value);
      if (current !== null && current !== angle.dataInput.value) {
        angle.dataInput.value = current;
        angle.dataInput.showValue(current);
      }
    };
  } else {
    // Shown as 0deg, but the agent is told what the page had.
    angle.dataInput.dataset.previousValue = rotateValue;
  }
  rotate.append(angle.shell);

  // Flips keep the size factors and turn only their sign, so a scaled
  // element stays its size.
  const flip = typeField('Flip');
  const scale = hiddenInspectorInput('scale', String(values?.scale || 'none'));
  const tabs = document.createElement('span');
  tabs.className = 'inspector-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', 'Flip');
  const flips = [['flipX', 'Flip horizontal', 0], ['flipY', 'Flip vertical', 1]].map(([key, title, axis]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inspector-tab is-icon';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = inspectorIcon(TRANSFORM_ICON_PATHS[key]);
    button.addEventListener('click', () => {
      const factors = scaleFactors(scale.value);
      factors[axis] = factors[axis].startsWith('-') ? factors[axis].slice(1) : `-${factors[axis]}`;
      setInputValue(scale, scaleValue(factors));
      syncFlips();
    });
    tabs.append(button);
    return { button, axis };
  });
  const syncFlips = () => {
    const factors = scaleFactors(scale.value);
    flips.forEach(({ button, axis }) => button.setAttribute('aria-pressed', String(factors[axis].startsWith('-'))));
  };
  flip.classList.add('inspector-syncs');
  flip.refreshFromPanel = syncFlips;
  syncFlips();
  flip.append(tabs, scale);

  // The pivot does nothing until the element is turned, flipped or transformed.
  const origin = positionMatrixField('transformOrigin', String(values?.transformOrigin || 'center center'), 'pivot');
  const originCaption = document.createElement('span');
  originCaption.className = 'inspector-type-label';
  originCaption.textContent = 'Origin';
  origin.prepend(originCaption);
  const relevance = () => {
    const turned = !['none', '0deg', '0turn', '0rad', '0grad', '0'].includes(panelValue(origin, 'rotate', rotateValue).trim());
    const transformed = panelValue(origin, 'transform', transformValue).trim() !== 'none';
    const off = !turned && !transformed && panelValue(origin, 'scale', 'none') === 'none';
    origin.hidden = off;
    origin.dataset.irrelevant = String(off);
  };
  origin.classList.add('inspector-syncs');
  const refreshOrigin = origin.refreshFromPanel;
  origin.refreshFromPanel = () => {
    refreshOrigin?.();
    relevance();
  };
  relevance();
  return [rotate, flip, transform, origin];
}
