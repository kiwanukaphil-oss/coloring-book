/* ========================================
   Toolbar
   Manages tool selection (fill vs brush),
   brush size slider, clear/undo/save/gallery
   button actions, and the clear confirmation
   dialog.
   ======================================== */

const Toolbar = (() => {
    let activeTool = 'fill'; // 'fill' or 'brush'

    function initialize() {
        setupToolSwitching();
        setupBrushSizeSlider();
        setupUndoButton();
        setupClearButton();
        setupSaveButton();
        setupGalleryButton();
        setupFillTapHandler();
    }

    // Wires up the fill and brush buttons to toggle the active
    // tool. Updates button highlighting and shows/hides the
    // brush size slider as appropriate.
    function setupToolSwitching() {
        const fillButton = document.getElementById('tool-fill');
        const brushButton = document.getElementById('tool-brush');
        const brushSizeControl = document.getElementById('brush-size-control');

        fillButton.addEventListener('pointerdown', () => {
            activeTool = 'fill';
            fillButton.classList.add('active');
            brushButton.classList.remove('active');
            brushSizeControl.classList.add('hidden');
        });

        brushButton.addEventListener('pointerdown', () => {
            activeTool = 'brush';
            brushButton.classList.add('active');
            fillButton.classList.remove('active');
            brushSizeControl.classList.remove('hidden');
        });
    }

    function setupBrushSizeSlider() {
        const slider = document.getElementById('brush-size-slider');
        const valueDisplay = document.getElementById('brush-size-value');

        slider.addEventListener('input', () => {
            const size = parseInt(slider.value, 10);
            BrushEngine.setBrushSize(size);
            valueDisplay.textContent = size;
        });
    }

    function setupUndoButton() {
        document.getElementById('tool-undo').addEventListener('pointerdown', () => {
            UndoManager.undoLastAction();
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
        let fillPointerDown = false;
        let fillStartX = 0;
        let fillStartY = 0;

        interactionCanvas.addEventListener('pointerdown', (event) => {
            if (activeTool !== 'fill') return;
            event.preventDefault();

            fillPointerDown = true;
            fillStartX = event.clientX;
            fillStartY = event.clientY;
        });

        interactionCanvas.addEventListener('pointerup', (event) => {
            if (!fillPointerDown || activeTool !== 'fill') {
                fillPointerDown = false;
                return;
            }
            fillPointerDown = false;

            // Only fill if the pointer didn't move much (it's a tap, not a drag)
            const dx = event.clientX - fillStartX;
            const dy = event.clientY - fillStartY;
            if (Math.sqrt(dx * dx + dy * dy) > 10) return;

            const rect = interactionCanvas.getBoundingClientRect();
            const cssX = event.clientX - rect.left;
            const cssY = event.clientY - rect.top;

            FloodFill.executeFloodFillAtPoint(
                cssX,
                cssY,
                ColorPalette.getCurrentColor()
            );
        });
    }

    function getActiveTool() {
        return activeTool;
    }

    return {
        initialize,
        getActiveTool
    };
})();
