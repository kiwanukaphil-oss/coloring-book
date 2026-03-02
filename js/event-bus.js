/**
 * Event Bus (ADR-014)
 *
 * Responsible for: Decoupled pub/sub communication between modules.
 * NOT responsible for: Request/response patterns — use direct calls for those.
 *
 * Key functions:
 *   - on: Subscribe to an event
 *   - off: Unsubscribe from an event
 *   - emit: Publish an event to all subscribers
 *
 * Dependencies: None (must load before all other modules)
 *
 * Notes: Event names use noun:verb convention (e.g., 'stroke:complete',
 *   'tool:changed'). Existing direct calls are preserved — events are
 *   emitted in parallel as a secondary notification channel.
 */

const EventBus = (() => {
    const listeners = new Map();

    function on(eventName, handler) {
        if (!listeners.has(eventName)) {
            listeners.set(eventName, new Set());
        }
        listeners.get(eventName).add(handler);
    }

    function off(eventName, handler) {
        const handlers = listeners.get(eventName);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    function emit(eventName, data) {
        const handlers = listeners.get(eventName);
        if (handlers) {
            handlers.forEach((handler) => {
                try {
                    handler(data);
                } catch (error) {
                    console.warn('EventBus handler error for ' + eventName + ':', error);
                }
            });
        }
    }

    return { on, off, emit };
})();
