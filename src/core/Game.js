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
import { ConstructionSystem } from '../construction/ConstructionSystem.js';
import { SPRITE_DEFINITIONS } from '../construction/content.js';

const FILL_WAVE_MS = 26;   // per-diagonal stagger for the terrain flood
const TOOLS = new Set(['place', 'fill', 'erase', 'pan']);

export class Game {
    constructor(canvas, { runtimeMode = 'editor' } = {}) {
        this.canvas = canvas;
        this.runtimeMode = runtimeMode;
        this.tileMap = new TileMap();
        this.camera = new Camera();
        this.placement = new PlacementSystem(this.tileMap);
        this.construction = new ConstructionSystem(this.tileMap);
        this.renderer = new Renderer(canvas, this.camera, this.tileMap);
        this.renderer.prepareConstructionSprites?.(SPRITE_DEFINITIONS);
        this.renderer.constructionSnapshot = this.construction.getRenderSnapshot();
        this.input = new InputManager(canvas, this.camera, this);

        // Pan/zoom only needs the next composite re-stamped.
        this.camera.onChange(() => this.renderer.markDirty());

        this.buildingHistory = [];
        this.construction.setCallbacks({
            onChange: () => {
                this.renderer.constructionSnapshot = this.construction.getRenderSnapshot();
                this.renderer.markDirty();
                this.ui?.update();
            },
            onMilestone: () => this.save({ silent: true }),
        });

        this.ui = null;                 // attached by main.js after UIManager
        this.tool = 'place';            // 'place' | 'fill' | 'erase' | 'pan'
        this.selectedAssetId = ASSET_MANIFEST[0].id;
        this.flipH = false;
        this.flipV = false;
        this.gridVisible = false;
        try {
            this.nightMode = localStorage.getItem('pharos.night') === '1';
        } catch {
            this.nightMode = false;
        }
        this.renderer.setNightMode(this.nightMode);
        document.documentElement.classList.toggle('night-mode', this.nightMode);

        this._centerCamera();

        const step = (now) => {
            this.construction.update(now, !document.hidden);
            this.renderer.render(now);
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /** Hovered cell, for HUD readouts. */
    get hoverCell() { return this.renderer.hoverCell; }

    get constructionView() { return this.construction.getViewModel(); }

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

    toggleNight() {
        this.nightMode = !this.nightMode;
        this.renderer.setNightMode(this.nightMode);
        document.documentElement.classList.toggle('night-mode', this.nightMode);
        try { localStorage.setItem('pharos.night', this.nightMode ? '1' : '0'); } catch {}
        this.ui?.showToast(this.nightMode ? 'Lanterns lit — night falls' : 'Sunrise over Alexandria');
        this.ui?.update();
    }

    /* ── Persistence ──────────────────────────────────────────── */

    save({ silent = false } = {}) {
        const result = SaveSystem.save(
            this.tileMap,
            this.camera,
            this.construction.getSerializableRecord(),
            this.buildingHistory,
        );
        if (!silent) this.ui?.showToast(result.ok ? 'City saved' : result.message);
        return result.ok;
    }

    load() {
        const result = SaveSystem.load(this.tileMap, this.camera);
        if (!result.ok) {
            this.ui?.showToast(result.message);
            return false;
        }
        if (!result.value.loaded) return false;
        this.buildingHistory = result.value.buildingHistory;
        const restore = this.construction.restoreRecord(result.value.constructionRecord);
        if (!restore.ok) this.ui?.showToast(restore.message);
        this.renderer.constructionSnapshot = this.construction.getRenderSnapshot();
        this.renderer.markDirty();
        this.ui?.update();
        return true;
    }

    reset() {
        this.tileMap.clearAll();
        this.construction.reset();
        this.buildingHistory = [];
        SaveSystem.clear();
        this._centerCamera();
        this.renderer.markDirty();
        this.ui?.showToast('World cleared');
        this.ui?.update();
    }

    /**
     * Grow the island by a ring of fresh desert on the right and front
     * edges. New cells ripple in as dune sand, ready to build on.
     */
    expandLand(delta = 3, max = 40) {
        const tm = this.tileMap;
        const oldW = tm.width, oldH = tm.height;
        const newW = Math.min(max, oldW + delta);
        const newH = Math.min(max, oldH + delta);
        if (newW === oldW && newH === oldH) {
            this.ui?.showToast(`The island is at its largest (${max}×${max})`);
            return false;
        }

        tm.resize(newW, newH);

        // Ripple dune sand across the newly reclaimed ring.
        for (let gy = 0; gy < newH; gy++)
            for (let gx = 0; gx < newW; gx++) {
                if (gx < oldW && gy < oldH) continue;
                const delay = (Math.max(gx - oldW, gy - oldH, 0)) * 60;
                this.placeAndAnimate('dune_sand', gx, gy, { delay, silent: true });
            }
        playPlacement('terrain');

        this.renderer.markDirty();
        this.ui?.showToast(`Island expanded to ${newW}×${newH}`);
        this.ui?.update();
        return true;
    }

    /* ── Living construction intents ─────────────────────────── */

    confirmConstructionSite() { return this.construction.confirmSite(); }
    selectConstructionPlan(planId) { return this.construction.selectPlan(planId); }
    beginConstruction() { return this.construction.beginConstruction(); }
    setConstructionPaused(paused) { return this.construction.setPaused(paused); }
    setConstructionSpeed(speed) { return this.construction.setPlaybackSpeed(speed); }
    skipConstructionPhase() { return this.construction.skipToNextPhase(); }
    resolveConstructionIntervention(optionId) { return this.construction.resolveIntervention(optionId); }
    replayConstruction() { return this.construction.startReplay(); }
    stopConstructionReplay() { return this.construction.stopReplay(); }
    seedMobileConstructionDemo() { return this.construction.seedCompletedDemo(); }

    /* ── World mutations ──────────────────────────────────────── */

    /**
     * Place an asset and queue its elastic pop-in, optionally delayed so
     * callers can ripple many placements (seed scene, terrain fill).
     * Returns the placement result, or null when rejected.
     */
    placeAndAnimate(assetId, gx, gy, opts = {}) {
        if (this.runtimeMode === 'mobile-replay' || this.construction.ownsCell(gx, gy)) return null;
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
        if (this.runtimeMode === 'mobile-replay' || this.construction.ownsCell(gx, gy)) return false;
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
            if (this.construction.ownsCell(gx, gy)) continue;
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
        if (this.runtimeMode === 'mobile-replay') return;
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
        if (this.runtimeMode === 'mobile-replay') return;
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
