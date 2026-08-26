/**
 * Canvas input: mouse, touch, and keyboard, translated into Game intents.
 *
 * Mouse:
 *   left click        apply active tool at the cell
 *   left drag         brush (place/erase continuously, one hit per cell)
 *   right click/drag  erase, always
 *   middle drag       pan
 *   shift+drag        pan
 *   wheel             zoom anchored at the cursor
 *
 * Touch:
 *   tap               apply active tool
 *   long-press        erase (the right-click stand-in)
 *   one-finger drag   brush in place/erase mode, pan otherwise
 *   two fingers       pinch zoom + pan around the gesture midpoint
 *
 * Keys: E erase toggle, G grid, H/V flips, S save, R reset,
 *       1-5 palette category, Escape back to place.
 */

import { screenToCell } from '../grid/IsoGrid.js';
import { playUiClick } from '../ui/Audio.js';

const LONG_PRESS_MS = 420;     // stationary hold before touch-erase fires
const DRIFT_CANCEL_PX = 8;     // finger drift that reclassifies hold as drag
const TAP_SLOP_PX = 10;        // max drift for a release to still be a tap
const TAP_MAX_MS = 350;        // max hold time for a release to be a tap

export class InputManager {
    constructor(canvas, camera, game) {
        this.canvas = canvas;
        this.camera = camera;
        this.game = game;

        // Mouse state.
        this._down = false;
        this._moved = false;
        this._button = null;
        this._lastX = 0;
        this._lastY = 0;
        this._brushing = false;
        this._brushKey = null;

        // Touch state, fully separate from the mouse path.
        this._touches = new Map();  // identifier → { x, y, startX, startY, startTime }
        this._touchMode = null;     // null | 'single' | 'pinch'
        this._touchMoved = false;
        this._touchErased = false;
        this._holdTimer = null;
        this._touchBrushKey = null;
        this._pinchDist = 0;
        this._pinchMid = { x: 0, y: 0 };

        const c = canvas;
        c.addEventListener('mousedown', e => this._mouseDown(e));
        window.addEventListener('mousemove', e => this._mouseMove(e));
        window.addEventListener('mouseup', e => this._mouseUp(e));
        c.addEventListener('mouseleave', () => this.game.clearHover());
        c.addEventListener('contextmenu', e => e.preventDefault());
        c.addEventListener('wheel', e => this._wheel(e), { passive: false });

        // passive: false so preventDefault can stop page scroll, browser
        // pinch-zoom, and the synthetic mouse events touches emit.
        c.addEventListener('touchstart', e => this._touchStart(e), { passive: false });
        c.addEventListener('touchmove', e => this._touchMove(e), { passive: false });
        c.addEventListener('touchend', e => this._touchEnd(e), { passive: false });
        c.addEventListener('touchcancel', e => this._touchEnd(e), { passive: false });

        window.addEventListener('keydown', e => this._keyDown(e));
    }

    /* ── Coordinate helpers ───────────────────────────────────── */

    _canvasXY(e) {
        const r = this.canvas.getBoundingClientRect();
        return { sx: e.clientX - r.left, sy: e.clientY - r.top };
    }

    _cellAt(sx, sy) {
        const w = this.camera.screenToWorld(sx, sy);
        const c = screenToCell(w.x, w.y);
        return { gx: Math.floor(c.gx), gy: Math.floor(c.gy) };
    }

    /* ── Mouse ────────────────────────────────────────────────── */

    _mouseDown(e) {
        const { sx, sy } = this._canvasXY(e);
        this._down = true;
        this._moved = false;
        this._button = e.button;
        this._lastX = sx;
        this._lastY = sy;

        const brushable = this.game.tool === 'place' || this.game.tool === 'erase';
        const canBrush = !e.shiftKey
            && ((e.button === 0 && brushable) || e.button === 2);
        if (canBrush) {
            e.preventDefault();
            this._brushing = true;
            this._brushKey = null;
            const { gx, gy } = this._cellAt(sx, sy);
            this._brushCell(gx, gy);
        }
    }

