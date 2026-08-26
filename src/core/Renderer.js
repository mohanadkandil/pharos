/**
 * Scene renderer built from cached layers plus a thin live overlay.
 *
 * Layers, back to front:
 *   sky      — screen-space papyrus gradient + sun glow, rebuilt on resize
 *   plinth   — world-space sandstone slab under the grid, rebuilt on grid size
 *   terrain  — world-space baked ground tiles, rebuilt on tileMap.terrainVersion
 *   objects  — world-space baked shadows + sprites, rebuilt on tileMap.objectsVersion
 *   overlay  — pop-in animations, hover diamond, ghost preview, water shimmer
 *
 * Pan/zoom never invalidate the world caches: the camera is just a canvas
 * transform applied when the cached layers are stamped. A dirty flag lets
 * `render()` exit immediately when nothing moved and nothing is animating.
 */

import { CONFIG } from '../config.js';
import { cellToScreen, cellInBounds } from '../grid/IsoGrid.js';
import { getAsset } from '../assets/assetFactory.js';
import { voxelToScreen } from '../assets/voxelRenderer.js';
import { ASSET_INDEX } from '../assets/assetManifest.js';

const PAL = CONFIG.palette;

// World-space slack around the grid diamond so tall monuments (the Pharos,
// the great pyramid) and slab shadows fit inside the cached layers.
const PAD_TOP = 720;
const PAD_BOTTOM = 220;
const PAD_X = 280;

// World caches are stored above 1:1 so sprites stay crisp when zoomed in.
// Capped at 3 to keep cache canvases well inside browser size limits.
const DPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
const CACHE_SCALE = Math.min(3, Math.max(2, Math.ceil(DPR * 1.5)));

const POP_MS = 350;              // default placement pop duration
const SHADOW_ALPHA = 0.18;
const SHADOW_SKEW_X = 0.22;      // shadow drift toward screen-right
const SHADOW_SQUASH_Y = 0.5;     // silhouette squashed onto the ground
const SHADOW_BLUR = 2.5;         // px, applied once while baking the cache
const SLAB_DEPTH = 24;           // visible thickness of the stone plinth
const SHIMMER_MS = 160;          // water sparkle refresh cadence

