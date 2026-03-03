/**
 * Brush Engine
 *
 * Responsible for: Handling free-hand painting via Pointer Events, drawing smooth
 *   strokes onto the coloring canvas. Supports multiple brush presets (marker,
 *   crayon, watercolor, pencil, sparkle) with pressure sensitivity (ADR-020).
 * NOT responsible for: Tool selection (Toolbar), color choice (ColorPalette),
 *   or managing undo history beyond triggering a snapshot at stroke start.
 *
 * Key functions:
 *   - handlePointerDown: Starts a stroke, saves undo snapshot, draws initial stamp
 *   - handlePointerMove: Draws strokes using coalesced events for smoothness
 *   - handlePointerUp: Ends the stroke and releases pointer capture
 *   - getStrokeColor: Returns the eraser color (white) or the palette color
 *   - restoreOutlinePixels: Resets outline pixels to white after each draw (ADR-008)
 *   - updateCursorPreview: Draws a semi-transparent circle on the cursor canvas
 *   - clearCursorPreview: Clears the cursor canvas when pointer leaves
 *   - setBrushSize / getBrushSize: Controls the stroke width
 *   - getStrokeContext: Returns scratch canvas (brush) or active layer context (eraser) for current stroke (ADR-027)
 *   - setBrushOpacity / getBrushOpacity: Controls per-stroke opacity (ADR-027)
 *   - setActivePreset / getActivePreset: Switches brush preset (ADR-020)
 *
 * Dependencies: CanvasManager, Toolbar, UndoManager, ColorPalette
 *
 * Notes: Uses pointer capture so strokes continue even if the finger/mouse leaves
 *   the canvas mid-stroke. Coalesced events (getCoalescedEvents API) provide
 *   sub-frame touch positions for smoother lines on mobile devices.
 *   The marker preset uses the original lineTo() path unchanged for backward
 *   compatibility. Other presets use stamp-based rendering at even intervals.
 */

