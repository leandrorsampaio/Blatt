# Blatt - Project Context

## What is this?

**Blatt** (German for "sheet/page") is a **self-hosted, no-install CV/resume system** that renders a professional A4 CV from structured Markdown data. The application is `cv.html` plus the `app/` folder next to it (JavaScript, CSS, the embedded font and the PDF library). Opening `cv.html` straight from disk runs it -- no server, no build step, no dependencies to install.

## Target Audience

**Non-developers.** The primary distribution model is: user downloads a zip, extracts it, and opens `cv.html` in a browser. Everything must work out of the box with zero setup. UI and UX decisions should always prioritize simplicity for people who are not technical.

## Project Structure

```
cv.html              ← The product: open this in a browser (markup + embedded sample CV and template)
app/                 ← The rest of the product -- must stay next to cv.html
  css/               ← fonts.css (embedded Open Sans), cv.css (the printed A4 page), app.css (the app around it)
  js/                ← The app's code, one file per concern (see "JS files"), loaded in order by cv.html
  vendor/            ← html2pdf.bundle.min.js (lazy-loaded for the Image PDF)
AGENTS.md            ← This file (project context for AI assistants)
README.md            ← Public documentation
LICENSE              ← MIT
.assetsignore        ← What the Cloudflare self-hosting uploads (cv.html + app/ only)
docs/                ← Marketing site (GitHub Pages) + sample CV PDF
src/
  cv-data.md         ← Source CV content in structured Markdown
  cv-template.md     ← Blank template showing the Markdown format
  assets/
    photo.jpeg       ← Profile photo
    Google_Shape_*.jpeg ← Decorative/logo assets
  server/            ← Optional self-hosting server (see "Server mode")
    core.mjs         ← Platform-neutral server: Google sign-in, sessions, data API, app files
    node/            ← Node adapter (file storage) + Dockerfile
    cloudflare/      ← Workers adapter (D1 storage, static assets) + wrangler.toml
    test/            ← node --test src/server/test/server.test.mjs
    README.md        ← Self-hosting guide (end-user facing)
```

**Root rule:** Keep the root lean — the product (`cv.html` + `app/`), the standard OSS files (`README.md`, `LICENSE`, `AGENTS.md`), and the `docs/` + `src/` folders (plus git/config dotfiles). Everything else belongs inside `src/` or `docs/`.

## Architecture

### One page, one folder, no build

`cv.html` holds the page markup (format panel, tabs, editor, modals) and the sample CV and blank template as `<script type="text/plain">` blocks. It links three stylesheets and ~30 plain scripts from `app/`. There is no build step: the files in the repo are the files users run.

- **Plain `<script src>`, never ES modules.** Browsers refuse `type="module"` (and `fetch()`) on pages opened from disk, but load classic scripts and stylesheets from a folder next to the page. All scripts share one global scope, exactly like the single `<script>` they were split from.
- **Order matters.** cv.html loads the scripts in the order listed in its `<script src>` block; top-level code may only use what an earlier file defined. Event handlers registered at load (several `keydown` listeners) run in that order too. `boot.js` is last and starts the app.
- **Missing folder.** If `app/` is not next to cv.html (opened from inside a zip, or copied alone), the `.missing-app` notice in cv.html covers the page; `app/css/cv.css` hides it.
- **The print window** (Text PDF) gets the same stylesheets as links with absolute URLs and prints once they and the fonts have loaded (fonts only start loading at layout; printing earlier falls back to Helvetica).

### JS files (`app/js/`, in load order)

