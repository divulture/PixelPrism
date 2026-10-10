// The Inspector’s fields, icons and units.

const INSPECTOR_FIELDS = {
  size: [['width', 'W', 'text'], ['height', 'H', 'text'], ['minWidth', 'Min W', 'text'], ['minHeight', 'Min H', 'text'], ['maxWidth', 'Max W', 'text'], ['maxHeight', 'Max H', 'text']],
  margin: [['marginTop', 'M top', 'number'], ['marginRight', 'M right', 'number'], ['marginBottom', 'M bottom', 'number'], ['marginLeft', 'M left', 'number']],
  padding: [['paddingTop', 'P top', 'number'], ['paddingRight', 'P right', 'number'], ['paddingBottom', 'P bottom', 'number'], ['paddingLeft', 'P left', 'number']],
  gap: [['rowGap', 'Gap row', 'number'], ['columnGap', 'Gap col', 'number']],
  component: [
    ['display', 'Display', 'select', true, null, [['block', 'Block'], ['flex', 'Flex'], ['grid', 'Grid']]],
    ['flexDirection', 'Direction', 'select', null, 'flex', [['row', 'Row'], ['column', 'Column'], ['row-reverse', 'Row reverse'], ['column-reverse', 'Column reverse']]],
    ['flexWrap', 'Wrap', 'select', null, 'flex', [['nowrap', 'No wrap'], ['wrap', 'Wrap'], ['wrap-reverse', 'Wrap reverse']]],
    ['justifyContent', 'Justify content', 'select', null, 'flex', [['flex-start', 'Start'], ['center', 'Center'], ['flex-end', 'End'], ['space-between', 'Space between'], ['space-around', 'Space around'], ['space-evenly', 'Space evenly']]],
    ['alignContent', 'Align content', 'select', null, 'flex', [['normal', 'Normal'], ['start', 'Start'], ['center', 'Center'], ['end', 'End'], ['space-between', 'Space between'], ['space-around', 'Space around'], ['stretch', 'Stretch']]],
    // Grid: track counts (templates behind the wrench), flow, item alignment.
    ['gridTracks', 'Grid', 'custom', true, 'grid'],
    ['gridAutoFlow', 'Direction', 'custom', true, 'grid'],
    ['gridAlign', 'Align', 'custom', true, 'grid'],
    ['columnGap', 'Gap', 'custom', true, 'flex-grid'],
    // Grid content alignment, folded away.
    ['gridMoreAlign', 'More alignment', 'custom', true, 'grid'],
    // How this element sits in a flex or grid parent; see childLayoutFields.
    ['childLayout', 'Child', 'custom'],
    ['width', 'W', 'text'], ['height', 'H', 'text'], ['minWidth', 'Min W', 'text'], ['minHeight', 'Min H', 'text'], ['maxWidth', 'Max W', 'text'], ['maxHeight', 'Max H', 'text'],
    // What happens to content that doesn't fit; see overflowField.
    ['overflow', 'Overflow', 'custom'],
    // Behind Dimensions' More options; see aspectRatioField.
    ['aspectRatio', 'Ratio', 'custom'],
    ['marginTop', 'M top', 'number'], ['marginRight', 'M right', 'number'], ['marginBottom', 'M bottom', 'number'], ['marginLeft', 'M left', 'number'], ['paddingTop', 'P top', 'number'], ['paddingRight', 'P right', 'number'], ['paddingBottom', 'P bottom', 'number'], ['paddingLeft', 'P left', 'number'],
    // Position scheme, offsets and stacking; see positionFields.
    ['position', 'Position', 'custom'],
    ['backgroundColor', 'Background', 'text', true],
    // Picture settings for an img / video or a background image.
    ['imageSettings', 'Image', 'custom'],
    ['borderWidth', 'Border width', 'number'], ['borderColor', 'Border color', 'text'], ['borderStyle', 'Border style', 'select', true, null, [['none', 'None'], ['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']]], ['borderRadius', 'Radius', 'number'],
    // Weight also carries font-style; see fontWeightStyleControl.
    ['fontFamily', 'Font family', 'text', true], ['fontWeight', 'Weight', 'text'], ['fontSize', 'Size', 'number'],
    ['lineHeight', 'Line height', 'text'], ['letterSpacing', 'Letter spacing', 'text'],
    ['color', 'Text color', 'text'], ['opacity', 'Opacity', 'number'],
    ['textAlign', 'Align', 'select', true, null, [['start', 'Left'], ['center', 'Center'], ['end', 'Right'], ['justify', 'Justify']]],
    ['textDecorationLine', 'Decoration', 'select', true, null, [['none', 'None'], ['underline', 'Underline'], ['overline', 'Overline'], ['line-through', 'Strike']]],
    ['textTransform', 'Transform', 'select', true, null, [['none', 'None'], ['uppercase', 'Uppercase'], ['lowercase', 'Lowercase'], ['capitalize', 'Capitalize']]],
    ['fontStretch', 'Stretch', 'text'],
    ['wordSpacing', 'Word space', 'text'], ['textIndent', 'Indent', 'number'],
    // Fields built by TYPE_MORE_CONTROLS, in pairs for the two columns; Word
    // break brings Line break (white-space), and Stroke width its color.
    ['columnCount', 'Columns', 'custom'], ['direction', 'Direction', 'custom'], ['overflowWrap', 'Wrap', 'custom'], ['wordBreak', 'Word break', 'custom'],
    ['webkitTextStrokeWidth', 'Stroke', 'custom'], ['textOverflow', 'Truncate', 'custom'], ['textShadow', 'Text shadows', 'custom'],
    ['fontVariationSettings', 'Font variation', 'text', true], ['fontFeatureSettings', 'Font features', 'text', true],
    // A list of shadows; see shadowListField.
    ['boxShadow', 'Box shadows', 'custom'],
    ['filter', 'Filters', 'custom'],
    // The same list, for what shows through from behind the element.
    ['backdropFilter', 'Backdrop filters', 'custom'],
    ['cursor', 'Cursor', 'custom']
  ],
  typography: [['fontFamily', 'Font family', 'text', true], ['fontStyle', 'Style', 'text'], ['fontSize', 'Size', 'number'], ['fontWeight', 'Weight', 'number'], ['fontStretch', 'Stretch', 'text'], ['lineHeight', 'Line height', 'text'], ['letterSpacing', 'Letter spacing', 'text'], ['wordSpacing', 'Word space', 'text'], ['textTransform', 'Transform', 'text'], ['textDecorationLine', 'Decoration', 'text'], ['textAlign', 'Align', 'text'], ['textIndent', 'Indent', 'number'], ['fontVariationSettings', 'Font variation', 'text', true], ['fontFeatureSettings', 'Font features', 'text', true], ['width', 'W', 'text'], ['height', 'H', 'text'], ['minWidth', 'Min W', 'text'], ['minHeight', 'Min H', 'text'], ['maxWidth', 'Max W', 'text'], ['maxHeight', 'Max H', 'text'], ['marginTop', 'M top', 'number'], ['marginRight', 'M right', 'number'], ['marginBottom', 'M bottom', 'number'], ['marginLeft', 'M left', 'number'], ['paddingTop', 'P top', 'number'], ['paddingRight', 'P right', 'number'], ['paddingBottom', 'P bottom', 'number'], ['paddingLeft', 'P left', 'number']]
};

