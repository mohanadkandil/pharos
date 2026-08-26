/**
 * The asset catalog — single source of truth for everything placeable.
 *
 * Each entry binds an id/name/category/kind/footprint to a procedural
 * builder. All art is generated at load time from voxel definitions;
 * there are no image files anywhere in the pipeline.
 *
 *   kind:      'terrain' replaces the ground tile; 'object' sits on top.
 *   sizeScale: visual occupation of one cell's width (decoupled from
 *              footprint so small props stay small on big cells).
 */

import * as Terrain from './theme/terrain.js';
import * as Nature from './theme/nature.js';
import * as Props from './theme/props.js';
import * as Buildings from './theme/buildings.js';

const T = (id, name) => ({
    id, name, category: 'terrain', kind: 'terrain',
    footprint: { w: 1, d: 1 }, sizeScale: 1,
});
const O = (category, defaultScale = 1) =>
    (id, name, foot = { w: 1, d: 1 }, sizeScale = defaultScale) => ({
        id, name, category, kind: 'object', footprint: foot, sizeScale,
    });
const N = O('nature', 0.85);
const PR = O('props', 0.5);
const W = O('water', 0.85);
const B = O('buildings', 1);

export const ASSET_MANIFEST = [
    // ── TERRAIN ────────────────────────────────────────────────────
    { ...T('fertile_silt',  'Nile Silt'),     tileLike: true, builder: Terrain.fertileSilt },
    { ...T('dune_sand',     'Dune Sand'),     tileLike: true, builder: Terrain.duneSand },
    { ...T('sandstone_path','Sandstone Path'),tileLike: true, builder: Terrain.sandstonePath },
    { ...T('marble_floor',  'Marble Floor'),  tileLike: true, builder: Terrain.marbleFloor },
    { ...T('nile_water',    'Nile Water'),    tileLike: true, builder: Terrain.nileWater },
    { ...O('terrain')('quay_wall', 'Quay Wall'), noShadow: true, builder: Terrain.quayWall },
    { ...O('terrain')('stairs', 'Stairs'),    noShadow: true, builder: Terrain.stairs },

    // ── NATURE ─────────────────────────────────────────────────────
    { ...N('date_palm',    'Date Palm',     { w: 1, d: 1 }, 0.95), builder: Nature.datePalm },
    { ...N('twin_palms',   'Twin Palms',    { w: 2, d: 1 }, 0.95), builder: Nature.twinPalms },
    { ...N('papyrus_clump','Papyrus Clump', { w: 1, d: 1 }, 0.60), builder: Nature.papyrusClump },
    { ...N('lotus_patch',  'Lotus Patch',   { w: 1, d: 1 }, 0.55), builder: Nature.lotusPatch },
    { ...N('acacia',       'Acacia',        { w: 1, d: 1 }, 0.90), builder: Nature.acaciaTree },
    { ...N('desert_broom', 'Desert Broom',  { w: 1, d: 1 }, 0.55), builder: Nature.desertBroom },
    { ...N('hibiscus_bush','Hibiscus Bush', { w: 1, d: 1 }, 0.65), builder: Nature.hibiscusBush },

    // ── PROPS ──────────────────────────────────────────────────────
    { ...PR('palm_fence',     'Palm Fence',     { w: 1, d: 1 }, 1.00), flatBase: true, shadowStyle: 'contact', builder: Props.palmFence },
    { ...PR('temple_archway', 'Temple Archway', { w: 1, d: 1 }, 0.95), builder: Props.templeArchway },
    { ...PR('fanoos_lantern', 'Fanoos Lantern', { w: 1, d: 1 }, 0.40), builder: Props.fanoosLantern },
    { ...PR('bronze_brazier', 'Bronze Brazier', { w: 1, d: 1 }, 0.45), builder: Props.bronzeBrazier },
    { ...PR('amphora',        'Amphora',        { w: 1, d: 1 }, 0.35), builder: Props.amphora },
    { ...PR('zir_jar',        'Water Zir',      { w: 1, d: 1 }, 0.35), builder: Props.zirJar },
    { ...PR('spice_crate',    'Spice Crate',    { w: 1, d: 1 }, 0.55), builder: Props.spiceCrate },
    { ...PR('bastet_cat',     'Bastet Statue',  { w: 1, d: 1 }, 0.45), builder: Props.bastetCat },
    { ...PR('hieroglyph_stele','Stele',         { w: 1, d: 1 }, 0.55), builder: Props.hieroglyphStele },
    { ...PR('camel',          'Camel',          { w: 1, d: 1 }, 0.85), builder: Props.camel },
    { ...PR('souq_awning',    'Souq Awning',    { w: 2, d: 1 }, 0.95), builder: Props.souqAwning },

    // ── WATER ──────────────────────────────────────────────────────
    { ...W('felucca', 'Felucca', { w: 2, d: 1 }, 0.95), builder: Buildings.feluccaBoat },

    // ── BUILDINGS & MONUMENTS ──────────────────────────────────────
    { ...B('mudbrick_house',  'Mudbrick House',  { w: 2, d: 2 }), builder: Buildings.mudbrickHouse },
    { ...B('alexandria_house','Alexandria House',{ w: 3, d: 3 }), builder: Buildings.alexandriaHouse },
    { ...B('mosque',          'Mosque',          { w: 3, d: 3 }), builder: Buildings.mosque },
    { ...B('minaret',         'Minaret',         { w: 2, d: 2 }), builder: Buildings.minaret },
    { ...B('pharos',          'Pharos Lighthouse',{ w: 3, d: 3 }), builder: Buildings.pharosLighthouse },
    { ...B('pyramid_small',   'Pyramid',         { w: 3, d: 3 }), builder: Buildings.smallPyramid },
    { ...B('pyramid_great',   'Great Pyramid',   { w: 4, d: 4 }), builder: Buildings.greatPyramid },
    { ...B('temple_gate',     'Hypostyle Gate',  { w: 3, d: 2 }), builder: Buildings.templeGate },
    { ...B('obelisk',         'Obelisk',         { w: 1, d: 1 }), builder: Buildings.obelisk },
];

export const ASSET_INDEX = Object.freeze(
    ASSET_MANIFEST.reduce((acc, a) => { acc[a.id] = a; return acc; }, {})
);

export const CATEGORIES = ['terrain', 'nature', 'props', 'water', 'buildings'];
