/**
 * Mode Manager (ADR-015)
 *
 * Responsible for: Managing the dual-mode UI state (Kids/Studio), handedness
 *   preference (left/right), and theme (light/dark). Applies data attributes
 *   to the document element that drive CSS mode-switching selectors.
 * NOT responsible for: Drawing, tool logic, or mode-specific UI wiring — those
 *   are handled by the respective modules reacting to mode:changed events.
 *
 * Key functions:
 *   - initialize: Reads persisted preferences, applies attributes, wires toggles
 *   - switchMode: Changes Kids/Studio mode, persists, emits mode:changed
 *   - switchHand: Changes handedness, persists
 *   - switchTheme: Changes light/dark theme, persists
 *   - getCurrentMode / getCurrentHand / getCurrentTheme: Getters
 *
 * Dependencies: EventBus
 *
 * Notes: Persists to localStorage. Default is kids mode, right hand, light theme.
 *   The classic toolbar (#toolbar) and color palette (#color-palette) are hidden
 *   via CSS in both Kids and Studio modes but remain in the DOM for test compatibility.
 */

const ModeManager = (() => {
    const STORAGE_KEY_MODE = 'app-mode';
    const STORAGE_KEY_HAND = 'app-hand';
    const STORAGE_KEY_THEME = 'app-theme';

    let currentMode = 'kids';
    let currentHand = 'right';
    let currentTheme = 'light';

    function initialize() {
        // Skip mode application when ?classic is present so Playwright
        // tests can interact with the classic toolbar and color palette
        // (ADR-015: dual-mode elements are hidden, classic elements visible)
        const isClassicMode = new URLSearchParams(window.location.search).has('classic');
        if (isClassicMode) {
            document.documentElement.removeAttribute('data-mode');
            return;
        }

        currentMode = localStorage.getItem(STORAGE_KEY_MODE) || 'kids';
        currentHand = localStorage.getItem(STORAGE_KEY_HAND) || 'right';
        currentTheme = localStorage.getItem(STORAGE_KEY_THEME) || detectSystemTheme();

        applyMode(currentMode);
        applyHand(currentHand);
        applyTheme(currentTheme);

        setupModeToggle();
        setupHandToggle();
        setupThemeToggle();
        wireKidsToolDelegation();
        wireStudioDockDelegation();
    }

    function detectSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function applyMode(mode) {
        document.documentElement.setAttribute('data-mode', mode);
    }

    function applyHand(hand) {
        document.documentElement.setAttribute('data-hand', hand);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    function switchMode(mode) {
        currentMode = mode;
        applyMode(mode);
        localStorage.setItem(STORAGE_KEY_MODE, mode);
        EventBus.emit('mode:changed', { mode });
        updateModeToggleUI(mode);
    }

    function switchHand(hand) {
        currentHand = hand;
        applyHand(hand);
        localStorage.setItem(STORAGE_KEY_HAND, hand);
    }

    function switchTheme(theme) {
        currentTheme = theme;
        applyTheme(theme);
        localStorage.setItem(STORAGE_KEY_THEME, theme);
    }

    // Wires the mode switch toggle buttons (Kids/Studio radio group)
    function setupModeToggle() {
        const modeSwitch = document.getElementById('mode-switch');
        if (!modeSwitch) return;

        const buttons = modeSwitch.querySelectorAll('.mode-option');
        buttons.forEach((button) => {
            button.addEventListener('pointerdown', function handleModeSwitch() {
                const mode = button.getAttribute('data-mode-value');
                switchMode(mode);
            });
        });

        updateModeToggleUI(currentMode);
    }

    // Reflects the current mode in the toggle button states
    function updateModeToggleUI(mode) {
        const modeSwitch = document.getElementById('mode-switch');
        if (!modeSwitch) return;

        const buttons = modeSwitch.querySelectorAll('.mode-option');
        buttons.forEach((button) => {
            const isActive = button.getAttribute('data-mode-value') === mode;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-checked', isActive ? 'true' : 'false');
        });
    }

    // Wires the handedness toggle button in Kids mode
    function setupHandToggle() {
        const handToggle = document.getElementById('hand-toggle');
        if (!handToggle) return;

        handToggle.addEventListener('pointerdown', function handleHandToggle() {
            const newHand = currentHand === 'right' ? 'left' : 'right';
            switchHand(newHand);
        });
    }

    // Wires the theme toggle button
    function setupThemeToggle() {
        const themeToggle = document.getElementById('theme-toggle');
        if (!themeToggle) return;

        themeToggle.addEventListener('pointerdown', function handleThemeToggle() {
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            switchTheme(newTheme);
        });
    }

    // Kids mode tool bubbles delegate to existing Toolbar API
    // so drawing logic remains centralized (ADR-015)
    function wireKidsToolDelegation() {
        const kidsTools = document.getElementById('kids-tools');
        if (!kidsTools) return;

        const toolButtons = kidsTools.querySelectorAll('[data-tool]');
        toolButtons.forEach((button) => {
            button.addEventListener('pointerdown', function handleKidsToolSelect() {
                const tool = button.getAttribute('data-tool');
                Toolbar.setActiveTool(tool);
                updateKidsToolActiveState(tool);
            });
        });

        // Kids undo/redo buttons
        const kidsUndo = document.getElementById('kids-undo');
        if (kidsUndo) {
            kidsUndo.addEventListener('pointerdown', () => {
                UndoManager.undoLastAction();
                ProgressManager.scheduleAutoSave();
            });
        }

        const kidsRedo = document.getElementById('kids-redo');
        if (kidsRedo) {
            kidsRedo.addEventListener('pointerdown', () => {
                UndoManager.redoLastAction();
                ProgressManager.scheduleAutoSave();
            });
        }

        // Kids gallery button
        const kidsGallery = document.getElementById('kids-gallery-btn');
        if (kidsGallery) {
            kidsGallery.addEventListener('pointerdown', () => {
                ImageLoader.showGallery();
            });
        }

        // Kids save button — delegates to Toolbar (ADR-015)
        const kidsSave = document.getElementById('kids-save-btn');
        if (kidsSave) {
            kidsSave.addEventListener('pointerdown', () => {
                Toolbar.saveAndDownload();
            });
        }

        // Kids size bubbles
        const sizeBubbles = document.querySelectorAll('[data-brush-size]');
        sizeBubbles.forEach((bubble) => {
            bubble.addEventListener('pointerdown', function handleSizeSelect() {
                const size = parseInt(bubble.getAttribute('data-brush-size'), 10);
                Toolbar.setBrushSize(size);
                updateKidsSizeActiveState(size);
            });
        });

        // Sync tool active state when tool changes via other means
        // (keyboard shortcuts, classic toolbar)
        EventBus.on('tool:changed', (data) => {
            updateKidsToolActiveState(data.tool);
        });
    }

    // Updates which kids tool bubble shows the active state
    function updateKidsToolActiveState(activeTool) {
        const kidsTools = document.getElementById('kids-tools');
        if (!kidsTools) return;

        const toolButtons = kidsTools.querySelectorAll('[data-tool]');
        toolButtons.forEach((button) => {
            const isActive = button.getAttribute('data-tool') === activeTool;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    // Updates which kids size bubble shows the active state
    function updateKidsSizeActiveState(size) {
        const sizeBubbles = document.querySelectorAll('[data-brush-size]');
        sizeBubbles.forEach((bubble) => {
            const bubbleSize = parseInt(bubble.getAttribute('data-brush-size'), 10);
            bubble.classList.toggle('active', bubbleSize === size);
        });
    }

    // Studio dock tool buttons delegate to existing Toolbar API
    function wireStudioDockDelegation() {
        const dock = document.getElementById('dock');
        if (!dock) return;

        const dockTools = dock.querySelectorAll('[data-tool]');
        dockTools.forEach((button) => {
            button.addEventListener('pointerdown', function handleDockToolSelect() {
                const tool = button.getAttribute('data-tool');
                Toolbar.setActiveTool(tool);
            });
        });

        // Studio undo/redo buttons
        const studioUndo = document.getElementById('studio-undo');
        if (studioUndo) {
            studioUndo.addEventListener('pointerdown', () => {
                UndoManager.undoLastAction();
                ProgressManager.scheduleAutoSave();
            });
        }

        const studioRedo = document.getElementById('studio-redo');
        if (studioRedo) {
            studioRedo.addEventListener('pointerdown', () => {
                UndoManager.redoLastAction();
                ProgressManager.scheduleAutoSave();
            });
        }

        // Studio gallery button
        const studioGallery = document.getElementById('studio-gallery');
        if (studioGallery) {
            studioGallery.addEventListener('pointerdown', () => {
                ImageLoader.showGallery();
            });
        }

        // Studio save button — delegates to Toolbar (ADR-015)
        const studioSave = document.getElementById('studio-save');
        if (studioSave) {
            studioSave.addEventListener('pointerdown', () => {
                Toolbar.saveAndDownload();
            });
        }

        // Studio zoom pill buttons (ADR-009)
        const zoomIn = document.getElementById('zoom-in');
        if (zoomIn) {
            zoomIn.addEventListener('pointerdown', () => {
                ViewportManager.zoomCentered(ViewportManager.getScale() + 0.25);
            });
        }

        const zoomOut = document.getElementById('zoom-out');
        if (zoomOut) {
            zoomOut.addEventListener('pointerdown', () => {
                ViewportManager.zoomCentered(ViewportManager.getScale() - 0.25);
            });
        }

        const zoomReset = document.getElementById('zoom-reset');
        if (zoomReset) {
            zoomReset.addEventListener('pointerdown', () => {
                ViewportManager.resetView();
            });
        }

        // Sync tool active state on the dock when tool changes
        EventBus.on('tool:changed', (data) => {
            updateDockToolActiveState(data.tool);
        });
    }

    // Updates which dock tool shows the active indicator
    function updateDockToolActiveState(activeTool) {
        const dock = document.getElementById('dock');
        if (!dock) return;

        const dockTools = dock.querySelectorAll('[data-tool]');
        dockTools.forEach((button) => {
            const isActive = button.getAttribute('data-tool') === activeTool;
            button.classList.toggle('active', isActive);
        });
    }

    function getCurrentMode() { return currentMode; }
    function getCurrentHand() { return currentHand; }
    function getCurrentTheme() { return currentTheme; }

    return {
        initialize,
        switchMode,
        switchHand,
        switchTheme,
        getCurrentMode,
        getCurrentHand,
        getCurrentTheme
    };
})();
