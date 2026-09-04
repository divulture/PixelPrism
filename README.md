# PixelPrism

**Design review for the site you are building.** Open your project on `localhost`, staging, a preview deployment or in production, check it at every breakpoint at once, comment on the real interface, including hover states, open menus and tabs, and hand the fixes to developers or AI coding agents.

PixelPrism is a Chrome extension for:

- **Designers** reviewing what was actually built, without screenshots, DevTools and a separate comment tool.
- **People building with AI** (Cursor, Claude Code, Codex, Lovable, Bolt, v0) who need to tell the agent exactly what to fix: which element, at which size, in which state, and with which CSS values.

Everything runs locally in your browser. There is no account and no server, and nothing leaves your machine unless you export it.

## How it works

1. **Open** a page from the PixelPrism icon. It loads side by side at several sizes.
2. **Review**: click through the page once and every size follows. Comment on any element, including an item in an open menu, an inactive tab or a hover state. Adjust spacing and sizes visually to show the change you want.
3. **Hand off**: copy a structured review for an AI agent, or export an HTML or PDF design review with screenshots, numbered markers and before/after CSS.

## Install

PixelPrism is not in the Chrome Web Store yet. Load it from source:

1. Clone the repository or download its archive.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Open a website and click the PixelPrism icon, or right-click the page and choose the PixelPrism action.

To preview local HTML files (`file:///…`), open the extension's details page in `chrome://extensions` and enable **Allow access to file URLs**.

## Features

### Viewports and presets

- Previews open at Phone (390), Phone L (568), Tablet (768), Laptop (1024) and Desktop (1440) by default. `+` adds HD, Full HD, QHD, 4K or a custom size.
- **Presets** switch the whole set in one click: Device lab, Most used sizes, iOS, Android, and the Bootstrap 5, Material UI, Tailwind CSS and Bulma breakpoints.
- **Site breakpoints** reads the page's own CSS, including files on other domains and `@import`, and opens one preview per range of styles, such as "768–1023" or "1280+".
- One zoom level for all previews, a separate height for each, and a single-viewport mode with free width resizing that shows the nearest breakpoint.

### Mirrored clicks

A click in one preview is repeated in the others, so a menu, tab or accordion opened at one size opens at every size. Links to other pages open in every preview. Buttons that read like Delete, Save, Submit, Send or Pay are never repeated.

### Inspector and states

- Select an element to see its size, position, selector, margins, padding and gap. Edit width, height, spacing and gaps; changes apply to the preview at once.
- **State** shows the element as **Hover**, **Focus** or **Pressed** and keeps it there while you edit. Edits go to the state's rule (`.button:hover`), and a blue dot marks a state with edits. It works with states drawn by scripts too, such as Framer and React's `onMouseEnter`. A press is always cancelled, so it never submits anything.
- Edits are saved in the browser per site and per preset, and survive closing Studio. A blue dot on a preset marks its edits; clicking the dot resets them. An edit leaves the list when you reset it or when the site already shows the new value.

### Comments

- Leave a comment on the page or on an element. While the Comments panel is open, each comment is a numbered marker on its element in the matching preview.
- Drag a marker to move it within its element, onto another element (hold Alt for the exact element under the pointer), or onto the background to pin a point. **Reattach comment** in the `⋯` menu does the same with a click.
- If an element can't be found later, the marker stays where the element was. The list shows whether each comment was found, is hidden or lost its element.
- Comments are grouped by page and size. Clicking a comment from another page or preset opens it there.
- Exported HTML reviews can be imported back from the `⋯` menu next to **Pending notes**.

### Tabs, menus and popups

- PixelPrism remembers the tabs, accordions and filters you switch and the popups you open (dialogs, drawers, menus, dropdowns). A comment or an edit keeps that view: a comment on another tab shows “In ‹tab›”, and clicking it switches the preview there.
- A comment left after typing, scrolling a container or opening a hover menu keeps a copy of the page as you saw it, so the review shows exactly that screen.
- Reviews replay views by pressing the recorded controls and checking that each popup opened. Only view switches are replayed: submit buttons, links and controls like Delete or Save never are, so a replay cannot change data.
- While you pick elements with the Inspector or Comments, clicks don't reach the page, so an open menu stays open.

