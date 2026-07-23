# Blatt - Project Context

## What is this?

**Blatt** (German for "sheet/page") is a **self-hosted, single-file CV/resume system** that renders a professional A4 CV from structured Markdown data. The entire application lives in one HTML file (`cv.html`) that can be opened directly in a browser -- no server, no build step, no dependencies to install.

## Target Audience

**Non-developers.** The primary distribution model is: user downloads a zip, extracts it, and opens `cv.html` in a browser. Everything must work out of the box with zero setup. UI and UX decisions should always prioritize simplicity for people who are not technical.

## Project Structure

```
cv.html              ← The product: open this in a browser (HTML + CSS + JS, ~3000 lines)
CLAUDE.md            ← This file (project context for AI assistants)
src/
  cv-data.md         ← Source CV content in structured Markdown
  cv-template.md     ← Blank template showing the Markdown format
  assets/
    photo.jpeg       ← Profile photo
    Google_Shape_*.jpeg ← Decorative/logo assets
```

**Root rule:** The project root should only contain `cv.html`, `CLAUDE.md`, and the `src/` folder (plus git/config dotfiles). All other files go inside `src/`.

## Architecture

### Single-file design

`cv.html` contains everything:
- **CSS** (~1400 lines): A4 page layout, sidebar/main columns, format panel, editor UI, print styles
- **HTML** (~300 lines): Page structure, format panel, editor view, modals (download, presets, confirm)
- **JavaScript** (~1300 lines): Markdown parser, renderers, editor, format controls, preset system, PDF export
- **Embedded data**: The CV content and template are embedded as `<script type="text/plain">` blocks

### JS modules (all in one `<script>`, organized by concern)

| Module | Responsibility | Key globals |
|---|---|---|
| Parser | `parseMD()` -- structured MD to data object | -- |
| Renderer | `renderCV()`, `renderHeader()`, `renderSidebarSection()`, `renderMainSection()` | `currentMD`, `currentName` |
| Editor | `buildEditor()`, `renderEditor()`, `editorToMD()` + all editor helpers | `editorData`, `editorDirty` |
| Format | `FORMAT_SCHEMA`, `applyFormat()`, `buildDrawerUI()`, format change handlers | `currentFormat` |
| Presets | Format presets + content presets (localStorage CRUD) | -- |
| PDF | `confirmDownload()` via html2pdf.js | -- |
| UI | Tab switching, fit-to-screen, page nav, modals, keyboard shortcuts | `fitted`, `showingTemplate`, `currentPage` |
| Auto-save | Debounced save to localStorage (1.5s) | `autoSaveTimer` |

### How it works

1. **Markdown parser** (`parseMD()`) reads structured MD into a data object with header, sidebar sections, and main sections
2. **Renderers** convert parsed data into HTML for a pixel-perfect A4 layout
3. **Two views**: Preview (live A4 page) and Editor (form-based editing)
4. **Format panel** (left sidebar): Real-time CSS variable controls for colors, fonts, spacing, layout
5. **Preset system**: Save/load/import/export both format presets and content presets (localStorage)
6. **PDF export**: Uses html2pdf.js (CDN) via browser print dialog

## Markdown Format

The CV content uses a custom structured Markdown dialect:

```markdown
# Name (Degree)
> Subtitle / Job Title

## sidebar: Section Title     <- sidebar sections
- :pin: Address               <- icon items (:pin:, :phone:, :email:)
- [link](url)                 <- link items
- Plain bullet                <- bullet items
Paragraph text                <- profile/description text

## main: Section Title        <- main content sections
### Organization | Department <- entry with org name
Title: Job Title              <- key-value fields
Date: MM/YYYY - MM/YYYY
Topics: ...
Tasks: ...

### (same)                    <- subsequent role at same org
Title: Previous Role
Date: ...
```

**Special keys** recognized for main entries: `Title`, `Date`, `Grade`, `Detail`. All other keys are rendered as labeled detail lines.

## Key Features

- **Live preview**: Changes in the editor or format panel update the A4 preview instantly
- **Multi-page support**: Content that overflows page 1 flows to additional pages with headers
- **Format presets**: Save/load complete formatting configurations (colors, spacing, fonts)
- **Content presets**: Save/load different CV versions (e.g., English, German, Short)
- **Fit-to-screen**: Toggle to scale the A4 page to fit the browser window
- **Template toggle**: Switch between real data and the blank template
- **Auto-save**: Debounced auto-save to localStorage (1.5s delay)
- **Keyboard shortcuts**: Ctrl+S (save), Ctrl+P (download PDF)
- **Print-optimized**: `@media print` rules hide UI and show all pages

## CSS Variable System

All visual formatting is controlled via CSS custom properties on `:root`:
- **Colors**: `--color-black`, `--color-blue`, `--color-grey`
- **UI colors**: `--ui-bg`, `--ui-blue-hover`, `--ui-grey-light`, `--ui-border`, `--ui-hover`
- **Font sizes**: `--fs-name`, `--fs-body`, `--fs-detail`, etc.
- **Spacing**: `--page-margin`, `--col-gap`, `--section-gap`, `--entry-gap`, `--line-gap`
- **Layout**: `--sidebar-width`, `--bar-width`

## Known Technical Debt

These are not bugs -- the app works well -- but they'll need attention as features grow:

1. **Single-file monolith (~3000 lines)**: CSS, HTML, and JS all in one file. Hard to navigate. Plan: split into separate files under `src/` with a build script that concatenates them back into the single distributable `cv.html`.
2. **Global state**: ~10 global variables manage app state. Plan: consolidate into a single `state` object.
3. **Full editor re-render on every change**: `renderEditor()` rebuilds entire DOM via `innerHTML`, losing cursor position. Plan: targeted DOM updates.
4. **HTML string concatenation**: Both renderer and editor build HTML via `html +=`. Works but fragile at scale.
5. **No tests**: Parser and renderer have no test coverage.

## Roadmap & Goals

### Current: Self-hosted HTML (v1)
- User downloads a zip, opens `cv.html` in a browser
- Zero setup, zero dependencies, works offline
- This is the primary distribution model and must always be supported

### Near-term: Build system
- Split `cv.html` into `src/css/`, `src/js/`, `src/html/` modules
- Simple build script (shell or Node) that produces the single distributable `cv.html`
- Enables proper development workflow without breaking the zip distribution model

### Medium-term: Desktop app via Tauri
- Wrap `cv.html` in a Tauri shell for native desktop distribution (macOS, Windows, Linux)
- Tauri chosen over Electron (much smaller binary ~5MB vs ~150MB) and Flutter (would require full rewrite)
- The app is already a web app, Tauri just provides a native window + system APIs
- Not intended for mobile -- desktop only

### Distant future: Web deployment
- Host the app online as a web app
- localStorage persistence maps naturally to a backend API
- Preset import/export JSON format can become the API payload
- Service worker for offline-first when hosted

## Language

The sample CV content ships with a fictional profile. The UI labels in the HTML are in English. The system is language-agnostic -- any language works in the Markdown content.

## How to Use

1. Open `cv.html` in a browser
2. Edit content via the Editor tab or modify `src/cv-data.md` and re-embed
3. Adjust formatting via the left Format panel
4. Download as PDF via the button or Ctrl+P

## Development Notes

- No build tools, bundlers, or package managers (yet -- see roadmap)
- Only external dependencies: Google Fonts (Open Sans) and html2pdf.js (CDN)
- All state is in localStorage -- no backend
- Target: all modern browsers (Chrome, Firefox, Safari, Edge)
- The `.claude/settings.local.json` allows bash commands for: `brew`, `python3`, `pip3`, `pdftotext`
