/**
 * Front door for all DOM-side UI: builds the toolbar, palette, and HUD
 * against the ids in index.html, owns the toast, and gives the game
 * one `update()` to refresh everything after state changes.
 */

import { Toolbar } from './Toolbar.js';
import { AssetPalette } from './AssetPalette.js';
import { HUD } from './HUD.js';
import { loadUiAudio } from './Audio.js';
import { ConstructionUI } from './ConstructionUI.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        loadUiAudio();

        this.toolbar = new Toolbar(document.getElementById('toolbar'), game);
        this.palette = new AssetPalette(
            document.getElementById('palette-tabs'),
            document.getElementById('palette-grid'),
            game,
        );
        this.hud = new HUD(game);
        this.construction = new ConstructionUI(game);
        this.toastEl = document.getElementById('toast');
        this._toastTimer = 0;
    }

    update() {
        this.toolbar.update();
        this.palette.update();
        this.hud.update();
        this.construction.update();
    }

    /** Category hotkeys (1-5) route through here. */
    selectCategory(index) {
        this.palette.selectCategory(index);
    }

    showToast(text, ms = 1600) {
        if (!this.toastEl) return;
        this.toastEl.textContent = text;
        this.toastEl.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            this.toastEl.classList.remove('show');
        }, ms);
    }
}
