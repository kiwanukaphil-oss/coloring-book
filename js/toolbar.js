/**
 * Toolbar
 *
 * Responsible for: Managing tool selection (fill / brush / eraser / eyedropper),
 *   brush size slider, brush preset selection (ADR-020), clear/undo/save/gallery
 *   button actions, and the clear confirmation dialog.
 * NOT responsible for: Performing drawing (BrushEngine), executing fills (FloodFill),
 *   or managing canvas layers (CanvasManager).
 *
 * Key functions:
 *   - setupToolSwitching: Wires fill/brush/eraser/eyedropper toggle buttons
 *   - setActiveTool: Sets the active tool and updates UI (fill, brush, eraser, or eyedropper)
 *   - setActivePreset: Sets brush preset via BrushEngine, updates UI, emits event (ADR-020)
 *   - setupClearButton: Shows confirmation dialog before clearing the canvas
 *   - setupSaveButton: Composites layers and triggers PNG download
 *   - setupFillTapHandler: Distinguishes taps from drags for flood fill
 *   - setupEyedropperHandler: Handles eyedropper tap with auto-switch-back (ADR-018)
 *   - getActiveTool: Returns 'fill', 'brush', 'eraser', or 'eyedropper'
 *   - setBrushOpacity: Updates brush opacity in BrushEngine and syncs slider UI (ADR-027)
 *   - getActivePreset: Returns the active brush preset name (ADR-020)
 *
 * Dependencies: CanvasManager, FloodFill, ColorPalette, BrushEngine, UndoManager,
 *   ImageLoader
 *
 * Notes: Fill uses a 10px movement threshold to distinguish taps from drags —
 *   this prevents accidental fills when the user is panning on mobile. The eraser
 *   is mechanically identical to the brush but hardcoded to white (#FFFFFF).
 *   Must be initialized last because it depends on all other modules.
 */

