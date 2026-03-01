# QA Checklist — Coloring Book PWA

Manual testing checklist for tablet, mobile, and desktop.
Run through before every release or after any Phase completion.

---

## How to Use

- Test on at least one device from each category: **Desktop** (Chrome/Firefox), **Tablet** (iPad or Android tablet), **Phone** (iOS Safari or Android Chrome).
- Mark each item: PASS / FAIL / N/A.
- If FAIL, note the device, browser, and observed behavior.

---

## 1. App Launch & Gallery

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 1.1 | App loads without console errors | | | |
| 1.2 | Gallery modal appears on first load | | | |
| 1.3 | Gallery grid displays cat.svg thumbnail | | | |
| 1.4 | Clicking a gallery item loads the coloring page and hides the gallery | | | |
| 1.5 | "Upload Your Own" button opens file picker | | | |
| 1.6 | "Upload Reference Image" button opens file picker | | | |
| 1.7 | "Close" button dismisses the gallery modal | | | |
| 1.8 | Gallery modal is scrollable if content exceeds viewport height | | | |
| 1.9 | Uploading a non-image file does not crash the app | | | |

## 2. Canvas & Layout

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 2.1 | Canvas fills the available space (left of color palette, above toolbar) | | | |
| 2.2 | Outline layer renders on top of coloring layer (lines visible over paint) | | | |
| 2.3 | Canvas is white before any drawing | | | |
| 2.4 | Resizing the browser window re-scales the canvas without losing existing drawing | | | |
| 2.5 | Rotating a tablet/phone preserves the drawing (orientation change) | | | |
| 2.6 | Canvas DPI matches devicePixelRatio (no blurry lines on Retina/HiDPI) | | | |

## 3. Brush Tool

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 3.1 | Clicking the Brush toolbar button activates it (orange highlight) | | | |
| 3.2 | Brush size slider appears when brush is active | | | |
| 3.3 | Brush size slider disappears when switching to fill | | | |
| 3.4 | Drawing a stroke with mouse produces a smooth, continuous line | | | |
| 3.5 | Drawing a stroke with finger/stylus produces a smooth, continuous line | | | |
| 3.6 | Brush color matches the selected swatch | | | |
| 3.7 | Changing brush size via slider affects subsequent strokes | | | |
| 3.8 | Brush size display updates live as the slider moves | | | |
| 3.9 | Fast strokes do not produce gaps (coalesced pointer events working) | | | |
| 3.10 | Brush strokes respect canvas bounds (no drawing outside the canvas) | | | |
| 3.11 | Drawing over outline lines — paint appears beneath lines, not on top | | | |

## 4. Fill Tool

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 4.1 | Clicking the Fill toolbar button activates it (orange highlight) | | | |
| 4.2 | Tapping a white region fills it with the selected color | | | |
| 4.3 | Fill does not bleed across outline boundaries | | | |
| 4.4 | Fill handles anti-aliased edges (tolerance=32 should prevent white halos) | | | |
| 4.5 | Tapping an already-filled region with the same color does nothing (no unnecessary work) | | | |
| 4.6 | Filling a large region completes without noticeable freeze (<500ms) | | | |
| 4.7 | Fill works correctly after a viewport resize | | | |

