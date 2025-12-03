# Skeduler Companion

Minimal iPad PWA for marking shots complete on set.

## Features

- Sign in with Skeduler account
- View project list
- Open schedule (read-only structure)
- Tap checkboxes to mark shots complete
- Auto-syncs completion state to Supabase

## What it doesn't do

- Create/edit schedules (use desktop app)
- Drag reorder
- Edit times/descriptions
- Media uploads
- Column management
- Any formatting

## Deployment

Host these files anywhere (GitHub Pages, Netlify, Vercel, etc.):

```
index.html
styles.css  
app.js
sw.js
manifest.json
icon-192.png
icon-512.png
```

## Usage

1. Open in Safari on iPad
2. Tap Share → Add to Home Screen
3. Open from home screen (runs fullscreen)
4. Sign in
5. Select project
6. Tap circles to mark shots complete

## Data flow

```
Desktop creates/edits schedule
         ↓
    Supabase storage
         ↓
Companion pulls schedule
         ↓
User marks shots complete
         ↓
Companion pushes updated JSON
         ↓
Desktop sees completion on reload
```

## Icons

Replace icon-192.png and icon-512.png with proper app icons.
Ideal: simple "S" or checkmark on dark background.

## TODO

- [ ] Offline queue (mark complete while offline, sync when back)
- [ ] Pull to refresh
- [ ] Last synced timestamp display
- [ ] Conflict detection (warn if desktop changed)