const Toolbar = (() => {
    let activeTool = 'fill'; // 'fill', 'brush', 'eraser', or 'eyedropper'

    // Stores the tool that was active before switching to eyedropper,
    // so it can be restored after sampling (ADR-018: transient tool pattern)
    let previousToolBeforeEyedropper = null;

    function initialize() {
        setupToolSwitching();
        setupBrushSizeSlider();
        setupBrushOpacitySlider();
        setupPresetSwitching();
        setupUndoButton();
        setupRedoButton();
        setupClearButton();
        setupSaveButton();
        setupGalleryButton();
        setupFillTapHandler();
        setupEyedropperHandler();
        setupKeyboardShortcuts();
    }

    // Wires up the fill, brush, eraser, and eyedropper buttons
    // to toggle the active tool via setActiveTool.
    function setupToolSwitching() {
        document.getElementById('tool-fill').addEventListener('pointerdown', () => {
            setActiveTool('fill');
        });

        document.getElementById('tool-brush').addEventListener('pointerdown', () => {
            setActiveTool('brush');
        });

        document.getElementById('tool-eraser').addEventListener('pointerdown', () => {
            setActiveTool('eraser');
        });

        const eyedropperBtn = document.getElementById('tool-eyedropper');
        if (eyedropperBtn) {
            eyedropperBtn.addEventListener('pointerdown', () => {
                setActiveTool('eyedropper');
            });
        }
    }

    // Updates the active tool, button highlighting, and brush
    // size slider visibility. Called by button handlers and by
    // ProgressManager when restoring a saved project. The eraser
    // shares the brush size slider since it uses the same stroke width.
    // When switching to eyedropper, stores the current tool for
    // auto-switch-back after sampling (ADR-018).
    function setActiveTool(tool) {
        // Track previous tool for eyedropper auto-switch-back (ADR-018)
        if (tool === 'eyedropper' && activeTool !== 'eyedropper') {
            previousToolBeforeEyedropper = activeTool;
        }

        activeTool = tool;
        const fillButton = document.getElementById('tool-fill');
        const brushButton = document.getElementById('tool-brush');
        const eraserButton = document.getElementById('tool-eraser');
        const eyedropperButton = document.getElementById('tool-eyedropper');
        const brushSizeControl = document.getElementById('brush-size-control');
        const brushOpacityControl = document.getElementById('brush-opacity-control');

        fillButton.classList.remove('active');
        brushButton.classList.remove('active');
        eraserButton.classList.remove('active');
        if (eyedropperButton) eyedropperButton.classList.remove('active');

        // Toggle aria-pressed for screen readers (ADR-013)
        fillButton.setAttribute('aria-pressed', tool === 'fill' ? 'true' : 'false');
        brushButton.setAttribute('aria-pressed', tool === 'brush' ? 'true' : 'false');
        eraserButton.setAttribute('aria-pressed', tool === 'eraser' ? 'true' : 'false');
        if (eyedropperButton) eyedropperButton.setAttribute('aria-pressed', tool === 'eyedropper' ? 'true' : 'false');

        if (tool === 'fill') {
            fillButton.classList.add('active');
            brushSizeControl.classList.add('hidden');
            brushOpacityControl.classList.add('hidden');
            CanvasManager.getInteractionCanvas().classList.remove('brush-active');
            CanvasManager.getInteractionCanvas().classList.remove('eyedropper-active');
        } else if (tool === 'brush') {
            brushButton.classList.add('active');
            brushSizeControl.classList.remove('hidden');
            brushOpacityControl.classList.remove('hidden');
            CanvasManager.getInteractionCanvas().classList.remove('eyedropper-active');
        } else if (tool === 'eraser') {
            eraserButton.classList.add('active');
            brushSizeControl.classList.remove('hidden');
            brushOpacityControl.classList.add('hidden');
            CanvasManager.getInteractionCanvas().classList.remove('eyedropper-active');
        } else if (tool === 'eyedropper') {
            if (eyedropperButton) eyedropperButton.classList.add('active');
            brushSizeControl.classList.add('hidden');
            brushOpacityControl.classList.add('hidden');
            CanvasManager.getInteractionCanvas().classList.remove('brush-active');
            CanvasManager.getInteractionCanvas().classList.add('eyedropper-active');
        }

        // Show preset selector only when brush tool is active (ADR-020)
        const presetControl = document.getElementById('brush-preset-control');
        if (presetControl) {
            presetControl.classList.toggle('hidden', tool !== 'brush');
        }

        EventBus.emit('tool:changed', { tool });
    }

    // Wires the classic toolbar preset buttons to switch the
    // active brush preset via setActivePreset (ADR-020).
    function setupPresetSwitching() {
        const presetControl = document.getElementById('brush-preset-control');
        if (!presetControl) return;

        const presetButtons = presetControl.querySelectorAll('.preset-button');
        presetButtons.forEach((button) => {
            button.addEventListener('pointerdown', function handlePresetSelect() {
                const preset = button.getAttribute('data-preset');
                setActivePreset(preset);
            });
        });
    }

    // Sets the active brush preset in BrushEngine, updates the
    // classic toolbar preset buttons, and emits a preset:changed
    // event for kids/studio UI sync (ADR-020).
    function setActivePreset(name) {
        BrushEngine.setActivePreset(name);
        updatePresetActiveState(name);
        EventBus.emit('preset:changed', { preset: name });
    }

    function getActivePreset() {
        return BrushEngine.getActivePreset();
    }

    // Updates which preset button shows the active state in
    // the classic toolbar preset control.
    function updatePresetActiveState(preset) {
        const presetControl = document.getElementById('brush-preset-control');
        if (!presetControl) return;

        presetControl.querySelectorAll('.preset-button').forEach((btn) => {
            const isActive = btn.getAttribute('data-preset') === preset;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function setupBrushSizeSlider() {
        document.getElementById('brush-size-slider').addEventListener('input', (event) => {
            setBrushSize(parseInt(event.target.value, 10));
        });
    }

    // Updates the brush size in BrushEngine and syncs the slider
    // UI. Called by the slider handler and by ProgressManager
    // when restoring a saved project.
    function setBrushSize(size) {
        const slider = document.getElementById('brush-size-slider');
        const valueDisplay = document.getElementById('brush-size-value');
        slider.value = size;
        valueDisplay.textContent = size;
        BrushEngine.setBrushSize(size);
    }

    function setupBrushOpacitySlider() {
        document.getElementById('brush-opacity-slider').addEventListener('input', (event) => {
            setBrushOpacity(parseInt(event.target.value, 10));
        });
    }

    // Updates the brush opacity in BrushEngine and syncs the slider UI.
    // Accepts an integer percentage (5–100); converts to 0.05–1.0 for BrushEngine.
    function setBrushOpacity(percent) {
        const slider = document.getElementById('brush-opacity-slider');
        const valueDisplay = document.getElementById('brush-opacity-value');
        slider.value = percent;
        valueDisplay.textContent = percent + '%';
        BrushEngine.setBrushOpacity(percent / 100);
    }

    function setupUndoButton() {
        document.getElementById('tool-undo').addEventListener('pointerdown', () => {
            UndoManager.undoLastAction();
            ProgressManager.scheduleAutoSave();
        });
    }

    function setupRedoButton() {
        document.getElementById('tool-redo').addEventListener('pointerdown', () => {
            UndoManager.redoLastAction();
            ProgressManager.scheduleAutoSave();
        });
    }

    // Shows a confirmation dialog before clearing the coloring
    // canvas, so kids don't accidentally lose their work
    function setupClearButton() {
        const clearModal = document.getElementById('clear-confirm-modal');
        const confirmYes = document.getElementById('clear-confirm-yes');
        const confirmNo = document.getElementById('clear-confirm-no');

        document.getElementById('tool-clear').addEventListener('pointerdown', () => {
            clearModal.classList.remove('hidden');
        });

        confirmYes.addEventListener('pointerdown', () => {
            // Clear is a non-undoable fresh start: wipe all layers and undo
            // history so the cleared state is the new baseline. (ADR-024, ADR-026)
            UndoManager.clearHistory();
            CanvasManager.clearAllColoringCanvases();
            clearModal.classList.add('hidden');
            ProgressManager.scheduleAutoSave();
        });

        confirmNo.addEventListener('pointerdown', () => {
            clearModal.classList.add('hidden');
        });

        // Close on backdrop click
        clearModal.addEventListener('pointerdown', (event) => {
            if (event.target === clearModal) {
                clearModal.classList.add('hidden');
            }
        });
    }

    // Composites the coloring and outline layers into a single
    // PNG image and triggers a browser download with a timestamped
    // filename. Public so Kids/Studio save buttons can delegate
    // here instead of duplicating the logic (ADR-015).
    function saveAndDownload() {
        const dataUrl = CanvasManager.renderCompositeForSave();

        const link = document.createElement('a');
        link.download = 'coloring-' + Date.now() + '.png';
        link.href = dataUrl;
        link.click();

        FeedbackManager.showToast('Saved!');
        ProgressManager.saveCurrentProject();
        EventBus.emit('save:complete');
    }

    function setupSaveButton() {
        document.getElementById('tool-save').addEventListener('pointerdown', saveAndDownload);
    }

    function setupGalleryButton() {
        document.getElementById('tool-gallery').addEventListener('pointerdown', () => {
            ImageLoader.showGallery();
        });
    }

    // Listens for taps on the interaction canvas. When the fill
    // tool is active and the user taps (not drags), executes a
    // flood fill at that position with the selected color.
    function setupFillTapHandler() {
        const interactionCanvas = CanvasManager.getInteractionCanvas();
        let isFillPointerDown = false;
        let fillStartX = 0;
        let fillStartY = 0;

        interactionCanvas.addEventListener('pointerdown', (event) => {
            if (activeTool !== 'fill') return;
            // Skip fill when spacebar pan is active (ADR-009)
            if (typeof ViewportManager !== 'undefined' && ViewportManager.isPanActive()) return;
            event.preventDefault();

            isFillPointerDown = true;
            fillStartX = event.clientX;
            fillStartY = event.clientY;
        });

        interactionCanvas.addEventListener('pointerup', (event) => {
            if (!isFillPointerDown || activeTool !== 'fill') {
                isFillPointerDown = false;
                return;
            }
            isFillPointerDown = false;

            // Only fill if the pointer didn't move much (it's a tap, not a drag).
            // Scale threshold by viewport zoom so fills stay accurate at high zoom (ADR-009).
            const dx = event.clientX - fillStartX;
            const dy = event.clientY - fillStartY;
            const tapThreshold = 10 * (typeof ViewportManager !== 'undefined' ? ViewportManager.getScale() : 1);
            if (Math.sqrt(dx * dx + dy * dy) > tapThreshold) return;

            const coords = CanvasManager.getCanvasPixelCoords(event);

            FloodFill.executeFloodFillAtPoint(
                coords.x,
                coords.y,
                ColorPalette.getCurrentColor()
            );
        });
    }

    // Handles eyedropper taps on the canvas. When the eyedropper
    // tool is active, reads the pixel color at the tap point, sets
    // it as the active color, adds to recent colors, shows a toast,
    // and auto-switches back to the previous tool. (ADR-018)
    function setupEyedropperHandler() {
        const interactionCanvas = CanvasManager.getInteractionCanvas();
        let isEyedropperDown = false;
        let eyedropperStartX = 0;
        let eyedropperStartY = 0;

        interactionCanvas.addEventListener('pointerdown', (event) => {
            if (activeTool !== 'eyedropper') return;
            if (typeof ViewportManager !== 'undefined' && ViewportManager.isPanActive()) return;
            event.preventDefault();

            isEyedropperDown = true;
            eyedropperStartX = event.clientX;
            eyedropperStartY = event.clientY;
        });

        interactionCanvas.addEventListener('pointerup', (event) => {
            if (!isEyedropperDown || activeTool !== 'eyedropper') {
                isEyedropperDown = false;
                return;
            }
            isEyedropperDown = false;

            // Only sample if the pointer didn't move much (tap, not drag)
            const dx = event.clientX - eyedropperStartX;
            const dy = event.clientY - eyedropperStartY;
            const tapThreshold = 10 * (typeof ViewportManager !== 'undefined' ? ViewportManager.getScale() : 1);
            if (Math.sqrt(dx * dx + dy * dy) > tapThreshold) return;

            const coords = CanvasManager.getCanvasPixelCoords(event);
            const sampledColor = CanvasManager.getPixelColorAt(coords.x, coords.y);

            if (sampledColor === null) return;

            ColorPalette.setCurrentColor(sampledColor);
            ColorPicker.addRecentColor(sampledColor);
            FeedbackManager.showToast('Color picked!');

            // Auto-switch-back to previous tool (ADR-018)
            const restoreTool = previousToolBeforeEyedropper || 'brush';
            previousToolBeforeEyedropper = null;
            setActiveTool(restoreTool);
        });
    }

    // Keyboard shortcuts for desktop/laptop users and accessibility.
    // Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo, B = brush,
    // F = fill, E = eraser, I = eyedropper (ADR-018), [ / ] = brush size down/up.
    // Shortcuts are suppressed when a modal is open so they don't
    // interfere with modal interactions.
    function setupKeyboardShortcuts() {
        const BRUSH_SIZE_STEP = 4;
        const MIN_BRUSH_SIZE = 4;
        const MAX_BRUSH_SIZE = 40;

        document.addEventListener('keydown', function handleKeyboardShortcut(event) {
            // Suppress shortcuts when a modal is visible
            const galleryModal = document.getElementById('image-gallery-modal');
            const clearModal = document.getElementById('clear-confirm-modal');
            const resumeModal = document.getElementById('resume-modal');
            if (!galleryModal.classList.contains('hidden') ||
                !clearModal.classList.contains('hidden') ||
                !resumeModal.classList.contains('hidden')) {
                return;
            }

            const key = event.key.toLowerCase();

            // Ctrl+Z = undo, Ctrl+Y or Ctrl+Shift+Z = redo
            if ((event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey) {
                event.preventDefault();
                UndoManager.undoLastAction();
                ProgressManager.scheduleAutoSave();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && (key === 'y' || (key === 'z' && event.shiftKey))) {
                event.preventDefault();
                UndoManager.redoLastAction();
                ProgressManager.scheduleAutoSave();
                return;
            }

            // Skip single-key shortcuts if a modifier is held
            if (event.ctrlKey || event.metaKey || event.altKey) return;

            if (key === 'b') {
                setActiveTool('brush');
            } else if (key === 'f') {
                setActiveTool('fill');
            } else if (key === 'e') {
                setActiveTool('eraser');
            } else if (key === 'i') {
                setActiveTool('eyedropper');
            } else if (key === '1') {
                setActivePreset('marker');
            } else if (key === '2') {
                setActivePreset('crayon');
            } else if (key === '3') {
                setActivePreset('watercolor');
            } else if (key === '4') {
                setActivePreset('pencil');
            } else if (key === '5') {
                setActivePreset('sparkle');
            } else if (key === '[') {
                const currentSize = BrushEngine.getBrushSize();
                setBrushSize(Math.max(MIN_BRUSH_SIZE, currentSize - BRUSH_SIZE_STEP));
            } else if (key === ']') {
                const currentSize = BrushEngine.getBrushSize();
                setBrushSize(Math.min(MAX_BRUSH_SIZE, currentSize + BRUSH_SIZE_STEP));
            }
        });
    }

    function getActiveTool() {
        return activeTool;
    }

    return {
        initialize,
        getActiveTool,
        setActiveTool,
        setBrushSize,
        setBrushOpacity,
        setActivePreset,
        getActivePreset,
        saveAndDownload
    };
})();
