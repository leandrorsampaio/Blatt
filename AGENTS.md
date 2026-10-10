# Blatt - Project Context

## What is this?

**Blatt** (German for "sheet/page") is a **self-hosted, single-file CV/resume system** that renders a professional A4 CV from structured Markdown data. The entire application lives in one HTML file (`cv.html`) that can be opened directly in a browser -- no server, no build step, no dependencies to install.

## Target Audience

**Non-developers.** The primary distribution model is: user downloads a zip, extracts it, and opens `cv.html` in a browser. Everything must work out of the box with zero setup. UI and UX decisions should always prioritize simplicity for people who are not technical.

## Project Structure

```
cv.html              ← The product: open this in a browser (HTML + CSS + JS)
AGENTS.md            ← This file (project context for AI assistants)
README.md            ← Public documentation
LICENSE              ← MIT
docs/                ← Marketing site (GitHub Pages) + sample CV PDF
src/
  cv-data.md         ← Source CV content in structured Markdown
  cv-template.md     ← Blank template showing the Markdown format
  assets/
    photo.jpeg       ← Profile photo
    Google_Shape_*.jpeg ← Decorative/logo assets
  server/            ← Optional self-hosting server (see "Server mode")
    core.mjs         ← Platform-neutral server: Google sign-in, sessions, data API
    node/            ← Node adapter (file storage) + Dockerfile
    cloudflare/      ← Workers adapter (D1 storage) + wrangler.toml
    test/            ← node --test src/server/test/server.test.mjs
    README.md        ← Self-hosting guide (end-user facing)
```

**Root rule:** Keep the root lean — the product (`cv.html`), the standard OSS files (`README.md`, `LICENSE`, `AGENTS.md`), and the `docs/` + `src/` folders (plus git/config dotfiles). Everything else belongs inside `src/` or `docs/`.

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
| Photo | One stored photo: crop stage, B&W, `renderPhoto()` | `photo`, `photoImg` |
| ATS | PDF properties per CV version, `cvMeta()`, language detection, checks, job ad match, reading-order preview | `atsReading` |
| Presets | Format presets + content presets (localStorage CRUD) | -- |
| PDF | `confirmDownload()` via html2pdf.js | -- |
| UI | Tab switching, fit-to-screen, page nav, modals, keyboard shortcuts | `fitted`, `showingTemplate`, `currentPage` |
| Auto-save | Debounced save to localStorage (1.5s) | `autoSaveTimer` |
| Server sync | Mirrors all `cv-*` localStorage keys to a Blatt server, only when one answers `api/data` | `state.sync` |

### How it works

1. **Markdown parser** (`parseMD()`) reads structured MD into a data object with header, sidebar sections, and main sections
2. **Renderers** convert parsed data into HTML for a pixel-perfect A4 layout
3. **Five tabs**: Preview (live A4 page), Editor (form-based editing), Photo, ATS, Configuration
4. **Format panel** (left sidebar): Real-time CSS variable controls for colors, fonts, spacing, layout
5. **Preset system**: Save/load/import/export both format presets and content presets (localStorage)
6. **PDF export**: Image PDF via an inline copy of html2pdf.js, plus an ATS-friendly export via the browser print dialog

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
- **Photo**: one photo per browser, page 1 only, in two placements (square in the sidebar, circle in the header corner)

## Photo

Blatt stores exactly one photo, under the `cv-photo` localStorage key, shared by
every CV version (a Blatt backup export carries it along). The record holds two
data URLs: `original` (the upload, downscaled to a 900px long edge) and `image`
(the framed 1:1 result actually painted on the CV).

Framing and black & white are **baked into `image` through a canvas**, not applied
as CSS filters -- the PDF exporter rasterises the page with html2canvas, which does
not reproduce CSS filters reliably. For the same reason the photo is painted as a
`background-image` on a div rather than an `<img>` with `object-fit`.

The image is always square; each placement crops it further with `background-size:
cover` centred, which is what makes the size slider crop evenly from the edges.
Placement, size, border and border width live in `FORMAT_SCHEMA` (group `Photo`)
and therefore travel with a **design** preset, not with the content. Keys listed in
`PHOTO_FORMAT_KEYS` change the CV structurally and re-run `renderPhoto()` rather
than setting a CSS variable.

## ATS (PDF properties and machine-readability)

The ATS tab sets what a PDF says about itself -- title, language, author, subject,
keywords -- plus the download file name. Only what the user typed is stored, per CV
version, under the `cv-content-meta` key (version name -> fields, like
`cv-content-designs`; the pasted job ad and its ignored terms live there too); an empty field follows the CV (`cvMeta()` derives title, author,
subject and file name from the header and guesses the language from common short
words). Saving a version under a new name, deleting, resetting Default, and the Blatt
backup export/import all carry or drop the entry.

The two exports differ in what they can carry. The **Text PDF** comes out of the
browser's print dialog: only `<title>` (PDF Title, and usually the suggested file name)
and `<html lang>` (PDF `/Lang`) reach it, and Chrome tags the structure from the HTML.
The **Image PDF** is written by jsPDF, so `applyPdfProperties()` sets every property,
the language and `DisplayDocTitle` -- but its text is a picture no ATS can read. The
app's own `<html lang>` is `en` (the UI language); the CV language goes on `#viewport`
and `#editor-view`.