| File | Responsibility | Key globals |
|---|---|---|
| `state.js` | The `state` object: all mutable app state | `state` |
| `confirm.js`, `toast.js`, `save-indicator.js`, `link-modal.js` | Confirm dialog, toasts, dirty/clean indicator, link modal | -- |
| `autosave.js` | Debounced save to localStorage (1.5s) | `state.autoSaveTimer` |
| `format-feedback.js` | Pulse and hover highlight when format controls change | -- |
| `shortcuts.js` | Ctrl+S, Ctrl+P | -- |
| `helpers.js` | `esc()`, inline Markdown, links | -- |
| `parser.js` | `parseMD()` -- structured MD to data object | -- |
| `render.js` | `renderCV()`, `renderHeader()`, `renderSidebarSection()`, `renderMainSection()` | -- |
| `tabs.js` | Tab switching, format panel toggle | -- |
| `editor.js`, `editor-drag.js`, `editor-to-md.js` | Form editor, reordering (drag & drop, ▲▼ buttons on touch screens), `editorToMD()` | `state.editorData` |
| `content-presets.js` | CV versions (localStorage CRUD) | -- |
| `word.js` | Word template + import, Word CV export (`docxPackage()`) | -- |
| `text-export.js` | Plain-text CV | -- |
| `ats.js` | PDF properties per CV version, `cvMeta()`, language detection | -- |
| `pdf-text-layer.js` | `addTextLayer()`: invisible text over the Image PDF | -- |
| `ats-checks.js`, `ats-reading.js`, `ats-job.js` | ATS tab: checks, reading-order preview, job ad match | -- |
| `download.js` | Download modal, Text PDF (`printCV()`), Image PDF (`confirmDownload()`, loads `app/vendor/html2pdf`) | -- |
| `library.js` | Configuration (gear at the right of the tab bar): CV versions, designs, backups | -- |
| `view.js` | Fit to screen, page navigation, template toggle; phones: `isPhoneLayout()`, the CV card and full-screen CV | -- |
| `photo.js` | One stored photo: crop stage, B&W, `renderPhoto()` | -- |
| `format.js`, `format-presets.js` | `FORMAT_SCHEMA`, `applyFormat()`, format panel; design presets | -- |
| `sync.js` | Mirrors all `cv-*` localStorage keys to a Blatt server, only when one answers `api/data` | `state.sync` |
| `agent.js` | `window.blatt`: commands for AI assistants in the browser; the "Edit with AI" prompt | `blatt` |
| `boot.js` | Storage migrations, then the start-up sequence | -- |

### How it works

1. **Markdown parser** (`parseMD()`) reads structured MD into a data object with header, sidebar sections, and main sections
2. **Renderers** convert parsed data into HTML for a pixel-perfect A4 layout
3. **Four tabs** for the CV being edited: Preview (live A4 page), Editor (form-based editing), Photo, ATS. **Configuration** (every CV version and design, backups, Word import) is not about one CV, so it opens from the gear at the right of the tab bar
4. **Download window**: one card per file (Text PDF, Image PDF, one-column PDF, Word), each saying what it is best for and whether it opens the print window or downloads
5. **Format panel** (left sidebar): Real-time CSS variable controls for colors, fonts, spacing, layout
6. **Preset system**: Save/load/import/export both format presets and content presets (localStorage)
7. **PDF export**: Image PDF via html2pdf.js (`app/vendor/`), plus an ATS-friendly export via the browser print dialog

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
the language and `DisplayDocTitle`. Its pages are pictures, so `addTextLayer()` writes
every measured run of words over them in invisible text (PDF rendering mode 3, like an
OCR layer), in Text PDF order. jsPDF cannot embed the page's WOFF2 fonts, so the layer
uses the built-in Helvetica: Windows-1252 only (`winAnsiText()` folds or drops other
letters, and the ATS checks warn), with each run's letter spacing set so it covers exactly
the words underneath. Widths come from `HELVETICA_WIDTHS` -- the metrics PDF readers use
-- because jsPDF's own tables are slightly off and the layer drifts into the next word.
Check changes with `pdftotext -raw`: the Image PDF must give the same words as the Text PDF. The
app's own `<html lang>` is `en` (the UI language); the CV language goes on `#viewport`
and `#editor-view`.

The reading-order preview lays a copy of the rendered pages out off-screen and measures
where each run of words lands, then shows two orders: **column by column** (DOM order,
which is the order Chrome writes the text into the Text PDF) and **straight across** (each
line over the full width, as simple parsers and `pdftotext -layout` read it). Check
changes to it against a real Text PDF with `pdftotext -raw` and `pdftotext -layout`.

`downloadWordCV()` exports a clean one-column **Word document** (`docxPackage()`, shared
with the Word template): real Title/Heading styles plus direct formatting, bullets, role
and dates on one line, and the PDF properties in `docProps/core.xml`. It is not the
template's import format. Organisation names render as `<h3 class="entry-org">`, so the
Text PDF's structure tags mark every job and degree; the company comes first in
`### Company | Department`, since parsers take the first line as the employer.
`keepHyphensTogether()` (render.js) wraps short hyphenated words in `.nobr`, so no line
breaks after a hyphen and a parser never reads "cross- functional".

