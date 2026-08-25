/**
 * Tiny isometric voxel renderer.
 *
 * A "voxel" is a plain object { x, y, z, c } where x/y walk the ground
 * plane (4 voxels per grid-cell edge) and z climbs vertically. The
 * renderer projects voxels into a 2:1 isometric view, painter-sorts
 * them back-to-front, and draws each cube as three shaded faces
 * (top / right / left) onto an offscreen canvas.
 *
 * Composition helpers (box, shell, dome, cylinder, pyramidRoof…) let
 * asset definitions build shapes by combining primitive voxel groups.
 */

import { CONFIG } from '../config.js';

const VW = CONFIG.voxel.size;    // top-face diamond width in px
const VH = CONFIG.voxel.height;  // vertical rise per z step in px

/** Project a voxel position to screen space relative to world origin. */
export function voxelToScreen(vx, vy, vz) {
    return {
        sx: (vx - vy) * (VW / 2),
        sy: (vx + vy) * (VW / 4) - vz * VH,
    };
}

/** Lighten (amount > 0) or darken (amount < 0) a hex color. */
export function shadeHex(hex, amount) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    let r = (n >> 16) & 0xff;
    let g = (n >> 8) & 0xff;
    let b = n & 0xff;
    if (amount >= 0) {
        r = Math.round(r + (255 - r) * amount);
        g = Math.round(g + (255 - g) * amount);
        b = Math.round(b + (255 - b) * amount);
    } else {
        r = Math.round(r * (1 + amount));
        g = Math.round(g * (1 + amount));
        b = Math.round(b * (1 + amount));
    }
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Draw one cube: a top diamond plus right/left side faces. */
function drawCube(ctx, ax, ay, color, faces = {}) {
    const half = VW / 2;
    const quarter = VW / 4;
    const drop = VW / 2; // vertical extent of the top-face diamond

    ctx.fillStyle = faces.top ?? shadeHex(color, 0.18);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + half, ay + quarter);
    ctx.lineTo(ax, ay + drop);
    ctx.lineTo(ax - half, ay + quarter);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = faces.right ?? color;
    ctx.beginPath();
    ctx.moveTo(ax + half, ay + quarter);
    ctx.lineTo(ax + half, ay + quarter + VH);
    ctx.lineTo(ax, ay + drop + VH);
    ctx.lineTo(ax, ay + drop);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = faces.left ?? shadeHex(color, -0.18);
    ctx.beginPath();
    ctx.moveTo(ax - half, ay + quarter);
    ctx.lineTo(ax - half, ay + quarter + VH);
    ctx.lineTo(ax, ay + drop + VH);
    ctx.lineTo(ax, ay + drop);
    ctx.closePath();
    ctx.fill();
}

/**
 * Render a voxel list to an offscreen canvas.
 *
 * @param {Array} voxels  [{x, y, z, c, top?, right?, left?}]
 * @param {{w:number,d:number}} footprint  grid cells covered on x/y
 * @returns {{canvas, anchorX, anchorY, width, height, footprint}}
 *   anchor* is where world (0,0,0) lands inside the canvas.
 */
export function renderVoxels(voxels, footprint = { w: 1, d: 1 }) {
    if (!voxels.length) {
        const blank = document.createElement('canvas');
        blank.width = blank.height = 1;
        return { canvas: blank, anchorX: 0, anchorY: 0, width: 1, height: 1, footprint };
    }

    // Painter's order: deeper rows later within equal depth, higher z last.
    const ordered = [...voxels].sort((a, b) =>
        (a.x + a.y) - (b.x + b.y) || a.z - b.z);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of ordered) {
        const { sx, sy } = voxelToScreen(v.x, v.y, v.z);
        minX = Math.min(minX, sx - VW / 2);
        maxX = Math.max(maxX, sx + VW / 2);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy + VW / 2 + VH);
    }

    const pad = 2;
    const width = Math.ceil(maxX - minX) + pad * 2;
    const height = Math.ceil(maxY - minY) + pad * 2;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const anchorX = -minX + pad;
    const anchorY = -minY + pad;

    for (const v of ordered) {
        const { sx, sy } = voxelToScreen(v.x, v.y, v.z);
        drawCube(ctx, anchorX + sx, anchorY + sy, v.c, {
            top: v.top, right: v.right, left: v.left,
        });
    }

    return { canvas, anchorX, anchorY, width, height, footprint };
}

/* ── Composition helpers ──────────────────────────────────────────── */

/** Solid filled box of voxels. */
export function box(x, y, z, w, d, h, color) {
    const out = [];
    for (let ix = x; ix < x + w; ix++)
        for (let iy = y; iy < y + d; iy++)
            for (let iz = z; iz < z + h; iz++)
                out.push({ x: ix, y: iy, z: iz, c: color });
    return out;
}

/** Hollow box: walls only, no interior — cheap big volumes. */
export function shell(x, y, z, w, d, h, color, opts = {}) {
    const out = [];
    const skipTop = opts.skipTop === true;
    for (let ix = x; ix < x + w; ix++)
        for (let iy = y; iy < y + d; iy++)
            for (let iz = z; iz < z + h; iz++) {
                const edge =
                    ix === x || ix === x + w - 1 ||
                    iy === y || iy === y + d - 1;
                if (!edge) continue;
                if (skipTop && iz === z + h - 1 && ix > x && ix < x + w - 1 && iy > y && iy < y + d - 1) continue;
                out.push({ x: ix, y: iy, z: iz, c: color });
            }
    return out;
}

/** Pyramid roof with base w×d at height z, rising h layers to a peak. */
export function pyramidRoof(x, y, z, w, d, h, color) {
    const out = [];
    let level = 0;
    while (level < h && (w - level * 2 > 0) && (d - level * 2 > 0)) {
        out.push(...box(
            x + level, y + level, z + level,
            Math.max(1, w - level * 2), Math.max(1, d - level * 2), 1,
            shadeHex(color, -level * 0.04),
        ));
        level++;
    }
    return out;
}

/** Rounded dome approximated by shrinking disc layers. */
export function dome(cx, cy, z, radius, color) {
    const out = [];
    for (let dz = 0; dz <= radius; dz++) {
        const r = radius - dz;
        const rr = Math.round(r);
        for (let dx = -rr; dx <= rr; dx++)
            for (let dy = -rr; dy <= rr; dy++)
                if (dx * dx + dy * dy <= r * r)
                    out.push({
                        x: cx + dx, y: cy + dy, z: z + dz,
                        c: shadeHex(color, dz * 0.03 - (dx + dy) * 0.01),
                    });
    }
    return out;
}

/** Vertical cylinder approximated by stacked discs. */
export function cylinder(cx, cy, z, radius, h, color) {
    const out = [];
    for (let iz = 0; iz < h; iz++) {
        for (let dx = -radius; dx <= radius; dx++)
            for (let dy = -radius; dy <= radius; dy++)
                if (dx * dx + dy * dy <= radius * radius)
                    out.push({
                        x: cx + dx, y: cy + dy, z: z + iz,
                        c: iz === h - 1 ? shadeHex(color, 0.15) : color,
                    });
    }
    return out;
}

/** Merge several voxel arrays into one list. */
export function compose(...parts) {
    return parts.flat();
}

/**
 * Overwrite or add voxels matching a predicate — used to paint windows,
 * doors and accents onto an existing shape without rebuilding it.
 */
export function paintAt(voxels, predicate, color) {
    for (const v of voxels) {
        if (predicate(v)) {
            v.c = color;
        }
    }
    return voxels;
}
