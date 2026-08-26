/**
 * Nature builders — palms, reeds, blossoms and desert scrub.
 *
 * Every builder returns a deterministic voxel list sized to its
 * footprint (4 voxels per cell edge). Coordinates always stay inside
 * [0, 4*w) × [0, 4*d); frond runs and tuft rings clip at the plot edge
 * so silhouettes lean naturally without spilling out of the cell.
 */

import { CONFIG } from '../../config.js';
import { box, compose } from '../voxelRenderer.js';

const P = CONFIG.palette;

// Eight compass directions used for radiating fronds and tuft rings.
const DIRS8 = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Ringed palm trunk color: light/dark bands read as fiber rings. */
function trunkColor(z) {
    const m = z % 3;
    return m === 0 ? P.wood : m === 1 ? P.woodLight : P.woodDark;
}

/**
 * One palm: curved single-voxel trunk (steps sideways at mid-height),
 * a crown of drooping fronds clipped to the plot, and gold dates
 * hanging just under the crown.
 */
function palmTree(baseX, baseY, height, leanX, maxX, maxY) {
    const out = [];

    // Trunk, bending leanX at mid-height.
    let tx = baseX;
    const ty = baseY;
    const bend = Math.floor(height / 2);
    for (let z = 0; z < height; z++) {
        if (z === bend) tx += leanX;
        out.push({ x: tx, y: ty, z, c: trunkColor(z) });
    }

    // Crown core.
    out.push({ x: tx, y: ty, z: height, c: P.frondDark });

    // Eight radiating fronds: level near the core, drooping one layer
    // per step further out. Tips get the lightest green.
    for (const [dx, dy] of DIRS8) {
        const run = [];
        for (let s = 1; s <= 3; s++) {
            const x = tx + dx * s;
            const y = ty + dy * s;
            if (x < 0 || x >= maxX || y < 0 || y >= maxY) break;
            run.push({ x, y, z: height - Math.max(0, s - 1), c: P.frond });
        }
        if (run.length) {
            run[run.length - 1].c = P.frondLight;
            out.push(...run);
        }
    }

    // Date cluster tucked under the crown, on the lean side.
    const gx = Math.min(maxX - 1, Math.max(0, tx + (leanX >= 0 ? 1 : -1)));
    const gy = Math.min(maxY - 1, ty + 1);
    out.push({ x: gx, y: ty, z: height - 1, c: P.gold });
    out.push({ x: tx, y: gy, z: height - 1, c: P.gold });
    out.push({ x: gx, y: ty, z: height - 2, c: P.goldDeep });

    return out;
}

/** Single date palm, 1×1 cell, curving gently to the right. */
export function datePalm() {
    return palmTree(1, 2, 9, 1, 4, 4);
}

/** Two palms of different heights leaning apart across a 2×1 plot. */
export function twinPalms() {
    return compose(
        palmTree(2, 2, 8, -1, 8, 4),
        palmTree(5, 1, 11, 1, 8, 4),
    );
}

/** Papyrus reeds: thin stems from a silt patch, umbrella tufts on top. */
export function papyrusClump() {
    const out = box(0, 0, 0, 4, 4, 1, P.silt);
    // Wet-soil speckles on the base.
    for (const v of out) {
        if ((v.x * 3 + v.y * 5) % 7 === 0) v.c = P.siltDark;
    }

    const stems = [
        { x: 1, y: 1, h: 5 },
        { x: 3, y: 2, h: 4 },
        { x: 0, y: 3, h: 4 },
        { x: 2, y: 0, h: 5 },
        { x: 2, y: 2, h: 6 },
        { x: 1, y: 3, h: 4 },
    ];
    for (const { x, y, h } of stems) {
        for (let s = 0; s < h; s++) {
            out.push({ x, y, z: 1 + s, c: s === 2 ? P.papyrusDark : P.papyrus });
        }
        // Umbrella tuft: dark center ringed by light spray, clipped.
        const top = 1 + h;
        out.push({ x, y, z: top, c: P.papyrusDark });
        for (const [dx, dy] of DIRS8.slice(0, 4)) {
            const rx = x + dx;
            const ry = y + dy;
            if (rx < 0 || rx >= 4 || ry < 0 || ry >= 4) continue;
            out.push({ x: rx, y: ry, z: top, c: P.papyrusLight });
        }
    }
    return out;
}

