<p align="center">
  <img alt="Chrome Web Store — coming soon" src="https://img.shields.io/badge/Chrome%20Web%20Store-coming%20soon-f6b73c?style=for-the-badge&logo=googlechrome&logoColor=white">
  <img alt="Install: manual only" src="https://img.shields.io/badge/Install-manual%20only-blue?style=for-the-badge">
  <img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache%202.0-0969da?style=for-the-badge">
</p>

<p align="center">
    <img src="./brand/logo_512x512.png" alt="Scribe logo" width="96">
</p>
<h1 align="center">Scribe</h1>
<p align="center">
  <i>A better GitHub comment box — with first-class support for tagged review comments.</i>
</p>

<p align="center">
  A browser extension that <strong>replaces</strong> GitHub's native comment box
  with a block-based Markdown editor, plus a per-line prefix palette
  (<code>nit:</code>, <code>non-blocking:</code>, <code>followup:</code>,
  <code>question:</code>, <code>blocking:</code>) so review comments stay
  classified and consistent.
</p>

> [!NOTE]
>
> **This is a fork of [riccardoperra/better-comments-for-github](https://github.com/riccardoperra/better-comments-for-github).**
> The upstream project provides the block-based editor. Scribe adds the review-comment
> prefix system (colored tags, palette bar, in-editor tinting, post-render color pass on
> GitHub) and a rebrand. All upstream improvements flow back in.

> [!IMPORTANT]
>
> **Scribe is not published on the Chrome Web Store yet.** Until the store listing is
> approved, installation is manual — see [Install](#install) below. Each time you want
> the latest version, re-download the build artifact and reload the unpacked extension.

## What's new in Scribe

On top of the upstream editor, Scribe ships a complete review-comment tagging system:

- ✅ **Per-line prefix tags.** Insert `blocking:`, `nit:`, `followup:`, `question:`, `praise:`, etc. at the start of any line with a single click — emit clean Markdown like `🔴 **blocking:** the actual bug`.
- ✅ **Color-coded tags.** Each prefix carries a configurable color and emoji. You pick the palette — two presets built in (team convention & [Conventional Comments](https://conventionalcomments.org/)).
- ✅ **Always-on palette bar.** On PR pages, a tag palette sits above the editor for instant insertion. The bar goes yellow (*"Missing a tag?"*) on a tagless review comment and green (*"Tagged — add more if you have several notes."*) once you've tagged at least one line. Replies never nag.
- ✅ **Live editor tinting.** As you type, the configured color is applied to the token (`nit:` shows in gray, `blocking:` in red, etc.) via a ProseMirror decoration plugin — markdown output stays `**nit:**`, unchanged.
- ✅ **Post-render color in GitHub comments.** A content-script tinter color-codes matching `<strong>` tags in already-submitted comments across GitHub — every review you read gets the same visual classification you typed.
- ✅ **Settings UI.** Add / edit / reorder / delete prefixes. Emoji + color per prefix. One-click presets. Syncs across devices via `chrome.storage.sync`.

## Core features (inherited from upstream)

- ✅ **WYSIWYG Markdown editor** — replaces every GitHub comment box with a visual Markdown editor powered by ProseMirror.
- ✅ **Full GitHub node support** — alerts, tables, lists, task lists, details, mentions, issue references, images, more.
- ✅ **Slash commands & toolbar** — quick insertion of blocks and formatting.
- ✅ **Code blocks with syntax highlighting** — any language.
- ✅ **TypeScript IntelliSense in code blocks** — CodeMirror + TypeScript language server with npm package autocompletion and real-time type-checking.
- ✅ **Advanced table handling** — intuitive creation, editing, and navigation.
- ✅ **Native GitHub styling** — uses GitHub Primer CSS variables and classes so it blends into the host UI.

[Full supported-features discussion (upstream)](https://github.com/riccardoperra/better-comments-for-github/discussions/50)

> [!CAUTION]
> Work in progress. Expect sharp edges. Issues and PRs welcome.

## Install

**Scribe is not on the Chrome Web Store yet — you have to install it manually until it is.**

### Option A: build from source (recommended during active development)

```bash
# Clone this fork
git clone https://github.com/0xisk/scribe.git
cd scribe

# Install deps and build
pnpm install
pnpm build:core-libs
pnpm --filter ./extension build
```

The build output lands in [extension/dist/chrome-mv3/](extension/dist/chrome-mv3/).

### Option B: build a zip for sharing

```bash
pnpm --filter ./extension zip
```

The zip appears under `extension/.output/scribe-<version>-chrome.zip`. Share that with teammates; they then follow the Chromium load steps below pointing at the zip's unpacked folder.

### Load into Chromium (Brave, Chrome, Arc, Edge, etc.)

1. Open **`chrome://extensions`** (or `brave://extensions`, `edge://extensions`, …).
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Point it at `extension/dist/chrome-mv3/`.
5. Visit github.com — the comment boxes are now Scribe.

### Load into Firefox (temporary add-on)

Firefox support is tracked [upstream](https://github.com/riccardoperra/better-comments-for-github/issues/69) and is still a work in progress. For now:

1. `pnpm --filter ./extension build:firefox`
2. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** → select `extension/dist/firefox-mv2/manifest.json`.
3. Note: temporary add-ons are removed when Firefox restarts.

### Staying current

Until the store listing is approved, there's no auto-update. When you want the latest Scribe:

1. `git pull`
2. `pnpm --filter ./extension build`
3. Go to `chrome://extensions` and click the ↻ button on the Scribe card.

## Development

```bash
pnpm install
pnpm build:core-libs
pnpm --filter ./extension dev          # hot-reload while you edit
```

For unit tests:

```bash
pnpm exec vitest run
```

For a storybook of editor components:

```bash
pnpm --filter ./extension storybook
```

## Project structure

Monorepo via pnpm workspaces:

- **[src/](src/)** — the editor core (ProseMirror + prosekit + SolidJS + Kobalte). Prefix-tag feature lives at [src/core/custom/comment-prefix/](src/core/custom/comment-prefix/).
- **[extension/](extension/)** — the browser extension shell (WXT). Content scripts, page detection, textarea handlers, the post-render tinter ([extension/src/utils/renderedCommentTinter.ts](extension/src/utils/renderedCommentTinter.ts)).
- **[markdown-schema/](markdown-schema/)** — ProseMirror node definitions for Markdown.
- **[markdown-transformer/](markdown-transformer/)** — Markdown ↔ ProseMirror transforms.
- **[brand/](brand/)** — logos and promo assets. New Scribe mark (Nib-Block, GitHub-blue) is at [brand/logo_512x512.png](brand/logo_512x512.png); source SVGs live in [extension/src/public/icon/](extension/src/public/icon/).

## Tech stack

Built on [WXT](https://github.com/wxt-dev/wxt). Core dependencies:

- [ProseMirror](https://prosemirror.net/) + [prosekit](https://github.com/prosekit/prosekit)
- [SolidJS](https://github.com/solidjs/solid) + [Kobalte](https://kobalte.dev)
- [unified](https://github.com/unifiedjs/unified) for markdown processing
- [statebuilder](https://github.com/riccardoperra/statebuilder)
- GitHub Primer CSS variables for native styling

## License

**Apache License 2.0** — inherited from upstream. See [LICENSE](LICENSE) for the
full text and [NOTICE](NOTICE) for attribution. Modifications in this fork
(prefix tagging, rebrand, rendered-comment tinter, etc.) are released under the
same Apache 2.0 terms.

If you're redistributing Scribe or building on it, be aware of the Apache 2.0
obligations: keep the `LICENSE` and `NOTICE` files, preserve copyright headers,
and mark any files you modify.

## Credits

- Upstream editor by [@riccardoperra](https://github.com/riccardoperra) — [riccardoperra/better-comments-for-github](https://github.com/riccardoperra/better-comments-for-github).
- Scribe fork, prefix-tag feature, rebrand by [@0xisk](https://github.com/0xisk).
- Scribe logo (Nib-Block) designed to coexist with GitHub's visual identity — sources at [extension/src/public/icon/](extension/src/public/icon/).
