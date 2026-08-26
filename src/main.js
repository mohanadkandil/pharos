/**
 * Boot sequence: generate the procedural asset pack (with progress UI),
 * then start the game and either restore the last session or seed the
 * example harbor scene.
 */

import { loadAssets } from './assets/assetFactory.js';
import { Game } from './core/Game.js';
import { UIManager } from './ui/UIManager.js';
import { loadUiAudio } from './ui/Audio.js';

async function main() {
    const fill = document.getElementById('loading-fill');
    const status = document.getElementById('loading-status');
    const loadingScreen = document.getElementById('loading-screen');
    const app = document.getElementById('app');

    await loadAssets((p, label) => {
        fill.style.width = `${Math.round(p * 100)}%`;
        status.textContent = `carving ${label}…`;
    });

    loadUiAudio();

    fill.style.width = '100%';
    status.textContent = 'sailing into the harbor';
    await new Promise(r => setTimeout(r, 250));

    const canvas = document.getElementById('game-canvas');
    const runtimeMode = window.matchMedia('(max-width: 767px)').matches ? 'mobile-replay' : 'editor';
    const game = new Game(canvas, { runtimeMode: 'editor' });
    const ui = new UIManager(game);
    game.ui = ui;
    ui.update();

    if (game.load()) {
        ui.showToast('Welcome back');
    } else {
        seedAlexandria(game);
        if (runtimeMode === 'mobile-replay') game.seedMobileConstructionDemo();
    }
    game.runtimeMode = runtimeMode;
    ui.update();

    loadingScreen.classList.add('hidden');
    app.classList.remove('hidden');
}

/**
 * First-run scene: a spacious slice of Alexandria. Desert with the
 * pyramids in the far back-left, a marble mosque plaza behind town,
 * mudbrick houses and a souq lane in the middle ground, the Pharos on
 * the right end of the quay, and a wide Nile up front with feluccas.
 *
 * Placements ripple in back-to-front: each cell's delay grows with its
 * depth (gx+gy), and objects pop a beat after their ground settles.
 */
function seedAlexandria(game) {
    const W = game.tileMap.width, H = game.tileMap.height;
    const STEP_MS = 26;
    const OBJECT_DELAY = 90;

    const placeT = (id, gx, gy) =>
        game.placeAndAnimate(id, gx, gy, { delay: (gx + gy) * STEP_MS });
    const placeO = (id, gx, gy) =>
        game.placeAndAnimate(id, gx, gy, { delay: (gx + gy) * STEP_MS + OBJECT_DELAY });

    // ── Ground ────────────────────────────────────────────────────
    // Fertile silt as the base…
    for (let gy = 0; gy < H - 3; gy++)
        for (let gx = 0; gx < W; gx++) placeT('fertile_silt', gx, gy);

    // …desert around the pyramids…
    for (let gy = 0; gy <= 5; gy++)
        for (let gx = 0; gx <= 5; gx++) placeT('dune_sand', gx, gy);

    // …a marble plaza for the mosque…
    for (let gy = 0; gy <= 4; gy++)
        for (let gx = 6; gx <= 10; gx++) placeT('marble_floor', gx, gy);

    // …a sandstone lane down to the harbor and along the souq row…
    for (let gy = 5; gy <= 14; gy++) placeT('sandstone_path', 7, gy);
    for (let gx = 2; gx <= 7; gx++) placeT('sandstone_path', gx, 13);

    // …and a wide Nile along the front.
    for (let gy = H - 3; gy < H; gy++)
        for (let gx = 0; gx < W; gx++) placeT('nile_water', gx, gy);

    // Quay wall holding the corniche above the water, stairs mid-lane.
    for (let gx = 0; gx < W; gx++) {
        if (gx >= 7 && gx <= 12) continue;
        placeO('quay_wall', gx, 14);
    }
    placeO('stairs', 7, 14);

    // ── Monuments ─────────────────────────────────────────────────
    placeO('pyramid_great', 0, 0);
    placeO('pyramid_small', 0, 4);
    placeO('hieroglyph_stele', 5, 0);
    placeO('mosque', 7, 1);
    placeO('minaret', 11, 1);
    placeO('temple_gate', 1, 8);
    placeO('obelisk', 5, 8);
    placeO('bastet_cat', 4, 10);
    placeO('pharos', 14, 11);

    // ── Town ──────────────────────────────────────────────────────
    placeO('alexandria_house', 14, 4);
    placeO('mudbrick_house', 9, 7);
    placeO('mudbrick_house', 12, 8);

    // ── Souq lane ─────────────────────────────────────────────────
    placeO('souq_awning', 4, 12);
    placeO('camel', 3, 12);
    placeO('spice_crate', 4, 13);
    placeO('amphora', 5, 13);
    placeO('zir_jar', 13, 13);
    placeO('fanoos_lantern', 6, 13);
    placeO('fanoos_lantern', 13, 12);
    placeO('bronze_brazier', 13, 10);

    // ── Green things ──────────────────────────────────────────────
    placeO('date_palm', 0, 11);
    placeO('date_palm', 8, 10);
    placeO('date_palm', 16, 2);
    placeO('twin_palms', 16, 8);
    placeO('acacia', 14, 0);
    placeO('hibiscus_bush', 10, 5);
    placeO('desert_broom', 4, 1);
    placeO('desert_broom', 3, 7);
    placeO('papyrus_clump', 0, 13);
    placeO('papyrus_clump', 17, 13);
    placeO('lotus_patch', 2, 15);
    placeO('lotus_patch', 12, 16);

    // ── On the water ──────────────────────────────────────────────
    placeO('felucca', 6, 16);
    placeO('felucca', 11, 15);
    placeO('felucca', 15, 17);
}

main().catch(err => {
    console.error(err);
    const status = document.getElementById('loading-status');
    if (status) status.textContent = `Something broke: ${err.message}`;
});
