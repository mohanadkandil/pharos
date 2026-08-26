/**
 * Pan/zoom camera over world pixel space, cursor-anchored zooming.
 */

import { CONFIG } from '../config.js';

export class Camera {
    constructor() {
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = CONFIG.camera.defaultZoom;
        this._onChange = null;
    }

    /** Renderer subscribes so any camera move flips its dirty flag. */
    onChange(cb) { this._onChange = cb; }
    _notify() { if (this._onChange) this._onChange(); }

    screenToWorld(sx, sy) {
        return {
            x: (sx - this.offsetX) / this.zoom,
            y: (sy - this.offsetY) / this.zoom,
        };
    }

    worldToScreen(wx, wy) {
        return {
            x: wx * this.zoom + this.offsetX,
            y: wy * this.zoom + this.offsetY,
        };
    }

    pan(dx, dy) {
        if (!dx && !dy) return;
        this.offsetX += dx;
        this.offsetY += dy;
        this._notify();
    }

    /** Zoom keeping the world point under (screenX,screenY) fixed. */
    zoomAt(screenX, screenY, factor) {
        const clamped = Math.max(CONFIG.camera.minZoom,
            Math.min(CONFIG.camera.maxZoom, this.zoom * factor));
        if (clamped === this.zoom) return;

        const before = this.screenToWorld(screenX, screenY);
        this.zoom = clamped;
        const after = this.screenToWorld(screenX, screenY);
        this.offsetX += (after.x - before.x) * this.zoom;
        this.offsetY += (after.y - before.y) * this.zoom;
        this._notify();
    }

    centerOn(wx, wy, canvasW, canvasH) {
        this.offsetX = canvasW / 2 - wx * this.zoom;
        this.offsetY = canvasH / 2 - wy * this.zoom;
        this._notify();
    }
}
