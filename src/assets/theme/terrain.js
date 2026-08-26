/**
 * Terrain tile builders — one per ground asset.
 *
 * Every tile is a 4×4 voxel patch (one grid cell). Colors come straight
 * from the palette; accent patterns are deterministic so tiles render
 * identically every session.
 */

import { CONFIG } from '../../config.js';
import { box, compose, shadeHex } from '../voxelRenderer.js';

const P = CONFIG.palette;
const VPT = CONFIG.voxel.perTile; // 4

/** One-voxel-thick floor covering the whole cell. */
function floor(color) {
    return box(0, 0, 0, VPT, VPT, 1, color);
}

/** Deterministic speckle paint: swaps a few floor voxels' colors. */
function speckle(voxels, spots, color) {
    for (const { x, y } of spots) {
        const v = voxels.find(o => o.x === x && o.y === y && o.z === 0);
        if (v) v.c = color;
    }
}

/** Nile silt: rich riverbank soil with darker wet patches. */
export function fertileSilt() {
    const t = floor(P.silt);
    speckle(t, [
        { x: 1, y: 2 }, { x: 2, y: 1 }, { x: 3, y: 3 },
    ], P.siltDark);
    speckle(t, [
        { x: 0, y: 1 }, { x: 2, y: 3 },
    ], P.siltLight);
    return t;
}

/** Dune sand with wind ripples running across. */
export function duneSand() {
    const t = floor(P.sand);
    for (let x = 0; x < VPT; x++) {
        const v = t.find(o => o.x === x && o.y === 1 && o.z === 0);
        if (v) v.c = P.sandDark;
        const v2 = t.find(o => o.x === x && o.y === 3 && o.z === 0);
        if (v2) v2.c = P.sandLight;
    }
    return t;
}

/** Sandstone paving slab with a lit back edge and worn corners. */
export function sandstonePath() {
    const t = floor(P.path);
    speckle(t, [
        { x: 0, y: 0 }, { x: 3, y: 0 },
    ], P.pathLight);
    speckle(t, [
        { x: 1, y: 2 }, { x: 2, y: 2 },
    ], P.pathDark);
    return t;
}

/** Polished marble with a lapis inlay at opposite corners. */
export function marbleFloor() {
    const t = floor(P.marble);
    speckle(t, [
        { x: 0, y: 0 }, { x: 1, y: 0 },
    ], P.marbleLight);
    speckle(t, [
        { x: 3, y: 3 }, { x: 3, y: 2 },
    ], P.lapis);
    return t;
}

/** Nile water: deep teal with glints near the back edge. */
export function nileWater() {
    const t = floor(P.nileDeep);
    speckle(t, [
        { x: 1, y: 0 }, { x: 2, y: 0 },
    ], P.nileShine);
    speckle(t, [
        { x: 0, y: 2 }, { x: 3, y: 1 }, { x: 2, y: 3 },
    ], P.nile);
    return t;
}

/**
 * Quay wall: dressed-stone block whose raised lip holds land above the
 * water line when placed between ground and Nile tiles.
 */
export function quayWall() {
    const base = box(0, 0, 0, VPT, VPT, 2, P.limestoneDark);
    // Lit cap stones
    for (let x = 0; x < VPT; x++)
        for (let y = 0; y < VPT; y++) {
            const v = base.find(o => o.x === x && o.y === y && o.z === 1);
            if (v) v.c = P.limestone;
        }
    // Masonry joints on the visible front faces
    for (const v of base) {
        if (v.z === 0 && (v.y === 3 || v.x === 3) && (v.x + v.y) % 2 === 0) {
            v.c = shadeHex(P.limestoneDark, -0.12);
        }
    }
    // Flat walking surface on top
    const cap = [];
    for (let x = 0; x < VPT; x++)
        for (let y = 0; y < VPT; y++)
            cap.push({ x, y, z: 2, c: P.limestoneLight });
    return compose(base, cap);
}

/** Steps ascending toward the back of the cell. */
export function stairs() {
    const steps = [];
    for (let step = 0; step < VPT; step++) {
        const y = VPT - 1 - step;          // front row lowest
        steps.push(...box(0, y, 0, VPT, 1, step + 1, P.path));
        // Tread highlight on each step's top front edge
        const tread = steps.find(o =>
            o.x === 1 && o.y === y && o.z === step);
        if (tread) tread.c = P.pathLight;
    }
    return compose(steps);
}
