/**
 * Central game configuration.
 *
 * Everything that speaks in pixels or colors lives here so the rest of
 * the code can reason purely in grid cells and voxels.
 *
 * The palette is sun-baked Alexandria: warm limestone and mudbrick,
 * turquoise Nile water, lapis and gold accents, palm-green vegetation.
 */

export const CONFIG = Object.freeze({
    grid: {
        width: 14,
        height: 14,
    },

    // One ground cell on the isometric grid: a classic 2:1 diamond.
    tile: {
        w: 64,
        h: 32,
    },

    // Each cell is subdivided into 4×4 voxel columns; one voxel cube is
    // 16px wide (top face) and 16px tall on screen. Chunky and readable.
    voxel: {
        perTile: 4,
        size: 16,
        height: 16,
    },

    camera: {
        minZoom: 0.5,
        maxZoom: 3.0,
        defaultZoom: 1.4,
    },

    layers: Object.freeze({
        TERRAIN: 0,
        WATER:   1,
        OBJECT:  2,
    }),

    storageKey: 'pharos.save.v1',

    palette: Object.freeze({
        // Plaster whites
        white:        '#f7f1e3',
        whiteShadow:  '#e3d8c2',
        whiteDeep:    '#cbbda1',

        // Nile water
        nile:         '#2fa0a5',
        nileDeep:     '#20787e',
        nileShine:    '#8fd8d8',

        // Fertile riverbank soil
        silt:         '#8ba75e',
        siltDark:     '#67844a',
        siltLight:    '#a9c47b',

        // Desert
        sand:         '#ecd9a8',
        sandDark:     '#cdb384',
        sandLight:    '#f6ead0',

        // Sandstone paths
        path:         '#d3b183',
        pathDark:     '#b3925f',
        pathLight:    '#e8caa0',

        // Marble floors
        marble:       '#efe8d8',
        marbleDark:   '#cfc4ac',
        marbleLight:  '#fbf7ec',

        // Cut limestone (temples, pharos)
        limestone:       '#e5d5ae',
        limestoneDark:   '#c4af82',
        limestoneLight:  '#f4e9cd',

        // Mudbrick houses
        mudbrick:     '#bf8a58',
        mudbrickDark: '#99683d',
        mudbrickLight:'#d6a674',

        // Rose granite (statues, steles)
        granite:      '#b98d76',
        graniteDark:  '#93695a',
        graniteLight: '#d3ab93',

        // Gold trim
        gold:         '#e6bd57',
        goldDeep:     '#bd9430',
        goldLight:    '#f6dc8d',

        // Lapis + turquoise (painted details)
        lapis:        '#24568f',
        lapisLight:   '#3570b5',
        lapisDeep:    '#173c69',
        turquoise:    '#35b3a2',
        turquoiseLight:'#63cdc0',

        // Fired clay
        terracotta:   '#b56232',
        terraLight:   '#cf7c48',
        terraDark:    '#8f4a22',

        // Wood, palm trunks, boats
        wood:         '#96693f',
        woodDark:     '#6d4826',
        woodLight:    '#b58554',

        // Palm crowns
        frond:        '#4c8a41',
        frondDark:    '#34632c',
        frondLight:   '#6ca758',

        // Papyrus reeds
        papyrus:      '#7fae52',
        papyrusDark:  '#5f8c3a',
        papyrusLight: '#a3cc74',

        // Acacia canopy
        acacia:       '#6d9450',
        acaciaDark:   '#4f7238',
        acaciaLight:  '#8fb26a',

        // Generic foliage + blossoms
        leaf:         '#4f7f3c',
        leafDark:     '#33582a',
        lotusPink:    '#e58bb0',
        lotusBlue:    '#7a9fd4',
        hibiscus:     '#d84a4a',

        // Spices & flame
        saffron:      '#dd8f2e',
        flame:        '#ffb84d',

        // Metal
        iron:         '#4a4440',
        ironLight:    '#6b625c',

        // Earth & glass
        soil:         '#6d5136',
        soilDark:     '#4e3924',
        glass:        '#dceef2',

        // Market cloth
        clothRed:     '#c65b4e',
        clothStripe:  '#efe3c8',
        clothTeal:    '#3f8f86',
    }),
});
