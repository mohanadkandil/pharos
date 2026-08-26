/**
 * Building voxel builders — the architecture of sun-baked Alexandria.
 *
 * Every builder returns a deterministic voxel list. One grid cell is
 * 4×4 voxels on the ground plane; z = 0 rests on the terrain.
 */

import { CONFIG } from '../../config.js';
import {
    box, shell, dome, cylinder, pyramidRoof, paintAt, shadeHex,
} from '../voxelRenderer.js';

const P = CONFIG.palette;

/** Last-wins de-duplication: later voxels override earlier ones. */
function merge(...parts) {
    const byCell = new Map();
    for (const v of parts.flat()) {
        byCell.set(v.x + ',' + v.y + ',' + v.z, v);
    }
    return [...byCell.values()];
}

/** Recolor exact voxel positions — doors, windows, glyphs, trim. */
function stamp(voxels, coords, color) {
    const keys = new Set(coords.map(([x, y, z]) => x + ',' + y + ',' + z));
    paintAt(voxels, v => keys.has(v.x + ',' + v.y + ',' + v.z), color);
}

/* ── Houses ───────────────────────────────────────────────────────── */

export function mudbrickHouse() {
    // 2×2 cells = 8×8 voxels. Flat-roofed Nubian house; the body takes
    // x 0..6 and an external mud staircase climbs the x = 7 strip.
    const out = [];
    out.push(...box(0, 0, 0, 7, 8, 1, P.mudbrickDark));      // floor
    out.push(...shell(0, 0, 0, 7, 8, 6, P.mudbrick));        // walls z0..5
    out.push(...box(1, 1, 5, 5, 6, 1, P.mudbrickDark));      // roof deck
    out.push(...shell(0, 0, 6, 7, 8, 1, P.mudbrickLight));   // parapet

    // Front face (y = 7): door, striped awning, lapis windows.
    stamp(out, [[3, 7, 0], [3, 7, 1]], P.woodDark);
    stamp(out, [[2, 7, 2], [3, 7, 2], [4, 7, 2]], P.clothStripe);
    stamp(out, [[1, 7, 3], [5, 7, 3]], P.lapis);

    // External staircase rising toward the back along the x = 7 side.
    for (let i = 0; i < 6; i++) {
        out.push(...box(7, 6 - i, 0, 1, 1, i + 1, P.mudbrickDark));
    }

    // Rooftop clutter: two amphorae drying in the sun.
    out.push({ x: 2, y: 3, z: 6, c: P.terracotta });
    out.push({ x: 3, y: 4, z: 6, c: P.terraLight });
    return merge(out);
}

export function alexandriaHouse() {
    // 3×3 cells = 12×12 voxels. Three-story townhouse: full ground
    // floor, inset upper block, projecting mashrabiya balcony.
    const out = [];
    out.push(...box(0, 0, 0, 12, 12, 1, P.whiteShadow));     // floor
    out.push(...shell(0, 0, 0, 12, 12, 4, P.white));         // ground story
    out.push(...box(0, 0, 4, 12, 12, 1, P.whiteShadow));     // story slab
    out.push(...shell(1, 1, 5, 10, 10, 6, P.white));         // stories 2–3
    out.push(...box(1, 1, 11, 10, 10, 1, P.whiteShadow));    // roof slab

    // Quoins: alternating shadow blocks on every corner column.
    paintAt(out, v =>
        v.z % 2 === 0 && (
            ((v.x === 0 || v.x === 11) && (v.y === 0 || v.y === 11)) ||
            ((v.x === 1 || v.x === 10) && (v.y === 1 || v.y === 10))
        ), P.whiteShadow);

    // Gold cornice ringing the top of the upper walls.
    paintAt(out, v =>
        v.z === 10 && (v.x === 1 || v.x === 10 || v.y === 1 || v.y === 10),
        P.gold);

    // Ground story front (y = 11): door + tall windows.
    stamp(out, [
        [5, 11, 0], [6, 11, 0], [5, 11, 1], [6, 11, 1], [5, 11, 2], [6, 11, 2],
    ], P.woodDark);
    stamp(out, [[2, 11, 1], [2, 11, 2], [9, 11, 1], [9, 11, 2]], P.lapis);

    // Upper front (y = 10): story-2 flanking windows, story-3 row.
    stamp(out, [[3, 10, 6], [3, 10, 7], [8, 10, 6], [8, 10, 7]], P.lapis);
    stamp(out, [[3, 10, 9], [5, 10, 9], [6, 10, 9], [8, 10, 9]], P.lapis);

    // Side windows.
    stamp(out, [[0, 3, 2], [0, 8, 2], [1, 4, 7], [1, 7, 7]], P.lapis);

    // Mashrabiya balcony projecting past the inset wall at y = 11.
    stamp(out, [[4, 11, 4], [7, 11, 4]], P.woodDark);        // brackets
    out.push(...box(4, 11, 5, 4, 1, 1, P.woodLight));        // balcony floor
    for (let x = 4; x <= 7; x++) {
        for (let z = 6; z <= 8; z++) {
            out.push({ x, y: 11, z, c: (x + z) % 2 ? P.woodDark : P.woodLight });
        }
    }
    out.push(...box(4, 11, 9, 4, 1, 1, P.woodDark));         // balcony cap

    // Roof life: stair bulkhead + laundry line.
    out.push(...box(2, 2, 12, 3, 3, 2, P.whiteDeep));
    out.push(...box(6, 7, 12, 1, 1, 2, P.wood));
    out.push(...box(9, 7, 12, 1, 1, 2, P.wood));
    out.push({ x: 7, y: 7, z: 13, c: P.clothTeal });
    out.push({ x: 8, y: 7, z: 13, c: P.clothTeal });
    return merge(out);
}