/** '#rrggbb' + alpha → 'rgba(...)' so overlay tints stay palette-driven. */
function tint(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export class Renderer {
    constructor(canvas, camera, tileMap) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: true });
        this.camera = camera;
        this.tileMap = tileMap;

        // Overlay state owned by Game.
        this.gridVisible = false;
        this.hoverCell = null;        // { gx, gy } | null
        this.previewAssetId = null;   // ghost asset while placing
        this.previewValid = true;
        this.previewFlipH = false;
        this.previewFlipV = false;
        this.eraseMode = false;
        this.nightMode = false;

        // Placement pop animations: key → { start, dur, cell, objId, tileKey }.
        this._anims = new Map();
        this._frame = new Map();      // this frame's active anims: key → { t, cell }
        this._animObjIds = new Set();
        this._animTileKeys = new Set();

        // Cached layers + the state stamps that produced them.
        this._sky = null;             // { base, vignette } at device pixels
        this._skyStale = true;
        this._plinth = null;
        this._plinthGridW = -1;
        this._plinthGridH = -1;
        this._terrainCache = null;
        this._terrainVersion = -1;
        this._terrainStale = false;
        this._objectsCache = null;
        this._objectsVersion = -1;
        this._objectsStale = false;

        this._bounds = null;          // world-space rect shared by world caches
        this._waterCells = [];        // cells holding nile_water, for shimmer
        this._shimmerAt = 0;
        this._nightAt = 0;

        this._cssW = 1;
        this._cssH = 1;
        this._dirty = true;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /** Request a redraw on the next frame. */
    markDirty() { this._dirty = true; }

    setNightMode(on) {
        this.nightMode = !!on;
        this._skyStale = true;
        this._dirty = true;
    }

    /** Fit the canvas to its parent element at device-pixel resolution. */
    resize() {
        const dpr = window.devicePixelRatio || 1;
        const host = this.canvas.parentElement;
        const w = (host && host.clientWidth) || window.innerWidth;
        const h = (host && host.clientHeight) || window.innerHeight;
        this._cssW = w;
        this._cssH = h;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this._skyStale = true;
        this._dirty = true;
    }

    /** Canvas size in CSS pixels. */
    cssSize() { return { w: this._cssW, h: this._cssH }; }

    /**
     * Queue an elastic pop-in for a placement. Keys: 'obj-<id>' for objects,
     * 't-<gx>,<gy>' for terrain tiles. `startAt` in the future stages a
     * delayed reveal; the entry stays invisible (and out of the baked
     * caches) until its window opens.
     */
    spawnAnim(key, cell = null, dur = POP_MS, startAt = performance.now()) {
        const rec = { start: startAt, dur, cell, objId: null, tileKey: null };
        if (key.startsWith('obj-')) {
            const id = Number(key.slice(4));
            if (!Number.isNaN(id)) {
                rec.objId = id;
                this._animObjIds.add(id);
                this._objectsStale = true;
            }
        } else if (key.startsWith('t-')) {
            rec.tileKey = key.slice(2);
            this._animTileKeys.add(rec.tileKey);
            this._terrainStale = true;
        }
        this._anims.set(key, rec);
        this._dirty = true;
    }

    /* ── Frame entry point ────────────────────────────────────── */

    render(now = performance.now()) {
        this._collectAnims(now);
        const animsPending = this._anims.size > 0;
        const shimmerDue = this._waterCells.length > 0
            && (now - this._shimmerAt) >= SHIMMER_MS;
        const nightDue = this.nightMode && (now - this._nightAt) >= 50;
        if (!this._dirty && !animsPending && !shimmerDue && !nightDue) return;
        this._dirty = false;

        const ctx = this.ctx;
        const { w, h } = this.cssSize();
        ctx.clearRect(0, 0, w, h);

        this._ensureSky(w, h);
        this._ensurePlinth();
        this._ensureTerrain();
        this._ensureObjects();

        ctx.drawImage(this._sky.base, 0, 0, w, h);

        ctx.save();
        ctx.translate(this.camera.offsetX, this.camera.offsetY);
        ctx.scale(this.camera.zoom, this.camera.zoom);

        const wb = this._bounds;
        ctx.drawImage(this._plinth, wb.x, wb.y);
        // High-DPI caches are stamped back to world units in one resample.
        ctx.drawImage(this._terrainCache, wb.x, wb.y, wb.w, wb.h);
        if (this._waterCells.length) {
            this._drawShimmer(now);
            this._shimmerAt = now;
        }
        if (this.gridVisible) this._drawGridLines();
        ctx.drawImage(this._objectsCache, wb.x, wb.y, wb.w, wb.h);

        this._drawOverlay();
        ctx.restore();

        if (this.nightMode) {
            this._drawNightLights(now, w, h);
            this._nightAt = now;
        }
        ctx.drawImage(this._sky.vignette, 0, 0, w, h);
    }

    /* ── Animation bookkeeping ────────────────────────────────── */

    _collectAnims(now) {
        this._frame.clear();
        let objSettled = false;
        let tileSettled = false;
        for (const [key, a] of this._anims) {
            const t = (now - a.start) / a.dur;
            if (t >= 1) {
                this._anims.delete(key);
                if (a.objId != null) {
                    this._animObjIds.delete(a.objId);
                    objSettled = true;
                } else if (a.tileKey) {
                    this._animTileKeys.delete(a.tileKey);
                    tileSettled = true;
                }
                continue;
            }
            if (t < 0) continue; // scheduled but not started yet
            this._frame.set(key, { t, cell: a.cell });
        }
        // A finished pop must fold its subject back into the baked layer
        // on this same frame or the object would blink out for a beat.
        if (objSettled)  { this._objectsStale = true; this._dirty = true; }
        if (tileSettled) { this._terrainStale = true; this._dirty = true; }
    }

    _isAnimAtCell(gx, gy) {
        for (const { cell } of this._frame.values()) {
            if (!cell) continue;
            if (gx >= cell.gx && gx < cell.gx + (cell.w ?? 1)
                && gy >= cell.gy && gy < cell.gy + (cell.d ?? 1)) return true;
        }
        return false;
    }

    _easeElastic(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        const k = (2 * Math.PI) / 3;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * k) + 1;
    }

    /* ── World bounds ─────────────────────────────────────────── */

    _computeBounds() {
        const W = this.tileMap.width;
        const H = this.tileMap.height;
        const pts = [
            cellToScreen(0, 0), cellToScreen(W, 0),
            cellToScreen(W, H), cellToScreen(0, H),
        ];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        }
        return {
            x: Math.floor(minX - PAD_X),
            y: Math.floor(minY - PAD_TOP),
            w: Math.ceil(maxX - minX + PAD_X * 2),
            h: Math.ceil(maxY - minY + PAD_TOP + PAD_BOTTOM),
        };
    }

    /* ── Sky (screen space) ───────────────────────────────────── */

    _ensureSky(w, h) {
        const dpr = window.devicePixelRatio || 1;
        const dw = Math.round(w * dpr);
        const dh = Math.round(h * dpr);
        if (!this._skyStale && this._sky
            && this._sky.base.width === dw && this._sky.base.height === dh) return;
        this._skyStale = false;

        const base = document.createElement('canvas');
        base.width = dw;
        base.height = dh;
        const vignette = document.createElement('canvas');
        vignette.width = dw;
        vignette.height = dh;

        const bctx = base.getContext('2d');
        bctx.scale(dpr, dpr);
        if (this.nightMode) {
            const sky = bctx.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, '#010208');
            sky.addColorStop(0.56, '#030713');
            sky.addColorStop(1, '#080d1c');
            bctx.fillStyle = sky;
            bctx.fillRect(0, 0, w, h);

            // Deterministic star field; no random flicker between rebuilds.
            for (let i = 0; i < 90; i++) {
                const x = (i * 137 + 53) % Math.max(1, Math.floor(w));
                const y = (i * 71 + 29) % Math.max(1, Math.floor(h * 0.72));
                const r = i % 11 === 0 ? 1.4 : i % 4 === 0 ? 1 : 0.6;
                bctx.fillStyle = i % 7 === 0 ? '#f6dc8d' : '#dce8ff';
                bctx.globalAlpha = 0.45 + (i % 5) * 0.1;
                bctx.beginPath();
                bctx.arc(x, y, r, 0, Math.PI * 2);
                bctx.fill();
            }
            bctx.globalAlpha = 1;

            const moon = bctx.createRadialGradient(w * 0.76, h * 0.14, 0,
                w * 0.76, h * 0.14, Math.max(w, h) * 0.3);
            moon.addColorStop(0, 'rgba(180,204,255,.1)');
            moon.addColorStop(0.42, 'rgba(104,140,211,.025)');
            moon.addColorStop(1, 'rgba(80,110,180,0)');
            bctx.fillStyle = moon;
            bctx.fillRect(0, 0, w, h);
        } else {
            // Warm papyrus sky: pale at the horizon, sinking into dune sand.
            const sky = bctx.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, '#fbf4e0');
            sky.addColorStop(0.55, PAL.sandLight);
            sky.addColorStop(1, PAL.sand);
            bctx.fillStyle = sky;
            bctx.fillRect(0, 0, w, h);
            const sun = bctx.createRadialGradient(
                w * 0.72, h * 0.14, 0,
                w * 0.72, h * 0.14, Math.max(w, h) * 0.8,
            );
            sun.addColorStop(0, tint(PAL.goldLight, 0.5));
            sun.addColorStop(0.4, tint(PAL.goldLight, 0.12));
            sun.addColorStop(1, tint(PAL.goldLight, 0));
            bctx.fillStyle = sun;
            bctx.fillRect(0, 0, w, h);
            const step = 26;
            const cx = w / 2, cy = h / 2;
            const maxR = Math.hypot(cx, cy);
            for (let y = 0; y < h; y += step)
            for (let x = 0; x < w; x += step) {
                const a = 0.045 * (1 - (Math.hypot(x - cx, y - cy) / maxR) * 0.85);
                if (a <= 0) continue;
                bctx.fillStyle = tint(PAL.soilDark, a);
                bctx.fillRect(x, y, 1, 1);
            }
        }

        const vctx = vignette.getContext('2d');
        vctx.scale(dpr, dpr);
        const vg = vctx.createRadialGradient(
            w / 2, h * 0.55, Math.min(w, h) * 0.35,
            w / 2, h * 0.55, Math.max(w, h) * 0.85,
        );
        vg.addColorStop(0, tint(PAL.soilDark, 0));
        vg.addColorStop(0.7, tint(PAL.soilDark, 0.05));
        vg.addColorStop(1, tint(PAL.soilDark, 0.2));
        vctx.fillStyle = vg;
        vctx.fillRect(0, 0, w, h);

        this._sky = { base, vignette };
    }

    /* ── Plinth slab (world space) ────────────────────────────── */

    _ensurePlinth() {
        const W = this.tileMap.width;
        const H = this.tileMap.height;
        if (this._plinth && this._plinthGridW === W && this._plinthGridH === H) return;

        // Grid size changed: every world cache shares this coordinate frame.
        this._bounds = this._computeBounds();
        this._terrainCache = null;
        this._objectsCache = null;
        this._terrainVersion = -1;
        this._objectsVersion = -1;

        const wb = this._bounds;
        const c = document.createElement('canvas');
        c.width = wb.w;
        c.height = wb.h;
        const ctx = c.getContext('2d');
        ctx.translate(-wb.x, -wb.y);
        this._paintPlinth(ctx, W, H);
        this._plinth = c;
        this._plinthGridW = W;
        this._plinthGridH = H;
    }

    _paintPlinth(ctx, W, H) {
        const back = cellToScreen(0, 0);
        const right = cellToScreen(W, 0);
        const front = cellToScreen(W, H);
        const left = cellToScreen(0, H);

        const traceTop = () => {
            ctx.beginPath();
            ctx.moveTo(back.x, back.y);
            ctx.lineTo(right.x, right.y);
            ctx.lineTo(front.x, front.y);
            ctx.lineTo(left.x, left.y);
            ctx.closePath();
        };

        // Soft ground shadow pooled beneath the slab.
        const canBlur = typeof ctx.filter === 'string';
        const passes = [
            { dy: SLAB_DEPTH + 30, blur: 26, a: 0.10 },
            { dy: SLAB_DEPTH + 18, blur: 12, a: 0.12 },
            { dy: SLAB_DEPTH + 8,  blur: 5,  a: 0.14 },
        ];
        for (const p of passes) {
            ctx.save();
            if (canBlur) ctx.filter = `blur(${p.blur}px)`;
            ctx.translate(0, p.dy);
            traceTop();
            ctx.fillStyle = tint(PAL.soilDark, p.a);
            ctx.fill();
            ctx.restore();
        }

        // Sandstone side faces: sunlit right, shaded left.
        ctx.beginPath();
        ctx.moveTo(right.x, right.y);
        ctx.lineTo(front.x, front.y);
        ctx.lineTo(front.x, front.y + SLAB_DEPTH);
        ctx.lineTo(right.x, right.y + SLAB_DEPTH);
        ctx.closePath();
        ctx.fillStyle = PAL.path;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(front.x, front.y);
        ctx.lineTo(left.x, left.y);
        ctx.lineTo(left.x, left.y + SLAB_DEPTH);
        ctx.lineTo(front.x, front.y + SLAB_DEPTH);
        ctx.closePath();
        ctx.fillStyle = PAL.pathDark;
        ctx.fill();

        // Limestone top face.
        traceTop();
        const top = ctx.createLinearGradient(back.x, back.y, front.x, front.y);
        top.addColorStop(0, PAL.limestoneLight);
        top.addColorStop(1, PAL.limestone);
        ctx.fillStyle = top;
        ctx.fill();

        // Back edges catch the sun.
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(back.x, back.y);
        ctx.lineTo(right.x, right.y);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = tint(PAL.sandLight, 0.6);
        ctx.stroke();
    }

    /* ── Terrain cache ────────────────────────────────────────── */

    _ensureTerrain() {
        const tm = this.tileMap;
        if (this._terrainCache && !this._terrainStale
            && this._terrainVersion === tm.terrainVersion) return;
        this._terrainStale = false;

        const wb = this._bounds;
        const cw = wb.w * CACHE_SCALE;
        const ch = wb.h * CACHE_SCALE;
        if (!this._terrainCache
            || this._terrainCache.width !== cw
            || this._terrainCache.height !== ch) {
            const c = document.createElement('canvas');
            c.width = cw;
            c.height = ch;
            this._terrainCache = c;
        }
        const ctx = this._terrainCache.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        ctx.scale(CACHE_SCALE, CACHE_SCALE);
        ctx.translate(-wb.x, -wb.y);

        this._waterCells.length = 0;
        for (let gy = 0; gy < tm.height; gy++)
        for (let gx = 0; gx < tm.width; gx++) {
            const id = tm.getTerrain(gx, gy);
            if (!id) continue;
            if (id === 'nile_water') this._waterCells.push({ gx, gy });
            // Mid-pop tiles are drawn scaled by the live overlay instead.
            if (this._animTileKeys.has(`${gx},${gy}`)) continue;
            const asset = getAsset(id);
            if (!asset) continue;
            const p = cellToScreen(gx, gy);
            ctx.drawImage(
                asset.displayCanvas || asset.canvas,
                p.x - asset.anchorX, p.y - asset.anchorY,
                asset.width, asset.height,
            );
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._terrainVersion = tm.terrainVersion;
    }

    /* ── Static objects cache ─────────────────────────────────── */

    _ensureObjects() {
        const tm = this.tileMap;
        if (this._objectsCache && !this._objectsStale
            && this._objectsVersion === tm.objectsVersion) return;
        this._objectsStale = false;

        const wb = this._bounds;
        const cw = wb.w * CACHE_SCALE;
        const ch = wb.h * CACHE_SCALE;
        if (!this._objectsCache
            || this._objectsCache.width !== cw
            || this._objectsCache.height !== ch) {
            const c = document.createElement('canvas');
            c.width = cw;
            c.height = ch;
            this._objectsCache = c;
        }
        const ctx = this._objectsCache.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        ctx.scale(CACHE_SCALE, CACHE_SCALE);
        ctx.translate(-wb.x, -wb.y);

        // Pass 1: every settled object's shadow, blurred once at bake time.
        ctx.save();
        ctx.globalAlpha = SHADOW_ALPHA;
        if (typeof ctx.filter === 'string') ctx.filter = `blur(${SHADOW_BLUR}px)`;
        for (const obj of tm.objects) {
            if (this._animObjIds.has(obj.id)) continue;
            const asset = getAsset(obj.assetId);
            if (this._castsShadow(asset)) {
                this._drawObjectShadow(ctx, asset, obj.gx, obj.gy, obj.footprint, obj);
            }
        }
        ctx.restore();

        // Pass 2: sprites, painter's order.
        const settled = tm.objects.filter(o => !this._animObjIds.has(o.id));
        settled.sort((a, b) => a.sortKey() - b.sortKey());
        for (const obj of settled) {
            const asset = getAsset(obj.assetId);
            if (asset) this._drawSprite(ctx, asset, obj.gx, obj.gy, obj.footprint, obj);
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._objectsVersion = tm.objectsVersion;
    }

    /* ── Sprite + shadow primitives ───────────────────────────── */

    /**
     * Stamp an asset at its cell, honoring sizeScale (scaled around the
     * footprint's ground-center point) and flip mirroring.
     */
    _drawSprite(ctx, asset, gx, gy, footprint = { w: 1, d: 1 }, flip = {}) {
        const p = cellToScreen(gx, gy);
        const dx = p.x - asset.anchorX;
        const dy = p.y - asset.anchorY;
        const s = asset.kind === 'object' ? (asset.sizeScale ?? 1) : 1;
        const fh = flip.flipH === true;
        const fv = flip.flipV === true;
        const src = asset.displayCanvas || asset.canvas;
        if (s === 1 && !fh && !fv) {
            ctx.drawImage(src, dx, dy, asset.width, asset.height);
            return;
        }
        const pivot = cellToScreen(gx + footprint.w / 2, gy + footprint.d / 2);
        ctx.save();
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(s * (fh ? -1 : 1), s * (fv ? -1 : 1));
        ctx.translate(-pivot.x, -pivot.y);
        ctx.drawImage(src, dx, dy, asset.width, asset.height);
        ctx.restore();
    }

    _castsShadow(asset) {
        return !!asset
            && asset.kind === 'object'
            && !asset.tileLike
            && !asset.noShadow
            && (!!asset.shadowCanvas || !!asset.contactPoints?.length);
    }

    _drawObjectShadow(ctx, asset, gx, gy, footprint, flip = {}) {
        const s = asset.sizeScale ?? 1;
        if (asset.shadowCanvas) {
            // Project the silhouette onto the ground: squash + skew away
            // from the sun, pinned at the footprint's ground center.
            const ground = cellToScreen(gx + footprint.w / 2, gy + footprint.d / 2);
            const w = asset.width * s;
            const h = asset.height * s;
            const ax = w / 2;
            const ay = h;
            ctx.save();
            ctx.transform(
                1, 0, SHADOW_SKEW_X, SHADOW_SQUASH_Y,
                ground.x - ax - ay * SHADOW_SKEW_X,
                ground.y - ay * SHADOW_SQUASH_Y,
            );
            if (flip.flipH || flip.flipV) {
                ctx.translate(ax, ay);
                ctx.scale(flip.flipH ? -1 : 1, flip.flipV ? -1 : 1);
                ctx.translate(-ax, -ay);
            }
            ctx.drawImage(asset.shadowCanvas, 0, 0, w, h);
            ctx.restore();
            return;
        }
        if (asset.contactPoints?.length) {
            // Low props ground themselves with tight foot ellipses instead
            // of a long projected silhouette. Points live in display-canvas
            // pixels; convert back to world units.
            const k = asset.width / (asset.displayCanvas?.width || asset.width);
            const p = cellToScreen(gx, gy);
            const dx = p.x - asset.anchorX;
            const dy = p.y - asset.anchorY;
            const rx = Math.max(5, asset.width * 0.1);
            const ry = rx * 0.45;
            ctx.save();
            if (s !== 1) {
                const pivot = cellToScreen(gx + footprint.w / 2, gy + footprint.d / 2);
                ctx.translate(pivot.x, pivot.y);
                ctx.scale(s, s);
                ctx.translate(-pivot.x, -pivot.y);
            }
            ctx.fillStyle = tint(PAL.soilDark, 1);
            for (const pt of asset.contactPoints) {
                const px = dx + (flip.flipH ? asset.width - pt.x * k : pt.x * k);
                const py = dy + (flip.flipV ? asset.height - pt.y * k : pt.y * k);
                ctx.beginPath();
                ctx.ellipse(px, py, rx, ry, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    /* ── Live overlay ─────────────────────────────────────────── */

    _drawOverlay() {
        const ctx = this.ctx;
        const items = [];

        for (const obj of this.tileMap.objects) {
            if (!this._animObjIds.has(obj.id)) continue;
            const entry = this._frame.get(`obj-${obj.id}`);
            if (!entry) continue;
            const asset = getAsset(obj.assetId);
            if (!asset) continue;
            const t = entry.t;
            if (this._castsShadow(asset)) {
                items.push({
                    key: obj.sortKey() - 0.5,
                    draw: () => {
                        const prev = ctx.globalAlpha;
                        ctx.globalAlpha = prev * SHADOW_ALPHA
                            * Math.min(1, Math.max(0, t * 1.4 - 0.1));
                        this._drawObjectShadow(ctx, asset, obj.gx, obj.gy, obj.footprint, obj);
                        ctx.globalAlpha = prev;
                    },
                });
            }
            items.push({
                key: obj.sortKey(),
                draw: () => this._drawAnimObject(obj, asset, t),
            });
        }

        for (const [key, entry] of this._frame) {
            if (!key.startsWith('t-') || !entry.cell) continue;
            const { gx, gy } = entry.cell;
            const id = this.tileMap.getTerrain(gx, gy);
            if (!id) continue;
            items.push({
                key: gx + gy - 0.0005,
                draw: () => this._drawAnimTile(id, gx, gy, entry.t),
            });
        }

        if (this.hoverCell) {
            const { gx, gy } = this.hoverCell;
            const entry = this.previewAssetId ? ASSET_INDEX[this.previewAssetId] : null;
            const fp = entry?.footprint ?? { w: 1, d: 1 };
            items.push({
                key: gx + gy - 0.001,
                draw: () => this._drawHoverCells(gx, gy, fp),
            });
            const blocked = this.eraseMode || this._isAnimAtCell(gx, gy);
            if (entry && !blocked && entry.kind === 'object') {
                const asset = getAsset(entry.id);
                if (asset && this._castsShadow(asset)) {
                    items.push({
                        key: (gx + fp.w - 1) + (gy + fp.d - 1) - 0.5,
                        draw: () => this._drawGhostShadow(asset, gx, gy, fp),
                    });
                }
                items.push({
                    key: (gx + fp.w - 1) + (gy + fp.d - 1) + 0.001,
                    draw: () => this._drawGhostObject(entry, gx, gy, fp),
                });
            } else if (entry && !blocked && entry.kind === 'terrain') {
                items.push({
                    key: gx + gy + 0.0005,
                    draw: () => this._drawGhostTerrain(entry, gx, gy),
                });
            }
        }

        if (items.length > 1) items.sort((a, b) => a.key - b.key);
        for (const item of items) item.draw();
    }

    _drawAnimObject(obj, asset, t) {
        const ctx = this.ctx;
        const k = this._easeElastic(t);
        const pivot = cellToScreen(
            obj.gx + obj.footprint.w / 2,
            obj.gy + obj.footprint.d / 2,
        );
        ctx.save();
        ctx.globalAlpha *= Math.min(1, t * 1.8);
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(k, k);
        ctx.translate(-pivot.x, -pivot.y);
        this._drawSprite(ctx, asset, obj.gx, obj.gy, obj.footprint, obj);
        ctx.restore();
    }

    _drawAnimTile(assetId, gx, gy, t) {
        const ctx = this.ctx;
        const asset = getAsset(assetId);
        if (!asset) return;
        const k = this._easeElastic(t);
        const pivot = cellToScreen(gx + 0.5, gy + 0.5);
        const p = cellToScreen(gx, gy);
        ctx.save();
        ctx.globalAlpha *= Math.min(1, t * 1.8);
        ctx.translate(pivot.x, pivot.y);
        ctx.scale(k, k);
        ctx.translate(-pivot.x, -pivot.y);
        ctx.drawImage(
            asset.displayCanvas || asset.canvas,
            p.x - asset.anchorX, p.y - asset.anchorY,
            asset.width, asset.height,
        );
        ctx.restore();
    }

    _drawGhostShadow(asset, gx, gy, fp) {
        const ctx = this.ctx;
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = prev * SHADOW_ALPHA * (this.previewValid ? 1 : 0.5);
        this._drawObjectShadow(ctx, asset, gx, gy, fp, {
            flipH: this.previewFlipH,
            flipV: this.previewFlipV,
        });
        ctx.globalAlpha = prev;
    }

    _drawGhostObject(entry, gx, gy, fp) {
        const ctx = this.ctx;
        const asset = getAsset(entry.id);
        if (!asset) return;
        ctx.save();
        ctx.globalAlpha = this.previewValid ? 0.6 : 0.3;
        this._drawSprite(ctx, asset, gx, gy, fp, {
            flipH: this.previewFlipH,
            flipV: this.previewFlipV,
        });
        ctx.restore();
    }

    _drawGhostTerrain(entry, gx, gy) {
        const ctx = this.ctx;
        const asset = getAsset(entry.id);
        if (!asset) return;
        const p = cellToScreen(gx, gy);
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.drawImage(
            asset.displayCanvas || asset.canvas,
            p.x - asset.anchorX, p.y - asset.anchorY,
            asset.width, asset.height,
        );
        ctx.restore();
    }

    /* ── Hover diamond + grid + shimmer ───────────────────────── */

    _drawHoverCells(gx, gy, fp) {
        const ctx = this.ctx;
        const valid = this.previewValid;
        const stroke = this.eraseMode
            ? tint(PAL.hibiscus, 0.95)
            : (valid ? tint(PAL.turquoise, 0.95) : tint(PAL.hibiscus, 0.9));
        const fill = this.eraseMode
            ? tint(PAL.hibiscus, 0.16)
            : (valid ? tint(PAL.turquoise, 0.16) : tint(PAL.hibiscus, 0.14));
        ctx.save();
        ctx.lineWidth = 2 / this.camera.zoom;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;
        for (let ix = 0; ix < fp.w; ix++)
        for (let iy = 0; iy < fp.d; iy++) {
            const cx = gx + ix;
            const cy = gy + iy;
            if (!cellInBounds(cx, cy, this.tileMap.width, this.tileMap.height)) continue;
            const a = cellToScreen(cx, cy);
            const b = cellToScreen(cx + 1, cy);
            const c = cellToScreen(cx + 1, cy + 1);
            const d = cellToScreen(cx, cy + 1);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.lineTo(c.x, c.y);
            ctx.lineTo(d.x, d.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawGridLines() {
        const ctx = this.ctx;
        const W = this.tileMap.width;
        const H = this.tileMap.height;
        ctx.save();
        ctx.lineWidth = 1 / this.camera.zoom;
        ctx.strokeStyle = tint(PAL.soil, 0.22);
        ctx.beginPath();
        for (let g = 0; g <= W; g++) {
            const a = cellToScreen(g, 0);
            const b = cellToScreen(g, H);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        for (let g = 0; g <= H; g++) {
            const a = cellToScreen(0, g);
            const b = cellToScreen(W, g);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Sparse deterministic glints on Nile water cells. The phase index
     * quantizes time so the pattern only mutates every SHIMMER_MS, which
     * keeps the redraw cadence (and cost) low.
     */
    _drawShimmer(now) {
        const ctx = this.ctx;
        const phase = Math.floor(now / SHIMMER_MS);
        ctx.save();
        ctx.fillStyle = PAL.nileShine;
        ctx.globalAlpha = 0.55;
        for (const cell of this._waterCells) {
            if ((cell.gx * 31 + cell.gy * 17 + phase) % 5 > 1) continue;
            for (let i = 0; i < 2; i++) {
                const h = (cell.gx * 131 + cell.gy * 73 + (phase + i) * 47) % 16;
                const u = (h % 4) * 0.25 - 0.3;
                const v = Math.floor(h / 4) * 0.25 - 0.3;
                const p = cellToScreen(cell.gx + 0.5 + u, cell.gy + 0.5 + v);
                ctx.fillRect(p.x - 1.5, p.y - 0.75, 3, 1.5);
            }
        }
        ctx.restore();
    }

    /** Cinematic exposure, moon rim, emissive architecture and Pharos beam. */
    _drawNightLights(now, w, h) {
        const ctx = this.ctx;
        ctx.save();

        // Exposure pass. Near-black rather than a blue color wash.
        ctx.fillStyle = 'rgba(0, 2, 10, .58)';
        ctx.fillRect(0, 0, w, h);

        // A restrained cold rim keeps voxel silhouettes and rooflines legible.
        ctx.save();
        ctx.translate(this.camera.offsetX, this.camera.offsetY);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.12;
        ctx.filter = 'drop-shadow(-3px -5px 2px rgba(105,145,215,.8))';
        const wb = this._bounds;
        ctx.drawImage(this._objectsCache, wb.x, wb.y, wb.w, wb.h);
        ctx.filter = 'none';
        ctx.restore();

        ctx.globalCompositeOperation = 'screen';
        const warm = 'rgba(255,184,64,ALPHA)';

        const glowAt = (x, y, radius, strength = 0.8, color = warm) => {
            const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
            g.addColorStop(0, color.replace('ALPHA', String(strength)));
            g.addColorStop(0.18, color.replace('ALPHA', String(strength * 0.46)));
            g.addColorStop(1, color.replace('ALPHA', '0'));
            ctx.fillStyle = g;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
        };

        const voxelPoint = (obj, x, y, z) => {
            const origin = cellToScreen(obj.gx, obj.gy);
            const v = voxelToScreen(x, y, z);
            return this.camera.worldToScreen(origin.x + v.sx, origin.y + v.sy);
        };

        const pane = (obj, x, y, z, face = 'left') => {
            const p = voxelPoint(obj, x, y, z);
            const s = this.camera.zoom;
            glowAt(p.x, p.y + 10 * s, 20 * s, 0.62);
            ctx.save();
            ctx.shadowColor = 'rgba(255,181,55,.95)';
            ctx.shadowBlur = 7 * s;
            const grd = ctx.createLinearGradient(p.x, p.y + 5 * s, p.x, p.y + 22 * s);
            grd.addColorStop(0, '#fff1b0');
            grd.addColorStop(0.5, '#ffc651');
            grd.addColorStop(1, '#c66a16');
            ctx.fillStyle = grd;
            ctx.beginPath();
            if (face === 'right') {
                ctx.moveTo(p.x, p.y + 8 * s);
                ctx.lineTo(p.x + 7 * s, p.y + 4.5 * s);
                ctx.lineTo(p.x + 7 * s, p.y + 19 * s);
                ctx.lineTo(p.x, p.y + 23 * s);
            } else {
                ctx.moveTo(p.x, p.y + 8 * s);
                ctx.lineTo(p.x - 7 * s, p.y + 4.5 * s);
                ctx.lineTo(p.x - 7 * s, p.y + 19 * s);
                ctx.lineTo(p.x, p.y + 23 * s);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        };

        let pharos = null;
        for (const obj of this.tileMap.objects) {
            if (obj.assetId === 'mudbrick_house') {
                pane(obj, 1, 7, 3); pane(obj, 5, 7, 3);
            } else if (obj.assetId === 'alexandria_house') {
                pane(obj, 2, 11, 1); pane(obj, 9, 11, 1);
                pane(obj, 3, 10, 6); pane(obj, 8, 10, 6);
                pane(obj, 3, 10, 9); pane(obj, 5, 10, 9);
                pane(obj, 6, 10, 9); pane(obj, 8, 10, 9);
            } else if (obj.assetId === 'mosque') {
                pane(obj, 2, 11, 3); pane(obj, 9, 11, 3);
                pane(obj, 11, 4, 4, 'right'); pane(obj, 11, 7, 4, 'right');
            } else if (obj.assetId === 'minaret') {
                pane(obj, 3, 5, 5); pane(obj, 3, 5, 9);
            } else if (obj.assetId === 'fanoos_lantern') {
                const p = voxelPoint(obj, 2, 2, 4);
                glowAt(p.x, p.y + 8, 34, 0.9);
            } else if (obj.assetId === 'bronze_brazier') {
                const p = voxelPoint(obj, 2, 2, 3);
                glowAt(p.x, p.y + 8, 46, 0.72 + Math.sin(now * 0.023) * 0.1);
            } else if (obj.assetId === 'pharos') {
                const p = voxelPoint(obj, 6, 6, 16);
                pharos = p;
                glowAt(p.x, p.y + 6, 58, 0.92);
            }
        }

        if (pharos) {
            const angle = (now * 0.00024) % (Math.PI * 2);
            const length = Math.max(w, h) * 0.58;
            const beamLayer = (spread, alpha, blur) => {
                ctx.save();
                ctx.translate(pharos.x, pharos.y + 8);
                ctx.rotate(angle);
                ctx.filter = `blur(${blur}px)`;
                const beam = ctx.createLinearGradient(0, 0, length, 0);
                beam.addColorStop(0, `rgba(255,224,142,${alpha})`);
                beam.addColorStop(0.14, `rgba(255,218,125,${alpha * 0.7})`);
                beam.addColorStop(0.62, `rgba(255,214,120,${alpha * 0.2})`);
                beam.addColorStop(1, 'rgba(255,214,120,0)');
                ctx.fillStyle = beam;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(length, -length * spread);
                ctx.lineTo(length, length * spread);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            };
            beamLayer(0.055, 0.12, 16);
            beamLayer(0.018, 0.16, 5);
        }
        ctx.restore();
    }
}
