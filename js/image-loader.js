/* ========================================
   Image Loader
   Manages the coloring page gallery with
   pre-loaded images and device file upload.
   Handles loading images onto the canvas.
   ======================================== */

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
                card.style.display = 'none';
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
                console.error('Failed to load coloring page:', error);
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
