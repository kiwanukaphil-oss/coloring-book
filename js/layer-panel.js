/**
 * Layer Panel
 *
 * Responsible for: Rendering the layer management UI panel and wiring user interactions
 *   (activate, add, delete, show/hide, opacity) to LayerManager.
 * NOT responsible for: Layer canvas creation or management (LayerManager), deciding
 *   which mode shows the panel (ModeManager).
 *
 * Key functions:
 *   - initialize: Grabs DOM elements, wires add-layer button, registers EventBus listeners
 *   - refresh: Re-renders the full layer list from LayerManager state
 *
 * Dependencies: LayerManager, CommandManager, EventBus
 *
 * Notes: Panel is shown in Studio mode only; hidden in Kids mode (ADR-025).
 *   ModeManager calls classList.add/remove('hidden') on #layer-panel (ADR-003).
 *   All interactive elements meet the 3px focus indicator requirement (ADR-013).
 *   Layer thumbnails are redrawn on every refresh() call.
 */

const LayerPanel = (() => {
    let panelEl = null;
    let layerListEl = null;
    let addLayerBtn = null;

    // Grabs panel DOM elements, wires the add-layer button, and subscribes to
    // LayerManager events so the panel stays in sync with layer state.
    function initialize() {
        panelEl = document.getElementById('layer-panel');
        layerListEl = document.getElementById('layer-list');
        addLayerBtn = document.getElementById('add-layer-btn');

        if (!panelEl || !layerListEl || !addLayerBtn) return;

        addLayerBtn.addEventListener('click', handleAddLayer);

        EventBus.on('layer:added', refresh);
        EventBus.on('layer:deleted', refresh);
        EventBus.on('layer:active-changed', refresh);
        EventBus.on('layer:visibility-changed', refresh);
        EventBus.on('layer:opacity-changed', refresh);

        refresh();
    }

    // Adds a new layer. The add button is disabled at the 5-layer limit,
    // so addLayer() should always succeed here; no extra handling needed.
    function handleAddLayer() {
        LayerManager.addLayer();
    }

    // Re-renders the entire layer list from the current LayerManager state.
    // Called on every layer state change event.
    function refresh() {
        if (!layerListEl) return;

        const layers = LayerManager.getLayers();
        const activeIndex = LayerManager.getActiveLayerIndex();
        const isAtLimit = layers.length >= 5;

        // Update add-layer button disabled state
        addLayerBtn.disabled = isAtLimit;

        // Rebuild the list
        layerListEl.innerHTML = '';

        // Render layers in reverse order so the top layer appears first in the UI
        for (let i = layers.length - 1; i >= 0; i--) {
            const item = renderLayerItem(layers[i], i, i === activeIndex);
            layerListEl.appendChild(item);
        }
    }

    // Builds the full DOM subtree for one layer row: thumbnail, name, visibility
    // toggle, opacity slider, and delete button. Called by refresh() which tears
    // down and rebuilds the entire list on every state change. Full rebuild rather
    // than DOM diffing keeps the list in guaranteed sync with LayerManager state and
    // avoids stale event listeners — safe because the list is always ≤ 5 items.
    function renderLayerItem(layer, index, isActive) {
        const li = document.createElement('li');
        li.className = 'layer-list-item' + (isActive ? ' active' : '');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(isActive));
        li.setAttribute('tabindex', '0');
        li.dataset.layerIndex = String(index);

        // Thumbnail: a small canvas that mirrors the layer content
        const thumb = document.createElement('canvas');
        thumb.className = 'layer-thumbnail';
        thumb.width = 40;
        thumb.height = 40;
        thumb.setAttribute('aria-hidden', 'true');
        drawThumbnail(thumb, layer.canvas);

        // Layer name label
        const nameSpan = document.createElement('span');
        nameSpan.className = 'layer-name';
        nameSpan.textContent = layer.name;

        // Visibility toggle button
        const visBtn = document.createElement('button');
        visBtn.className = 'layer-visibility-btn';
        visBtn.setAttribute('aria-label', (layer.visible ? 'Hide' : 'Show') + ' ' + layer.name);
        visBtn.textContent = layer.visible ? '👁' : '🙈';
        visBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            LayerManager.setLayerVisibility(index, !layer.visible);
        });

        // Opacity slider
        const opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.className = 'layer-opacity-slider';
        opacitySlider.min = '0';
        opacitySlider.max = '100';
        opacitySlider.value = String(Math.round(layer.opacity * 100));
        opacitySlider.setAttribute('aria-label', layer.name + ' opacity');
        opacitySlider.addEventListener('input', (e) => {
            e.stopPropagation();
            LayerManager.setLayerOpacity(index, parseInt(e.target.value, 10) / 100);
        });

        // Delete button (visually hidden when only 1 layer remains to preserve layout, ADR-003)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'layer-delete-btn';
        deleteBtn.setAttribute('aria-label', 'Delete ' + layer.name);
        deleteBtn.textContent = '✕';
        if (LayerManager.getLayerCount() <= 1) {
            deleteBtn.classList.add('visually-hidden');
        }
        // Capture a snapshot before deletion so the delete can be
        // undone via CommandManager (ADR-026). The snapshot includes
        // the layer's full pixel data and metadata; insertLayer()
        // uses it to reconstruct the canvas on undo.
        function handleLayerDelete(e) {
            e.stopPropagation();
            // Defensive guard: button is visually-hidden at ≤1 layer but
            // also checked here so the handler is safe regardless of DOM state
            if (LayerManager.getLayerCount() <= 1) return;
            const snapshot = LayerManager.getLayerSnapshot(index);
            if (snapshot) {
                CommandManager.pushCommand(
                    CommandManager.createLayerDeleteCommand(index, snapshot)
                );
            }
            LayerManager.deleteLayer(index);
        }
        deleteBtn.addEventListener('click', handleLayerDelete);

        // Click on item to activate layer
        li.addEventListener('click', () => {
            LayerManager.setActiveLayer(index);
        });

        // Keyboard: Enter or Space activates layer; Space on buttons is handled by browser
        li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                LayerManager.setActiveLayer(index);
            }
        });

        // Drag-to-reorder: stores the logical LayerManager index in dataTransfer
        // so the drop handler receives the correct index regardless of visual order.
        // LayerPanel.refresh() renders the list in reverse (top layer first), so
        // the stored logical index is what LayerManager.reorderLayer() expects. (ADR-025)
        li.draggable = true;

        li.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', String(index));
            e.dataTransfer.effectAllowed = 'move';
        });

        function handleLayerDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            li.classList.add('drag-over');
        }
        li.addEventListener('dragover', handleLayerDragOver);

        li.addEventListener('dragleave', (e) => {
            // dragleave fires for child elements (thumbnail, buttons) too.
            // Only remove the indicator when the pointer has truly left this <li>.
            if (!li.contains(e.relatedTarget)) {
                li.classList.remove('drag-over');
            }
        });

        function handleLayerDrop(e) {
            e.preventDefault();
            li.classList.remove('drag-over');
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (fromIndex !== index) {
                LayerManager.reorderLayer(fromIndex, index);
            }
        }
        li.addEventListener('drop', handleLayerDrop);

        // Clean up indicator if the drag is cancelled or dropped outside any target
        li.addEventListener('dragend', () => {
            li.classList.remove('drag-over');
        });

        li.appendChild(thumb);
        li.appendChild(nameSpan);
        li.appendChild(visBtn);
        li.appendChild(opacitySlider);
        li.appendChild(deleteBtn);

        return li;
    }

    // Draws a scaled-down copy of the layer canvas onto the 40×40 thumbnail canvas.
    function drawThumbnail(thumbCanvas, sourceCanvas) {
        const ctx = thumbCanvas.getContext('2d');
        ctx.clearRect(0, 0, 40, 40);
        // White background so transparent layers don't look empty
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 40, 40);
        ctx.drawImage(sourceCanvas, 0, 0, 40, 40);
    }

    return { initialize, refresh };
})();
