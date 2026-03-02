/**
 * Color Picker (ADR-012)
 *
 * Responsible for: HSL color selection with canvas-rendered hue ring,
 *   saturation/lightness square, recent colors persistence, and
 *   mode-specific UIs (Kids lighter/darker, Studio full HSL picker).
 * NOT responsible for: Applying the color to the canvas — all color
 *   changes go through ColorPalette.setCurrentColor(hex).
 *
 * Key functions:
 *   - hslToHex / hexToHsl: Pure math HSL<->hex conversion
 *   - openPicker: Shows the HSL picker popover at an anchor position
 *   - closePicker: Hides the picker
 *   - addRecentColor: Persists a color to the recent colors list
 *   - adjustLightness: Kids mode lighter/darker helper
 *   - renderHueRing / renderSlSquare: Canvas drawing for the picker
 *
 * Dependencies: ColorPalette, EventBus
 *
 * Notes: Hue ring uses arc segments (not CSS conic-gradient) for
 *   browser compatibility. Recent colors stored in localStorage
 *   as JSON array (max 8, duplicates removed, most recent first).
 */

const ColorPicker = (() => {
    const MAX_RECENT = 8;
    const STORAGE_KEY = 'recentColors';

    let pickerEl = null;
    let hueCanvas = null;
    let hueCtx = null;
    let slCanvas = null;
    let slCtx = null;
    let previewSwatch = null;
    let recentContainer = null;

    let currentHue = 0;
    let currentSat = 100;
    let currentLight = 50;
    let isOpen = false;
    let isDraggingHue = false;
    let isDraggingSL = false;

    // --- Pure math HSL <-> Hex conversion (ADR-012) ---

    // Converts HSL values to a 6-digit hex string.
    // h: 0-360, s: 0-100, l: 0-100
    function hslToHex(h, s, l) {
        s /= 100;
        l /= 100;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;

        if (h < 60)      { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else              { r = c; g = 0; b = x; }

        const toHex = (v) => {
            const hex = Math.round((v + m) * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    // Converts a hex string to { h: 0-360, s: 0-100, l: 0-100 }
    function hexToHsl(hex) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const d = max - min;
        let h = 0;
        const l = (max + min) / 2;
        const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

        if (d !== 0) {
            if (max === r)      h = 60 * (((g - b) / d) % 6);
            else if (max === g) h = 60 * ((b - r) / d + 2);
            else                h = 60 * ((r - g) / d + 4);
            if (h < 0) h += 360;
        }

        return {
            h: Math.round(h),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    // --- Recent colors (localStorage) ---

    function getRecentColors() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    }

    function addRecentColor(hex) {
        const upper = hex.toUpperCase();
        let colors = getRecentColors().filter((c) => c !== upper);
        colors.unshift(upper);
        if (colors.length > MAX_RECENT) {
            colors = colors.slice(0, MAX_RECENT);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
        renderRecentColors();
    }

    // --- Picker UI ---

    function initialize() {
        pickerEl = document.getElementById('color-picker');
        if (!pickerEl) return;

        hueCanvas = document.getElementById('hue-ring-canvas');
        slCanvas = document.getElementById('sl-square-canvas');
        previewSwatch = document.getElementById('picker-preview');
        recentContainer = document.getElementById('picker-recent');

        if (hueCanvas) {
            hueCtx = hueCanvas.getContext('2d');
            setupHueRingInteraction();
        }
        if (slCanvas) {
            slCtx = slCanvas.getContext('2d');
            setupSlSquareInteraction();
        }

        setupPickerButtons();
        wireKidsLighterDarker();
    }

    // Draws the hue ring on canvas using arc segments
    function renderHueRing() {
        if (!hueCtx) return;
        const size = hueCanvas.width;
        const center = size / 2;
        const outerRadius = center - 2;
        const innerRadius = outerRadius - 20;

        hueCtx.clearRect(0, 0, size, size);

        // Draw hue segments
        for (let deg = 0; deg < 360; deg++) {
            const startAngle = (deg - 90) * Math.PI / 180;
            const endAngle = (deg + 1 - 90) * Math.PI / 180;
            hueCtx.beginPath();
            hueCtx.arc(center, center, outerRadius, startAngle, endAngle);
            hueCtx.arc(center, center, innerRadius, endAngle, startAngle, true);
            hueCtx.closePath();
            hueCtx.fillStyle = 'hsl(' + deg + ', 100%, 50%)';
            hueCtx.fill();
        }

        // Draw hue indicator
        const indicatorAngle = (currentHue - 90) * Math.PI / 180;
        const indicatorRadius = (outerRadius + innerRadius) / 2;
        const ix = center + indicatorRadius * Math.cos(indicatorAngle);
        const iy = center + indicatorRadius * Math.sin(indicatorAngle);
        hueCtx.beginPath();
        hueCtx.arc(ix, iy, 8, 0, Math.PI * 2);
        hueCtx.strokeStyle = '#ffffff';
        hueCtx.lineWidth = 3;
        hueCtx.stroke();
        hueCtx.strokeStyle = '#000000';
        hueCtx.lineWidth = 1;
        hueCtx.stroke();
    }

    // Draws the saturation/lightness square for the current hue
    function renderSlSquare() {
        if (!slCtx) return;
        const w = slCanvas.width;
        const h = slCanvas.height;
        const imageData = slCtx.createImageData(w, h);
        const pixels = imageData.data;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const s = (x / w) * 100;
                const l = 100 - (y / h) * 100;
                const hex = hslToHex(currentHue, s, l);
                const idx = (y * w + x) * 4;
                pixels[idx] = parseInt(hex.substring(1, 3), 16);
                pixels[idx + 1] = parseInt(hex.substring(3, 5), 16);
                pixels[idx + 2] = parseInt(hex.substring(5, 7), 16);
                pixels[idx + 3] = 255;
            }
        }
        slCtx.putImageData(imageData, 0, 0);

        // Draw SL indicator
        const sx = (currentSat / 100) * w;
        const sy = ((100 - currentLight) / 100) * h;
        slCtx.beginPath();
        slCtx.arc(sx, sy, 6, 0, Math.PI * 2);
        slCtx.strokeStyle = '#ffffff';
        slCtx.lineWidth = 2;
        slCtx.stroke();
        slCtx.strokeStyle = '#000000';
        slCtx.lineWidth = 1;
        slCtx.stroke();
    }

    function renderRecentColors() {
        if (!recentContainer) return;
        recentContainer.innerHTML = '';
        const colors = getRecentColors();
        colors.forEach((color) => {
            const btn = document.createElement('button');
            btn.className = 'picker-recent-swatch';
            btn.style.backgroundColor = color;
            btn.setAttribute('aria-label', 'Recent color ' + color);
            btn.addEventListener('pointerdown', () => {
                confirmColor(color);
            });
            recentContainer.appendChild(btn);
        });
    }

    function updatePreview() {
        const hex = hslToHex(currentHue, currentSat, currentLight);
        if (previewSwatch) {
            previewSwatch.style.backgroundColor = hex;
        }
    }

    // --- Hue ring interaction ---

    function setupHueRingInteraction() {
        hueCanvas.addEventListener('pointerdown', function handleHuePointerDown(event) {
            isDraggingHue = true;
            hueCanvas.setPointerCapture(event.pointerId);
            updateHueFromEvent(event);
        });
        hueCanvas.addEventListener('pointermove', function handleHuePointerMove(event) {
            if (!isDraggingHue) return;
            updateHueFromEvent(event);
        });
        hueCanvas.addEventListener('pointerup', function handleHuePointerUp() {
            isDraggingHue = false;
        });
    }

    function updateHueFromEvent(event) {
        const rect = hueCanvas.getBoundingClientRect();
        const cx = event.clientX - rect.left - rect.width / 2;
        const cy = event.clientY - rect.top - rect.height / 2;
        let angle = Math.atan2(cy, cx) * 180 / Math.PI + 90;
        if (angle < 0) angle += 360;
        currentHue = Math.round(angle) % 360;
        renderHueRing();
        renderSlSquare();
        updatePreview();
    }

    // --- SL square interaction ---

    function setupSlSquareInteraction() {
        slCanvas.addEventListener('pointerdown', function handleSlPointerDown(event) {
            isDraggingSL = true;
            slCanvas.setPointerCapture(event.pointerId);
            updateSlFromEvent(event);
        });
        slCanvas.addEventListener('pointermove', function handleSlPointerMove(event) {
            if (!isDraggingSL) return;
            updateSlFromEvent(event);
        });
        slCanvas.addEventListener('pointerup', function handleSlPointerUp() {
            isDraggingSL = false;
        });
    }

    function updateSlFromEvent(event) {
        const rect = slCanvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
        const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height));
        currentSat = Math.round((x / rect.width) * 100);
        currentLight = Math.round(100 - (y / rect.height) * 100);
        renderSlSquare();
        updatePreview();
    }

    // --- Picker open/close and confirm ---

    function openPicker() {
        if (!pickerEl) return;
        const currentColor = ColorPalette.getCurrentColor();
        const hsl = hexToHsl(currentColor);
        currentHue = hsl.h;
        currentSat = hsl.s;
        currentLight = hsl.l;

        pickerEl.classList.remove('hidden');
        isOpen = true;

        renderHueRing();
        renderSlSquare();
        updatePreview();
        renderRecentColors();
    }

    function closePicker() {
        if (!pickerEl) return;
        pickerEl.classList.add('hidden');
        isOpen = false;
    }

    // Confirms the current HSL selection, applies to the palette,
    // and adds to recent colors history
    function confirmColor(hex) {
        if (!hex) {
            hex = hslToHex(currentHue, currentSat, currentLight);
        }
        ColorPalette.setCurrentColor(hex.toUpperCase());
        addRecentColor(hex);
        closePicker();
    }

    function setupPickerButtons() {
        const confirmBtn = document.getElementById('picker-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('pointerdown', () => confirmColor());
        }

        const cancelBtn = document.getElementById('picker-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('pointerdown', () => closePicker());
        }

        // Escape key closes picker (ADR-013)
        document.addEventListener('keydown', function handlePickerEscape(event) {
            if (event.key === 'Escape' && isOpen) {
                closePicker();
            }
        });

        // "+" swatch on classic palette opens picker
        const plusSwatch = document.getElementById('picker-open-btn');
        if (plusSwatch) {
            plusSwatch.addEventListener('pointerdown', () => openPicker());
        }
    }

    // --- Kids mode lighter/darker (ADR-012) ---
    // Adjusts the current color's lightness by +-15
    function wireKidsLighterDarker() {
        const lighterBtn = document.getElementById('kids-lighter');
        if (lighterBtn) {
            lighterBtn.addEventListener('pointerdown', () => {
                adjustLightness(15);
            });
        }

        const darkerBtn = document.getElementById('kids-darker');
        if (darkerBtn) {
            darkerBtn.addEventListener('pointerdown', () => {
                adjustLightness(-15);
            });
        }
    }

    // Adjusts the lightness of the current palette color by delta
    function adjustLightness(delta) {
        const current = ColorPalette.getCurrentColor();
        const hsl = hexToHsl(current);
        hsl.l = Math.max(5, Math.min(95, hsl.l + delta));
        const newHex = hslToHex(hsl.h, hsl.s, hsl.l);
        ColorPalette.setCurrentColor(newHex.toUpperCase());
        addRecentColor(newHex);
    }

    function isPickerOpen() { return isOpen; }

    return {
        initialize,
        hslToHex,
        hexToHsl,
        openPicker,
        closePicker,
        adjustLightness,
        isPickerOpen,
        getRecentColors,
        addRecentColor
    };
})();
