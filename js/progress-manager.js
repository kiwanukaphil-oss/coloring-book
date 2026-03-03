/**
 * Progress Manager
 *
 * Responsible for: Orchestrating auto-save of drawing progress to IndexedDB,
 *   project lifecycle (start, save, complete), and resume-from-previous-session flow.
 * NOT responsible for: Direct IndexedDB operations (StorageManager), canvas rendering
 *   (CanvasManager), or deciding what triggers a save (callers invoke scheduleAutoSave).
 *
 * Key functions:
 *   - initialize: Registers visibilitychange listener for save-on-hide
 *   - startNewProject: Marks previous project completed, begins tracking a new one
 *   - scheduleAutoSave: Debounced save — waits AUTO_SAVE_DELAY_MS after last call
 *   - saveCurrentProject: Immediately serializes canvas + settings to IndexedDB
 *   - checkForInProgressProject: Returns the most recent in-progress project (if any)
 *   - resumeProject: Restores canvas layers and tool settings from a saved project
 *   - getCurrentProjectId: Returns the active project's ID
 *
 * Dependencies: StorageManager, CanvasManager, UndoManager, Toolbar, BrushEngine,
 *   ColorPalette
 *
 * Notes: Auto-save is debounced at 5 seconds to batch rapid brush strokes.
 *   The visibilitychange handler triggers an immediate save when the user
 *   switches tabs or locks the phone — the most critical mobile save point.
 *   All save failures are swallowed (ADR-001) so drawing is never interrupted.
 */

