# HYPATIA

Rebuild Alexandria, one remembered building at a time.

HYPATIA is an isometric voxel city-builder about rebuilding a fictional
future Alexandria from memories. Residents commission a home; three
authored plans respond to the Nile, road and preserved palm; workers,
cart, scaffolding, walls, windows and interiors appear through six
construction phases. At walls-complete, the player changes the design.
The finished building remembers that decision in a Memory / Decision /
New Life passport and deterministic replay.

The shipped site remains framework-free and dependency-free. Development
uses pinned TypeScript and Playwright tooling to compile the mixed JS/TS
source tree into static `dist/` files.

## Play

```bash
npm install
npm run build
npm start
# → http://localhost:8000
```

## Controls

### Mouse + keyboard

| Input | Action |
|---|---|
| Click | Place selected asset |
| Drag | Brush-place across cells |
| Right click / drag | Erase |
| Shift + drag | Pan camera |
| Scroll wheel | Zoom (anchored at cursor) |
| `H` / `V` | Flip placement preview |
| `E` | Toggle erase mode |
| `G` | Toggle grid overlay |
| `N` | Toggle night mode |
| `1`–`5` | Switch palette category |
| `S` / `R` | Save / reset |

### Touch

| Gesture | Action |
|---|---|
| Tap | Place |
| Drag | Brush-place |
| Long-press | Erase |
| Two-finger pinch / drag | Zoom / pan |

## What's in the box

- **Living construction chronicle.** Review one remembered resident
  commission, compare Compact/Courtyard/Colonnaded plans, watch a
  deterministic six-phase build, make a heat/shade intervention, welcome
  the family home, inspect the building passport, and replay the build.
- **33 procedural assets** across terrain, nature, props, water and
  buildings — from a single papyrus clump to the Great Pyramid.
- **Zero binary files.** Voxel art is rendered to canvases at load
  time; sound effects are synthesized with WebAudio oscillators. The
  whole game is text.
- **Layered-cache renderer.** Terrain and static objects are baked into
  hi-DPI world-space canvases and only re-composited per frame; idle
  frames early-exit entirely. Cast shadows are blurred silhouettes baked
  once into the object layer.
- **Living night mode.** Stars replace the papyrus sky; fanoos
  lanterns, braziers and windows glow; turquoise domes catch moonlight;
  and the Pharos sweeps a rotating beam across the water.
- **Auto-save.** The city persists to `localStorage`, camera included.
- **A starter scene** seeds a spacious slice of Alexandria on first
  run: pyramids in the desert behind town, a mosque on its marble
  plaza, a souq lane with camel and spice crates, the Pharos on the
  quay, feluccas on a wide Nile — all rippling in back-to-front.

## Architecture

```
index.html / styles.css      HYPATIA UI, copied into static dist
src/
├── config.js                grid/voxel dimensions + Egyptian palette
├── main.js                  boot, exact story fixture, runtime mode
├── construction/
│   ├── content.ts           authored commission/plans/phases/branches
│   └── ConstructionSystem.ts deterministic state, save, replay snapshots
├── assets/
│   ├── voxelRenderer.js     voxel→canvas projection + shape helpers
│   ├── assetManifest.js     sandbox asset catalog
│   ├── assetFactory.js      builders → draw-ready records (+shadows)
│   └── theme/               terrain / nature / props / buildings
├── core/                    Game, Renderer, Camera, InputManager
├── grid/                    IsoGrid math, TileMap world state
├── building/                placement + construction reservations
├── storage/                 v1→v2 localStorage persistence
└── ui/                      editor UI + ConstructionUI + synthesized audio
tests/
├── construction/            100% line/function/branch unit coverage
├── storage/                 migration/recovery tests
└── e2e/                     Playwright desktop/tablet/mobile journeys
```

Inspired by the lovely
[mykonos-island-voxels](https://github.com/boona13/mykonos-island-voxels)
builder; the engine and all art here are written from scratch for Egypt.

## License

MIT — see [LICENSE](LICENSE).