/** Floating lotus: a loose ring of pads with three blossoms. */
export function lotusPatch() {
    const out = [];
    const pads = [
        { x: 0, y: 1 }, { x: 1, y: 0 }, { x: 2, y: 0 },
        { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 2, y: 3 },
        { x: 0, y: 2 }, { x: 1, y: 2 },
    ];
    for (let i = 0; i < pads.length; i++) {
        out.push({ x: pads[i].x, y: pads[i].y, z: 0, c: i % 3 === 0 ? P.leafDark : P.leaf });
    }
    // Blossoms: dark calyx below, colored bloom above.
    const blooms = [
        { x: 1, y: 1, c: P.lotusPink },
        { x: 2, y: 2, c: P.lotusBlue },
        { x: 0, y: 3, c: P.lotusPink },
    ];
    for (const b of blooms) {
        out.push({ x: b.x, y: b.y, z: 0, c: P.leafDark });
        out.push({ x: b.x, y: b.y, z: 1, c: b.c });
    }
    return out;
}

/** Acacia: short trunk under a wide flat-topped umbrella canopy. */
export function acaciaTree() {
    const out = [];
    // Trunk.
    for (let z = 0; z < 4; z++) {
        out.push({ x: 2, y: 1, z, c: z % 2 === 0 ? P.woodDark : P.wood });
    }
    // Base canopy disc: nearly the full cell, corners nipped.
    for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
            if ((x === 0 && y === 0) || (x === 3 && y === 3)) continue;
            const c = (x * 5 + y * 3) % 5 === 0 ? P.acaciaDark : P.acacia;
            out.push({ x, y, z: 4, c });
        }
    }
    // Sun-lit top layer, offset toward the back for asymmetry.
    for (let x = 0; x < 3; x++) {
        for (let y = 1; y < 4; y++) {
            out.push({ x, y, z: 5, c: P.acaciaLight });
        }
    }
    return out;
}

/** Dry desert broom: a low, scraggly tuft of sand-toned twigs. */
export function desertBroom() {
    const out = [];
    const twigs = [
        { x: 1, y: 1, h: 2 },
        { x: 2, y: 2, h: 3 },
        { x: 0, y: 2, h: 1 },
        { x: 3, y: 1, h: 2 },
        { x: 2, y: 0, h: 1 },
        { x: 1, y: 3, h: 1 },
    ];
    for (const { x, y, h } of twigs) {
        for (let z = 0; z < h; z++) {
            out.push({ x, y, z, c: z === 0 ? P.sandDark : P.sand });
        }
    }
    // Two bleached tips on the tallest twigs.
    out.push({ x: 2, y: 2, z: 3, c: P.pathLight });
    out.push({ x: 1, y: 1, z: 2, c: P.pathLight });
    return out;
}

/** Hibiscus: a rounded leaf mound studded with red blossoms. */
export function hibiscusBush() {
    const out = [];
    const leafAt = (x, y, z) =>
        ({ x, y, z, c: (x * 3 + y * 5 + z * 7) % 3 === 0 ? P.leafDark : P.leaf });

    // Ground layer: full cell minus corners for a rounded base.
    for (let x = 0; x < 4; x++) {
        for (let y = 0; y < 4; y++) {
            if ((x === 0 || x === 3) && (y === 0 || y === 3)) continue;
            out.push(leafAt(x, y, 0));
        }
    }
    // Middle layer: 3×3 shifted for a natural tilt.
    for (let x = 0; x < 3; x++) {
        for (let y = 1; y < 4; y++) {
            out.push(leafAt(x, y, 1));
        }
    }
    // Crown.
    out.push(leafAt(1, 1, 2));
    out.push(leafAt(1, 2, 2));
    out.push(leafAt(2, 2, 2));

    // Red blossoms swapped onto exposed surface voxels.
    const blossoms = [
        { x: 3, y: 2, z: 0 }, { x: 1, y: 0, z: 0 },
        { x: 0, y: 2, z: 1 }, { x: 2, y: 3, z: 1 },
        { x: 1, y: 2, z: 2 },
    ];
    for (const b of blossoms) {
        const v = out.find(o => o.x === b.x && o.y === b.y && o.z === b.z);
        if (v) v.c = P.hibiscus;
    }
    return out;
}
