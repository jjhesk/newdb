# Chrome App Reference

## regex101 head pattern

[regex101.com](https://regex101.com/) uses this structure for installable web apps:

### Meta tags

```html
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="…" />
<meta name="application-name" content="…" />
<meta name="format-detection" content="telephone=no">

<meta name="theme-color" content="#2c5c97">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f2c48">
```

### Manifest link

```html
<link rel="manifest" href="/static/assets/manifest.webmanifest">
```

### Icons

```html
<link rel="icon" type="image/png" sizes="196x196" href="/static/assets/icons/favicon-196.png" />
<link rel="apple-touch-icon" href="/static/assets/icons/apple-icon-180.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
```

### regex101 manifest fields

```json
{
  "name": "regex101",
  "short_name": "regex101",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f7f7f7",
  "theme_color": "#2c5c97",
  "description": "…",
  "icons": [ /* 192 and 512, any + maskable */ ]
}
```

## Vite specifics

- Static assets go in `public/`; they are copied to `dist/` unchanged.
- Do not import the manifest in JS — link it from `index.html`.
- SPA rewrites (e.g. Vercel) must not intercept files with extensions. Existing `vercel.json` rewrite `(?!.*\\.)` already allows `.webmanifest` and `.png`.

## newdb values (example)

| Field | Value |
|-------|-------|
| `name` | `newdb: PostgreSQL setup` |
| `short_name` | `newdb` |
| `theme_color` | `#1B9BDB` |
| `theme_color` (dark) | `#16171d` |
| `background_color` | `#ffffff` |

## Chrome install criteria (minimum)

- Served over HTTPS (or localhost for dev)
- Valid `manifest.webmanifest` with `name`, `icons` (192 + 512), `start_url`, `display`
- Registered service worker **not required** for basic "Install app" in Chrome (optional for offline)
