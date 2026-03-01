/**
 * Feedback Manager
 *
 * Responsible for: Providing visual feedback to the user — loading spinners
 *   during async operations, toast notifications for success/error messages,
 *   and fill pulse animations at tap coordinates.
 * NOT responsible for: Deciding when to show feedback (callers trigger it),
 *   or managing canvas state (CanvasManager).
 *
 * Key functions:
 *   - showLoadingSpinner / hideLoadingSpinner: Centered overlay during image loads
 *   - showToast: Auto-dismissing bottom notification with configurable duration
 *
 * Dependencies: None
 *
 * Notes: Toast uses CSS animation for fade in/out. Only one toast is visible
 *   at a time — calling showToast while one is active replaces it. The spinner
 *   is always inside #canvas-container and uses z-index 10 to float above all
 *   canvas layers.
 */

const FeedbackManager = (() => {
    let spinnerElement = null;
    let toastContainer = null;
    let toastMessage = null;
    let toastTimer = null;

    function initialize() {
        spinnerElement = document.getElementById('loading-spinner');
        toastContainer = document.getElementById('toast-container');
        toastMessage = document.getElementById('toast-message');
    }

    function showLoadingSpinner() {
        if (!spinnerElement) return;
        spinnerElement.classList.remove('hidden');
    }

    function hideLoadingSpinner() {
        if (!spinnerElement) return;
        spinnerElement.classList.add('hidden');
    }

    // Displays a temporary notification at the bottom of the screen.
    // Replaces any currently visible toast. Auto-dismisses after the
    // specified duration (default 2 seconds). Uses CSS keyframe
    // animations for smooth fade in/out.
    function showToast(message, durationMs) {
        if (!toastContainer || !toastMessage) return;

        const duration = (typeof durationMs === 'number') ? durationMs : 2000;

        // Clear any pending dismiss timer
        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }

        // Reset animation by removing and re-adding the visible state
        toastContainer.classList.add('hidden');
        toastContainer.classList.remove('toast-exit');
        toastMessage.textContent = message;

        // Force reflow so the browser registers the hidden state
        // before we show the toast again (needed for re-triggering
        // the CSS entrance animation)
        void toastContainer.offsetHeight;

        toastContainer.classList.remove('hidden');

        // Schedule the exit animation
        toastTimer = setTimeout(() => {
            toastContainer.classList.add('toast-exit');
            // After exit animation completes, hide the element
            toastTimer = setTimeout(() => {
                toastContainer.classList.add('hidden');
                toastContainer.classList.remove('toast-exit');
                toastTimer = null;
            }, 300);
        }, duration);
    }

    return {
        initialize,
        showLoadingSpinner,
        hideLoadingSpinner,
        showToast
    };
})();
