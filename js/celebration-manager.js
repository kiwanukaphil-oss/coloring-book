/**
 * Celebration Manager (ADR-022)
 *
 * Responsible for: Displaying confetti/celebration animations in Kids mode
 *   and toast notifications in Studio mode. Provides visual reward feedback
 *   for fills, saves, and page completions.
 * NOT responsible for: Determining when a page is "complete" (ProgressManager),
 *   or performing the save itself (Toolbar).
 *
 * Key functions:
 *   - initialize: Creates container, wires EventBus listeners
 *   - triggerConfetti: Spawns CSS-animated confetti particles at a point
 *   - triggerEdgePulse: Reduced-motion alternative — brief border glow
 *   - triggerSaveCelebration: Confetti from top center on save
 *
 * Dependencies: EventBus, ModeManager, FeedbackManager
 *
 * Notes: Confetti particles are DOM divs in a pointer-events:none overlay,
 *   not canvas elements, so they never interfere with drawing. Particles
 *   are removed from the DOM after animation completes (~2s). Maximum 30
 *   particles per burst, reduced to 15 on low-performance devices.
 *   Kids mode gets confetti; Studio mode gets a toast via FeedbackManager.
 */

const CelebrationManager = (() => {
    const CONFETTI_DURATION_MS = 2000;
    const CONFETTI_COUNT = 30;
    const CONFETTI_COUNT_LOW = 15;
    const CONFETTI_COLORS = [
        '#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1',
        '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8C42'
    ];

    let celebrationContainer = null;
    let isReducedMotion = false;

    function initialize() {
        celebrationContainer = document.getElementById('celebration-container');
        if (!celebrationContainer) return;

        isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Listen for fill completions — celebrate in Kids mode (ADR-022)
        EventBus.on('fill:complete', (data) => {
            if (ModeManager.getCurrentMode() !== 'kids') {
                return;
            }
            celebrateFill(data.x, data.y);
        });

        // Listen for save events — celebrate in Kids mode (ADR-022)
        EventBus.on('save:complete', () => {
            if (ModeManager.getCurrentMode() !== 'kids') {
                return;
            }
            triggerSaveCelebration();
        });
    }

    // Triggers a fill celebration: confetti at tap point for Kids,
    // or nothing extra for Studio (toast already shown by Toolbar).
    function celebrateFill(canvasX, canvasY) {
        if (isReducedMotion) {
            triggerEdgePulse();
            return;
        }

        // Convert canvas coords to viewport coords for confetti placement
        const container = CanvasManager.getContainerElement();
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const scaleFactor = CanvasManager.getScaleFactor();
        const viewportX = rect.left + (canvasX / scaleFactor);
        const viewportY = rect.top + (canvasY / scaleFactor);

        triggerConfetti(viewportX, viewportY);
    }

    // Spawns CSS-animated confetti particles that burst from a point.
    // Each particle gets a random color, direction, and timing.
    // All particles are removed after animation completes. (ADR-022)
    function triggerConfetti(originX, originY) {
        if (!celebrationContainer) return;

        const isLowPerf = document.documentElement.getAttribute('data-performance') === 'low';
        const count = isLowPerf ? CONFETTI_COUNT_LOW : CONFETTI_COUNT;

        const fragment = document.createDocumentFragment();

        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'confetti-particle';

            const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
            const angle = Math.random() * Math.PI * 2;
            const velocity = 80 + Math.random() * 120;
            const dx = Math.cos(angle) * velocity;
            const dy = Math.sin(angle) * velocity - 60;
            const rotation = Math.random() * 720 - 360;
            const delay = Math.random() * 100;

            particle.style.cssText =
                'left:' + originX + 'px;' +
                'top:' + originY + 'px;' +
                'background-color:' + color + ';' +
                '--dx:' + dx + 'px;' +
                '--dy:' + dy + 'px;' +
                '--rot:' + rotation + 'deg;' +
                'animation-delay:' + delay + 'ms;';

            fragment.appendChild(particle);
        }

        celebrationContainer.appendChild(fragment);

        // Remove particles after animation completes (ADR-022)
        setTimeout(() => {
            while (celebrationContainer.firstChild) {
                celebrationContainer.removeChild(celebrationContainer.firstChild);
            }
        }, CONFETTI_DURATION_MS + 200);
    }

    // Reduced-motion alternative: brief glow on canvas border.
    // Provides visual feedback without movement. (ADR-022, ADR-013)
    function triggerEdgePulse() {
        const container = CanvasManager.getContainerElement();
        if (!container) return;

        container.classList.add('celebration-pulse');
        setTimeout(() => {
            container.classList.remove('celebration-pulse');
        }, 600);
    }

    // Save celebration: confetti rains from top center (ADR-022)
    function triggerSaveCelebration() {
        if (isReducedMotion) {
            triggerEdgePulse();
            return;
        }

        const centerX = window.innerWidth / 2;
        triggerConfetti(centerX, 20);
    }

    return {
        initialize
    };
})();