    _mouseMove(e) {
        const { sx, sy } = this._canvasXY(e);
        const cell = this._cellAt(sx, sy);
        this.game.setHover(cell.gx, cell.gy);

        if (!this._down) return;
        const dx = sx - this._lastX;
        const dy = sy - this._lastY;
        if (Math.abs(dx) + Math.abs(dy) > 3) this._moved = true;

        if (this._brushing && !e.shiftKey) {
            this._brushCell(cell.gx, cell.gy);
        } else if (this._button === 1
            || this.game.tool === 'pan'
            || (this._moved && e.shiftKey)) {
            this.camera.pan(dx, dy);
        }
        this._lastX = sx;
        this._lastY = sy;
    }

    _mouseUp(e) {
        if (!this._down) return;
        this._down = false;
        const wasBrushing = this._brushing;
        this._brushing = false;
        this._brushKey = null;
        const button = this._button;
        this._button = null;
        if (wasBrushing || this._moved) return;

        const { sx, sy } = this._canvasXY(e);
        const { gx, gy } = this._cellAt(sx, sy);
        if (button === 0) this.game.applyPrimary(gx, gy);
        else if (button === 2) this.game.applySecondary(gx, gy);
    }

    /** One tool application per cell entered while dragging. */
    _brushCell(gx, gy) {
        const key = `${gx},${gy}`;
        if (key === this._brushKey) return;
        this._brushKey = key;
        if (this._button === 0) this.game.applyPrimary(gx, gy);
        else if (this._button === 2) this.game.applySecondary(gx, gy);
        this.game.setHover(gx, gy);
    }

    _wheel(e) {
        e.preventDefault();
        const { sx, sy } = this._canvasXY(e);
        this.camera.zoomAt(sx, sy, Math.exp(-e.deltaY * 0.0015));
    }

    /* ── Touch ────────────────────────────────────────────────── */

    _touchXY(t) {
        const r = this.canvas.getBoundingClientRect();
        return { x: t.clientX - r.left, y: t.clientY - r.top };
    }

