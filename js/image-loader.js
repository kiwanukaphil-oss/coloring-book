/**
 * Image Loader
 *
 * Responsible for: Managing the coloring page gallery (pre-loaded thumbnails and device
 *   uploads), the saved artwork gallery ("My Art" tab), the draggable/resizable
 *   reference image panel, and loading images onto the canvas. Loads templates from
 *   a JSON manifest with categories and difficulty metadata (ADR-019).
 * NOT responsible for: Canvas rendering or image processing — CanvasManager handles
 *   the actual drawing, white-pixel removal, and layer management.
 *
 * Key functions:
 *   - loadManifest: Fetches templates/manifest.json, falls back to hardcoded array (ADR-019)
 *   - buildGalleryFromManifest: Renders category sections with difficulty badges
 *   - buildGalleryThumbnails: Flat grid fallback when manifest is unavailable
 *   - setupSearchAndSort: Wires search input (debounced 300ms) and sort dropdown
 *   - loadColoringPage: Loads a selected image onto the outline canvas, resets undo
 *   - setupUploadHandler: Wires the file input for user-uploaded coloring pages
 *   - setupReferenceUploadHandler: Wires the file input for reference guide images
 *   - setupGalleryTabs: Wires tab switching between Templates and My Art panels
 *   - populateSavedArtwork: Loads saved projects from IndexedDB and builds artwork cards
 *   - handleReferencePanelPointerMove: Handles drag and resize of the reference panel
 *   - showReferencePanel / hideReferencePanel: Controls reference panel visibility
 *
 * Dependencies: CanvasManager, UndoManager, StorageManager, ProgressManager,
 *   FeedbackManager
 *
 * Notes: The reference panel uses pointer capture for reliable drag/resize across
 *   the entire viewport. Panel position is clamped to the canvas container bounds.
 *   Gallery cards auto-hide if their thumbnail image fails to load (file not found).
 *   Saved artwork thumbnails are loaded from IndexedDB each time the My Art tab
 *   becomes visible, ensuring freshness. The manifest is the canonical template
 *   source; PRELOADED_COLORING_PAGES is retained as a synchronous fallback (ADR-019).
 */

