/**
 * Turns manifest builders into draw-ready runtime records.
 *
 * For every manifest entry:
 *   1. Run the voxel builder and render it to a source canvas.
 *   2. Pre-render a hi-DPI display canvas so per-frame blits never
 *      resample a raw canvas.
 *   3. Build a black silhouette for cast shadows (objects only), and
 *      contact points for props that ground themselves instead.
 */

import { ASSET_MANIFEST } from './assetManifest.js';
import { renderVoxels } from './voxelRenderer.js';

let _assets = null;

const MAX_ZOOM = 3.0;
const DEFAULT_DPR = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
// Pre-render generously: crisp at max zoom on any display density.
const DISPLAY_SUPERSAMPLE = Math.max(2, Math.ceil(MAX_ZOOM * DEFAULT_DPR));

/** Upscale a source canvas to its final draw resolution once. */
function buildDisplayCanvas(src) {
    const c = document.createElement('canvas');
    c.width = src.width * DISPLAY_SUPERSAMPLE;
    c.height = src.height * DISPLAY_SUPERSAMPLE;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
}

/** Black silhouette of an asset, used as the projected cast shadow. */
function buildSilhouette(src) {
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    return c;
}

/**
 * Bottom contact anchors for low props: opaque column clusters along the
 * asset's bottom edge, returned in display-canvas coordinates.
 */
function buildContactPoints(src, outW, outH) {
    const ctx = src.getContext('2d');
    let data;
    try {
        data = ctx.getImageData(0, 0, src.width, src.height).data;
    } catch {
        return null;
    }
    const sx = outW / src.width;
    const sy = outH / src.height;
    const bandH = Math.max(2, Math.floor(src.height * 0.12));
    const cols = new Map();
    for (let y = src.height - bandH; y < src.height; y++) {
        for (let x = 0; x < src.width; x++) {
            if (data[(y * src.width + x) * 4 + 3] > 40) {
                cols.set(x, Math.max(cols.get(x) ?? 0, src.height - y));
            }
        }
    }
    if (!cols.size) return null;

    // Cluster adjacent opaque columns into foot points.
    const xs = [...cols.keys()].sort((a, b) => a - b);
    const points = [];
    let run = [xs[0]];
    for (let i = 1; i <= xs.length; i++) {
        const x = xs[i];
        if (x === run[run.length - 1] + 1) {
            run.push(x);
            continue;
        }
        const mid = run[Math.floor(run.length / 2)];
        points.push({
            x: (mid + 0.5) * sx,
            y: outH - (cols.get(mid) ?? 0) * sy,
        });
        run = [x];
    }
    return points.slice(0, 4);
}

export async function loadAssets(onProgress = () => {}) {
    if (_assets) return _assets;
    const out = {};
    const total = ASSET_MANIFEST.length;

    for (let i = 0; i < total; i++) {
        const entry = ASSET_MANIFEST[i];
        const rendered = renderVoxels(entry.builder(), entry.footprint);
        const displayCanvas = buildDisplayCanvas(rendered.canvas);

        const record = {
            id: entry.id,
            name: entry.name,
            category: entry.category,
            kind: entry.kind,
            footprint: entry.footprint,
            tileLike: entry.tileLike === true,
            noShadow: entry.noShadow === true,
            flatBase: entry.flatBase === true,
            shadowStyle: entry.shadowStyle ?? 'cast',
            sizeScale: entry.sizeScale ?? 1,

            canvas: rendered.canvas,
            anchorX: rendered.anchorX,
            anchorY: rendered.anchorY,
            width: rendered.width,
            height: rendered.height,
            displayCanvas,
        };

        if (entry.kind === 'object' && !record.tileLike && !record.noShadow) {
            if (record.shadowStyle === 'contact') {
                record.contactPoints = buildContactPoints(
                    rendered.canvas, displayCanvas.width, displayCanvas.height);
            } else {
                record.shadowCanvas = buildSilhouette(rendered.canvas);
                record.shadowWidth = rendered.width;
                record.shadowHeight = rendered.height;
                record.shadowBlurred = false;
            }
        }

        out[entry.id] = record;
        onProgress((i + 1) / total, entry.name);

        // Yield so the loading bar keeps painting smoothly.
        if (i % 4 === 0) await new Promise(r => requestAnimationFrame(r));
    }

    _assets = out;
    console.info(`[assets] generated ${total} procedural assets.`);
    return _assets;
}

export function getAsset(id) {
    if (!_assets) throw new Error('Assets not yet loaded');
    return _assets[id];
}

export function allAssets() {
    if (!_assets) throw new Error('Assets not yet loaded');
    return Object.values(_assets);
}
