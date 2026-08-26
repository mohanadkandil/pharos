/**
 * World state: two layers on one grid.
 *
 *   terrain — one asset id per cell (ground tiles).
 *   objects — multi-cell placed assets sitting on top.
 *
 * An occupancy index maps every covered cell to its owning object so
 * hover-time `canPlace` checks and renderer lookups stay O(1) per cell.
 * `terrainVersion` / `objectsVersion` let the renderer invalidate its
 * caches cheaply instead of diffing contents.
 */

import { CONFIG } from '../config.js';

export class TileMap {
    constructor(width = CONFIG.grid.width, height = CONFIG.grid.height) {
        this.width = width;
        this.height = height;

        this.terrain = new Array(width * height).fill(null);
        this.objects = [];

        this._occupancy = new Array(width * height).fill(null);
        this._nextId = 1;

        this.terrainVersion = 0;
        this.objectsVersion = 0;
    }

    nextId() { return this._nextId++; }

    inBounds(gx, gy) {
        return gx >= 0 && gy >= 0 && gx < this.width && gy < this.height;
    }

    _index(gx, gy) { return gy * this.width + gx; }

    setTerrain(gx, gy, assetId) {
        if (!this.inBounds(gx, gy)) return;
        this.terrain[this._index(gx, gy)] = assetId;
        this.terrainVersion++;
    }

    clearTerrain(gx, gy) { this.setTerrain(gx, gy, null); }

    getTerrain(gx, gy) {
        return this.inBounds(gx, gy)
            ? this.terrain[this._index(gx, gy)]
            : null;
    }

    /** Object covering (gx,gy), or null — O(1) via occupancy index. */
    objectAt(gx, gy) {
        if (!this.inBounds(gx, gy)) return null;
        return this._occupancy[this._index(gx, gy)];
    }

    /** True when the w×d rect rooted at (gx,gy) holds no object. */
    isFreeFor(gx, gy, w, d) {
        for (let ix = gx; ix < gx + w; ix++)
            for (let iy = gy; iy < gy + d; iy++) {
                if (!this.inBounds(ix, iy)) return false;
                if (this._occupancy[this._index(ix, iy)]) return false;
            }
        return true;
    }

    addObject(obj) {
        this.objects.push(obj);
        this._stampOccupancy(obj, obj);
        this.objectsVersion++;
    }

    removeObjectAt(gx, gy) {
        const obj = this.objectAt(gx, gy);
        if (!obj) return null;
        this.objects = this.objects.filter(o => o !== obj);
        this._stampOccupancy(obj, null);
        this.objectsVersion++;
        return obj;
    }

    clearAll() {
        this.terrain.fill(null);
        this.objects = [];
        this._occupancy.fill(null);
        this.terrainVersion++;
        this.objectsVersion++;
    }

    /**
     * Grow (or shrink) the grid, preserving terrain by coordinate and
     * keeping every object that still fits. Both version counters bump
     * so the renderer rebuilds its world caches.
     */
    resize(newW, newH) {
        if (newW === this.width && newH === this.height) return;
        const old = { w: this.width, h: this.height, terrain: this.terrain };

        this.width = newW;
        this.height = newH;
        this.terrain = new Array(newW * newH).fill(null);
        for (let gy = 0; gy < Math.min(old.h, newH); gy++)
            for (let gx = 0; gx < Math.min(old.w, newW); gx++)
                this.terrain[gy * newW + gx] = old.terrain[gy * old.w + gx];

        this.objects = this.objects.filter(o =>
            o.gx + o.footprint.w <= newW && o.gy + o.footprint.d <= newH);
        this._occupancy = new Array(newW * newH).fill(null);
        for (const obj of this.objects) this._stampOccupancy(obj, obj);

        this.terrainVersion++;
        this.objectsVersion++;
    }

    serialize() {
        return {
            width: this.width,
            height: this.height,
            terrain: [...this.terrain],
            objects: this.objects.map(o => o.serialize()),
            nextId: this._nextId,
        };
    }

    /**
     * Restore from a snapshot. `objectFactory(plainData)` rebuilds object
     * instances — keeps TileMap decoupled from the PlacedObject class.
     */
    deserialize(data, objectFactory = d => d) {
        this.width = data.width ?? this.width;
        this.height = data.height ?? this.height;
        const n = this.width * this.height;
        this.terrain = new Array(n).fill(null);
        if (Array.isArray(data.terrain)) {
            for (let i = 0; i < Math.min(n, data.terrain.length); i++) {
                this.terrain[i] = data.terrain[i];
            }
        }
        this.objects = (data.objects ?? []).map(objectFactory);
        this._occupancy = new Array(n).fill(null);
        for (const obj of this.objects) this._stampOccupancy(obj, obj);
        this._nextId = data.nextId ?? (this.objects.length + 1);
        this.terrainVersion++;
        this.objectsVersion++;
    }

    _stampOccupancy(obj, value) {
        for (let ix = obj.gx; ix < obj.gx + obj.footprint.w; ix++)
            for (let iy = obj.gy; iy < obj.gy + obj.footprint.d; iy++) {
                if (!this.inBounds(ix, iy)) continue;
                this._occupancy[this._index(ix, iy)] = value;
            }
    }
}
