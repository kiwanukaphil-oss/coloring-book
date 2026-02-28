/* ========================================
   Color Palette
   Renders a vertical grid of kid-friendly
   color swatches on the right side panel.
   Manages the currently selected color.
   ======================================== */

const ColorPalette = (() => {
    const KID_FRIENDLY_COLORS = [
        '#FF0000',   // Red
        '#FF5733',   // Orange-Red
        '#FF8C00',   // Dark Orange
        '#FFA500',   // Orange
        '#FFD700',   // Gold
        '#FFFF00',   // Yellow
        '#ADFF2F',   // Green-Yellow
        '#00CC00',   // Green
        '#008000',   // Dark Green
        '#00CED1',   // Turquoise
        '#00BFFF',   // Sky Blue
        '#0000FF',   // Blue
        '#4B0082',   // Indigo
        '#8A2BE2',   // Blue-Violet
        '#FF00FF',   // Magenta
        '#FF69B4',   // Hot Pink
        '#F4A460',   // Sandy Brown
        '#A0522D',   // Sienna
        '#000000',   // Black
        '#FFFFFF',   // White (eraser-like)
    ];

    let currentColor = KID_FRIENDLY_COLORS[0];
    let paletteContainer = null;
    let swatchElements = [];

    // Builds the color swatch buttons inside the palette
    // container and sets up click handlers for each one.
    // The first color is selected by default.
    function initialize() {
        paletteContainer = document.getElementById('color-palette');

        KID_FRIENDLY_COLORS.forEach((color, index) => {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = color;
            swatch.setAttribute('aria-label', 'Color ' + color);

            // Add a thin dark border to white swatch so it's visible
            if (color === '#FFFFFF') {
                swatch.style.border = '3px solid #aaa';
            }

            swatch.addEventListener('pointerdown', () => {
                selectColor(color, index);
            });

            if (index === 0) {
                swatch.classList.add('selected');
            }

            paletteContainer.appendChild(swatch);
            swatchElements.push(swatch);
        });
    }

    // Updates the selected color, highlights the chosen swatch,
    // and updates the toolbar's color indicator dot
    function selectColor(color, index) {
        currentColor = color;

        swatchElements.forEach((el, i) => {
            el.classList.toggle('selected', i === index);
        });

        const indicator = document.getElementById('active-color-indicator');
        if (indicator) {
            indicator.style.backgroundColor = color;
        }
    }

    function getCurrentColor() {
        return currentColor;
    }

    return {
        initialize,
        getCurrentColor
    };
})();
