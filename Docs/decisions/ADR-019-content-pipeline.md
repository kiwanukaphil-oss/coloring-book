# ADR-019: Content Pipeline and Template Manifest

## Status
Accepted

## Context
The template catalog is currently a hardcoded array `PRELOADED_COLORING_PAGES` in `image-loader.js` (8 entries). Adding templates requires modifying JavaScript source code. There is no metadata for categories, difficulty levels, or suggested palettes — all templates appear in a flat grid.

The transformation audit (Section 6, Layer 1: Content ecosystem) recommends moving to a JSON-driven manifest that separates content from code.

## Decision
Introduce `templates/manifest.json` as the single source of truth for the template catalog. `ImageLoader` fetches the manifest on initialization and falls back to the hardcoded array if the fetch fails (offline first load, network error).

### Manifest structure
```json
{
    "version": 1,
    "categories": [
        {
            "id": "animals",
            "name": "Animals",
            "emoji": "🦁",
            "templates": [
                {
                    "id": "cat",
                    "title": "Cat",
                    "file": "images/coloring-pages/cat.svg",
                    "difficulty": "simple",
                    "suggestedPalette": ["#FF6B6B", "#FFD93D", "#6BCB77"]
                }
            ]
        }
    ]
}
```

### Gallery UI enhancements
- **Category sections**: templates grouped by category with emoji headers
- **Difficulty badges**: colored pills (Easy / Medium / Detailed) on template cards
- **Search bar** (Studio mode): text input filtering templates by title, debounced 300ms
- **Sort options**: by name (A-Z), difficulty, recently used
- **Empty state for My Art**: encouraging illustration + "Start coloring!" CTA

### Fetch strategy
```javascript
async function loadManifest() {
    try {
        const response = await fetch('templates/manifest.json');
        return await response.json();
    } catch (error) {
        console.warn('Manifest fetch failed, using built-in templates', error);
        return null; // Triggers hardcoded fallback
    }
}
```

### Rules
- `templates/manifest.json` is the canonical template source; `PRELOADED_COLORING_PAGES` is retained as a synchronous fallback only
- Template IDs must be unique across all categories
- Difficulty values are one of: `"simple"`, `"medium"`, `"detailed"`
- `suggestedPalette` is optional — omitted means "use default 20-color palette"
- The manifest is cached by the service worker alongside other static assets
- Gallery UI must work correctly whether manifest loaded or fallback is active

## Consequences
- New: `templates/manifest.json`
- Modified: `js/image-loader.js` (add `loadManifest()`, category/search/sort/empty state)
- Modified: `index.html` (search input, sort dropdown, category UI, empty state markup)
- Modified: `css/styles.css` (category tabs, difficulty badges, search bar, empty state)
- Modified: `service-worker.js` (add manifest to cache, bump version)
- Adding new templates requires only editing JSON + adding SVG file — no JS changes
- Manifest format is designed to be remote-ready (could be served from an API in Phase 3)