/* ── Sacred architecture ──────────────────────────────────────────── */

export function mosque() {
    // 3×3 cells. White prayer hall under a grand turquoise dome, with
    // two small domed turrets flanking the arched entrance.
    const out = [];
    out.push(...box(0, 0, 0, 12, 12, 1, P.whiteShadow));     // floor
    out.push(...shell(0, 0, 0, 12, 12, 8, P.white));         // hall walls
    out.push(...box(1, 1, 7, 10, 10, 1, P.whiteShadow));     // hall roof

    // Drum, dome, and gold crescent finial.
    out.push(...cylinder(6, 6, 8, 4, 2, P.whiteDeep));
    out.push(...dome(6, 6, 10, 4, P.turquoise));
    out.push({ x: 6, y: 6, z: 15, c: P.gold });
    out.push({ x: 6, y: 6, z: 16, c: P.goldLight });

    // Corner turrets at the front, capped with little domes.
    out.push(...cylinder(1, 10, 0, 1, 9, P.white));
    out.push(...dome(1, 10, 9, 1, P.turquoiseLight));
    out.push(...cylinder(10, 10, 0, 1, 9, P.white));
    out.push(...dome(10, 10, 9, 1, P.turquoiseLight));

    // Marble entry steps, then the arched lapis doorway over them.
    stamp(out, [[4, 11, 0], [5, 11, 0], [6, 11, 0], [7, 11, 0], [8, 11, 0]], P.marble);
    stamp(out, [
        [5, 11, 0], [6, 11, 0], [7, 11, 0],
        [5, 11, 1], [6, 11, 1], [7, 11, 1],
        [6, 11, 2],
    ], P.lapis);

    // Arched windows front and sides.
    stamp(out, [[2, 11, 3], [2, 11, 4], [9, 11, 3], [9, 11, 4]], P.lapis);
    stamp(out, [[0, 4, 4], [0, 7, 4], [11, 4, 4], [11, 7, 4]], P.lapis);
    return merge(out);
}

export function minaret() {
    // 2×2 cells. Slender ringed tower with a muezzin balcony, a
    // narrower upper shaft, and a turquoise dome under a gold crescent.
    const out = [];
    out.push(...cylinder(3, 3, 0, 2, 10, P.limestone));      // shaft z0..9
    paintAt(out, v => v.z === 3 || v.z === 7, P.limestoneDark); // rings
    stamp(out, [[3, 5, 0], [3, 5, 1]], P.woodDark);          // door

    out.push(...cylinder(3, 3, 10, 3, 1, P.limestoneLight)); // balcony disc
    out.push({ x: 0, y: 3, z: 11, c: P.limestoneDark });     // railing posts
    out.push({ x: 6, y: 3, z: 11, c: P.limestoneDark });
    out.push({ x: 3, y: 0, z: 11, c: P.limestoneDark });
    out.push({ x: 3, y: 6, z: 11, c: P.limestoneDark });

    out.push(...cylinder(3, 3, 11, 1, 4, P.limestone));      // upper shaft
    out.push(...dome(3, 3, 15, 1, P.turquoise));
    out.push({ x: 3, y: 3, z: 17, c: P.gold });              // crescent
    return merge(out);
}