// Typography fields whose value or tabs say what they are; their label is
// kept for screen readers and the hover title only.
const UNLABELED_FIELDS = new Set(['fontFamily', 'fontWeight', 'fontSize', 'textAlign', 'textDecorationLine', 'textTransform', 'color', 'opacity', 'borderWidth', 'borderColor', 'borderStyle', 'backgroundColor', 'display']);

// Fields shown as tabs instead of a dropdown.
const INSPECTOR_TAB_FIELDS = new Set(['display', 'textAlign', 'textDecorationLine', 'textTransform', 'borderStyle']);

// 16px line icons: tab faces for text alignment, and prefixes that tell the
// label-less line height, letter spacing, opacity and border width inputs apart.
const INSPECTOR_ICON_PATHS = {
  textAlign: {
    start: 'M2 4h12M2 8h8M2 12h10',
    center: 'M2 4h12M4 8h8M3 12h10',
    end: 'M2 4h12M6 8h8M4 12h10',
    justify: 'M2 4h12M2 8h12M2 12h12'
  },
  // None stays a word; the other border styles draw their line.
  borderStyle: {
    solid: 'M2 8h12',
    dashed: 'M2 8h3M6.5 8h3M11 8h3',
    dotted: 'M2 8h.01M5 8h.01M8 8h.01M11 8h.01M14 8h.01',
    double: 'M2 6h12M2 10h12'
  },
  // One line of items, and items wrapping onto a next line; flexFlowIcon
  // turns them for each direction.
  flexFlow: {
    line: 'M2.5 8h11M10 4.5 13.5 8 10 11.5',
    wrap: 'M2.5 4h11L2.5 12h11M11 9.5 13.5 12 11 14.5'
  },
  check: 'M3.5 8.5 6.5 11.5 12.5 4.5',
  // Overflow tabs: an eye (open or crossed out), a crop frame, and lines
  // scrolling down.
  overflow: {
    visible: 'M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8zM8 6a2 2 0 1 0 0 4A2 2 0 0 0 8 6z',
    hidden: 'M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8zM8 6a2 2 0 1 0 0 4A2 2 0 0 0 8 6zM2.5 2.5l11 11',
    clip: 'M4.5 1.5v10h10M1.5 4.5h10v10',
    scroll: 'M2.5 4h7M2.5 8h7M2.5 12h7M12.5 3.5v9M10.5 10.5l2 2 2-2'
  },
  // More type options: two columns of text, and a paragraph mark with the
  // way text runs.
  type: {
    columns: 'M2.5 3.5h4.5M2.5 6.5h4.5M2.5 9.5h4.5M2.5 12.5h4.5M9 3.5h4.5M9 6.5h4.5M9 9.5h4.5M9 12.5h3',
    ltr: 'M7 2.5v7M10 2.5v7M11.5 2.5h-5a2.25 2.25 0 0 0 0 4.5H7M2.5 13h11M11.5 11l2 2-2 2',
    rtl: 'M7 2.5v7M10 2.5v7M11.5 2.5h-5a2.25 2.25 0 0 0 0 4.5H7M13.5 13h-11M4.5 11l-2 2 2 2',
    add: 'M8 3v10M3 8h10',
    remove: 'M3 8h10'
  },
  // Sliders: each border side set on its own.
  borderSides: {
    custom: 'M2.5 5h6M11.5 5h2M2.5 11h2M7.5 11h6M10 3.5v3M6 9.5v3'
  },
  // Chevrons apart and together, for the panel menu's Expand / Collapse all.
  sections: {
    expand: 'M5 6l3-3 3 3M5 10l3 3 3-3',
    collapse: 'M5 3l3 3 3-3M5 13l3-3 3 3',
    // A viewfinder around one point.
    focus: 'M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M8 6.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5z'
  },
  // A variable: apply one to a plain field, or detach it (a broken link).
  variable: {
    apply: 'M8 1.75 13.4 4.9v6.2L8 14.25 2.6 11.1V4.9zM8 6.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5z',
    detach: 'M9.5 4.5l1-1a2.12 2.12 0 0 1 3 3l-1 1M6.5 11.5l-1 1a2.12 2.12 0 0 1-3-3l1-1M2.5 2.5l11 11'
  },
  // A rounded box and its single corners.
  radius: {
    all: 'M6 2.5h4A3.5 3.5 0 0 1 13.5 6v4a3.5 3.5 0 0 1-3.5 3.5H6A3.5 3.5 0 0 1 2.5 10V6A3.5 3.5 0 0 1 6 2.5z',
    TopLeft: 'M3 13V7a4 4 0 0 1 4-4h6',
    TopRight: 'M3 3h6a4 4 0 0 1 4 4v6',
    BottomRight: 'M13 3v6a4 4 0 0 1-4 4H3',
    BottomLeft: 'M13 13H7a4 4 0 0 1-4-4V3'
  },
  lineHeight: 'M3 2.5v11M1.75 2.5h2.5M1.75 13.5h2.5M7 13l3.25-9.5L13.5 13M8.1 10h4.3',
  letterSpacing: 'M5 10.5 8 2.5l3 8M6 8h4M2 13.5h12M3.5 12 2 13.5 3.5 15M12.5 12l1.5 1.5-1.5 1.5',
  // Lines of growing weight.
  borderWidth: 'M2 3h12M2 6.5h12V8H2zM2 11h12v3H2z',
  opacity: 'M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8zM8 6a2 2 0 1 0 0 4A2 2 0 0 0 8 6z',
  // A box with the edge (or edges) a spacing field sets.
  spacing: {
    x: 'M2.5 3v10M13.5 3v10M6 6h4v4H6z',
    y: 'M3 2.5h10M3 13.5h10M6 6h4v4H6z',
    Left: 'M2.5 3v10M6 6h4v4H6z',
    Right: 'M13.5 3v10M6 6h4v4H6z',
    Top: 'M3 2.5h10M6 6h4v4H6z',
    Bottom: 'M3 13.5h10M6 6h4v4H6z',
    sides: 'M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M6 6h4v4H6z'
  }
};
const inspectorIcon = (path) => `<svg class="inspector-line-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="${path}"></path></svg>`;

