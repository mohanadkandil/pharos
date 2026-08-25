/**
 * Grid ↔ screen math for the 2:1 isometric view.
 *
 * Cell (0,0) anchors at the top corner of its ground diamond; x walks
 * toward screen-right/down, y toward screen-left/down.
 */

import { CONFIG } from '../config.js';

const TW = CONFIG.tile.w;
const TH = CONFIG.tile.h;

/** Screen position of cell (gx,gy)'s back corner, in world pixels. */
export function cellToScreen(gx, gy) {
    return {
        x: (gx - gy) * (TW / 2),
        y: (gx + gy) * (TH / 2),
    };
}

/** Inverse mapping: world pixel point → fractional cell coordinates. */
export function screenToCell(px, py) {
    return {
        gx: (px / (TW / 2) + py / (TH / 2)) / 2,
        gy: (py / (TH / 2) - px / (TW / 2)) / 2,
    };
}

export function cellInBounds(gx, gy, w = CONFIG.grid.width, h = CONFIG.grid.height) {
    return gx >= 0 && gy >= 0 && gx < w && gy < h;
}
