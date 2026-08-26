/**
 * Vertical tool dock. Buttons are generated here with inline SVG
 * glyphs (stroke-based, currentColor) so the rail needs no icon assets
 * and recolors automatically with active/hover states.
 */

import { playUiClick } from './Audio.js';

const SVG_ATTRS =
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const ICONS = {
    // Map pin
    place: `<svg ${SVG_ATTRS}><path d="M12 21s-7-6.1-7-11a7 7 0 1 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>`,
    // Paint bucket tipping
    fill: `<svg ${SVG_ATTRS}><path d="M6 12.5 12.5 6l5.5 5.5-6.5 6.5a2 2 0 0 1-2.8 0L6 15.3a2 2 0 0 1 0-2.8z"/><path d="M10 3.5 12.5 6"/><path d="M19.5 15.5s1.5 1.9 1.5 3a1.5 1.5 0 0 1-3 0c0-1.1 1.5-3 1.5-3z"/></svg>`,
    // Eraser block
    erase: `<svg ${SVG_ATTRS}><path d="m8.5 19.5-4.6-4.6a2 2 0 0 1 0-2.8l7.5-7.5a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8l-7.1 7.1z"/><path d="M7 10.4 14.6 18"/><path d="M8.5 19.5H20"/></svg>`,
    // Four-direction move arrows
    pan: `<svg ${SVG_ATTRS}><path d="M12 2v20M2 12h20"/><path d="m9 5 3-3 3 3M9 19l3 3 3-3M5 9 2 12l3 3M19 9l3 3-3 3"/></svg>`,
    // 3x3 mesh
    grid: `<svg ${SVG_ATTRS}><rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M3.5 9.2h17M3.5 14.8h17M9.2 3.5v17M14.8 3.5v17"/></svg>`,
    // Floppy disk
    save: `<svg ${SVG_ATTRS}><path d="M5 3.5h11L20.5 8v12.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M8 3.5V9h7V3.5"/><rect x="7.5" y="13.5" width="9" height="8" rx="0.5"/></svg>`,
    // Circular refresh arrow
    reset: `<svg ${SVG_ATTRS}><path d="M20 12a8 8 0 1 1-2.9-6.2"/><path d="M20 3.5V8h-4.5"/></svg>`,
};

const TOOLS = [
    { id: 'place', label: 'Place' },
    { id: 'fill',  label: 'Fill'  },
    { id: 'erase', label: 'Erase' },
    { id: 'pan',   label: 'Pan'   },
    { id: 'grid',  label: 'Grid'  },
    { id: 'save',  label: 'Save'  },
    { id: 'reset', label: 'Reset', danger: true },
];

const TOOL_MODES = new Set(['place', 'fill', 'erase', 'pan']);

export class Toolbar {
    constructor(rootEl, game) {
        this.root = rootEl;
        this.game = game;
        this.buttons = new Map();
        this._build();
    }

    _build() {
        if (!this.root) return;
        this.root.innerHTML = '';
        for (const def of TOOLS) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = def.danger ? 'tool tool--danger' : 'tool';
            btn.dataset.toolId = def.id;
            btn.setAttribute('aria-label', def.label);
            btn.setAttribute('aria-pressed', 'false');
            btn.innerHTML = `${ICONS[def.id]}<span class="label">${def.label}</span>`;
            btn.addEventListener('click', () => this._onClick(def.id));
            this.root.appendChild(btn);
            this.buttons.set(def.id, btn);
        }
        this.update();
    }

    _onClick(id) {
        playUiClick();
        const game = this.game;
        if (TOOL_MODES.has(id)) {
            game?.setTool?.(id);
        } else if (id === 'grid') {
            game?.toggleGrid?.();
        } else if (id === 'save') {
            game?.save?.();
        } else if (id === 'reset') {
            if (window.confirm('Reset the whole city? This clears your save.')) {
                game?.reset?.();
            }
        }
        this.update();
        game?.ui?.update?.();
    }

    update() {
        const tool = this.game?.tool;
        const grid = !!this.game?.gridVisible;
        for (const [id, btn] of this.buttons) {
            const active = TOOL_MODES.has(id) ? id === tool
                         : id === 'grid' ? grid
                         : false;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', String(active));
        }
    }
}