`printCV(true)` exports the **one-column Text PDF**: the same page clones and styles, with
`oneColumnPrintCss()` stacking the sidebar above the main column, letting the pages flow
(page margins move to `@page`) and hiding the extra-page headers and the side bar.

**Job ad match** runs fully offline. `jobKeyTerms()` drops benefits and company sections
by their headings, splits the rest at punctuation, stop words (grammar and job-ad
boilerplate in seven languages) and verbs that open a bullet, then ranks the remaining
words and phrases of up to three words by frequency and by whether they look like a tool,
acronym or name. German capitalises every noun, so there only capitalised words are kept.
`matchJobTerms()` compares crude stems (`stemWord()`) against the CV text: found (and whether
in a job or project entry, i.e. shown in use, or only listed in the sidebar), words apart,
or missing. The job card also checks the ad's title (`jobAdTitle()`, editable) against the
subtitle and latest role, and suggests writing both forms of acronyms the ad uses
(`ACRONYMS` plus pairs spelled out in the ad or CV). The checks list covers location and
links whose visible text hides the address.

## AI assistants (`window.blatt`)

An AI assistant that controls the browser (Claude in Chrome, from Chrome's side panel or Claude
Desktop) edits the CV through `window.blatt` in `app/js/agent.js` instead of clicking through the
editor. It works in the open tab, so it needs no server and works for local files too (the
extension needs "Allow access to file URLs" for those). `blatt.help()` is the assistant's manual:
the commands, the Markdown dialect and the ATS rules -- **keep it in step with the parser and the
ATS checks**. Commands: `getCV`, `setCV(markdown, { asNewVersion })`, `atsCheck`, `matchJob(ad)`,
`properties`, `setProperties`, `versions`, `useVersion`, `template`, `undo`.

- `setCV` takes the whole CV, strips a code fence, refuses a CV without a name or sections, and
  returns `warnings` for lines the renderer would drop (unindented bullets in an entry, `###` in a
  sidebar, text in a main section outside entries) plus the open ATS checks.
- Changes go through the normal paths (localStorage, `renderCV`, editor/ATS refresh, so server
  sync pushes them) and push a snapshot to an in-memory undo stack. The toast's Undo button and
  `blatt.undo()` restore it, deleting a version the change created.
- `atsCheckItems()` and `jobMatch()` return the ATS tab's checks and job match as data; the tab
  renders the same data, so the two never disagree.
- "Edit with AI" (preview panel) opens a prompt to paste into the assistant: page content is
  information to Claude, not instructions, so the user's own prompt tells it to use `blatt.help()`.
- For assistants that read the page instead, every editor field is named after its label and
  place (`nameEditorControls()`: "Experience › Analytix GmbH › Job Title"), format controls carry
  `aria-label`s, the views are labelled regions and the tab bar is a `<nav>` with `aria-current`.

## Phones

The phone layout is meant for the served app (self-hosting): a zip opened from disk
can't run on a phone. It is one block at the end of `app/css/app.css`, at
`max-width: 760px` -- the same query as `isPhoneLayout()` in view.js, so keep the two
in step. Phones open on the Editor. The Preview tab shows a card instead of the page:
a thumbnail of page 1 (`renderPhoneCard()`: a copy without ids, so nothing finds it
instead of the real page; it lives after `#viewport`, and render.js looks the page parts
up inside `#viewport`). Tapping it opens the CV full screen (`openCvFullscreen()`):
`#viewport` becomes a fixed, scrolling layer with every page at the screen's width
(`zoom: var(--cv-full-zoom)`, set by `applyFit()`), and the phone's Back button closes
it (a history entry). The preview actions become a toolbar along the bottom (with a
Format button, `.phone-only`; "Edit with AI" is `.phone-hidden`). The format panel is a
bottom sheet that starts closed; opening it opens the full-screen CV, which then ends
above the sheet, so changes show live. Pinch zoom is the browser's own.

Touch screens (`hover: none`) get ▲▼ buttons (`moveButtons()`, `.ed-touch-only`) in
place of the drag handles, since HTML5 drag & drop is unreliable with fingers. A
company moves together with its `(same)` roles, by button or by dragging
(`moveEntryGroupTo()`). `pointer: coarse` gets 16px fields (iOS zooms into smaller
ones) and bigger buttons. Exports on touch screens: the Text PDF window carries a
"Print or save as PDF" button, in case the print sheet doesn't open by itself, and the
Image PDF's canvas scale drops below 3x as pages are added (`pdfCanvasScale()`), since
iOS leaves a canvas over ~16.7 million pixels blank.

