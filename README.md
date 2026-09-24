# PixelPrism

**PixelPrism** is a Chrome extension for visual responsive-design checks, element inspection, and quick handoff of UI changes to development. It opens one URL in multiple independent viewports, lets you measure the interface directly on the page, and capture CSS adjustments without switching between DevTools and device emulators.

## Features

- View a page simultaneously in Phone (390 px), Phone L (568 px), Tablet (768 px), Laptop (1024 px), and Desktop (1440 px) presets.
- Add custom viewports manually or choose HD, Full HD, QHD, and 4K presets.
- Set a shared zoom level for every preview and adjust each preview's height independently.
- Use a single-viewport mode with unlimited width resizing; the nearest breakpoint and device type are shown alongside it.
- Capture the visible area of a page in any viewport.
- **Inspector**: select an element and inspect its dimensions, coordinates, CSS selector, margins, padding, and container gap.
- Visually adjust the selected element's width, height, spacing, `row-gap`, and `column-gap`, with results applied immediately in the preview.
- **Layout grid**: a monochrome layout map that highlights content, padding, gaps, and their exact values.
- **Layers**: a DOM layer tree for the active preview.
- **Comments**: attach notes to a page or a specific element, linked to a viewport.
- **Comment markers**: while the Comments panel is open, every comment is shown as a numbered marker on its element in the matching preview (same page and width). The list shows whether each comment was found, is hidden, or lost its element. Drag a marker within its element to move the marker there, or onto another element to attach the comment to it (hold Alt to pick exactly the element under the pointer, such as a badge inside the current link); a drop on the page background pins the exact point. Or choose **Move comment** in the comment's `⋯` menu and click the right element. The same menu edits or deletes a comment. Every comment also keeps the element's position and size on the page; if the element cannot be found later, the marker (in the studio and in the exported review) is placed where it was, and the Markdown report lists the coordinates. Comments are grouped by page and viewport size in a fixed alphabetical order; the group shown in the previews is marked with an eye and expanded, the rest are collapsed. Clicking a comment from another page opens that page and scrolls to the comment. The `⋯` menu next to **Pending notes** imports an exported HTML review or deletes all comments.
- **Tabs, panels and popups**: the preview remembers the view switches you click on a page (tabs, segmented controls, filter lists, accordions) and the clicks that open a popup (dialogs, modals, drawers, menus, popovers). Closing a popup forgets its opening click and everything clicked inside it. Comments left before this was recorded learn their view on their own: when a comment's element was not shown and appears after you switch a tab or open a popup, the comment keeps those clicks. A comment keeps the switches made before it, so a comment left on another tab is shown as “In ‹tab›” instead of “Not found”; clicking it switches the preview to that tab. The HTML review clicks the same switches before capturing, with one screenshot per view (for example “1440 × 900 · Archive”). Only view switches are recorded—submit buttons, links to other pages and controls such as Delete or Save never are, so a replay cannot change data.
- Hand off accumulated changes by downloading a Markdown report or copying structured context with **Copy review**.
- Export a self-contained HTML design review: a page menu, one screenshot per page and viewport with numbered markers, and a comments panel grouped by viewport. Clicking a marker or a comment highlights its element; comments can be checked off as done, and the screenshot can be zoomed. Screenshots are viewport-sized: elements that fit on one screen share a screenshot, and comments further down the page get their own screens. They show the live site without your unsaved CSS edits. Everything is produced locally inside Chrome.
- Apply CSS changes to a local HTML file through the system file picker.
- Open the current page with one click from the extension icon or the **Open in PixelPrism** context-menu action.

## Install in Chrome

1. Clone the repository or download its archive.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository folder—the one containing `manifest.json`.
6. Open a website and click the PixelPrism icon in Chrome's toolbar.

After changing the code, click the extension's reload button on `chrome://extensions`.

## How to use it

1. Open a website and launch PixelPrism from the extension icon. The current tab's URL is filled in automatically.
2. Choose one or more device sizes from the top bar. Use `+` to add a custom size.
3. Change the zoom with `−` and `+`. Drag a card's bottom edge to change its height. In single-viewport mode, drag the right edge to test intermediate widths.
4. To inspect an element, enable **Inspector** (`I`), hover over the element, and click it. Use the right panel to edit available CSS properties; changes apply only to the preview.
5. Enable **Layout grid** in a preview card's header to see its spacing and container structure. Use **Layers** (`L`) for DOM navigation.
6. Add notes with **Comments** (`C`) when needed. They are included in the report with the selected element and viewport size.
7. Open the handoff menu in the lower-right corner:
   - **Agent → Export MD** saves a Markdown report;
   - **Agent → Copy review** copies a structured set of changes for Codex or another agent;
   - **Design review → Export PDF** creates one local PDF with contextual screenshots, highlighted targets, comments, and before/after change summaries;
   - **Design review → Export HTML** downloads one self-contained `.html` file with the screenshots, comments, and before/after CSS changes;
   - the save button in a viewport card is available for local HTML files and writes the generated CSS block to the chosen file.

Keyboard shortcuts: `V` cursor, `I` Inspector, `C` Comments, `L` Layers.

## Local files

PixelPrism supports `file:///…` URLs and absolute paths to HTML files. Open the extension's details page in `chrome://extensions` and enable **Allow access to file URLs**.

The first time you save changes, Chrome asks you to select the source `.html` file. This is required for both `file://` pages and pages served locally, such as from `localhost`.

## Limitations

Previews use an `iframe`. Websites that block embedding with `X-Frame-Options` or the `frame-ancestors` CSP directive cannot be opened inside PixelPrism. This is controlled by the website; open the page in a separate tab instead.

Visual CSS edits remain in the studio until you export them, copy them with **Copy review**, or apply them to the selected local HTML file. Design review generation does not call a backend or external document service.

## Permissions

The extension requests the following Chrome permissions:

- `activeTab`, `tabs` — retrieve the active tab's URL and open it in PixelPrism;
- `contextMenus` — add the context-menu action;
- `downloads` — save screenshots and Markdown reports;
- `debugger` — capture a viewport at a specified size;
- access to `http`, `https`, and `file` URLs — load pages in previews.

## Project structure

```text
manifest.json       Chrome Extension Manifest V3 configuration
background.js       Service worker: launch studio, screenshots, and downloads
studio.html         PixelPrism interface
studio.js           Viewport, Inspector, comments, and export logic
studio.css          Studio interface styles
inspector.js        Script executed inside previewed pages
icons/              Extension icons
fonts/              Local interface fonts
```

## Development

The project has no build step: it is a native HTML, CSS, and JavaScript extension. After changing files, reload the extension on `chrome://extensions`, then refresh the PixelPrism tab.

## License

PixelPrism is released under the [MIT License](LICENSE). You may use, copy, modify, distribute, sublicense, and sell copies of the software, provided that the copyright notice and license text are included in all copies or substantial portions of the software. The software is provided without warranty.
