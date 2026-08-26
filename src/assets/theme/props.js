/**
 * Prop builders — small street furniture and market clutter that dresses
 * the spaces between buildings: fences, lanterns, jars, statues, a camel
 * and a striped souq stall.
 *
 * Every builder is deterministic and returns voxels inside its footprint:
 * x in [0, 4w), y in [0, 4d), z >= 0. One cell is 4×4 voxels.
 */

import { CONFIG } from '../../config.js';
import { box, shell, compose, paintAt } from '../voxelRenderer.js';

const P = CONFIG.palette;

/** Low garden fence: two posts, two rails, a coiled rope on one post. */
export function palmFence() {
    return compose(
        // posts at the cell edges
        box(0, 1, 0, 1, 1, 3, P.wood),
        box(3, 1, 0, 1, 1, 3, P.wood),
        // rails nailed to the viewer side of the posts, full cell width
        box(0, 2, 1, 4, 1, 1, P.woodLight),
        box(0, 2, 2, 4, 1, 1, P.woodLight),
        // rope coil resting on the left post
        [{ x: 0, y: 1, z: 3, c: P.pathDark }],
    );
}

/** Miniature pylon gate: two limestone piers under a heavy lintel. */
export function templeArchway() {
    const arch = compose(
        // piers, one voxel wide and two deep, at opposite edges
        box(0, 1, 0, 1, 2, 6, P.limestone),
        box(3, 1, 0, 1, 2, 6, P.limestone),
        // lintel: dark cornice line below, pale slab above
        box(0, 1, 6, 4, 2, 1, P.limestoneDark),
        box(0, 1, 7, 4, 2, 1, P.limestone),
    );
    // gilded sun disc on the lintel's face
    return paintAt(arch, v => v.x === 2 && v.y === 2 && v.z === 7, P.gold);
}

/** Ramadan lantern glowing on a short iron post. */
export function fanoosLantern() {
    const lantern = compose(
        box(1, 1, 0, 2, 2, 1, P.iron),        // base
        box(1, 1, 1, 1, 1, 2, P.iron),        // post
        box(1, 1, 3, 2, 2, 3, P.glass),       // glass body
        [
            { x: 2, y: 2, z: 6, c: P.gold },       // onion-top crown
            { x: 2, y: 2, z: 7, c: P.ironLight },  // hanging loop
        ],
    );
    // flame glowing at the heart of the glass
    return paintAt(lantern, v => v.x === 2 && v.y === 2 && v.z === 4, P.flame);
}

/** Tripod fire bowl with a live flame. */
export function bronzeBrazier() {
    return compose(
        // three squat legs
        [
            { x: 0, y: 1, z: 0, c: P.iron },
            { x: 2, y: 1, z: 0, c: P.iron },
            { x: 1, y: 3, z: 0, c: P.iron },
        ],
        box(0, 1, 1, 3, 3, 1, P.goldDeep),     // bowl
        shell(0, 1, 2, 3, 3, 1, P.terraDark),  // rim ring
        // fire rising from the center
        [
            { x: 1, y: 2, z: 2, c: P.flame },
            { x: 1, y: 2, z: 3, c: P.flame },
            { x: 1, y: 2, z: 4, c: P.saffron },
        ],
    );
}

/** Pointed wine-and-oil jar with a painted band. */
export function amphora() {
    const jar = compose(
        [{ x: 1, y: 1, z: 0, c: P.terraDark }],   // narrow foot
        box(1, 1, 1, 2, 2, 2, P.terracotta),      // belly
        [
            { x: 2, y: 2, z: 3, c: P.terracotta },  // tapering neck
            { x: 2, y: 2, z: 4, c: P.terraLight },  // lip
        ],
    );
    // teal painted band on the belly
    return paintAt(jar, v => v.x === 2 && v.y === 2 && v.z === 2, P.clothTeal);
}

/** Round household water jar, open at the top. */
export function zirJar() {
    const jar = compose(
        box(0, 1, 0, 3, 3, 2, P.terracotta),   // belly
        // rim ring around the 2×2 opening
        [
            { x: 0, y: 1, z: 2, c: P.terraDark },
            { x: 1, y: 1, z: 2, c: P.terraDark },
            { x: 2, y: 1, z: 2, c: P.terraDark },
            { x: 0, y: 2, z: 2, c: P.terraDark },
            { x: 0, y: 3, z: 2, c: P.terraDark },
        ],
    );
    // cool water sitting a layer below the rim
    paintAt(jar, v => v.z === 1 && v.x >= 1 && v.y >= 2, P.nile);
    // sun highlights on the fired clay
    paintAt(jar, v => (v.x === 1 && v.y === 3 && v.z === 0) ||
                      (v.x === 0 && v.y === 3 && v.z === 1), P.terraLight);
    return jar;
}

