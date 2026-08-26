/**
 * A single object placed on the grid — plain value class.
 */

export class PlacedObject {
    constructor({
        id,
        assetId,
        gx,
        gy,
        footprint,
        flipH = false,
        flipV = false,
        kind = 'object',
        constructionId = null,
        renderStatic = true,
        buildingId = null,
    }) {
        this.id = id;
        this.assetId = assetId;
        this.gx = gx;               // footprint origin (back-left cell)
        this.gy = gy;
        this.footprint = footprint; // { w, d }
        this.flipH = !!flipH;
        this.flipV = !!flipV;
        this.kind = kind;
        this.constructionId = constructionId;
        this.renderStatic = renderStatic !== false;
        this.buildingId = buildingId;
    }

    occupies(gx, gy) {
        return gx >= this.gx && gx < this.gx + this.footprint.w
            && gy >= this.gy && gy < this.gy + this.footprint.d;
    }

    /** All covered cells, row-major. */
    cells() {
        const out = [];
        for (let ix = 0; ix < this.footprint.w; ix++)
            for (let iy = 0; iy < this.footprint.d; iy++)
                out.push({ gx: this.gx + ix, gy: this.gy + iy });
        return out;
    }

    /**
     * Depth-sort key: the FRONT-most covered cell (largest gx+gy) decides
     * draw order, so big objects correctly overlap what sits behind them.
     */
    sortKey() {
        return (this.gx + this.footprint.w - 1) + (this.gy + this.footprint.d - 1);
    }

    serialize() {
        return {
            id: this.id,
            assetId: this.assetId,
            gx: this.gx,
            gy: this.gy,
            footprint: { ...this.footprint },
            flipH: this.flipH,
            flipV: this.flipV,
            kind: this.kind,
            constructionId: this.constructionId,
            renderStatic: this.renderStatic,
            buildingId: this.buildingId,
        };
    }
}