const BrushEngine = (() => {
    const ERASER_COLOR = '#FFFFFF';

    // Brush preset definitions (ADR-020).
    // Each preset defines a renderStamp function called at evenly-spaced
    // intervals along the stroke path. The marker preset retains the
    // original lineTo() + round caps path unchanged (spacing: 0).
    //
    // extraPadding: multiplier of brush size added to the undo bbox
    //   to account for particle scatter (e.g. sparkle). 0 for most presets.
    const BRUSH_PRESETS = {
        marker: {
            name: 'marker',
            spacing: 0,
            extraPadding: 0,
            renderStamp: null
        },
        crayon: {
            name: 'crayon',
            spacing: 0.3,
            extraPadding: 0,
            // Textured circle with noise dots, alpha 0.6-0.9.
            // Pressure affects size (×0.8-1.2).
            renderStamp(ctx, x, y, size, color, pressure) {
                const pressuredSize = size * (0.8 + pressure * 0.4);
                const radius = pressuredSize / 2;

                ctx.fillStyle = color;
                ctx.globalAlpha = 0.6 + Math.random() * 0.3;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();

                // Scatter noise dots across the stamp area for texture
                const dotCount = Math.floor(radius * 2);
                for (let i = 0; i < dotCount; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * radius;
                    ctx.globalAlpha = 0.3 + Math.random() * 0.4;
                    ctx.beginPath();
                    ctx.arc(
                        x + Math.cos(angle) * dist,
                        y + Math.sin(angle) * dist,
                        1 + Math.random() * 2, 0, Math.PI * 2
                    );
                    ctx.fill();
                }
                ctx.globalAlpha = 1.0;
            }
        },
        watercolor: {
            name: 'watercolor',
            spacing: 0.5,
            extraPadding: 0,
            // Soft-edge radial gradient, alpha 0.15-0.4.
            // Pressure affects opacity.
            renderStamp(ctx, x, y, size, color, pressure) {
                const radius = size / 2;
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
                gradient.addColorStop(0, color);
                gradient.addColorStop(0.7, color);
                gradient.addColorStop(1, 'transparent');

                ctx.globalAlpha = 0.15 + pressure * 0.25;
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        },
        pencil: {
            name: 'pencil',
            spacing: 0.15,
            extraPadding: 0,
            // Thin circle, alpha 0.6, sharp edges.
            // Pressure affects size (×0.5-1.5).
            renderStamp(ctx, x, y, size, color, pressure) {
                const pressuredSize = size * (0.5 + pressure * 1.0);
                const radius = pressuredSize / 2;

                ctx.globalAlpha = 0.6;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        },
        sparkle: {
            name: 'sparkle',
            spacing: 0.8,
            extraPadding: 1.5,
            // 3-5 random small circles with varied hues.
            // Pressure affects particle count.
            renderStamp(ctx, x, y, size, color, pressure) {
                const count = 3 + Math.floor(pressure * 2);
                const scatter = size;

                for (let i = 0; i < count; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Math.random() * scatter;
                    const dotRadius = 1 + Math.random() * (size / 4);

                    ctx.globalAlpha = 0.7 + Math.random() * 0.3;
                    ctx.fillStyle = shiftColorHue(color, 30);
                    ctx.beginPath();
                    ctx.arc(
                        x + Math.cos(angle) * dist,
                        y + Math.sin(angle) * dist,
                        dotRadius, 0, Math.PI * 2
                    );
                    ctx.fill();
                }
                ctx.globalAlpha = 1.0;
            }
        }
    };

    // Shifts a hex color's hue by a random amount within ±range degrees.
    // Used by the sparkle preset for varied particle colors.
    function shiftColorHue(hex, range) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;

        // RGB to HSL
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        let s = 0;
        const l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            else if (max === g) h = ((b - r) / d + 2) / 6;
            else h = ((r - g) / d + 4) / 6;
        }

        const shifted = (h + (Math.random() - 0.5) * (range / 360) + 1) % 1;

        // HSL to RGB
        function hueToRgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        }

        let nr, ng, nb;
        if (s === 0) {
            nr = ng = nb = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            nr = hueToRgb(p, q, shifted + 1 / 3);
            ng = hueToRgb(p, q, shifted);
            nb = hueToRgb(p, q, shifted - 1 / 3);
        }

        return '#' + ((1 << 24) + (Math.round(nr * 255) << 16) +
            (Math.round(ng * 255) << 8) + Math.round(nb * 255))
            .toString(16).slice(1).toUpperCase();
    }

    let isDrawing = false;
    let brushSize = 12;
    let lastX = 0;
    let lastY = 0;
    let activePreset = 'marker';

    // Tracks distance traveled since the last stamp was placed.
    // Reset at stroke start. Only used for stamp-based presets (spacing > 0).
    let stampDistanceAccumulated = 0;

    // Per-stroke scratch canvas for opacity compositing (ADR-027).
    // Created on pointerdown for the brush tool; removed on pointerup.
    // null when no stroke is in progress.
    let scratchCanvas = null;
    let scratchCtx = null;

    // User-controlled brush opacity (0.05–1.0). Default 1.0 = fully opaque.
    // Eraser always uses 1.0 regardless of this value. (ADR-027)
    let brushOpacity = 1.0;

    // Stroke bounding box accumulator for region-aware undo (ADR-017).
    // Tracks the min/max canvas pixel coordinates across all coalesced
    // events in a single stroke, padded by brush radius on finalize.
    let strokeMinX = Infinity;
    let strokeMinY = Infinity;
    let strokeMaxX = -Infinity;
    let strokeMaxY = -Infinity;

    function initialize() {
        const interactionCanvas = CanvasManager.getInteractionCanvas();

        interactionCanvas.addEventListener('pointerdown', handlePointerDown);
        interactionCanvas.addEventListener('pointermove', handlePointerMove);
        interactionCanvas.addEventListener('pointerup', handlePointerUp);
        interactionCanvas.addEventListener('pointercancel', handlePointerUp);
        interactionCanvas.addEventListener('pointerleave', handlePointerUp);

        // Cursor preview follows the pointer whenever the brush tool is active
        interactionCanvas.addEventListener('pointermove', updateCursorPreview);
        interactionCanvas.addEventListener('pointerleave', clearCursorPreview);
    }

    // Returns true when the active tool uses stroke-based drawing
    // (brush or eraser). Both share the same pointer handling.
    function isStrokeTool() {
        const tool = Toolbar.getActiveTool();
        return tool === 'brush' || tool === 'eraser';
    }

    // Returns white for the eraser, or the palette color for
    // the brush. Centralizes the color decision so both
    // handlePointerDown and handlePointerMove stay DRY.
    function getStrokeColor() {
        return Toolbar.getActiveTool() === 'eraser'
            ? ERASER_COLOR
            : ColorPalette.getCurrentColor();
    }

    // Returns the brush size scaled to native canvas pixel
    // resolution. The slider value is in CSS pixels, but
    // withNativeTransform draws at identity transform, so
    // we multiply by the DPI scale factor to keep the visual
    // stroke size matching the slider value on high-DPI screens.
    function getScaledBrushSize() {
        return brushSize * CanvasManager.getScaleFactor();
    }

    // Returns the effective preset for the current tool. The eraser
    // always uses the marker preset regardless of activePreset,
    // because stamp-based erasure (e.g. watercolor at alpha 0.15)
    // would not fully remove paint.
    function getEffectivePreset() {
        if (Toolbar.getActiveTool() === 'eraser') return BRUSH_PRESETS.marker;
        return BRUSH_PRESETS[activePreset];
    }

    // Returns the context to draw onto during a stroke. The brush tool uses
    // scratchCtx so the full stroke can be composited at brushOpacity on pointerup,
    // preventing within-stroke alpha compounding. (ADR-027)
    // The eraser draws directly to the active layer — a partial-opacity erase
    // would leave colour residue, which is not the expected eraser behaviour.
    function getStrokeContext() {
        return scratchCtx !== null ? scratchCtx : CanvasManager.getColoringContext();
    }

    function handlePointerDown(event) {
        if (!isStrokeTool()) return;
        // Skip brush strokes during spacebar pan (ADR-009)
        if (typeof ViewportManager !== 'undefined' && ViewportManager.isPanActive()) return;

        event.preventDefault();
        event.target.setPointerCapture?.(event.pointerId);
        isDrawing = true;

        // Save region-aware undo snapshot at stroke start (ADR-017).
        // Full canvas is captured now; cropped to stroke bbox on pointerup.
        UndoManager.saveSnapshotForRegion();

        const coords = CanvasManager.getCanvasPixelCoords(event);
        lastX = coords.x;
        lastY = coords.y;

        // Initialize stroke bbox from the starting point (ADR-017)
        strokeMinX = coords.x;
        strokeMinY = coords.y;
        strokeMaxX = coords.x;
        strokeMaxY = coords.y;

        const scaledSize = getScaledBrushSize();
        const preset = getEffectivePreset();

        // Create per-stroke scratch canvas for opacity compositing (ADR-027).
        // Not used for the eraser — eraser always draws at full opacity.
        if (Toolbar.getActiveTool() === 'brush') {
            const activeCanvas = CanvasManager.getColoringCanvas();
            const scaleFactor = CanvasManager.getScaleFactor();
            scratchCanvas = document.createElement('canvas');
            scratchCanvas.width = activeCanvas.width;
            scratchCanvas.height = activeCanvas.height;
            scratchCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:7;';
            scratchCanvas.style.width = (activeCanvas.width / scaleFactor) + 'px';
            scratchCanvas.style.height = (activeCanvas.height / scaleFactor) + 'px';
            scratchCanvas.style.opacity = String(brushOpacity);
            activeCanvas.parentElement.appendChild(scratchCanvas);
            scratchCtx = scratchCanvas.getContext('2d');
            scratchCtx.scale(scaleFactor, scaleFactor);
        }

        if (preset.spacing === 0) {
            // Original marker dot at starting point for single taps.
            // restoreOutlinePixels deferred to handlePointerUp (ADR-027).
            CanvasManager.withNativeTransform(getStrokeContext(), (ctx) => {
                ctx.fillStyle = getStrokeColor();
                ctx.beginPath();
                ctx.arc(coords.x, coords.y, scaledSize / 2, 0, Math.PI * 2);
                ctx.fill();
            });
        } else {
            // Place first stamp at tap point (ADR-020).
            // restoreOutlinePixels deferred to handlePointerUp (ADR-027).
            stampDistanceAccumulated = 0;
            const pressure = event.pressure || 0.5;
            CanvasManager.withNativeTransform(getStrokeContext(), (ctx) => {
                preset.renderStamp(ctx, coords.x, coords.y, scaledSize, getStrokeColor(), pressure);
            });
        }
    }

    // Processes pointer movement during a brush stroke. Uses
    // getCoalescedEvents() to capture all intermediate touch
    // positions between animation frames, producing smoother
    // lines on fast-moving finger strokes.
    // For stamp-based presets, places stamps at even intervals
    // along the stroke path (ADR-020).
    function handlePointerMove(event) {
        if (!isDrawing || !isStrokeTool()) return;

        event.preventDefault();

        const scaledSize = getScaledBrushSize();
        const preset = getEffectivePreset();

        if (preset.spacing === 0) {
            renderMarkerSegment(event, scaledSize);
        } else {
            renderStampedSegment(event, scaledSize, preset);
        }
    }

    // Original marker rendering path — lineTo() with round caps.
    // Draws onto getStrokeContext() (scratch canvas for brush tool) so the full stroke
    // can be composited at brushOpacity on pointerup without within-stroke compounding.
    // restoreOutlinePixels is deferred to handlePointerUp (ADR-027).
    function renderMarkerSegment(event, scaledSize) {
        CanvasManager.withNativeTransform(getStrokeContext(), (ctx) => {
            ctx.strokeStyle = getStrokeColor();
            ctx.lineWidth = scaledSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Use coalesced events for smoother strokes (when available)
            const coalescedEvents = event.getCoalescedEvents
                ? event.getCoalescedEvents()
                : [event];

            for (const coalescedEvent of coalescedEvents) {
                const coords = CanvasManager.getCanvasPixelCoords(coalescedEvent);
                ctx.beginPath();
                ctx.moveTo(lastX, lastY);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();

                // Expand stroke bbox for region-aware undo (ADR-017)
                strokeMinX = Math.min(strokeMinX, coords.x);
                strokeMinY = Math.min(strokeMinY, coords.y);
                strokeMaxX = Math.max(strokeMaxX, coords.x);
                strokeMaxY = Math.max(strokeMaxY, coords.y);

                lastX = coords.x;
                lastY = coords.y;
            }
        });
    }

    // Stamp-based rendering for non-marker presets (ADR-020).
    // Places stamps at even intervals (preset.spacing × brushSize) along the stroke path.
    // Draws onto getStrokeContext() (scratch canvas for brush tool) so the full stroke
    // can be composited at brushOpacity on pointerup without within-stroke compounding.
    // restoreOutlinePixels is deferred to handlePointerUp (ADR-027).
    function renderStampedSegment(event, scaledSize, preset) {
        const coalescedEvents = event.getCoalescedEvents
            ? event.getCoalescedEvents()
            : [event];

        const color = getStrokeColor();
        const stampSpacing = preset.spacing * scaledSize;

        CanvasManager.withNativeTransform(getStrokeContext(), (ctx) => {
            for (const coalescedEvent of coalescedEvents) {
                const coords = CanvasManager.getCanvasPixelCoords(coalescedEvent);
                const pressure = coalescedEvent.pressure || 0.5;

                const dx = coords.x - lastX;
                const dy = coords.y - lastY;
                const segmentLength = Math.sqrt(dx * dx + dy * dy);

                if (segmentLength > 0 && stampSpacing > 0) {
                    // How far along this segment before the next stamp is due
                    const distanceToNextStamp = stampSpacing - stampDistanceAccumulated;

                    if (segmentLength < distanceToNextStamp) {
                        // Not enough distance for a stamp in this segment
                        stampDistanceAccumulated += segmentLength;
                    } else {
                        // Walk along the segment placing stamps at even intervals
                        let traveled = distanceToNextStamp;
                        while (traveled <= segmentLength) {
                            const t = traveled / segmentLength;
                            const stampX = lastX + dx * t;
                            const stampY = lastY + dy * t;

                            preset.renderStamp(ctx, stampX, stampY, scaledSize, color, pressure);

                            // Expand stroke bbox for region-aware undo (ADR-017)
                            strokeMinX = Math.min(strokeMinX, stampX);
                            strokeMinY = Math.min(strokeMinY, stampY);
                            strokeMaxX = Math.max(strokeMaxX, stampX);
                            strokeMaxY = Math.max(strokeMaxY, stampY);

                            traveled += stampSpacing;
                        }
                        // Leftover distance since last stamp
                        stampDistanceAccumulated = segmentLength - (traveled - stampSpacing);
                    }
                }

                lastX = coords.x;
                lastY = coords.y;
            }
        });
    }

    // After drawing a brush segment, resets any pixels that
    // overlap with outline boundaries back to white. This keeps
    // paint "inside the lines." Only operates on the small
    // bounding box of the affected stroke segment for performance.
    // Skips entirely when no outline mask is loaded. (ADR-008)
    function restoreOutlinePixels(ctx, regionX, regionY, regionWidth, regionHeight) {
        const mask = CanvasManager.getOutlineMask();
        if (!mask) return;

        const canvasWidth = CanvasManager.getColoringCanvas().width;
        const canvasHeight = CanvasManager.getColoringCanvas().height;

        // Clamp to canvas bounds
        const x0 = Math.max(0, Math.floor(regionX));
        const y0 = Math.max(0, Math.floor(regionY));
        const x1 = Math.min(canvasWidth, Math.ceil(regionX + regionWidth));
        const y1 = Math.min(canvasHeight, Math.ceil(regionY + regionHeight));
        const w = x1 - x0;
        const h = y1 - y0;
        if (w <= 0 || h <= 0) return;

        const imageData = ctx.getImageData(x0, y0, w, h);
        const pixels = imageData.data;
        let hasOutlineOverlap = false;

        for (let row = 0; row < h; row++) {
            for (let col = 0; col < w; col++) {
                const maskIndex = (y0 + row) * canvasWidth + (x0 + col);
                if (mask[maskIndex] === 1) {
                    const pixelIndex = (row * w + col) * 4;
                    // Restore outline pixels to white so the outline
                    // layer (z-3) renders cleanly on top
                    pixels[pixelIndex] = 255;
                    pixels[pixelIndex + 1] = 255;
                    pixels[pixelIndex + 2] = 255;
                    pixels[pixelIndex + 3] = 255;
                    hasOutlineOverlap = true;
                }
            }
        }

        if (hasOutlineOverlap) {
            ctx.putImageData(imageData, x0, y0);
        }
    }

    // Draws a semi-transparent circle on the cursor canvas showing
    // the brush size and color at the current pointer position.
    // Hides the default CSS cursor when active. Only runs when the
    // brush tool is selected. Skips during active drawing to avoid
    // visual clutter during fast strokes.
    // Shows a circular cursor preview for brush and eraser tools.
    // The eraser shows a gray outline (since white on white canvas
    // would be invisible), while the brush shows the selected color.
    function updateCursorPreview(event) {
        const interactionCanvas = CanvasManager.getInteractionCanvas();

        if (!isStrokeTool()) {
            interactionCanvas.classList.remove('brush-active');
            clearCursorPreview();
            return;
        }

        interactionCanvas.classList.add('brush-active');

        const cursorCanvas = CanvasManager.getCursorCanvas();
        const cursorCtx = CanvasManager.getCursorContext();
        const coords = CanvasManager.getCanvasPixelCoords(event);
        const isEraser = Toolbar.getActiveTool() === 'eraser';

        const scaledSize = getScaledBrushSize();

        CanvasManager.withNativeTransform(cursorCtx, (ctx) => {
            ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
            ctx.beginPath();
            ctx.arc(coords.x, coords.y, scaledSize / 2, 0, Math.PI * 2);
            ctx.strokeStyle = isEraser ? '#999999' : ColorPalette.getCurrentColor();
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.5;
            ctx.stroke();
        });
    }

    function clearCursorPreview() {
        const cursorCanvas = CanvasManager.getCursorCanvas();
        if (!cursorCanvas) return;
        const cursorCtx = CanvasManager.getCursorContext();
        CanvasManager.withNativeTransform(cursorCtx, (ctx) => {
            ctx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        });
    }

    // Ends the stroke, composites the scratch canvas onto the active layer at
    // brushOpacity, runs outline restoration once over the full stroke bbox,
    // then finalizes the region-aware undo command. (ADR-017, ADR-020, ADR-027)
    function handlePointerUp(event) {
        if (!isDrawing) return;
        event.target.releasePointerCapture?.(event.pointerId);
        isDrawing = false;

        const scaledSize = getScaledBrushSize();
        const preset = getEffectivePreset();
        const extraPadding = preset.extraPadding * scaledSize;
        const padding = scaledSize / 2 + extraPadding + 2;

        // Composite scratch canvas and restore outline pixels for the full stroke bbox. (ADR-027, ADR-008)
        if (scratchCanvas !== null) {
            // Brush tool: composite scratch canvas at brushOpacity, then restore outline pixels.
            CanvasManager.withNativeTransform(CanvasManager.getColoringContext(), (ctx) => {
                ctx.globalAlpha = brushOpacity;
                ctx.drawImage(scratchCanvas, 0, 0);
                ctx.globalAlpha = 1.0;
                restoreOutlinePixels(ctx,
                    strokeMinX - padding, strokeMinY - padding,
                    (strokeMaxX - strokeMinX) + padding * 2,
                    (strokeMaxY - strokeMinY) + padding * 2
                );
            });
            scratchCanvas.parentElement.removeChild(scratchCanvas);
            scratchCanvas = null;
            scratchCtx = null;
        } else {
            // Eraser tool: draws directly to the active layer at full opacity. Restoration is
            // called explicitly rather than relying on ERASER_COLOR being white — correct by
            // construction if eraser behaviour ever changes. (ADR-008)
            CanvasManager.withNativeTransform(CanvasManager.getColoringContext(), (ctx) => {
                restoreOutlinePixels(ctx,
                    strokeMinX - padding, strokeMinY - padding,
                    (strokeMaxX - strokeMinX) + padding * 2,
                    (strokeMaxY - strokeMinY) + padding * 2
                );
            });
        }

        // Finalize region-aware undo with the stroke bounding box (ADR-017)
        const bbox = {
            x: strokeMinX - padding,
            y: strokeMinY - padding,
            width: (strokeMaxX - strokeMinX) + padding * 2,
            height: (strokeMaxY - strokeMinY) + padding * 2
        };
        UndoManager.finalizeWithRegion(bbox);

        // Reset stroke bbox and stamp distance for next stroke
        strokeMinX = Infinity;
        strokeMinY = Infinity;
        strokeMaxX = -Infinity;
        strokeMaxY = -Infinity;
        stampDistanceAccumulated = 0;

        ProgressManager.scheduleAutoSave();
        EventBus.emit('stroke:complete');
    }

    function setBrushSize(size) {
        brushSize = size;
    }

    function getBrushSize() {
        return brushSize;
    }

    function setBrushOpacity(opacity) {
        brushOpacity = Math.max(0.05, Math.min(1, opacity));
    }

    function getBrushOpacity() {
        return brushOpacity;
    }

    function setActivePreset(name) {
        if (BRUSH_PRESETS[name]) {
            activePreset = name;
        }
    }

    function getActivePreset() {
        return activePreset;
    }

    return {
        initialize,
        setBrushSize,
        getBrushSize,
        setBrushOpacity,
        getBrushOpacity,
        setActivePreset,
        getActivePreset
    };
})();
