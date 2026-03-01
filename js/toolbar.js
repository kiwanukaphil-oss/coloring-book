/**
 * Toolbar
 *
 * Responsible for: Managing tool selection (fill / brush / eraser), brush size
 *   slider, clear/undo/save/gallery button actions, and the clear confirmation dialog.
 * NOT responsible for: Performing drawing (BrushEngine), executing fills (FloodFill),
 *   or managing canvas layers (CanvasManager).
 *
 * Key functions:
 *   - setupToolSwitching: Wires fill/brush/eraser toggle buttons
 *   - setActiveTool: Sets the active tool and updates UI (fill, brush, or eraser)
 *   - setupClearButton: Shows confirmation dialog before clearing the canvas
 *   - setupSaveButton: Composites layers and triggers PNG download
 *   - setupFillTapHandler: Distinguishes taps from drags for flood fill
 *   - getActiveTool: Returns 'fill', 'brush', or 'eraser'
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
    let activeTool = 'fill'; // 'fill', 'brush', or 'eraser'

    function initialize() {
        setupToolSwitching();
        setupBrushSizeSlider();
        setupUndoButton();
        setupRedoButton();
        setupClearButton();
        setupSaveButton();
        setupGalleryButton();
        setupFillTapHandler();
        setupKeyboardShortcuts();
    }

    // Wires up the fill, brush, and eraser buttons to toggle
    // the active tool via setActiveTool.
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
    }

    // Updates the active tool, button highlighting, and brush
    // size slider visibility. Called by button handlers and by
    // ProgressManager when restoring a saved project. The eraser
    // shares the brush size slider since it uses the same stroke width.
    function setActiveTool(tool) {
        activeTool = tool;
        const fillButton = document.getElementById('tool-fill');
        const brushButton = document.getElementById('tool-brush');
        const eraserButton = document.getElementById('tool-eraser');
        const brushSizeControl = document.getElementById('brush-size-control');

        fillButton.classList.remove('active');
        brushButton.classList.remove('active');
        eraserButton.classList.remove('active');

        if (tool === 'fill') {
            fillButton.classList.add('active');
            brushSizeControl.classList.add('hidden');
            CanvasManager.getInteractionCanvas().classList.remove('brush-active');
        } else if (tool === 'brush') {
            brushButton.classList.add('active');
            brushSizeControl.classList.remove('hidden');
        } else if (tool === 'eraser') {
            eraserButton.classList.add('active');
            brushSizeControl.classList.remove('hidden');
        }
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
            UndoManager.saveSnapshot();
            CanvasManager.clearColoringCanvas();
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
    // filename
    function setupSaveButton() {
        document.getElementById('tool-save').addEventListener('pointerdown', () => {
            const dataUrl = CanvasManager.renderCompositeForSave();

            const link = document.createElement('a');
            link.download = 'coloring-' + Date.now() + '.png';
            link.href = dataUrl;
            link.click();

            FeedbackManager.showToast('Saved!');
            ProgressManager.saveCurrentProject();
        });
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

            // Only fill if the pointer didn't move much (it's a tap, not a drag)
            const dx = event.clientX - fillStartX;
            const dy = event.clientY - fillStartY;
            if (Math.sqrt(dx * dx + dy * dy) > 10) return;

            const coords = CanvasManager.getCanvasPixelCoords(event);

            FloodFill.executeFloodFillAtPoint(
                coords.x,
                coords.y,
                ColorPalette.getCurrentColor()
            );
        });
    }

    // Keyboard shortcuts for desktop/laptop users and accessibility.
    // Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo, B = brush,
    // F = fill, E = eraser, [ / ] = brush size down/up.
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
        setBrushSize
    };
})();