/** Open crate heaped with market spices. */
export function spiceCrate() {
    const crate = compose(
        shell(0, 1, 0, 3, 3, 2, P.wood),       // slatted walls
        box(1, 2, 0, 1, 1, 2, P.saffron),      // spice filling the middle
        // heaped mounds spilling over the rim
        [
            { x: 1, y: 2, z: 2, c: P.saffron },
            { x: 2, y: 2, z: 2, c: P.hibiscus },
            { x: 1, y: 3, z: 2, c: P.clothTeal },
        ],
    );
    // dark corner posts
    return paintAt(crate,
        v => (v.x === 0 || v.x === 2) && (v.y === 1 || v.y === 3) && v.z < 2,
        P.woodDark);
}

/** Seated Bastet statue in dark stone with a gold collar. */
export function bastetCat() {
    const cat = compose(
        box(1, 1, 0, 2, 2, 2, P.iron),         // haunches
        box(1, 2, 2, 2, 1, 2, P.ironLight),    // upright chest
        box(1, 2, 4, 2, 1, 1, P.ironLight),    // head
        [
            { x: 1, y: 2, z: 5, c: P.iron },     // ears
            { x: 2, y: 2, z: 5, c: P.iron },
            { x: 0, y: 2, z: 4, c: P.gold },     // earring
        ],
    );
    // collar band where the chest meets the head
    return paintAt(cat, v => v.z === 3 && v.y === 2, P.gold);
}

/** Round-topped limestone slab carved with painted glyphs. */
export function hieroglyphStele() {
    const slab = compose(
        box(0, 2, 0, 3, 1, 4, P.limestone),
        [{ x: 1, y: 2, z: 4, c: P.limestone }],  // rounded crown
    );
    // carved glyph column on the face
    const glyphs = [
        { x: 1, z: 3, c: P.gold },
        { x: 1, z: 2, c: P.turquoise },
        { x: 1, z: 1, c: P.gold },
        { x: 0, z: 3, c: P.turquoise },
        { x: 2, z: 3, c: P.turquoise },
    ];
    for (const g of glyphs) {
        paintAt(slab, v => v.x === g.x && v.y === 2 && v.z === g.z, g.c);
    }
    return slab;
}

/** Standing camel with a red saddle blanket. */
export function camel() {
    return compose(
        // four legs at the body corners
        box(0, 1, 0, 1, 1, 2, P.pathDark),
        box(0, 2, 0, 1, 1, 2, P.pathDark),
        box(2, 1, 0, 1, 1, 2, P.pathDark),
        box(2, 2, 0, 1, 1, 2, P.pathDark),
        box(0, 1, 2, 3, 2, 2, P.pathDark),     // body
        box(1, 1, 4, 1, 2, 1, P.sandDark),     // hump
        // saddle blanket between hump and neck
        [
            { x: 2, y: 1, z: 4, c: P.clothRed },
            { x: 2, y: 2, z: 4, c: P.clothRed },
        ],
        // neck stepping up to the head
        [
            { x: 3, y: 1, z: 4, c: P.pathDark },
            { x: 3, y: 1, z: 5, c: P.pathDark },
            { x: 3, y: 1, z: 6, c: P.sandDark },   // head
            { x: 3, y: 2, z: 6, c: P.woodDark },   // muzzle
        ],
    );
}

/** Two-cell market stall under a striped, sloping canopy. */
export function souqAwning() {
    const out = [];
    // posts at the outer front corners
    out.push(...box(0, 3, 0, 1, 1, 4, P.wood));
    out.push(...box(7, 3, 0, 1, 1, 4, P.wood));
    // counter spanning the stall
    out.push(...box(0, 1, 0, 8, 2, 2, P.woodLight));
    // wares on the counter: a pot and a spice mound
    out.push({ x: 2, y: 2, z: 2, c: P.terracotta });
    out.push({ x: 2, y: 2, z: 3, c: P.terraLight });
    out.push({ x: 5, y: 2, z: 2, c: P.saffron });
    out.push({ x: 6, y: 2, z: 2, c: P.saffron });
    // striped canopy stepping down one layer toward the front
    const rows = [
        { y: 1, z: 6 },
        { y: 2, z: 5 },
        { y: 3, z: 4 },
    ];
    for (const row of rows) {
        for (let x = 0; x < 8; x++) {
            out.push({ x, y: row.y, z: row.z, c: x % 2 === 0 ? P.clothRed : P.clothStripe });
        }
    }
    return out;
}
