/**
 * Turns player intent (selected asset + target cell) into world changes.
 */

import { ASSET_INDEX } from '../assets/assetManifest.js';
import { PlacedObject } from './PlacedObject.js';

export class PlacementSystem {
    constructor(tileMap) {
        this.tileMap = tileMap;
    }

    canPlace(assetId, gx, gy) {
        const asset = ASSET_INDEX[assetId];
        if (!asset) return false;
        if (asset.kind === 'terrain') return this.tileMap.inBounds(gx, gy);
        return this.tileMap.isFreeFor(gx, gy, asset.footprint.w, asset.footprint.d);
    }

    place(assetId, gx, gy, opts = {}) {
        const asset = ASSET_INDEX[assetId];
        if (!asset || !this.canPlace(assetId, gx, gy)) return null;

        if (asset.kind === 'terrain') {
            // Terrain swaps out underneath; standing objects are untouched.
            this.tileMap.setTerrain(gx, gy, assetId);
            return { kind: 'terrain', gx, gy, assetId };
        }

        const obj = new PlacedObject({
            id: this.tileMap.nextId(),
            assetId,
            gx,
            gy,
            footprint: asset.footprint,
            flipH: !!opts.flipH,
            flipV: !!opts.flipV,
        });
        this.tileMap.addObject(obj);
        return { kind: 'object', object: obj };
    }

    /** Erase topmost thing on (gx,gy): objects before terrain. */
    erase(gx, gy) {
        if (this.tileMap.objectAt(gx, gy)) {
            this.tileMap.removeObjectAt(gx, gy);
            return true;
        }
        if (this.tileMap.getTerrain(gx, gy)) {
            this.tileMap.clearTerrain(gx, gy);
            return true;
        }
        return false;
    }
}
