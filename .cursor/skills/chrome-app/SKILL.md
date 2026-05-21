---
name: chrome-app
description: >-
  Make a Vite/static web app installable as a Chrome PWA (Install app / Add to
  Home Screen). Adds manifest.webmanifest, head meta tags, and PNG icons from
  an SVG source. Use when the user asks for Chrome app setup, PWA manifest,
  installable web app, apple-touch-icon, or web app manifest.
---

# Chrome App (PWA) Setup

Make a web app installable in Chrome and on mobile home screens. Pattern follows [regex101.com](https://regex101.com/) head/manifest setup.

## Workflow

Copy this checklist and track progress:

```
Task Progress:
- [ ] Step 1: Gather app metadata and colors
- [ ] Step 2: Ensure SVG favicon exists in public/
- [ ] Step 3: Generate PNG icons
- [ ] Step 4: Create public/manifest.webmanifest
- [ ] Step 5: Add PWA meta tags and links to index.html
- [ ] Step 6: Build and verify dist output
```

## Step 1: Gather metadata

Collect from the project before editing files:

| Field | Source |
|-------|--------|
| `name` | Page title or app name (can include subtitle) |
| `short_name` | ≤12 chars, home-screen label |
| `description` | One sentence from README or meta description |
| `theme_color` (light) | Brand accent or icon primary color |
| `theme_color` (dark) | App dark-mode background (e.g. CSS `--bg`) |
| `background_color` | Light-mode splash/launch color (usually `#ffffff`) |
| SVG source | `public/favicon.svg` or `src/assets/*.svg` copied to `public/` |

## Step 2: SVG favicon

Place the app icon at `public/favicon.svg`. Vite serves `public/` at the site root.

If the source SVG lives under `src/assets/`, also copy it to `public/favicon.svg` so favicon and icon generation share one file.

## Step 3: Generate PNG icons

Run from the project root (requires `rsvg-convert`):

```bash
bash .cursor/skills/chrome-app/scripts/generate-pwa-icons.sh public/favicon.svg public/icons
```

Creates:

| File | Size | Used for |
|------|------|----------|
| `apple-icon-180.png` | 180×180 | iOS home screen |
| `favicon-196.png` | 196×196 | Legacy favicon |
| `manifest-icon-192.png` | 192×192 | PWA manifest |
| `manifest-icon-512.png` | 512×512 | PWA manifest / splash |

If `rsvg-convert` is missing, install librsvg (`brew install librsvg` on macOS) and retry.

## Step 4: Create manifest

Write `public/manifest.webmanifest`:

```json
{
  "name": "{{APP_NAME}}",
  "short_name": "{{SHORT_NAME}}",
  "start_url": "/",
  "display": "standalone",
  "background_color": "{{BACKGROUND_COLOR}}",
  "theme_color": "{{THEME_COLOR}}",
  "description": "{{DESCRIPTION}}",
  "icons": [
    {
      "src": "/icons/manifest-icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/manifest-icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icons/manifest-icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/manifest-icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

Replace placeholders with project values. Keep icon paths absolute from site root (`/icons/...`).

## Step 5: Update index.html head

Insert these tags in `<head>` after charset/viewport basics and before the page title. Adapt names and colors to the project.

```html
<meta name="title" content="{{SHORT_NAME}}" />
<meta name="description" content="{{DESCRIPTION}}" />

<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="{{APP_NAME}}" />
<meta name="application-name" content="{{APP_NAME}}" />
<meta name="format-detection" content="telephone=no" />

<meta name="theme-color" content="{{THEME_COLOR}}" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="{{THEME_COLOR_DARK}}" />

<link rel="manifest" href="/manifest.webmanifest" />

<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="196x196" href="/icons/favicon-196.png" />
<link rel="apple-touch-icon" href="/icons/apple-icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
```

Do **not** remove existing theme bootstrapping scripts (e.g. `data-theme` from localStorage).

### Optional: iOS splash screens

regex101 ships many `apple-touch-startup-image` links for every device size. Skip unless the user explicitly asks — they are verbose and rarely needed for a tool app.

## Step 6: Verify

```bash
bun run build
ls dist/manifest.webmanifest dist/icons/
```

Confirm:

- `dist/manifest.webmanifest` exists
- `dist/icons/` contains all four PNGs
- `dist/index.html` includes `<link rel="manifest">` and theme-color meta tags

Test locally with `bun run preview`, then in Chrome DevTools → Application → Manifest.

## Reference implementation

This repo (`newdb`) is the canonical example:

- `index.html` — head meta tags
- `public/manifest.webmanifest` — PWA manifest
- `public/favicon.svg` — SVG source
- `public/icons/` — generated PNGs

For full regex101 head markup, see [reference.md](reference.md).