## Server mode (optional self-hosting)

The same `cv.html` and `app/` folder can be served by the server in `src/server/`: one
person, behind a Google sign-in, with their data synced across devices. Opened as a file
or from plain static hosting, nothing changes -- the sync code stays inert.

**Server (`src/server/core.mjs`):** zero dependencies, Web-standard APIs only (Request/
Response, fetch, WebCrypto), so it runs on Cloudflare Workers, Node 20+, Deno, Bun.
Adapters supply only storage (`get()` / compare-and-swap `put(baseRev, rec)`) and the
app's files (`getAppFile(name)`, name being `cv.html` or a path under `app/`; the core
only passes names matching `APP_FILE`, so no other file of the repo can be asked for).
Node reads them from `APP_DIR` (default: the repo root). On Cloudflare they are Workers
static assets (`[assets]` in wrangler.toml; `/.assetsignore` limits the upload to
`cv.html` and `app/`) with `run_worker_first`, so they too sit behind the sign-in.
Sign-in is Google OAuth (authorization code + PKCE) for exactly one `ALLOWED_EMAIL`; the
session is an HMAC-signed HttpOnly cookie. Everything -- the app page and its files
included -- requires the session (a signed-out request for an app file gets 401, not a
redirect). Everything is sent `Cache-Control: no-store`, so a new deploy never mixes old and
new files. `PUT api/data` additionally requires the `X-Blatt-Sync: 1` header (CSRF). Run
the tests after any change to it.

**Client (`app/js/sync.js`):** localStorage stays the working copy. The
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

1. **Global state**: ~10 global variables manage app state. Plan: consolidate into a single `state` object.
2. **Full editor re-render on every change**: `renderEditor()` rebuilds entire DOM via `innerHTML`, losing cursor position. Plan: targeted DOM updates.
3. **HTML string concatenation**: Both renderer and editor build HTML via `html +=`. Works but fragile at scale.
4. **No tests**: Parser and renderer have no test coverage (the optional server in `src/server/` does).

## Roadmap & Goals

### Current: Self-hosted HTML (v1)
- User downloads a zip, unzips it, opens `cv.html` in a browser
- Zero setup, zero dependencies, works offline
- This is the primary distribution model and must always be supported

### Done: Split into files (v1.1)
- The former single 7,800-line `cv.html` is now `cv.html` + `app/` (plain scripts and stylesheets), with no build step

### Medium-term: Desktop app via Tauri
- Wrap `cv.html` + `app/` in a Tauri shell for native desktop distribution (macOS, Windows, Linux)
- Tauri chosen over Electron (much smaller binary ~5MB vs ~150MB) and Flutter (would require full rewrite)
- The app is already a web app, Tauri just provides a native window + system APIs
- Not intended for mobile -- desktop only

### Done: Self-hosting (single user)
- `src/server/`: the same `cv.html` + `app/` behind a Google sign-in on Cloudflare Workers, Docker or Node, synced across devices (see "Server mode")

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

- No build tools, bundlers, or package managers: edit the files in `app/`, reload `cv.html`
- A new script goes into `app/js/` and gets a `<script src>` line in cv.html, after every file it uses at load time
- No runtime network access: the Open Sans font (data URLs in `app/css/fonts.css`) and html2pdf.js (`app/vendor/`) ship with the app
- The embedded Open Sans must stay **static** instances (one file per weight/style), never the Google Fonts variable font: Chrome's print-to-PDF embeds variable fonts as Type 3, which ATS parsers and upload virus scanners handle badly. Check with `pdffonts` -- the text PDF should list `CID TrueType`, not `Type 3`
- All state is in localStorage -- no backend required (the optional server in `src/server/` only mirrors it)
- The server has no package.json and no npm dependencies; only Cloudflare deployers use `npx wrangler`
- Target: all modern browsers (Chrome, Firefox, Safari, Edge)
- The `.claude/settings.local.json` allows bash commands for: `brew`, `python3`, `pip3`, `pdftotext`

## Releasing

Users download `Blatt.zip` from the latest GitHub release (README and site link to
`releases/latest/download/Blatt.zip`, so the asset name must stay the same). It holds a
`Blatt/` folder with `cv.html`, `app/` and `LICENSE`, built from the tag:

```
git archive --format=zip --prefix=Blatt/ -o Blatt.zip vX.Y.Z cv.html app LICENSE
```