The reading-order preview lays a copy of the rendered pages out off-screen and measures
where each run of words lands, then shows two orders: **column by column** (DOM order,
which is the order Chrome writes the text into the Text PDF) and **straight across** (each
line over the full width, as simple parsers and `pdftotext -layout` read it). Check
changes to it against a real Text PDF with `pdftotext -raw` and `pdftotext -layout`.

`printCV(true)` exports the **one-column Text PDF**: the same page clones and styles, with
`oneColumnPrintCss()` stacking the sidebar above the main column, letting the pages flow
(page margins move to `@page`) and hiding the extra-page headers and the side bar.

**Job ad match** runs fully offline. `jobKeyTerms()` drops benefits and company sections
by their headings, splits the rest at punctuation, stop words (grammar and job-ad
boilerplate in seven languages) and verbs that open a bullet, then ranks the remaining
words and phrases of up to three words by frequency and by whether they look like a tool,
acronym or name. German capitalises every noun, so there only capitalised words are kept.
`matchJobTerms()` compares crude stems (`stemWord()`) against the CV text: found, words
apart, or missing.

## Server mode (optional self-hosting)

The same `cv.html` can be served by the server in `src/server/`: one person, behind a
Google sign-in, with their data synced across devices. Served as a file or from plain
static hosting, nothing changes -- the sync code stays inert.

**Server (`src/server/core.mjs`):** zero dependencies, Web-standard APIs only (Request/
Response, fetch, WebCrypto), so it runs on Cloudflare Workers, Node 20+, Deno, Bun.
Adapters supply only storage (`get()` / compare-and-swap `put(baseRev, rec)`) and the
`cv.html` text. Sign-in is Google OAuth (authorization code + PKCE) for exactly one
`ALLOWED_EMAIL`; the session is an HMAC-signed HttpOnly cookie. Everything -- the app page
included -- requires the session. `PUT api/data` additionally requires the
`X-Blatt-Sync: 1` header (CSRF). Run the tests after any change to it.

**Client (SERVER SYNC section of `cv.html`):** localStorage stays the working copy. The
synced unit is a snapshot of every localStorage key starting with `cv-`, so **new
persistent state must use a `cv-` key to sync, and UI-only state must not**. The
`blatt-sync` key holds `{ rev, hash }` of the last state agreed with the server.
`syncPoll()` checks every 3s and pushes once changes settle; `syncReconcile()` decides
push / pull / conflict (identical content on both sides is never a conflict); pulling
replaces the `cv-*` keys and reloads the page rather than re-initialising in place.
Pending debounced writes (auto-save, photo framing) are flushed before any sync decision
via `syncFlushPending()` -- a new debounced writer of `cv-*` keys must be added there and
cancelled in `syncApply()`. A `storage` event from another tab reloads this one, so a
stale tab never auto-saves over newer data. Signing out clears the `cv-*` keys.

## CSS Variable System

All visual formatting is controlled via CSS custom properties on `:root`:
- **Colors**: `--color-black`, `--color-blue`, `--color-grey`
- **UI colors**: `--ui-bg`, `--ui-blue-hover`, `--ui-grey-light`, `--ui-border`, `--ui-hover`
- **Font sizes**: `--fs-name`, `--fs-body`, `--fs-detail`, etc.
- **Spacing**: `--page-margin`, `--col-gap`, `--section-gap`, `--entry-gap`, `--line-gap`
- **Layout**: `--sidebar-width`, `--bar-width`

## Known Technical Debt

These are not bugs -- the app works well -- but they'll need attention as features grow:

1. **Single-file monolith (~7400 lines)**: CSS, HTML, and JS all in one file. Hard to navigate. Plan: split into separate files under `src/` with a build script that concatenates them back into the single distributable `cv.html`.
2. **Global state**: ~10 global variables manage app state. Plan: consolidate into a single `state` object.
3. **Full editor re-render on every change**: `renderEditor()` rebuilds entire DOM via `innerHTML`, losing cursor position. Plan: targeted DOM updates.
4. **HTML string concatenation**: Both renderer and editor build HTML via `html +=`. Works but fragile at scale.
5. **No tests**: Parser and renderer have no test coverage (the optional server in `src/server/` does).

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

### Done: Self-hosting (single user)
- `src/server/`: the same `cv.html` behind a Google sign-in on Cloudflare Workers, Docker or Node, synced across devices (see "Server mode")

### Distant future: Hosted web app
- A multi-user hosted service (per-user storage, sign-up) built on the same data API
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
- No runtime network access: the Open Sans font and html2pdf.js are embedded inline in `cv.html`
- The embedded Open Sans must stay **static** instances (one file per weight/style), never the Google Fonts variable font: Chrome's print-to-PDF embeds variable fonts as Type 3, which ATS parsers and upload virus scanners handle badly. Check with `pdffonts` -- the text PDF should list `CID TrueType`, not `Type 3`
- All state is in localStorage -- no backend required (the optional server in `src/server/` only mirrors it)
- The server has no package.json and no npm dependencies; only Cloudflare deployers use `npx wrangler`
- Target: all modern browsers (Chrome, Firefox, Safari, Edge)
- The `.claude/settings.local.json` allows bash commands for: `brew`, `python3`, `pip3`, `pdftotext`
