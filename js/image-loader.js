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

    function initialize() {
        galleryModal = document.getElementById('image-gallery-modal');
        galleryGrid = document.getElementById('gallery-grid');

        buildGalleryThumbnails();
        setupUploadHandler();
        setupReferenceUploadHandler();
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
                CanvasManager.loadReferenceImage(loadEvent.target.result)
                    .then(() => {
                        hideGallery();
                    })
                    .catch((error) => {
                        console.error('Failed to load reference image:', error);
                    });
            };
            reader.readAsDataURL(file);

            // Reset input so the same file can be re-selected
            referenceUploadInput.value = '';
        });
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
