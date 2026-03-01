/**
 * Image Loader
 *
 * Responsible for: Managing the coloring page gallery (pre-loaded thumbnails and device
 *   uploads), the draggable/resizable reference image panel, and loading images onto
 *   the canvas.
 * NOT responsible for: Canvas rendering or image processing — CanvasManager handles
 *   the actual drawing, white-pixel removal, and layer management.
 *
 * Key functions:
 *   - buildGalleryThumbnails: Creates clickable cards for each pre-loaded coloring page
 *   - loadColoringPage: Loads a selected image onto the outline canvas, resets undo
 *   - setupUploadHandler: Wires the file input for user-uploaded coloring pages
 *   - setupReferenceUploadHandler: Wires the file input for reference guide images
 *   - handleReferencePanelPointerMove: Handles drag and resize of the reference panel
 *   - showReferencePanel / hideReferencePanel: Controls reference panel visibility
 *
 * Dependencies: CanvasManager, UndoManager
 *
 * Notes: The reference panel uses pointer capture for reliable drag/resize across
 *   the entire viewport. Panel position is clamped to the canvas container bounds.
 *   Gallery cards auto-hide if their thumbnail image fails to load (file not found).
 */

const ImageLoader = (() => {
    // Add more entries here as you place new images in images/coloring-pages/
    // Supports both PNG and SVG formats. Cards auto-hide if file is missing.
    const PRELOADED_COLORING_PAGES = [
        { id: 'cat', title: 'Cat', src: 'images/coloring-pages/cat.svg' },
    ];

    let galleryModal = null;
    let galleryGrid = null;
    let referencePanel = null;
    let referencePanelHandle = null;
    let referencePanelClose = null;
    let referencePanelResize = null;
    let referencePreviewImage = null;
    let isDraggingReferencePanel = false;
    let isResizingReferencePanel = false;
    let dragPointerId = null;
    let resizePointerId = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let resizeStartWidth = 0;
    let resizeStartHeight = 0;
    let resizeStartClientX = 0;
    let resizeStartClientY = 0;
    const REFERENCE_PANEL_MIN_WIDTH = 140;
    const REFERENCE_PANEL_MIN_HEIGHT = 120;

    // Caches all DOM references up front and wires sub-components.
    // The reference preview image gets an error listener so a broken
    // image source is cleared instead of showing a broken icon.
    function initialize() {
        galleryModal = document.getElementById('image-gallery-modal');
        galleryGrid = document.getElementById('gallery-grid');
        referencePanel = document.getElementById('reference-panel');
        referencePanelHandle = document.getElementById('reference-panel-handle');
        referencePanelClose = document.getElementById('reference-panel-close');
        referencePanelResize = document.getElementById('reference-panel-resize');
        referencePreviewImage = document.getElementById('reference-preview-image');
        referencePreviewImage.classList.add('is-empty');
        referencePreviewImage.addEventListener('error', () => {
            clearReferencePreviewImage();
        });

        buildGalleryThumbnails();
        setupUploadHandler();
        setupReferenceUploadHandler();
        setupReferencePanelInteractions();
        setupCloseHandler();
    }

    // Creates thumbnail cards for each pre-loaded coloring page
    // and adds them to the gallery grid. Each card loads the
    // full image onto the canvas when tapped.
    function buildGalleryThumbnails() {
        galleryGrid.innerHTML = '';

        PRELOADED_COLORING_PAGES.forEach((page) => {
            const card = document.createElement('div');
            card.className = 'gallery-item';

            const img = document.createElement('img');
            img.src = page.src;
            img.alt = page.title;
            img.loading = 'lazy';

            // If the thumbnail fails to load (file not found), hide the card
            img.onerror = () => {
                card.classList.add('hidden');
            };

            card.appendChild(img);

            card.addEventListener('pointerdown', () => {
                loadColoringPage(page.src);
            });

            galleryGrid.appendChild(card);
        });
    }

    // Handles the file upload input: reads the selected image
    // file as a data URL and loads it onto the canvas
    function setupUploadHandler() {
        const uploadInput = document.getElementById('upload-input');

        uploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                loadColoringPage(loadEvent.target.result);
            };
            reader.readAsDataURL(file);

            // Reset input so the same file can be re-selected
            uploadInput.value = '';
        });
    }

    // Handles separate reference-image upload so users can
    // keep a guide image visible while coloring.
    function setupReferenceUploadHandler() {
        const referenceUploadInput = document.getElementById('reference-upload-input');

        referenceUploadInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (loadEvent) => {
                showReferencePanel(loadEvent.target.result);
                hideGallery();
            };
            reader.readAsDataURL(file);

            // Reset input so the same file can be re-selected
            referenceUploadInput.value = '';
        });
    }

    // Pointermove and pointerup listen on window (not the panel) so
    // dragging and resizing continue even when the pointer leaves
    // the panel bounds during fast movements.
    function setupReferencePanelInteractions() {
        referencePanelHandle.addEventListener('pointerdown', handleReferencePanelPointerDown);
        referencePanelResize.addEventListener('pointerdown', handleReferencePanelResizePointerDown);
        window.addEventListener('pointermove', handleReferencePanelPointerMove);
        window.addEventListener('pointerup', handleReferencePanelPointerUp);
        window.addEventListener('pointercancel', handleReferencePanelPointerUp);

        referencePanelClose.addEventListener('pointerdown', (event) => {
            event.stopPropagation();
            hideReferencePanel();
        });
    }

    function handleReferencePanelPointerDown(event) {
        if (referencePanel.classList.contains('hidden') || isResizingReferencePanel) return;

        isDraggingReferencePanel = true;
        dragPointerId = event.pointerId;

        const panelRect = referencePanel.getBoundingClientRect();
        dragOffsetX = event.clientX - panelRect.left;
        dragOffsetY = event.clientY - panelRect.top;

        referencePanelHandle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    }

    // Records the panel's starting dimensions and pointer position so
    // handleReferencePanelPointerMove can compute deltas during resize.
    // Explicitly clears drag state to prevent conflicting interactions.
    function handleReferencePanelResizePointerDown(event) {
        if (referencePanel.classList.contains('hidden')) return;

        isResizingReferencePanel = true;
        resizePointerId = event.pointerId;
        isDraggingReferencePanel = false;
        dragPointerId = null;

        resizeStartWidth = referencePanel.offsetWidth;
        resizeStartHeight = referencePanel.offsetHeight;
        resizeStartClientX = event.clientX;
        resizeStartClientY = event.clientY;

        referencePanelResize.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    }

    // Handles both resize and drag in a single pointermove listener.
    // Resize is checked first because it takes priority — if the user
    // starts resizing from the corner handle, drag must not interfere.
    // Both operations clamp to the canvas container bounds so the panel
    // never extends outside the visible area.
    function handleReferencePanelPointerMove(event) {
        if (isResizingReferencePanel && event.pointerId === resizePointerId) {
            const container = CanvasManager.getContainerElement();
            const containerRect = container.getBoundingClientRect();
            const panelLeft = referencePanel.offsetLeft;
            const panelTop = referencePanel.offsetTop;
            const maxWidth = containerRect.width - panelLeft;
            const maxHeight = containerRect.height - panelTop;

            const deltaX = event.clientX - resizeStartClientX;
            const deltaY = event.clientY - resizeStartClientY;

            const nextWidth = Math.max(
                REFERENCE_PANEL_MIN_WIDTH,
                Math.min(resizeStartWidth + deltaX, maxWidth)
            );
            const nextHeight = Math.max(
                REFERENCE_PANEL_MIN_HEIGHT,
                Math.min(resizeStartHeight + deltaY, maxHeight)
            );

            referencePanel.style.width = nextWidth + 'px';
            referencePanel.style.height = nextHeight + 'px';
            return;
        }

        if (!isDraggingReferencePanel || event.pointerId !== dragPointerId) return;

        const container = CanvasManager.getContainerElement();
        const containerRect = container.getBoundingClientRect();
        const panelWidth = referencePanel.offsetWidth;
        const panelHeight = referencePanel.offsetHeight;

        const rawLeft = event.clientX - containerRect.left - dragOffsetX;
        const rawTop = event.clientY - containerRect.top - dragOffsetY;

        const clampedLeft = Math.max(0, Math.min(rawLeft, containerRect.width - panelWidth));
        const clampedTop = Math.max(0, Math.min(rawTop, containerRect.height - panelHeight));

        referencePanel.style.left = clampedLeft + 'px';
        referencePanel.style.top = clampedTop + 'px';
    }

    // Ends whichever interaction (resize or drag) matches the released
    // pointer. Checks resize first to mirror the priority in pointermove.
    function handleReferencePanelPointerUp(event) {
        if (isResizingReferencePanel && event.pointerId === resizePointerId) {
            referencePanelResize.releasePointerCapture?.(event.pointerId);
            isResizingReferencePanel = false;
            resizePointerId = null;
            return;
        }

        if (isDraggingReferencePanel && event.pointerId === dragPointerId) {
            referencePanelHandle.releasePointerCapture?.(event.pointerId);
            isDraggingReferencePanel = false;
            dragPointerId = null;
        }
    }

    function showReferencePanel(imageSrc) {
        setReferencePreviewImage(imageSrc);
        referencePanel.style.left = '12px';
        referencePanel.style.top = '12px';
        referencePanel.style.width = '';
        referencePanel.style.height = '';
        referencePanel.classList.remove('hidden');

        // Ensure the old in-canvas reference layer is not visible.
        CanvasManager.clearReferenceCanvas();
    }

    function hideReferencePanel() {
        referencePanel.classList.add('hidden');
        clearReferencePreviewImage();
    }

    function setReferencePreviewImage(imageSrc) {
        referencePreviewImage.classList.remove('is-empty');
        referencePreviewImage.src = imageSrc;
    }

    function clearReferencePreviewImage() {
        referencePreviewImage.removeAttribute('src');
        referencePreviewImage.classList.add('is-empty');
    }

    function setupCloseHandler() {
        const closeButton = document.getElementById('gallery-close-button');
        closeButton.addEventListener('pointerdown', hideGallery);

        // Close on backdrop click
        galleryModal.addEventListener('pointerdown', (event) => {
            if (event.target === galleryModal) {
                hideGallery();
            }
        });
    }

    // Loads a coloring page image onto the canvas, clearing
    // any previous work. Resets undo history since the previous
    // image's history is no longer relevant.
    function loadColoringPage(imageSrc) {
        hideGallery();
        UndoManager.clearHistory();
        CanvasManager.clearReferenceCanvas();
        hideReferencePanel();

        CanvasManager.loadOutlineImage(imageSrc)
            .then(() => {
                UndoManager.saveSnapshot();
            })
            .catch((error) => {
                console.warn('Failed to load coloring page:', error);
            });
    }

    function showGallery() {
        galleryModal.classList.remove('hidden');
    }

    function hideGallery() {
        galleryModal.classList.add('hidden');
    }

    return {
        initialize,
        showGallery,
        hideGallery
    };
})();
