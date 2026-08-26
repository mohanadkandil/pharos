/**
 * localStorage persistence: tile map snapshot plus camera state.
 */

import { CONFIG } from '../config.js';
import { PlacedObject } from '../building/PlacedObject.js';

const KEY = CONFIG.storageKey;

export const SaveSystem = {
    save(tileMap, camera) {
        try {
            localStorage.setItem(KEY, JSON.stringify({
                v: 1,
                tileMap: tileMap.serialize(),
                camera: {
                    offsetX: camera.offsetX,
                    offsetY: camera.offsetY,
                    zoom: camera.zoom,
                },
            }));
            return true;
        } catch (e) {
            console.error('Save failed:', e);
            return false;
        }
    },

    load(tileMap, camera) {
        try {
            const raw = localStorage.getItem(KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            tileMap.deserialize(data.tileMap, d => new PlacedObject(d));
            if (data.camera) {
                camera.offsetX = data.camera.offsetX;
                camera.offsetY = data.camera.offsetY;
                camera.zoom = data.camera.zoom;
            }
            return true;
        } catch (e) {
            console.error('Load failed:', e);
            return false;
        }
    },

    clear() {
        try { localStorage.removeItem(KEY); } catch { /* private mode */ }
    },
};
