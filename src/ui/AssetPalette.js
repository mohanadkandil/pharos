/**
 * Right-hand asset picker: one tab per category, a grid of thumbnail
 * swatches for the active category. Thumbnails draw each asset's
 * generated canvas contain-fit into a small square, so what you click
 * is exactly what gets placed.
 */

import { CATEGORIES } from '../assets/assetManifest.js';
import { allAssets } from '../assets/assetFactory.js';
import { playUiClick } from './Audio.js';

const THUMB_SIZE = 48;

export class AssetPalette {
    constructor(tabsEl, gridEl, game) {
        this.tabsEl = tabsEl;
        this.gridEl = gridEl;
        this.game = game;
        this.category = CATEGORIES[0];
        this.tabButtons = new Map();
        this._buildTabs();
        this._renderGrid();
    }

    _assets() {
        try {
            return allAssets();
        } catch {
            return [];
        }
    }

    _buildTabs() {
        if (!this.tabsEl) return;
        this.tabsEl.innerHTML = '';
        for (const cat of CATEGORIES) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tab';
            btn.textContent = cat[0].toUpperCase() + cat.slice(1);
            btn.addEventListener('click', () => {
                playUiClick();
                this._setCategory(cat);
            });
            this.tabsEl.appendChild(btn);
            this.tabButtons.set(cat, btn);
        }
    }

    _setCategory(cat) {
        if (cat === this.category) return;
        this.category = cat;
        this._renderGrid();
        this.update();
    }

    /** Switch to the nth category (0-based) — used by the 1-5 keys. */
    selectCategory(index) {
        const cat = CATEGORIES[index];
        if (cat) this._setCategory(cat);
    }

    _renderGrid() {
        if (!this.gridEl) return;
        this.gridEl.innerHTML = '';
        const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
        const items = this._assets().filter(a => a.category === this.category);
        for (const rec of items) {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'swatch';
            swatch.dataset.assetId = rec.id;

            if (rec.canvas) {
                const thumb = document.createElement('canvas');
                const backing = THUMB_SIZE * dpr;
                thumb.width = backing;
                thumb.height = backing;
                const ctx = thumb.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                const scale = Math.min(backing / rec.width, backing / rec.height);
                const w = rec.width * scale;
                const h = rec.height * scale;
                ctx.drawImage(rec.canvas, (backing - w) / 2, (backing - h) / 2, w, h);
                swatch.appendChild(thumb);
            }

            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = rec.name;
            swatch.appendChild(name);

            swatch.addEventListener('click', () => {
                playUiClick();
                this.game?.selectAsset?.(rec.id);
                this.update();
                this.game?.ui?.update?.();
            });
            this.gridEl.appendChild(swatch);
        }
        this.update();
    }

    update() {
        for (const [cat, btn] of this.tabButtons) {
            btn.classList.toggle('active', cat === this.category);
        }
        const selected = this.game?.selectedAssetId;
        for (const sw of this.gridEl?.querySelectorAll('.swatch') ?? []) {
            sw.classList.toggle('selected', sw.dataset.assetId === selected);
        }
    }
}