// Inspector sections the user folded, by name; kept while switching elements.
const collapsedInspectorGroups = new Set();
// Focus mode keeps one section open: opening another folds the rest.
const INSPECTOR_FOCUS_KEY = 'pixelprism-inspector-focus';
let inspectorFocusMode = false;
try { inspectorFocusMode = localStorage.getItem(INSPECTOR_FOCUS_KEY) === 'true'; } catch { /* Off by default. */ }
// Margin / padding the user split into four sides; kept while switching elements.
const expandedSpacingControls = new Set();
// Same for the radius split into four corners.
let radiusCornersOpen = false;
// Properties the user changed, per preview and selector, so the marks survive
// the panel being rebuilt.
const changedInspectorProperties = new Map();
let inspectorChangeKey = '';
// The element the panel edits, in the terms changes are logged by.
let inspectorChangeTarget;
// Rarely used typography fields wait behind "More options"; the first one
// places the toggle.
const MORE_OPTIONS_FIELDS = new Set(['aspectRatio', 'fontStretch', 'wordSpacing', 'textIndent', 'columnCount', 'direction', 'wordBreak', 'overflowWrap', 'textOverflow', 'webkitTextStrokeWidth', 'textShadow', 'fontVariationSettings', 'fontFeatureSettings']);
// Sections whose More options the user opened; kept while switching elements.
const openMoreOptions = new Set();

const CSS_LENGTH_FIELDS = new Set([
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'rowGap', 'columnGap', 'borderWidth', 'borderRadius', 'flexBasis',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'top', 'right', 'bottom', 'left',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontSize', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textIndent', 'webkitTextStrokeWidth'
]);
const COLOR_FIELDS = new Set(['backgroundColor', 'color', 'borderColor']);

// The unit sits at the end of the field as its own select, the way the weight
// name does: "2" + "em". A hidden input carries the joined CSS value through
// the usual pipeline; values that aren't number + unit (var(), calc(),
// normal) stay whole in the field and the unit select steps aside.
const LENGTH_UNITS = ['px', 'pt', 'em', 'rem', 'ch', 'ex', 'vw', 'vh', 'vmin', 'vmax', 'svh', 'lvh', 'dvh'];
// Line height also takes a bare multiplier of the font size ("1.5") and %.
const LINE_HEIGHT_UNITS = ['', '%', ...LENGTH_UNITS];
// Sizes are often a share of the parent as well.
const SIZE_UNITS = ['px', '%', ...LENGTH_UNITS.slice(1)];