const ImageLoader = (() => {
    // Synchronous fallback when manifest.json fetch fails (ADR-019).
    // Retained for offline-first support on very first load.
    const PRELOADED_COLORING_PAGES = [
        { id: 'cat', title: 'Cat', src: 'images/coloring-pages/cat.svg' },
        { id: 'dog', title: 'Dog', src: 'images/coloring-pages/dog.svg' },
        { id: 'butterfly', title: 'Butterfly', src: 'images/coloring-pages/butterfly.svg' },
        { id: 'fish', title: 'Fish', src: 'images/coloring-pages/fish.svg' },
        { id: 'rocket', title: 'Rocket', src: 'images/coloring-pages/rocket.svg' },
        { id: 'flower', title: 'Flower', src: 'images/coloring-pages/flower.svg' },
        { id: 'unicorn', title: 'Unicorn', src: 'images/coloring-pages/unicorn.svg' },
        { id: 'car', title: 'Car', src: 'images/coloring-pages/car.svg' },
    ];

    const DIFFICULTY_LABELS = {
        simple: 'Easy',
        medium: 'Medium',
        detailed: 'Detailed'
    };

    const SEARCH_DEBOUNCE_MS = 300;

    // Loaded manifest data (ADR-019). Null means fallback to PRELOADED.
    let manifestData = null;
    // Flattened template list derived from manifest (or fallback)
    let allTemplates = [];
    let currentSortMode = 'category'; // 'category', 'name', 'difficulty'
    let currentSearchQuery = '';
    let searchDebounceTimer = null;

    let galleryModal = null;
    let galleryGrid = null;
    let tabTemplates = null;
    let tabMyArt = null;
    let templatesPanel = null;
    let myArtPanel = null;
    let savedArtworkGrid = null;
    let savedArtworkEmpty = null;
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

    // Caches all DOM references up front, loads the template manifest
    // (ADR-019), and wires sub-components. Falls back to the hardcoded
    // array if manifest fetch fails. The reference preview image gets
    // an error listener so a broken image source is cleared.
    function initialize() {
        galleryModal = document.getElementById('image-gallery-modal');
        galleryGrid = document.getElementById('gallery-grid');
        tabTemplates = document.getElementById('tab-templates');
        tabMyArt = document.getElementById('tab-my-art');
        templatesPanel = document.getElementById('templates-panel');
        myArtPanel = document.getElementById('my-art-panel');
        savedArtworkGrid = document.getElementById('saved-artwork-grid');
        savedArtworkEmpty = document.getElementById('saved-artwork-empty');
        referencePanel = document.getElementById('reference-panel');
        referencePanelHandle = document.getElementById('reference-panel-handle');
        referencePanelClose = document.getElementById('reference-panel-close');
        referencePanelResize = document.getElementById('reference-panel-resize');
        referencePreviewImage = document.getElementById('reference-preview-image');
        referencePreviewImage.classList.add('is-empty');
        referencePreviewImage.addEventListener('error', () => {
            clearReferencePreviewImage();
        });

        // Load manifest then build gallery (ADR-019).
        // Show fallback grid immediately, then upgrade if manifest loads.
        buildGalleryThumbnails();
        loadManifest().then((manifest) => {
            if (manifest) {
                manifestData = manifest;
                allTemplates = flattenManifestTemplates(manifest);
                renderTemplateGallery();
            } else {
                allTemplates = PRELOADED_COLORING_PAGES.map((p) => ({
                    id: p.id,
                    title: p.title,
                    file: p.src,
                    difficulty: 'simple',
                    category: 'all'
                }));
            }
        });

        setupSearchAndSort();
        setupUploadHandler();
        setupReferenceUploadHandler();
        setupReferencePanelInteractions();
        setupGalleryTabs();
        setupCloseHandler();
    }

    // Fetches the JSON manifest from templates/manifest.json (ADR-019).
    // Returns the parsed manifest object or null on failure.
    function loadManifest() {
        return fetch('templates/manifest.json')
            .then((response) => {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .catch((error) => {
                console.warn('Manifest fetch failed, using built-in templates', error);
                return null;
            });
    }

    // Converts the nested manifest structure into a flat array
    // of templates, each annotated with its category ID.
    function flattenManifestTemplates(manifest) {
        const templates = [];
        manifest.categories.forEach((category) => {
            category.templates.forEach((template) => {
                templates.push({
                    id: template.id,
                    title: template.title,
                    file: template.file,
                    difficulty: template.difficulty || 'simple',
                    category: category.id,
                    categoryName: category.name,
                    categoryEmoji: category.emoji,
                    suggestedPalette: template.suggestedPalette || null
                });
            });
        });
        return templates;
    }

    // Renders the template gallery from manifest data (ADR-019).
    // Groups templates by category with emoji headers and difficulty
    // badges. Applies current search filter and sort mode.
    function renderTemplateGallery() {
        galleryGrid.innerHTML = '';

        const filteredTemplates = getFilteredAndSortedTemplates();

        if (filteredTemplates.length === 0) {
            const emptyMsg = document.createElement('p');
            emptyMsg.className = 'gallery-empty-search';
            emptyMsg.textContent = 'No templates match your search.';
            galleryGrid.appendChild(emptyMsg);
            return;
        }

        if (currentSortMode === 'category' && manifestData) {
            renderGroupedByCategory(filteredTemplates);
        } else {
            renderFlatGrid(filteredTemplates);
        }
    }

    // Renders templates grouped under category headers with emoji
    function renderGroupedByCategory(templates) {
        const categoryOrder = manifestData.categories.map((c) => c.id);
        const grouped = {};

        templates.forEach((t) => {
            if (!grouped[t.category]) grouped[t.category] = [];
            grouped[t.category].push(t);
        });

        categoryOrder.forEach((catId) => {
            if (!grouped[catId] || grouped[catId].length === 0) return;

            const category = manifestData.categories.find((c) => c.id === catId);
            const header = document.createElement('div');
            header.className = 'gallery-category-header';
            header.textContent = category.emoji + ' ' + category.name;
            galleryGrid.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'gallery-category-grid';
            grouped[catId].forEach((template) => {
                grid.appendChild(buildTemplateCard(template));
            });
            galleryGrid.appendChild(grid);
        });
    }

    // Renders a flat grid of template cards (no category grouping)
    function renderFlatGrid(templates) {
        templates.forEach((template) => {
            galleryGrid.appendChild(buildTemplateCard(template));
        });
    }

    // Builds a single template card with thumbnail, title,
    // and difficulty badge. Tapping loads the coloring page.
    function buildTemplateCard(template) {
        const card = document.createElement('div');
        card.className = 'gallery-item';
        card.dataset.templateId = template.id;

        const img = document.createElement('img');
        img.src = template.file;
        img.alt = template.title;
        img.loading = 'lazy';
        img.onerror = () => { card.classList.add('hidden'); };
        card.appendChild(img);

        // Title label below thumbnail
        const title = document.createElement('span');
        title.className = 'gallery-item-title';
        title.textContent = template.title;
        card.appendChild(title);

        // Difficulty badge (ADR-019)
        if (template.difficulty && DIFFICULTY_LABELS[template.difficulty]) {
            const badge = document.createElement('span');
            badge.className = 'difficulty-badge difficulty-' + template.difficulty;
            badge.textContent = DIFFICULTY_LABELS[template.difficulty];
            card.appendChild(badge);
        }

        card.addEventListener('pointerdown', () => {
            loadColoringPage(template.file);
        });

        return card;
    }

    // Returns templates filtered by search query and sorted
    // by the current sort mode.
    function getFilteredAndSortedTemplates() {
        let templates = allTemplates.slice();

        // Filter by search query
        if (currentSearchQuery) {
            const query = currentSearchQuery.toLowerCase();
            templates = templates.filter((t) =>
                t.title.toLowerCase().includes(query)
            );
        }

        // Sort
        if (currentSortMode === 'name') {
            templates.sort((a, b) => a.title.localeCompare(b.title));
        } else if (currentSortMode === 'difficulty') {
            const order = { simple: 0, medium: 1, detailed: 2 };
            templates.sort((a, b) =>
                (order[a.difficulty] || 0) - (order[b.difficulty] || 0)
            );
        }
        // 'category' mode preserves manifest order (no extra sort)

        return templates;
    }

    // Wires the search input (debounced 300ms) and sort dropdown
    // in the templates panel. Both trigger a full re-render of
    // the gallery grid.
    function setupSearchAndSort() {
        const searchInput = document.getElementById('gallery-search');
        const sortSelect = document.getElementById('gallery-sort');

        if (searchInput) {
            searchInput.addEventListener('input', function handleSearchInput() {
                clearTimeout(searchDebounceTimer);
                searchDebounceTimer = setTimeout(() => {
                    currentSearchQuery = searchInput.value.trim();
                    renderTemplateGallery();
                }, SEARCH_DEBOUNCE_MS);
            });
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', function handleSortChange() {
                currentSortMode = sortSelect.value;
                renderTemplateGallery();
            });
        }
    }

    // Creates thumbnail cards for each pre-loaded coloring page
    // and adds them to the gallery grid. Used as the initial/fallback
    // rendering before manifest loads (ADR-019).
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

    // Wires the Templates / My Art tab buttons. Switching to
    // My Art triggers a fresh load from IndexedDB so newly
    // saved projects appear immediately.
    function setupGalleryTabs() {
        tabTemplates.addEventListener('pointerdown', () => {
            switchToTemplatesTab();
        });

        tabMyArt.addEventListener('pointerdown', () => {
            switchToMyArtTab();
        });
    }

    function switchToTemplatesTab() {
        tabTemplates.classList.add('gallery-tab-active');
        tabMyArt.classList.remove('gallery-tab-active');
        templatesPanel.classList.remove('hidden');
        myArtPanel.classList.add('hidden');
    }

    function switchToMyArtTab() {
        tabMyArt.classList.add('gallery-tab-active');
        tabTemplates.classList.remove('gallery-tab-active');
        myArtPanel.classList.remove('hidden');
        templatesPanel.classList.add('hidden');
        populateSavedArtwork();
    }

    // Loads all projects from IndexedDB and renders them as
    // thumbnail cards in the My Art grid. Revokes any previous
    // object URLs to prevent memory leaks, then creates fresh
    // cards sorted by most recently updated.
    function populateSavedArtwork() {
        if (!StorageManager.isAvailable()) {
            showSavedArtworkEmptyState();
            return;
        }

        StorageManager.listProjects().then((projects) => {
            revokeSavedArtworkUrls();
            savedArtworkGrid.innerHTML = '';

            if (projects.length === 0) {
                showSavedArtworkEmptyState();
                return;
            }

            savedArtworkEmpty.classList.add('hidden');

            projects.forEach((project) => {
                const card = buildSavedArtworkCard(project);
                savedArtworkGrid.appendChild(card);
            });
        });
    }

    // Builds a single saved artwork card with thumbnail image,
    // status badge, and delete button. Tapping the card resumes
    // that project; tapping delete removes it from IndexedDB.
    function buildSavedArtworkCard(project) {
        const card = document.createElement('div');
        card.className = 'saved-artwork-card';
        card.dataset.projectId = project.id;

        // Thumbnail image from saved blob
        const img = document.createElement('img');
        if (project.thumbnailBlob) {
            const thumbUrl = URL.createObjectURL(project.thumbnailBlob);
            img.src = thumbUrl;
            img.dataset.objectUrl = thumbUrl;
        }
        img.alt = 'Saved artwork';
        card.appendChild(img);

        // Status badge (in-progress or completed)
        const badge = document.createElement('span');
        if (project.status === 'in-progress') {
            badge.className = 'saved-artwork-badge saved-artwork-badge-progress';
            badge.textContent = 'In Progress';
        } else {
            badge.className = 'saved-artwork-badge saved-artwork-badge-completed';
            badge.textContent = 'Done';
        }
        card.appendChild(badge);

        // Delete button (ADR-005: named handler)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'saved-artwork-delete';
        deleteBtn.textContent = '\u00D7';
        deleteBtn.title = 'Delete artwork';
        function handleDeleteArtwork(event) {
            event.stopPropagation();
            deleteProject(project.id, card);
        }
        deleteBtn.addEventListener('pointerdown', handleDeleteArtwork);
        card.appendChild(deleteBtn);

        // Tap card to resume the project (ADR-005: named handler)
        function handleResumeArtwork() {
            resumeSavedProject(project);
        }
        card.addEventListener('pointerdown', handleResumeArtwork);

        return card;
    }

    // Deletes a project from IndexedDB and removes its card
    // from the grid. If the deleted project was the current
    // in-progress project, clears ProgressManager tracking.
    // Shows the empty state if no projects remain.
    function deleteProject(projectId, cardElement) {
        // Revoke the object URL for this card's thumbnail
        const img = cardElement.querySelector('img');
        if (img && img.dataset.objectUrl) {
            URL.revokeObjectURL(img.dataset.objectUrl);
        }

        cardElement.remove();

        StorageManager.deleteProject(projectId);

        if (ProgressManager.getCurrentProjectId() === projectId) {
            ProgressManager.clearCurrentProject();
        }

        // Show empty state if no cards remain
        if (savedArtworkGrid.children.length === 0) {
            showSavedArtworkEmptyState();
        }
    }

    // Resumes a saved project by hiding the gallery and
    // delegating to ProgressManager.resumeProject().
    function resumeSavedProject(project) {
        hideGallery();
        ProgressManager.resumeProject(project);
    }

    function showSavedArtworkEmptyState() {
        savedArtworkEmpty.classList.remove('hidden');
    }

    // Revokes all object URLs from saved artwork thumbnails
    // to prevent memory leaks. Called before repopulating
    // the grid with fresh data.
    function revokeSavedArtworkUrls() {
        const images = savedArtworkGrid.querySelectorAll('img[data-object-url]');
        images.forEach((img) => {
            URL.revokeObjectURL(img.dataset.objectUrl);
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

        // Escape key closes gallery (ADR-013)
        document.addEventListener('keydown', function handleGalleryEscape(event) {
            if (event.key === 'Escape' && !galleryModal.classList.contains('hidden')) {
                hideGallery();
            }
        });

        // Focus trap: Tab/Shift+Tab cycles within modal (ADR-013)
        galleryModal.addEventListener('keydown', function handleFocusTrap(event) {
            if (event.key !== 'Tab') return;

            const focusableElements = galleryModal.querySelectorAll(
                'button:not([hidden]):not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([hidden]), label'
            );
            if (focusableElements.length === 0) return;

            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === firstFocusable) {
                event.preventDefault();
                lastFocusable.focus();
            } else if (!event.shiftKey && document.activeElement === lastFocusable) {
                event.preventDefault();
                firstFocusable.focus();
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

        FeedbackManager.showLoadingSpinner();
        CanvasManager.loadOutlineImage(imageSrc)
            .then(() => {
                FeedbackManager.hideLoadingSpinner();
                UndoManager.saveSnapshot();
                ProgressManager.startNewProject(imageSrc);
            })
            .catch((error) => {
                FeedbackManager.hideLoadingSpinner();
                FeedbackManager.showToast('Oops! Could not load that picture.');
                console.warn('Failed to load coloring page:', error);
            });
    }

    function showGallery() {
        switchToTemplatesTab();
        galleryModal.classList.remove('hidden');

        // Move focus into the modal for keyboard users (ADR-013)
        const firstFocusable = galleryModal.querySelector('button:not([hidden]):not([disabled])');
        if (firstFocusable) {
            firstFocusable.focus();
        }
    }

    function hideGallery() {
        revokeSavedArtworkUrls();
        galleryModal.classList.add('hidden');
    }

    return {
        initialize,
        showGallery,
        hideGallery
    };
})();
