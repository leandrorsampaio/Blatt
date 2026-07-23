<h1 align="center">Blatt</h1>

<p align="center"><em>Your CV. One file. Yours forever.</em></p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg">
  <img alt="Single file" src="https://img.shields.io/badge/build-single%20HTML%20file-success">
  <img alt="No dependencies" src="https://img.shields.io/badge/dependencies-none-success">
  <img alt="Offline" src="https://img.shields.io/badge/works-offline-success">
</p>

**Blatt** (German for *"sheet of paper"*) is a self-hosted résumé/CV builder that lives in a **single HTML file**. One sheet, one file — open it in any browser, fill in your details, and export a clean A4 PDF. No sign-up, no server, no build step, no tracking. Your data never leaves your computer.

> 🔗 **[Live demo](https://leandrorsampaio.github.io/Blatt/cv.html)** · **[Website](https://leandrorsampaio.github.io/Blatt/)** · **[Download](https://github.com/leandrorsampaio/Blatt/archive/refs/heads/main.zip)**

---

## Why Blatt?

- 🗂️ **It's just one file.** The entire app is `cv.html`. Email it to yourself, drop it on a USB stick, back it up — it works anywhere, forever.
- 🔌 **100% offline.** Runs entirely in your browser. After download you never need an internet connection.
- 🔒 **You own your data.** No account, no cloud, no analytics. Everything is stored locally in your browser (`localStorage`).
- 🖱️ **No setup.** Download, double-click, done. Built for people who aren't developers.
- 📄 **Clean export.** One-click A4 PDF, plus an ATS-friendly print export that applicant-tracking systems can read.
- 🎨 **Fully customizable.** Live format panel for colors, fonts, spacing and layout — with savable presets.

**No account. No server. No tracking. No cost.**

---

## Quick start

1. **[Download the ZIP](https://github.com/leandrorsampaio/Blatt/archive/refs/heads/main.zip)** and extract it.
2. Double-click **`cv.html`** to open it in your browser.
3. Click the **Editor** tab, replace the sample content with yours.
4. Adjust the look in the **Format** panel on the left.
5. Hit **Download PDF** (or `Ctrl`/`Cmd` + `P`).

That's it. Your work auto-saves to your browser as you type.

---

## Features

- **Live A4 preview** — what you see is exactly what prints.
- **Two views** — a live preview and a friendly form-based editor (no Markdown required).
- **Multi-page support** — content flows to additional pages with customizable headers.
- **Content presets** — keep multiple versions of your CV (e.g. *English*, *German*, *Short*) side by side.
- **Format presets** — save and reuse complete look-and-feel configurations; import/export as JSON.
- **Fit-to-screen** and **page navigation** for comfortable editing.
- **Keyboard shortcuts** — `Ctrl`/`Cmd`+`S` to save, `Ctrl`/`Cmd`+`P` to export.
- **Print-optimized** — clean output with all UI hidden.

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

The whole application is one `cv.html` file (~5,000 lines: CSS + HTML + vanilla JS), with the CV content and the PDF library embedded inline. The only pieces bundled are a self-contained copy of [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) and a locally embedded copy of the Open Sans font — **nothing is fetched from the network at runtime.**

Source assets live in `src/`:

```
cv.html              ← The product — open this in a browser
LICENSE              ← MIT
README.md            ← You are here
docs/                ← Marketing site (GitHub Pages)
src/
  cv-data.md         ← Source CV content (Markdown)
  cv-template.md     ← Blank template showing the format
  assets/            ← Photo, logos, bundled html2pdf.js
```

> **Roadmap:** a small build step that splits `cv.html` into `src/css`, `src/js`, `src/html` modules and re-concatenates them into the single distributable file — without ever breaking the "just open the file" model.

---

## Browser support

Works in all modern browsers: **Chrome, Firefox, Safari, Edge.** Desktop recommended for editing.

---

## Contributing

Issues and pull requests are welcome. Because the app is a single file, small focused changes are easiest to review. Please describe what you changed and why.

---

## Support

Blatt is free and always will be. If it saved you time or helped you land an interview, you can say thanks:

<a href="https://buymeacoffee.com/lsampaio"><img alt="Buy me a coffee" src="https://img.shields.io/badge/Buy%20me%20a%20coffee-%E2%98%95-yellow.svg"></a>

☕ **[buymeacoffee.com/lsampaio](https://buymeacoffee.com/lsampaio)**

---

## License

[MIT](LICENSE) © 2026 Leandro Rossi Sampaio