## 5. Color Palette

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 5.1 | 20 color swatches are visible in the right-side panel | | | |
| 5.2 | Default selected color is red (#FF0000) | | | |
| 5.3 | Clicking a swatch selects it (white border + shadow + scale) | | | |
| 5.4 | Active color indicator in the toolbar updates to match | | | |
| 5.5 | Color palette scrolls if all swatches do not fit vertically | | | |
| 5.6 | Swatches are large enough to tap accurately on a phone (44px minimum) | | | |

## 6. Undo

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 6.1 | Undo reverses the last brush stroke | | | |
| 6.2 | Undo reverses the last fill operation | | | |
| 6.3 | Multiple undos work in sequence (up to 10 steps) | | | |
| 6.4 | Undo after 11+ actions — oldest action is lost (stack capped at 10) | | | |
| 6.5 | Undo with empty history does nothing (no crash) | | | |
| 6.6 | Loading a new coloring page clears undo history | | | |

## 7. Clear

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 7.1 | Clicking Clear opens the confirmation modal | | | |
| 7.2 | Confirmation modal text reads "Erase all your coloring?" | | | |
| 7.3 | "Yes" clears the coloring canvas back to white | | | |
| 7.4 | "Yes" saves an undo snapshot before clearing (so it can be undone) | | | |
| 7.5 | "No" dismisses the modal without clearing | | | |
| 7.6 | Outline layer is preserved after clear | | | |

## 8. Save

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 8.1 | Clicking Save triggers a PNG file download | | | |
| 8.2 | Saved image composites both coloring and outline layers | | | |
| 8.3 | Saved image has correct resolution (not blurry, not oversized) | | | |
| 8.4 | Save works on mobile browsers (may show share sheet instead of download) | | | |

## 9. Reference Image Panel

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 9.1 | Uploading a reference image shows the floating panel | | | |
| 9.2 | Reference image displays correctly inside the panel | | | |
| 9.3 | Panel is draggable via the blue header bar | | | |
| 9.4 | Panel is resizable via the bottom-right corner handle | | | |
| 9.5 | Panel respects minimum size (140x120) during resize | | | |
| 9.6 | Panel does not exceed canvas container bounds during drag | | | |
| 9.7 | "x" close button hides the reference panel | | | |
| 9.8 | Panel drag and resize work with touch (finger/stylus) | | | |
| 9.9 | Drawing on the canvas still works when the reference panel is visible | | | |

## 10. Touch & Gesture Guards (canvas area only)

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 10.1 | Pinch-to-zoom is blocked on the canvas | | | |
| 10.2 | Double-tap zoom is blocked on the canvas | | | |
| 10.3 | Long-press context menu is blocked on the canvas | | | |
| 10.4 | Gallery modal content is still scrollable (touch guards scoped to canvas) | | | |
| 10.5 | Text selection works in modals (touch guards do not interfere) | | | |
| 10.6 | Browser back/forward gestures still work outside the canvas | | | |

## 11. PWA & Offline

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 11.1 | Service worker registers successfully on first load | | | |
| 11.2 | App loads fully when offline (airplane mode / network disabled) | | | |
| 11.3 | All coloring pages load from cache when offline | | | |
| 11.4 | CSS, JS, and icons load from cache when offline | | | |
| 11.5 | App is installable (Add to Home Screen prompt or install button) | | | |
| 11.6 | Installed app launches in standalone mode (no browser chrome) | | | |
| 11.7 | Cache updates in background when online (stale-while-revalidate) | | | |

## 12. Performance

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 12.1 | First load completes in <3 seconds on a fast connection | | | |
| 12.2 | Brush drawing at 60fps — no visible lag during strokes | | | |
| 12.3 | Flood fill on a large region completes in <1 second | | | |
| 12.4 | Undo restores instantly (no visible delay) | | | |
| 12.5 | No memory leaks after 50+ fill operations (check DevTools memory) | | | |
| 12.6 | Canvas resize does not cause jank or flicker | | | |

## 13. Edge Cases

| # | Test | Desktop | Tablet | Phone |
|---|------|---------|--------|-------|
| 13.1 | Uploading a very large image (>10MB) does not crash the app | | | |
| 13.2 | Uploading a very small image (<50px) renders without errors | | | |
| 13.3 | Rapidly switching between fill and brush does not cause errors | | | |
| 13.4 | Tapping outside the loaded image region (white border area) does not crash fill | | | |
| 13.5 | Using the app in a very narrow viewport (320px width) — toolbar still usable | | | |
| 13.6 | Using the app in a very wide viewport (2560px) — layout does not break | | | |
| 13.7 | Multiple rapid undos do not corrupt canvas state | | | |
| 13.8 | Switching coloring pages mid-drawing discards old state cleanly | | | |

---

## Device Testing Matrix

| Device | Browser | OS | Screen | Tester | Date |
|--------|---------|-----|--------|--------|------|
| _example: iPad Air_ | _Safari_ | _iPadOS 17_ | _2360x1640_ | | |
| _example: Pixel 7_ | _Chrome_ | _Android 14_ | _1080x2400_ | | |
| _example: Desktop_ | _Chrome 120_ | _Windows 11_ | _1920x1080_ | | |
| | | | | | |
| | | | | | |
| | | | | | |

---

## Notes

- Automated E2E tests (51 Playwright tests) cover smoke and characterisation scenarios but do **not** replace manual touch/gesture testing on real devices.
- When reporting a FAIL, include: device, browser version, steps to reproduce, expected vs actual behavior, and a screenshot if possible.
- This checklist should be updated as new features are added (e.g., progress saving, cloud sync, edge-aware brush).
