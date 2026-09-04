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
- Hand off accumulated changes by downloading a Markdown report or copying structured context with **Copy for Codex**.
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
   - **Download .md** saves a Markdown report;
   - **Copy for Codex** copies a structured set of changes for Codex;
   - the save button in a viewport card is available for local HTML files and writes the generated CSS block to the chosen file.

Keyboard shortcuts: `V` cursor, `I` Inspector, `C` Comments, `L` Layers.

## Local files

PixelPrism supports `file:///…` URLs and absolute paths to HTML files. Open the extension's details page in `chrome://extensions` and enable **Allow access to file URLs**.

The first time you save changes, Chrome asks you to select the source `.html` file. This is required for both `file://` pages and pages served locally, such as from `localhost`.

## Limitations

Previews use an `iframe`. Websites that block embedding with `X-Frame-Options` or the `frame-ancestors` CSP directive cannot be opened inside PixelPrism. This is controlled by the website; open the page in a separate tab instead.

Visual CSS edits remain in the studio until you export them, copy them for Codex, or apply them to the selected local HTML file.

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
