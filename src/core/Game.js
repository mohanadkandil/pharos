/**
 * Top-level controller: owns the world, camera, renderer, placement and
 * input systems, runs the frame loop, and exposes the intent API the UI
 * layer drives (setTool, selectAsset, placeAndAnimate, save, ...).
 */

import { Camera } from './Camera.js';
import { Renderer } from './Renderer.js';
import { InputManager } from './InputManager.js';
import { TileMap } from '../grid/TileMap.js';
import { PlacementSystem } from '../building/PlacementSystem.js';
import { SaveSystem } from '../storage/SaveSystem.js';
import { ASSET_INDEX, ASSET_MANIFEST } from '../assets/assetManifest.js';
import { cellToScreen } from '../grid/IsoGrid.js';
import { playPlacement, playErase } from '../ui/Audio.js';

const FILL_WAVE_MS = 26;   // per-diagonal stagger for the terrain flood
const TOOLS = new Set(['place', 'fill', 'erase', 'pan']);

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.tileMap = new TileMap();
        this.camera = new Camera();
        this.placement = new PlacementSystem(this.tileMap);
        this.renderer = new Renderer(canvas, this.camera, this.tileMap);
        this.input = new InputManager(canvas, this.camera, this);

        // Pan/zoom only needs the next composite re-stamped.
        this.camera.onChange(() => this.renderer.markDirty());

        this.ui = null;                 // attached by main.js after UIManager
        this.tool = 'place';            // 'place' | 'fill' | 'erase' | 'pan'
        this.selectedAssetId = ASSET_MANIFEST[0].id;
        this.flipH = false;
        this.flipV = false;
        this.gridVisible = false;

        this._centerCamera();

        const step = (now) => {
            this.renderer.render(now);
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /** Hovered cell, for HUD readouts. */
    get hoverCell() { return this.renderer.hoverCell; }

    _centerCamera() {
        const mid = cellToScreen(this.tileMap.width / 2, this.tileMap.height / 2);
        const { w, h } = this.renderer.cssSize();
        this.camera.centerOn(mid.x, mid.y, w, h);
    }

    /* ── Tool + selection intents ─────────────────────────────── */

    setTool(t) {
        if (!TOOLS.has(t)) return;
        this.tool = t;
        this.renderer.eraseMode = t === 'erase';
        this.canvas.style.cursor = t === 'pan' ? 'grab' : 'crosshair';
        this._updatePreview();
        this.renderer.markDirty();
        this.ui?.update();
    }

    selectAsset(id) {
        if (!ASSET_INDEX[id]) return;
        if (this.selectedAssetId !== id) {
            this.selectedAssetId = id;
            this.flipH = false;
            this.flipV = false;
            this._syncFlip();
        }
        if (this.tool !== 'place') this.setTool('place');
        this._updatePreview();
        this.renderer.markDirty();
        this.ui?.update();
    }

    toggleFlipH() {
        this.flipH = !this.flipH;
        this._syncFlip();
        this.renderer.markDirty();
        this.ui?.showToast(`Flip horizontal ${this.flipH ? 'on' : 'off'}`);
        this.ui?.update();
    }

    toggleFlipV() {
        this.flipV = !this.flipV;
        this._syncFlip();
        this.renderer.markDirty();
        this.ui?.showToast(`Flip vertical ${this.flipV ? 'on' : 'off'}`);
        this.ui?.update();
    }

    _syncFlip() {
        this.renderer.previewFlipH = this.flipH;
        this.renderer.previewFlipV = this.flipV;
    }

    toggleGrid() {
        this.gridVisible = !this.gridVisible;
        this.renderer.gridVisible = this.gridVisible;
        this.renderer.markDirty();
        this.ui?.update();
    }

    /* ── Persistence ──────────────────────────────────────────── */

    save() {
        const ok = SaveSystem.save(this.tileMap, this.camera);
        this.ui?.showToast(ok ? 'City saved' : 'Save failed');
        return ok;
    }

    load() {
        const ok = SaveSystem.load(this.tileMap, this.camera);
        if (ok) {
            this.renderer.markDirty();
            this.ui?.update();
        }
        return ok;
    }

    reset() {
        this.tileMap.clearAll();
        SaveSystem.clear();
        this._centerCamera();
        this.renderer.markDirty();
        this.ui?.showToast('World cleared');
        this.ui?.update();
    }

    /* ── World mutations ──────────────────────────────────────── */

    /**
     * Place an asset and queue its elastic pop-in, optionally delayed so
     * callers can ripple many placements (seed scene, terrain fill).
     * Returns the placement result, or null when rejected.
     */
    placeAndAnimate(assetId, gx, gy, opts = {}) {
        if (!this.placement.canPlace(assetId, gx, gy)) return null;
        const result = this.placement.place(assetId, gx, gy, {
            flipH: !!opts.flipH,
            flipV: !!opts.flipV,
        });
        if (!result) return null;

        const startAt = performance.now() + (opts.delay ?? 0);
        if (result.kind === 'object') {
            const o = result.object;
            this.renderer.spawnAnim(`obj-${o.id}`, {
                gx: o.gx,
                gy: o.gy,
                w: o.footprint?.w ?? 1,
                d: o.footprint?.d ?? 1,
            }, opts.duration, startAt);
        } else {
            this.renderer.spawnAnim(`t-${result.gx},${result.gy}`, {
                gx: result.gx,
                gy: result.gy,
                w: 1,
                d: 1,
            }, opts.duration, startAt);
        }
        if (!opts.silent) {
            playPlacement(ASSET_INDEX[assetId]?.category ?? 'props');
        }
        this._updatePreview();
        return result;
    }

    /** Erase the topmost thing at a cell. Returns true when removed. */
    eraseAt(gx, gy) {
        if (!this.tileMap.inBounds(gx, gy)) return false;
        if (!this.placement.erase(gx, gy)) return false;
        playErase();
        this.renderer.markDirty();
        this._updatePreview();
        return true;
    }

    /** Carpet every grid cell with a terrain tile, rippling diagonally. */
    fillTerrain(assetId) {
        const entry = ASSET_INDEX[assetId];
        if (!entry || entry.kind !== 'terrain') return 0;
        let laid = 0;
        for (let gy = 0; gy < this.tileMap.height; gy++)
        for (let gx = 0; gx < this.tileMap.width; gx++) {
            if (this.placeAndAnimate(assetId, gx, gy, {
                delay: (gx + gy) * FILL_WAVE_MS,
                silent: true,
            })) laid++;
        }
        if (laid > 0) {
            playPlacement('terrain');
            this.ui?.showToast(`Laid ${laid} tiles of ${entry.name}`);
        }
        this.renderer.markDirty();
        this.ui?.update();
        return laid;
    }

    /* ── Input callbacks ──────────────────────────────────────── */

    /** Left click / tap / brush step: apply the active tool. */
    applyPrimary(gx, gy) {
        if (!this.tileMap.inBounds(gx, gy)) return;
        switch (this.tool) {
            case 'place':
                this.placeAndAnimate(this.selectedAssetId, gx, gy, {
                    flipH: this.flipH,
                    flipV: this.flipV,
                });
                break;
            case 'erase':
                this.eraseAt(gx, gy);
                break;
            case 'fill': {
                const sel = ASSET_INDEX[this.selectedAssetId];
                this.fillTerrain(sel?.kind === 'terrain' ? sel.id : ASSET_MANIFEST[0].id);
                break;
            }
            // 'pan' consumes drags in the input layer; clicks are no-ops.
        }
    }

    /** Right click / long-press: erase regardless of the active tool. */
    applySecondary(gx, gy) {
        this.eraseAt(gx, gy);
    }

    setHover(gx, gy) {
        const r = this.renderer;
        const prev = r.hoverCell;
        if (!prev || prev.gx !== gx || prev.gy !== gy) {
            r.hoverCell = { gx, gy };
            r.markDirty();
        }
        this._updatePreview();
    }

    clearHover() {
        if (!this.renderer.hoverCell) return;
        this.renderer.hoverCell = null;
        this.renderer.markDirty();
    }

    /** Recompute the ghost asset + validity tint for the hovered cell. */
    _updatePreview() {
        const r = this.renderer;
        const cell = r.hoverCell;
        if (!cell) return;
        let assetId = null;
        let valid = true;
        if (this.tool === 'place') {
            assetId = this.selectedAssetId;
            valid = this.placement.canPlace(assetId, cell.gx, cell.gy);
        } else if (this.tool === 'erase') {
            valid = !!(this.tileMap.objectAt(cell.gx, cell.gy)
                || this.tileMap.getTerrain(cell.gx, cell.gy));
        } else if (this.tool === 'fill') {
            valid = this.tileMap.inBounds(cell.gx, cell.gy);
        }
        if (r.previewAssetId !== assetId || r.previewValid !== valid) {
            r.previewAssetId = assetId;
            r.previewValid = valid;
            r.markDirty();
        }
    }
}