const ProgressManager = (() => {
    let currentProjectId = null;
    let currentTemplateSrc = null;
    let autoSaveTimer = null;
    let isSaving = false;

    const AUTO_SAVE_DELAY_MS = 5000;
    const THUMBNAIL_SIZE = 200;

    function initialize() {
        document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    // Saves immediately when the user switches tabs or locks
    // the phone. This is the most reliable save point on mobile
    // where beforeunload is not guaranteed to fire.
    function handleVisibilityChange() {
        if (document.visibilityState === 'hidden' && currentProjectId) {
            saveCurrentProject();
        }
    }

    // Resets the debounce timer so a save fires AUTO_SAVE_DELAY_MS
    // after the last drawing action. Called by BrushEngine (stroke end),
    // FloodFill (fill complete), and Toolbar (clear/undo).
    function scheduleAutoSave() {
        if (!currentProjectId) return;
        if (!StorageManager.isAvailable()) return;

        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            saveCurrentProject();
            autoSaveTimer = null;
        }, AUTO_SAVE_DELAY_MS);
    }

    // Marks the previous in-progress project as completed (if any)
    // and begins tracking a new project for auto-save. Called by
    // ImageLoader after a coloring page loads successfully.
    function startNewProject(templateSrc) {
        if (!StorageManager.isAvailable()) return;

        const previousId = currentProjectId;
        currentProjectId = 'project-' + Date.now();
        currentTemplateSrc = templateSrc;

        if (previousId) {
            markProjectCompleted(previousId);
        }

        scheduleAutoSave();
    }

    function markProjectCompleted(projectId) {
        StorageManager.loadProject(projectId).then((project) => {
            if (project) {
                project.status = 'completed';
                project.updatedAt = Date.now();
                StorageManager.saveProject(project);
            }
        });
    }

    // Serializes all coloring layers (canvas pixels, metadata), tool settings,
    // and template source into a project record and writes it to IndexedDB.
    // Generates a 200×200 composite thumbnail for the saved artwork gallery.
    // Guards against concurrent saves with the isSaving flag. (ADR-024)
    function saveCurrentProject() {
        if (!currentProjectId || !currentTemplateSrc || isSaving) return;
        if (!StorageManager.isAvailable()) return;

        isSaving = true;

        const layers = LayerManager.getLayers();
        const layerBlobPromises = layers.map((layer) => canvasToBlob(layer.canvas));

        Promise.all([...layerBlobPromises, generateThumbnailBlob()])
            .then((results) => {
                const thumbnailBlob = results.pop();
                const coloringBlobs = results;

                const project = {
                    id: currentProjectId,
                    templateSrc: currentTemplateSrc,
                    canvasWidth: layers[0].canvas.width,
                    canvasHeight: layers[0].canvas.height,
                    coloringBlobs: coloringBlobs,
                    layerMetadata: layers.map((l) => ({
                        name: l.name,
                        visible: l.visible,
                        opacity: l.opacity
                    })),
                    thumbnailBlob: thumbnailBlob,
                    activeTool: Toolbar.getActiveTool(),
                    brushSize: BrushEngine.getBrushSize(),
                    activePreset: BrushEngine.getActivePreset(),
                    activeColor: ColorPalette.getCurrentColor(),
                    status: 'in-progress',
                    createdAt: parseInt(currentProjectId.split('-')[1], 10),
                    updatedAt: Date.now()
                };

                return StorageManager.saveProject(project);
            }).then(() => {
                isSaving = false;
            }).catch((error) => {
                console.warn('Auto-save failed:', error);
                isSaving = false;
            });
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, 'image/png');
        });
    }

    // Creates a 200×200 thumbnail by compositing the coloring
    // and outline layers (same as save), then scaling down.
    // The thumbnail is stored as a blob for the artwork gallery.
    function generateThumbnailBlob() {
        const compositeDataUrl = CanvasManager.renderCompositeForSave();
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const thumbCanvas = document.createElement('canvas');
                thumbCanvas.width = THUMBNAIL_SIZE;
                thumbCanvas.height = THUMBNAIL_SIZE;
                const ctx = thumbCanvas.getContext('2d');

                const scale = Math.min(
                    THUMBNAIL_SIZE / img.width,
                    THUMBNAIL_SIZE / img.height
                );
                const w = img.width * scale;
                const h = img.height * scale;
                const x = (THUMBNAIL_SIZE - w) / 2;
                const y = (THUMBNAIL_SIZE - h) / 2;

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
                ctx.drawImage(img, x, y, w, h);

                thumbCanvas.toBlob((blob) => resolve(blob), 'image/png');
            };
            img.onerror = () => {
                // Return a 1×1 white pixel blob as fallback
                const fallback = document.createElement('canvas');
                fallback.width = 1;
                fallback.height = 1;
                fallback.toBlob((blob) => resolve(blob), 'image/png');
            };
            img.src = compositeDataUrl;
        });
    }

    // Checks IndexedDB for the most recent in-progress project.
    // Returns the project record or null. Called during app boot
    // to decide whether to show the resume modal.
    function checkForInProgressProject() {
        if (!StorageManager.isAvailable()) return Promise.resolve(null);
        return StorageManager.getInProgressProject();
    }

    // Restores all coloring layers and tool settings from a saved project.
    // Loads the outline template first (which clears and prepares all canvases),
    // then restores each coloring layer from its blob in sequence.
    // Backward-compat: v1 projects have a single coloringBlob; handled via fallback. (ADR-024)
    function resumeProject(project) {
        currentProjectId = project.id;
        currentTemplateSrc = project.templateSrc;

        FeedbackManager.showLoadingSpinner();

        // Support v1 projects (single coloringBlob) and v2 projects (coloringBlobs[])
        const coloringBlobs = project.coloringBlobs || [project.coloringBlob];
        const layerMetas = project.layerMetadata ||
            [{ name: 'Layer 1', visible: true, opacity: 1 }];

        return CanvasManager.loadOutlineImage(project.templateSrc)
            .then(() => {
                // Ensure LayerManager has enough layers for the saved project
                while (LayerManager.getLayerCount() < coloringBlobs.length) {
                    LayerManager.addLayer();
                }

                // Restore each layer sequentially. restoreColoringFromBlob()
                // calls CanvasManager.getColoringCanvas/Context(), which proxies
                // to the active layer — so switching the active layer before each
                // call targets the correct canvas. (ADR-024)
                let chain = Promise.resolve();
                coloringBlobs.forEach((blob, i) => {
                    chain = chain.then(() => {
                        LayerManager.setActiveLayer(i);
                        return restoreColoringFromBlob(blob);
                    });
                });
                return chain;
            })
            .then(() => {
                // Restore layer metadata (visibility, opacity)
                layerMetas.forEach((meta, i) => {
                    if (i < LayerManager.getLayerCount()) {
                        LayerManager.setLayerVisibility(i, meta.visible !== false);
                        LayerManager.setLayerOpacity(
                            i, meta.opacity !== undefined ? meta.opacity : 1
                        );
                    }
                });
                LayerManager.setActiveLayer(0);

                // Restore tool settings
                Toolbar.setActiveTool(project.activeTool || 'fill');
                Toolbar.setBrushSize(project.brushSize || 12);
                Toolbar.setActivePreset(project.activePreset || 'marker');
                ColorPalette.setCurrentColor(project.activeColor || '#FF0000');

                // Set up undo with the restored state as baseline
                UndoManager.clearHistory();
                UndoManager.saveSnapshot();

                FeedbackManager.hideLoadingSpinner();
            })
            .catch((error) => {
                FeedbackManager.hideLoadingSpinner();
                FeedbackManager.showToast('Could not restore your drawing.');
                console.warn('Resume failed:', error);

                // Fall back to a clean state
                currentProjectId = null;
                currentTemplateSrc = null;
            });
    }

    // Draws a saved PNG blob onto the coloring canvas, replacing
    // the white fill that loadOutlineImage created. Scales the
    // image to fit the current canvas dimensions in case the
    // viewport changed between sessions.
    function restoreColoringFromBlob(blob) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const image = new Image();

            image.onload = () => {
                const coloringCanvas = CanvasManager.getColoringCanvas();
                const coloringCtx = CanvasManager.getColoringContext();

                CanvasManager.withNativeTransform(coloringCtx, (ctx) => {
                    ctx.clearRect(0, 0, coloringCanvas.width, coloringCanvas.height);
                    ctx.drawImage(image, 0, 0, coloringCanvas.width, coloringCanvas.height);
                });

                URL.revokeObjectURL(url);
                resolve();
            };

            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Failed to restore coloring canvas from blob'));
            };

            image.src = url;
        });
    }

    function getCurrentProjectId() {
        return currentProjectId;
    }

    // Clears all project tracking state and cancels any pending
    // auto-save. Used when the user chooses "Start Fresh" instead
    // of resuming.
    function clearCurrentProject() {
        currentProjectId = null;
        currentTemplateSrc = null;
        if (autoSaveTimer) {
            clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
        }
    }

    return {
        initialize,
        scheduleAutoSave,
        startNewProject,
        saveCurrentProject,
        checkForInProgressProject,
        resumeProject,
        getCurrentProjectId,
        clearCurrentProject
    };
})();