    _touchStart(e) {
        e.preventDefault();

        for (const t of e.changedTouches) {
            const { x, y } = this._touchXY(t);
            this._touches.set(t.identifier, {
                x, y, startX: x, startY: y,
                startTime: performance.now(),
            });
        }

        const n = this._touches.size;
        if (n === 1) {
            this._touchMode = 'single';
            this._touchMoved = false;
            this._touchErased = false;
            this._touchBrushKey = null;

            const [tp] = this._touches.values();
            const cell = this._cellAt(tp.x, tp.y);
            this.game.setHover(cell.gx, cell.gy);

            // Stationary hold = erase. Any drift or a second finger cancels.
            this._clearHold();
            this._holdTimer = setTimeout(() => {
                this._holdTimer = null;
                if (this._touches.size !== 1 || this._touchMoved) return;
                const c = this._cellAt(tp.x, tp.y);
                this._touchErased = true;
                this.game.applySecondary(c.gx, c.gy);
                if (navigator.vibrate) navigator.vibrate(18);
            }, LONG_PRESS_MS);
        } else if (n >= 2) {
            // A second finger cancels any single-finger intent in flight.
            this._clearHold();
            this._touchMode = 'pinch';
            this._touchErased = false;
            const [a, b] = Array.from(this._touches.values()).slice(0, 2);
            this._pinchDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
            this._pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
    }

    _touchMove(e) {
        e.preventDefault();

        for (const t of e.changedTouches) {
            const tp = this._touches.get(t.identifier);
            if (!tp) continue;
            const { x, y } = this._touchXY(t);
            tp.lastX = tp.x;
            tp.lastY = tp.y;
            tp.x = x;
            tp.y = y;
        }

        if (this._touchMode === 'single') {
            const [tp] = this._touches.values();
            const drift = Math.abs(tp.x - tp.startX) + Math.abs(tp.y - tp.startY);
            if (!this._touchMoved && drift > DRIFT_CANCEL_PX) {
                this._touchMoved = true;
                this._clearHold();
            }
            const cell = this._cellAt(tp.x, tp.y);
            this.game.setHover(cell.gx, cell.gy);
            if (!this._touchMoved) return;

            const tool = this.game.tool;
            if (tool === 'place' || tool === 'erase') {
                const key = `${cell.gx},${cell.gy}`;
                if (key !== this._touchBrushKey) {
                    this._touchBrushKey = key;
                    this.game.applyPrimary(cell.gx, cell.gy);
                }
            } else {
                const dx = tp.x - (tp.lastX ?? tp.x);
                const dy = tp.y - (tp.lastY ?? tp.y);
                if (dx || dy) this.camera.pan(dx, dy);
            }
        } else if (this._touchMode === 'pinch') {
            const [a, b] = Array.from(this._touches.values()).slice(0, 2);
            if (!a || !b) return;
            const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            // Frame-relative factor: the camera already accumulates zoom.
            const factor = dist / this._pinchDist;
            if (factor !== 1) this.camera.zoomAt(mid.x, mid.y, factor);
            const dx = mid.x - this._pinchMid.x;
            const dy = mid.y - this._pinchMid.y;
            if (dx || dy) this.camera.pan(dx, dy);
            this._pinchDist = dist;
            this._pinchMid = mid;
        }
    }

    _touchEnd(e) {
        e.preventDefault();

        let lifted = null;
        for (const t of e.changedTouches) {
            lifted = this._touches.get(t.identifier) || lifted;
            this._touches.delete(t.identifier);
        }

        const wasSingle = this._touchMode === 'single';
        const remaining = this._touches.size;

        if (wasSingle && remaining === 0 && lifted) {
            this._clearHold();
            const elapsed = performance.now() - lifted.startTime;
            const drift = Math.abs(lifted.x - lifted.startX)
                + Math.abs(lifted.y - lifted.startY);
            if (drift <= TAP_SLOP_PX && elapsed < TAP_MAX_MS && !this._touchErased) {
                const cell = this._cellAt(lifted.x, lifted.y);
                this.game.applyPrimary(cell.gx, cell.gy);
            }
        }

        if (remaining === 0) {
            this._touchMode = null;
            this._touchMoved = false;
            this._touchErased = false;
            this._touchBrushKey = null;
            this._clearHold();
        } else if (remaining === 1 && this._touchMode === 'pinch') {
            // Pinch collapsed to one finger: restart the single path from
            // the survivor's current position, with tap detection off since
            // the user is mid-gesture.
            const [tp] = this._touches.values();
            tp.startX = tp.x;
            tp.startY = tp.y;
            tp.startTime = performance.now();
            tp.lastX = tp.x;
            tp.lastY = tp.y;
            this._touchMode = 'single';
            this._touchMoved = true;
            this._touchErased = true;
        }
    }

    _clearHold() {
        if (this._holdTimer != null) {
            clearTimeout(this._holdTimer);
            this._holdTimer = null;
        }
    }

    /* ── Keyboard ─────────────────────────────────────────────── */

    _keyDown(e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target instanceof HTMLInputElement
            || e.target instanceof HTMLTextAreaElement) return;

        const k = e.key.toLowerCase();
        if (k >= '1' && k <= '5' && k.length === 1) {
            e.preventDefault();
            playUiClick();
            this.game.ui?.selectCategory?.(Number(k) - 1);
            return;
        }
        const actions = {
            'e': () => this.game.setTool(this.game.tool === 'erase' ? 'place' : 'erase'),
            'g': () => this.game.toggleGrid(),
            'n': () => this.game.toggleNight(),
            'h': () => this.game.toggleFlipH(),
            'v': () => this.game.toggleFlipV(),
            's': () => this.game.save(),
            'r': () => this.game.reset(),
            'escape': () => this.game.setTool('place'),
        };
        if (actions[k]) {
            e.preventDefault();
            playUiClick();
            actions[k]();
        }
    }
}