/* ── Monuments ────────────────────────────────────────────────────── */

export function pharosLighthouse() {
    // 3×3 cells. The signature piece: square base, chamfered octagonal
    // middle tier, cylindrical top, open flame chamber, gold statue.
    const out = [];

    // Tier 1: square base with dark corner blocks and lapis entrance.
    out.push(...shell(0, 0, 0, 12, 12, 6, P.limestone));
    out.push(...box(1, 1, 5, 10, 10, 1, P.limestoneDark));
    paintAt(out, v =>
        v.z % 2 === 0 && (v.x === 0 || v.x === 11) && (v.y === 0 || v.y === 11),
        P.limestoneDark);
    stamp(out, [[4, 11, 3], [5, 11, 3], [6, 11, 3], [7, 11, 3]], P.gold);
    stamp(out, [
        [5, 11, 0], [6, 11, 0], [5, 11, 1], [6, 11, 1], [5, 11, 2], [6, 11, 2],
    ], P.lapis);

    // Tier 2: octagon — a 10×10 block with three-cell chamfered corners.
    for (let z = 6; z <= 10; z++) {
        for (let x = 1; x <= 10; x++) {
            for (let y = 1; y <= 10; y++) {
                const ex = Math.min(x - 1, 10 - x);
                const ey = Math.min(y - 1, 10 - y);
                if (ex + ey < 2) continue;
                out.push({ x, y, z, c: z === 10 ? P.limestoneLight : P.limestone });
            }
        }
    }

    // Tier 3: cylinder.
    out.push(...cylinder(6, 6, 11, 3, 4, P.limestoneLight));

    // Flame chamber: gold columns, burning brazier, cap slab, statue.
    out.push(...box(4, 4, 15, 1, 1, 2, P.gold));
    out.push(...box(8, 4, 15, 1, 1, 2, P.gold));
    out.push(...box(4, 8, 15, 1, 1, 2, P.gold));
    out.push(...box(8, 8, 15, 1, 1, 2, P.gold));
    out.push({ x: 6, y: 6, z: 15, c: P.saffron });
    out.push({ x: 6, y: 6, z: 16, c: P.flame });
    out.push(...box(4, 4, 17, 5, 5, 1, P.limestoneDark));
    out.push({ x: 6, y: 6, z: 18, c: P.gold });
    return merge(out);
}

export function smallPyramid() {
    // 3×3 cells. Smooth-cased limestone pyramid with a gold capstone.
    const out = pyramidRoof(0, 0, 0, 12, 12, 6, P.limestone);
    out.push(...box(5, 5, 6, 2, 2, 1, P.gold));
    stamp(out, [[5, 11, 0], [6, 11, 0]], P.granite);         // doorway
    return merge(out);
}

export function greatPyramid() {
    // 4×4 cells = 16×16 voxels. Stepped courses, taller at the base,
    // with deterministic sand weathering on the sunlit faces.
    const out = [];
    const courses = [
        [0, 0, 2], [1, 2, 2],                                // double-height
        [2, 4, 1], [3, 5, 1], [4, 6, 1], [5, 7, 1], [6, 8, 1], [7, 9, 1],
    ];
    for (const [i, z, h] of courses) {
        out.push(...box(i, i, z, 16 - i * 2, 16 - i * 2, h,
            shadeHex(P.limestone, -i * 0.03)));
    }
    out.push(...box(7, 7, 10, 2, 2, 1, P.gold));             // capstone

    // Weathering pecks on the front (max-y) and right (max-x) faces.
    stamp(out, [
        [3, 15, 0], [9, 15, 1], [6, 14, 2], [12, 14, 3],
        [5, 13, 4], [10, 12, 5], [7, 11, 6],
        [15, 3, 1], [15, 10, 0], [14, 7, 3], [13, 5, 4], [11, 8, 6],
    ], P.sandDark);
    return merge(out);
}