### Measuring and structure

- **Layout grid** (`Shift+G`): a map of content, padding and gaps with their values.
- **Grid overlay** (`Shift+C`): Figma-style column or row grids per card, with count, colour, Stretch or fixed width, margin and gutter. Each card size keeps its own settings.
- **Rulers and guides** (`Shift+R`): drag from a ruler to add a guide, drag it back to remove it.
- **Layers** (`L`): the DOM tree of the active preview.
- **Code** (`E`): the live HTML as a tree and every stylesheet, formatted. Media queries that apply to the current preview are opened, and the selected element's rules are highlighted.

Grids, rulers, guides and the Code panel are never included in screenshots, reports or reviews.

### Screenshots

The camera menu in a card saves a PNG at that card's size: the **visible area**, the **full page** (up to 16,384 px tall, with an optional 5 or 10 s delay for late content), or a single **element**, captured in its tab, menu or state. Screenshots show the live site without your unsaved CSS edits.

### Handoff

From the menu in the lower-right corner:

- **Agent → Copy review** copies a structured list of comments and CSS changes for an AI agent; **Export MD** saves it as Markdown.
- **Design review → Export HTML** saves one self-contained file: a screenshot per page, size and view, numbered markers, comments that can be checked off, and before/after CSS. Screenshots are viewport-sized, so comments further down a page get their own screen.
- **Design review → Export PDF** creates a PDF from the same screens, with a sidebar outline and clickable links.
- For local HTML files, the save button in a card writes the CSS changes into the file you choose.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `V` | Cursor |
| `I` | Inspector |
| `C` | Comments |
| `L` | Layers |
| `E` | Code |
| `Shift+R` | Rulers on all cards |
| `Shift+G` | Layout grid on all cards |
| `Shift+C` | Grid overlay on all cards |

The `?` button next to the zoom control lists them in the app. The moon button next to it switches Studio to a dark theme; previews keep the site's own colours.

## Limitations

- **Sites that block embedding.** Previews are `iframe`s, so a page sent with `X-Frame-Options` or the CSP `frame-ancestors` directive cannot be shown. Most production sites can be opened, but some, such as x.com and linkedin.com, send these headers. Local dev servers and most staging sites do not. If your project sends them, turn them off for development and staging.
- **Native select lists.** The open list of a native `<select>` is drawn by the browser outside the page and cannot be captured. A comment on it stays on the select.
- **Debugger notice.** Screenshots and design reviews use Chrome's debugger in a temporary tab, so Chrome briefly shows its "started debugging this browser" bar.
- **Edits stay in PixelPrism.** CSS edits are previews. They reach your code through the agent report, the design review, or the save button for local HTML files.

## Privacy and permissions

No backend, no analytics, and no external document service. Comments, edits and page copies are stored in your browser. Reviews and reports are built locally inside Chrome.

| Permission | Why |
|---|---|
| `activeTab`, `tabs` | Read the current tab's URL and open it in PixelPrism |
| `contextMenus` | The right-click action that opens a page in PixelPrism |
| `downloads` | Save screenshots, reports and reviews |
| `debugger` | Capture screenshots and reviews at an exact viewport size |
| Access to `http`, `https` and `file` URLs | Load pages in previews and read their stylesheets |

## Development

There is no build step: PixelPrism is plain HTML, CSS and JavaScript (Manifest V3). After changing files, reload the extension on `chrome://extensions` and refresh the PixelPrism tab.

```text
manifest.json        Manifest V3 configuration
background.js        Service worker: opens Studio, screenshots, reviews, downloads
studio.html          Studio interface
studio.js            Viewports, Inspector, comments, handoff and export
studio.css           Studio styles, light and dark themes
theme.js             Applies the saved theme before Studio paints
inspector.js         Content script that runs inside previewed pages
review-viewer.html   Template for the exported HTML design review
phosphor-icons.js    Interface icons (Phosphor Icons, MIT)
icons/, fonts/       Extension icons and local interface fonts
```

## License

PixelPrism is released under the [MIT License](LICENSE).
