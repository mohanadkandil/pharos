/**
 * Top-right status readout: selected asset name, hovered grid cell,
 * placed-object count. Pull-only — reads game state on update() and
 * on a light timer so hover coords stay fresh between game pushes.
 */

import { ASSET_INDEX } from '../assets/assetManifest.js';

const HOVER_REFRESH_MS = 120;

export class HUD {
    constructor(game) {
        this.game = game;
        this.assetEl = document.getElementById('hud-asset');
        this.cellEl = document.getElementById('hud-cell');
        this.countEl = document.getElementById('hud-count');
        this.update();
        this._timer = setInterval(() => this.update(), HOVER_REFRESH_MS);
    }

    update() {
        const game = this.game;

        if (this.assetEl) {
            const id = game?.selectedAssetId;
            this.assetEl.textContent = (id && ASSET_INDEX[id]?.name) || '—';
        }

        if (this.cellEl) {
            const cell = game?.hoverCell ?? game?.hoveredCell ?? null;
            this.cellEl.textContent =
                cell && Number.isFinite(cell.gx) && Number.isFinite(cell.gy)
                    ? `${cell.gx}, ${cell.gy}`
                    : '—';
        }

        if (this.countEl) {
            this.countEl.textContent = String(game?.tileMap?.objects?.length ?? 0);
        }
    }
}
