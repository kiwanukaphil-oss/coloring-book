/**
 * App Initialization
 *
 * Responsible for: Bootstrapping all modules in dependency order, registering
 *   the service worker, opening IndexedDB for progress persistence, and
 *   deciding whether to resume a previous session or show the gallery.
 * NOT responsible for: Any runtime application logic — each module manages its own
 *   behavior after initialization.
 *
 * Key functions:
 *   - initializeColoringBookApp: IIFE that calls initialize() on all modules in order
 *   - registerServiceWorker: Registers the service worker (logs warning on failure)
 *   - checkForResumableProject: Opens IndexedDB, checks for in-progress work
 *   - showResumeModal: Shows thumbnail of previous work with Keep Going / Start Fresh
 *
 * Dependencies: TouchGuard, FeedbackManager, CanvasManager, ColorPalette, BrushEngine,
 *   ImageLoader, Toolbar, StorageManager, ProgressManager (all modules)
 *
 * Notes: Module initialization order matters — CanvasManager must come before any
 *   module that reads canvas elements, and Toolbar must come last because it wires
 *   up event handlers that reference all other modules. StorageManager.initialize()
 *   is async (opens IndexedDB) and runs after synchronous module init.
 */

(function initializeColoringBookApp() {
    // Initialize modules in dependency order:
    // 1. Touch guards first (prevent browser gesture interference)
    // 2. Feedback manager (spinner + toast ready for use)
    // 3. Canvas system (everything else depends on this)
    // 4. Undo manager (no init needed — ready immediately)
    // 5. Color palette (standalone UI)
    // 6. Brush engine (needs canvas + color palette + toolbar)
    // 7. Image loader (needs canvas + undo manager)
    // 8. Toolbar (wires up all other modules)
    // 9. Progress manager (registers visibilitychange listener)
    TouchGuard.initialize();
    FeedbackManager.initialize();
    CanvasManager.initialize();
    ColorPalette.initialize();
    BrushEngine.initialize();
    ImageLoader.initialize();
    Toolbar.initialize();
    ProgressManager.initialize();

    registerServiceWorker();
    checkForResumableProject();
})();

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .register('./service-worker.js')
            .catch((error) => {
                console.warn('Service worker registration failed:', error);
            });
    }
}

// Opens IndexedDB and checks for an in-progress project.
// If found, shows the resume modal so the user can pick up
// where they left off. Otherwise opens the gallery.
function checkForResumableProject() {
    StorageManager.initialize()
        .then(() => {
            return ProgressManager.checkForInProgressProject();
        })
        .then((project) => {
            if (project) {
                showResumeModal(project);
            } else {
                ImageLoader.showGallery();
            }
        })
        .catch(() => {
            // If anything fails, just show the gallery
            ImageLoader.showGallery();
        });
}

// Shows the resume modal with a thumbnail of the user's
// previous work. "Keep Going" restores the canvas and tool
// settings; "Start Fresh" marks the project completed and
// opens the gallery for a new pick.
function showResumeModal(project) {
    const resumeModal = document.getElementById('resume-modal');
    const thumbnail = document.getElementById('resume-thumbnail');
    const resumeYes = document.getElementById('resume-yes');
    const resumeNo = document.getElementById('resume-no');

    // Display the saved thumbnail (ADR-003: classList for visibility)
    if (project.thumbnailBlob) {
        const thumbUrl = URL.createObjectURL(project.thumbnailBlob);
        thumbnail.src = thumbUrl;
        thumbnail.onload = () => URL.revokeObjectURL(thumbUrl);
    }

    resumeModal.classList.remove('hidden');

    // Named handler functions so they can remove themselves
    // after one click (ADR-005)
    function handleResumeYes() {
        resumeModal.classList.add('hidden');
        ProgressManager.resumeProject(project);
        cleanup();
    }

    function handleResumeNo() {
        resumeModal.classList.add('hidden');
        // Mark the old project as completed
        project.status = 'completed';
        project.updatedAt = Date.now();
        StorageManager.saveProject(project);
        ProgressManager.clearCurrentProject();
        ImageLoader.showGallery();
        cleanup();
    }

    function handleBackdropClick(event) {
        if (event.target === resumeModal) {
            handleResumeNo();
        }
    }

    function cleanup() {
        resumeYes.removeEventListener('pointerdown', handleResumeYes);
        resumeNo.removeEventListener('pointerdown', handleResumeNo);
        resumeModal.removeEventListener('pointerdown', handleBackdropClick);
    }

    resumeYes.addEventListener('pointerdown', handleResumeYes);
    resumeNo.addEventListener('pointerdown', handleResumeNo);
    resumeModal.addEventListener('pointerdown', handleBackdropClick);
}
