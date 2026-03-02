/**
 * Radial Menu (ADR-023)
 *
 * Responsible for: Providing a semicircular tool menu in Studio mode that opens
 *   from the dock trigger button. Offers gesture-friendly, keyboard-navigable
 *   access to all tools.
 * NOT responsible for: Tool logic (delegates to Toolbar), dock styling (CSS),
 *   or mode switching (ModeManager).
 *
 * Key functions:
 *   - initialize: Creates menu items, wires trigger, sets up keyboard nav
 *   - openMenu: Shows radial items with staggered pop-in animation
 *   - closeMenu: Hides all items, returns focus to trigger
 *   - handleKeyboardNavigation: Arrow keys, Enter, Escape for accessibility
 *
 * Dependencies: Toolbar, EventBus
 *
 * Notes: Each menu item delegates to Toolbar methods — no duplicate logic.
 *   The menu container has pointer-events:none when closed. Items are
 *   positioned via CSS custom properties (--angle, --radius). Focus trap
 *   keeps Tab within the open menu (ADR-013). Staggered animation uses
 *   40ms delay per item with var(--ease-spring) timing. Reduced-motion
 *   users see instant show/hide without animation.
 */

const RadialMenu = (() => {
    const RADIUS = 80;
    const STAGGER_DELAY_MS = 40;

    const MENU_ITEMS = [
        { id: 'radial-brush',      tool: 'brush',      label: 'Brush',      icon: 'B' },
        { id: 'radial-eraser',     tool: 'eraser',     label: 'Eraser',     icon: 'E' },
        { id: 'radial-clear',      tool: 'clear',      label: 'Clear',      icon: 'X' },
        { id: 'radial-eyedropper', tool: 'eyedropper', label: 'Eyedropper', icon: 'I' },
        { id: 'radial-fill',       tool: 'fill',       label: 'Fill',       icon: 'F' }
    ];

    let menuContainer = null;
    let triggerButton = null;
    let isOpen = false;
    let focusedIndex = -1;
    let itemElements = [];

    function initialize() {
        menuContainer = document.getElementById('radial-menu');
        triggerButton = document.getElementById('radial-trigger');
        if (!menuContainer || !triggerButton) return;

        buildMenuItems();
        wireEvents();
    }

    // Creates the radial menu item elements, positioned in a semicircle
    // above the trigger using CSS custom properties for angle/radius
    function buildMenuItems() {
        const totalItems = MENU_ITEMS.length;
        // Semicircle from 180° to 0° (left to right above trigger)
        const startAngle = Math.PI;
        const endAngle = 0;
        const angleStep = (endAngle - startAngle) / (totalItems - 1);

        MENU_ITEMS.forEach((item, index) => {
            const button = document.createElement('button');
            button.id = item.id;
            button.className = 'radial-item';
            button.setAttribute('role', 'menuitem');
            button.setAttribute('aria-label', item.label);
            button.setAttribute('tabindex', '-1');
            button.textContent = item.icon;

            const angle = startAngle + angleStep * index;
            const x = Math.cos(angle) * RADIUS;
            const y = Math.sin(angle) * RADIUS;
            button.style.setProperty('--offset-x', x + 'px');
            button.style.setProperty('--offset-y', y + 'px');
            button.style.setProperty('--stagger', (index * STAGGER_DELAY_MS) + 'ms');

            button.addEventListener('pointerdown', function handleRadialSelect(event) {
                event.stopPropagation();
                selectItem(item);
            });

            menuContainer.appendChild(button);
            itemElements.push(button);
        });
    }

    function wireEvents() {
        // Toggle menu on trigger click
        triggerButton.addEventListener('pointerdown', function handleRadialTrigger(event) {
            event.stopPropagation();
            if (isOpen) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        // Close on outside click
        document.addEventListener('pointerdown', function handleOutsideClick() {
            if (isOpen) {
                closeMenu();
            }
        });

        // Keyboard navigation (ADR-023, ADR-013)
        menuContainer.addEventListener('keydown', handleKeyboardNavigation);
        triggerButton.addEventListener('keydown', function handleTriggerKeydown(event) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (isOpen) {
                    closeMenu();
                } else {
                    openMenu();
                }
            }
        });
    }

    // Opens the radial menu with staggered pop-in animation.
    // Focuses the first item for keyboard users. (ADR-023)
    function openMenu() {
        isOpen = true;
        menuContainer.classList.add('radial-open');
        menuContainer.style.pointerEvents = 'auto';

        // Enable tab focus on items
        itemElements.forEach((el) => {
            el.setAttribute('tabindex', '0');
        });

        // Focus first item after animation starts
        focusedIndex = 0;
        requestAnimationFrame(() => {
            if (itemElements[0]) {
                itemElements[0].focus();
            }
        });
    }

    // Closes the radial menu instantly (no stagger on close).
    // Returns focus to the trigger button. (ADR-023)
    function closeMenu() {
        isOpen = false;
        menuContainer.classList.remove('radial-open');
        menuContainer.style.pointerEvents = 'none';

        // Disable tab focus on items
        itemElements.forEach((el) => {
            el.setAttribute('tabindex', '-1');
        });

        focusedIndex = -1;
        triggerButton.focus();
    }

    // Handles item selection: delegates to Toolbar for tool actions,
    // shows clear modal for clear action. Closes menu after. (ADR-023)
    function selectItem(item) {
        if (item.tool === 'clear') {
            // Show clear confirmation modal (ADR-003)
            const clearModal = document.getElementById('clear-confirm-modal');
            if (clearModal) {
                clearModal.classList.remove('hidden');
            }
        } else {
            Toolbar.setActiveTool(item.tool);
        }
        closeMenu();
    }

    // Arrow keys rotate through items, Enter/Space selects,
    // Escape closes, Tab wraps within the menu. (ADR-013)
    function handleKeyboardNavigation(event) {
        if (!isOpen) return;

        switch (event.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                event.preventDefault();
                focusedIndex = (focusedIndex - 1 + itemElements.length) % itemElements.length;
                itemElements[focusedIndex].focus();
                break;

            case 'ArrowRight':
            case 'ArrowDown':
                event.preventDefault();
                focusedIndex = (focusedIndex + 1) % itemElements.length;
                itemElements[focusedIndex].focus();
                break;

            case 'Home':
                event.preventDefault();
                focusedIndex = 0;
                itemElements[0].focus();
                break;

            case 'End':
                event.preventDefault();
                focusedIndex = itemElements.length - 1;
                itemElements[focusedIndex].focus();
                break;

            case 'Enter':
            case ' ':
                event.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < MENU_ITEMS.length) {
                    selectItem(MENU_ITEMS[focusedIndex]);
                }
                break;

            case 'Escape':
                event.preventDefault();
                closeMenu();
                break;

            case 'Tab':
                // Trap focus within the menu (ADR-013)
                event.preventDefault();
                if (event.shiftKey) {
                    focusedIndex = (focusedIndex - 1 + itemElements.length) % itemElements.length;
                } else {
                    focusedIndex = (focusedIndex + 1) % itemElements.length;
                }
                itemElements[focusedIndex].focus();
                break;
        }
    }

    return {
        initialize
    };
})();
