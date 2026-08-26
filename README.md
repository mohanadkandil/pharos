# Pharos

Build a little Alexandria, one block at a time.

Pharos is an isometric voxel city-builder that runs entirely in the
browser — no bundler, no dependencies, no asset files. Every sprite is
generated at load time from voxel definitions: the Pharos lighthouse
with its burning flame chamber, turquoise mosque domes, mudbrick houses,
date palms, feluccas drifting on the Nile, a striped souq awning, even a
standing camel. Click a cell, pick a piece, and a sun-baked city
assembles under your cursor.

## Play

Serve the folder with any static file server and open it:

```bash
python3 -m http.server 8000
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

- **33 procedural assets** across terrain, nature, props, water and
  buildings — from a single papyrus clump to the Great Pyramid.
- **Zero binary files.** Voxel art is rendered to canvases at load
  time; sound effects are synthesized with WebAudio oscillators. The
  whole game is text.
- **Layered-cache renderer.** Terrain and static objects are baked into
  hi-DPI world-space canvases and only re-composited per frame; idle
  frames early-exit entirely. Cast shadows are blurred silhouettes baked
  once into the object layer.
- **Auto-save.** The city persists to `localStorage`, camera included.
- **A starter scene** seeds a spacious slice of Alexandria on first
  run: pyramids in the desert behind town, a mosque on its marble
  plaza, a souq lane with camel and spice crates, the Pharos on the
  quay, feluccas on a wide Nile — all rippling in back-to-front.

## Architecture

```
index.html / styles.css      the whole UI, framework-free
src/
├── config.js                grid/voxel dimensions + Egyptian palette
├── main.js                  boot, progress UI, starter scene
├── assets/
│   ├── voxelRenderer.js     voxel→canvas projection + shape helpers
│   ├── assetManifest.js     the asset catalog
│   ├── assetFactory.js      builders → draw-ready records (+shadows)
│   └── theme/               terrain / nature / props / buildings
├── core/                    Game, Renderer, Camera, InputManager
├── grid/                    IsoGrid math, TileMap world state
├── building/                placement rules
├── storage/                 localStorage persistence
└── ui/                      toolbar, palette, HUD, synthesized audio
```

Inspired by the lovely
[mykonos-island-voxels](https://github.com/boona13/mykonos-island-voxels)
builder; the engine and all art here are written from scratch for Egypt.

## License

MIT — see [LICENSE](LICENSE).
