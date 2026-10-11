<h1 align="center">Blatt</h1>

<p align="center"><em>Your CV. One folder. Yours forever.</em></p>

<p align="center">
  <a href="https://github.com/leandrorsampaio/Blatt/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/leandrorsampaio/Blatt?color=2c3e6b"></a>
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="No install" src="https://img.shields.io/badge/install-none-success">
  <img alt="No dependencies" src="https://img.shields.io/badge/dependencies-none-success">
  <img alt="Offline" src="https://img.shields.io/badge/works-offline-success">
</p>

**Blatt** (German for *"sheet of paper"*) is a self-hosted résumé/CV builder that runs straight from a **folder on your computer**. Unzip it, open `cv.html` in any browser, fill in your details, and export a clean A4 PDF. No installation, no sign-up, no server, no tracking. Your data never leaves your computer.

> 🔗 **[Website](https://leandrorsampaio.github.io/Blatt/)** · **[Download Blatt.zip](https://github.com/leandrorsampaio/Blatt/releases/latest/download/Blatt.zip)** · **[Releases](https://github.com/leandrorsampaio/Blatt/releases/latest)** · **[Sample CV (PDF)](https://leandrorsampaio.github.io/Blatt/CV_DEMO.pdf)**

---

## Why Blatt?

- 🗂️ **It's just one folder.** Unzip it, open `cv.html`. Put the folder on a USB stick or in your cloud drive, back it up — it works anywhere, forever.
- 🔌 **100% offline.** Runs entirely in your browser. After download you never need an internet connection.
- 🔒 **You own your data.** No account, no cloud, no analytics. Everything is stored locally in your browser (`localStorage`).
- 🖱️ **No setup.** Download, double-click, done. Built for people who aren't developers.
- 📄 **Clean export.** One-click A4 PDF, plus an ATS-friendly print export that applicant-tracking systems can read.
- 🎨 **Fully customizable.** Live format panel for colors, fonts, spacing and layout — with savable presets.

**No account. No server. No tracking. No cost.**

---

## Quick start

1. **[Download `Blatt.zip`](https://github.com/leandrorsampaio/Blatt/releases/latest/download/Blatt.zip)** and unzip it (on Windows: right-click → *Extract All*).
2. In the `Blatt` folder, double-click **`cv.html`** to open it in your browser. Keep the `app` folder next to it: that's the rest of the app.
3. Click the **Editor** tab, replace the sample content with yours.
4. Optionally add a photo in the **Photo** tab.
5. Adjust the look in the **Format** panel on the left.
6. Hit **Download PDF** (or `Ctrl`/`Cmd` + `P`).

That's it. Your work auto-saves to your browser as you type.

---

## Features

- **Live A4 preview** — what you see is exactly what prints.
- **Simple editing** — a live preview alongside a friendly form-based editor (no Markdown required).
- **Photo** — upload one, frame it with drag + zoom, optionally make it black & white, and place it either as a square at the top of the sidebar or as a circle in the top-right corner. Size and border are adjustable; it appears on page 1 only.
- **ATS tab** — set the PDF's title, language, author, subject, keywords and file name per CV version; check that a parser finds your name, email, phone, standard headings and dates; paste a job ad to see which of its key terms your CV is missing, whether it uses the ad's job title, which skills you list but never show in use, and which acronyms to spell out; and see the order in which applicant-tracking systems read your two columns.
- **One-column Text PDF** — the same design with the sidebar stacked above the main column, for job portals whose parsers mix up columns.
- **Word export** — a clean one-column `.docx` for portals that ask for Word, and a hidden text layer that makes even the pixel-perfect Image PDF readable to an ATS.
- **Multi-page support** — content flows to additional pages with customizable headers.
- **Content presets** — keep multiple versions of your CV (e.g. *English*, *German*, *Short*) side by side.
- **Format presets** — save and reuse complete look-and-feel configurations; import/export as JSON.
- **Fit-to-screen** and **page navigation** for comfortable editing.
- **Keyboard shortcuts** — `Ctrl`/`Cmd`+`S` to save, `Ctrl`/`Cmd`+`P` to export.
- **Print-optimized** — clean output with all UI hidden.
- **Optional self-hosting** — run the same app on your own server behind a Google sign-in, and your CV follows you across devices.

---

## Self-hosting (optional)

Want your CV on every device instead of in one browser? Host Blatt on your own server: **Cloudflare Workers** (free tier), **Docker**, or any machine with **Node.js**. You sign in with Google and only your account gets in. Edits save to your server automatically, and if two devices change it at the same time, Blatt asks which version to keep.

It's the same `cv.html` and `app` folder, with no fork and no build step. Opened from your computer, it still works fully offline.

**→ [Self-hosting guide](src/server/README.md)**

---

## How it works

Blatt renders a pixel-perfect A4 page from structured content. Under the hood, content is stored in a small, human-readable Markdown dialect — but you never have to touch it: the built-in **Editor** handles everything with forms and rich-text fields.

For power users, the format looks like this:

```markdown
# Jane Doe (M.Sc.)
> Product Designer

## sidebar: Contact
- :pin: 10 Example Street, 12345 Berlin
- :phone: +49 123 456 7890
- :email: [jane@example.com](mailto:jane@example.com)

## sidebar: Profile
Short summary about who you are and what you do.

## main: Experience

### Acme GmbH | Design
Title: Senior Product Designer
Date: 03/2021 – Present
Detail: Led the redesign of the core product.
```

- `## sidebar:` / `## main:` define sections.
- `### Organization | Department` starts an entry.
- `Title`, `Date`, `Grade`, `Detail` are recognized fields; any other `Key: Value` renders as a labeled line.

---

## Tech & architecture

The application is `cv.html` plus an `app/` folder of plain JavaScript and CSS files: vanilla JS, no framework, **no build step** (the files in this repo are the files you run). The only pieces bundled are a copy of [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) and a locally embedded copy of the Open Sans font — **nothing is fetched from the network at runtime** (when self-hosted, it talks only to your own server).

```
cv.html              ← The product — open this in a browser
app/
  css/               ← The CV page, the app around it, the embedded font
  js/                ← The app's code, one file per concern
  vendor/            ← html2pdf.js
LICENSE              ← MIT
README.md            ← You are here
docs/                ← Marketing site (GitHub Pages)
src/
  cv-data.md         ← Source CV content (Markdown)
  cv-template.md     ← Blank template showing the format
  assets/            ← Photo, logos
  server/            ← Optional self-hosting server (Cloudflare / Node / Docker)
```

---

## Browser support

Works in all modern browsers: **Chrome, Firefox, Safari, Edge.** Desktop recommended for editing.

---

## Contributing

Issues and pull requests are welcome. There's nothing to install or build: edit the files in `app/` and reload `cv.html`. Small focused changes are easiest to review. Please describe what you changed and why.

---

## Support

Blatt is free and always will be. If it saved you time or helped you land an interview, you can say thanks:

<a href="https://buymeacoffee.com/lsampaio"><img alt="Buy me a coffee" src="https://img.shields.io/badge/Buy%20me%20a%20coffee-%E2%98%95-yellow.svg"></a>

☕ **[buymeacoffee.com/lsampaio](https://buymeacoffee.com/lsampaio)**

---

## License

[MIT](LICENSE) © 2026 Leandro Rossi Sampaio