export function templeGate() {
    // 3×2 cells = 12×8 voxels. Battered granite pylons flanking a
    // marble-floored passage lined with limestone columns.
    const out = [];
    out.push(...box(4, 0, 0, 4, 8, 1, P.marble));            // threshold

    // Pylons: 4 wide at the base, stepping in to 3 above.
    out.push(...box(0, 0, 0, 4, 8, 3, P.granite));
    out.push(...box(1, 0, 3, 3, 8, 4, P.granite));
    out.push(...box(1, 0, 7, 3, 8, 1, P.graniteDark));
    out.push(...box(8, 0, 0, 4, 8, 3, P.granite));
    out.push(...box(8, 0, 3, 3, 8, 4, P.granite));
    out.push(...box(8, 0, 7, 3, 8, 1, P.graniteDark));

    // Lintel slab bridging the passage.
    out.push(...box(1, 0, 8, 10, 8, 1, P.graniteLight));

    // Two rows of two engaged columns, clipped to the passage width.
    for (const [cx, cy] of [[4, 1], [7, 1], [4, 6], [7, 6]]) {
        for (const v of cylinder(cx, cy, 1, 1, 6, P.limestone)) {
            if (v.x >= 4 && v.x <= 7) out.push(v);
        }
        out.push({ x: cx, y: cy, z: 7, c: P.limestoneLight }); // capital
    }

    // Painted glyph bands on the pylon fronts (y = 7).
    stamp(out, [[1, 7, 4], [2, 7, 2], [9, 7, 4], [10, 7, 2]], P.gold);
    stamp(out, [[2, 7, 5], [1, 7, 1], [9, 7, 5], [10, 7, 1]], P.turquoise);
    return merge(out);
}

export function obelisk() {
    // 1×1 cell. Granite monolith: pedestal, stepped tapering shaft,
    // gold pyramidion, sun-catching edge highlights, carved glyphs.
    const out = [];
    out.push(...box(0, 0, 0, 3, 3, 2, P.granite));           // pedestal
    out.push(...box(0, 0, 2, 3, 3, 3, P.granite));           // shaft 3×3
    out.push(...box(0, 0, 5, 2, 2, 3, P.granite));           // shaft 2×2
    out.push(...box(1, 1, 8, 1, 1, 3, P.granite));           // shaft 1×1
    out.push({ x: 1, y: 1, z: 11, c: P.goldLight });         // pyramidion

    stamp(out, [
        [2, 2, 2], [2, 2, 3], [2, 2, 4], [1, 1, 5], [1, 1, 6], [1, 1, 7],
    ], P.graniteLight);
    stamp(out, [[1, 2, 2], [1, 2, 4], [0, 1, 6]], P.gold);   // glyph column
    return merge(out);
}

/* ── Watercraft ───────────────────────────────────────────────────── */

export function feluccaBoat() {
    // 2×1 cells = 8×4 voxels. Nile sailboat: curved wooden hull with
    // raised bow and stern, slanted lateen sail, red pennant. The keel
    // stays at z = 0 so the renderer floats it on water tiles.
    const out = [];
    out.push(...box(1, 1, 0, 6, 2, 1, P.woodDark));          // keel
    out.push(...shell(0, 0, 1, 8, 4, 1, P.wood));            // gunwale ring
    out.push(...box(1, 1, 1, 6, 2, 1, P.woodLight));         // deck

    // Raised bow (x = 0) and stern (x = 7) tips, plus the tiller.
    out.push({ x: 0, y: 1, z: 2, c: P.wood });
    out.push({ x: 0, y: 2, z: 2, c: P.wood });
    out.push({ x: 7, y: 1, z: 2, c: P.wood });
    out.push({ x: 7, y: 2, z: 2, c: P.woodDark });           // tiller

    // Mast, slanted yard, and the stepped triangular lateen sail.
    out.push(...box(5, 2, 2, 1, 1, 6, P.wood));              // mast z2..7
    out.push({ x: 1, y: 2, z: 3, c: P.woodLight });          // yard
    out.push({ x: 2, y: 2, z: 4, c: P.woodLight });
    out.push({ x: 3, y: 2, z: 5, c: P.woodLight });
    out.push({ x: 4, y: 2, z: 6, c: P.woodLight });
    for (const [x, zTop] of [[1, 2], [2, 3], [3, 4], [4, 5]]) {
        for (let z = 2; z <= zTop; z++) {
            out.push({ x, y: 2, z, c: (x + z) % 2 ? P.whiteShadow : P.white });
        }
    }
    out.push({ x: 5, y: 2, z: 8, c: P.clothRed });           // pennant
    return merge(out);
}
