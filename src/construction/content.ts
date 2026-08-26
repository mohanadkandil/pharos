import { CONFIG } from '../config.js';
import { box, shell } from '../assets/voxelRenderer.js';

export type Voxel = Readonly<{ x: number; y: number; z: number; c: string }>;
export type PlanId = 'compact' | 'courtyard' | 'colonnaded';
export type OptionId = 'shade' | 'courtyard' | 'keep';
export type PhaseId = 'survey' | 'foundation' | 'structure' | 'enclosure' | 'fitout' | 'opening';
export type ConstructionSpriteId = string;

export type Result<T, C extends string = string> =
    | Readonly<{ ok: true; value: T }>
    | Readonly<{ ok: false; code: C; recoverable: boolean; message: string; details?: unknown }>;

export type SiteFixture = Readonly<{
    id: string;
    gx: number;
    gy: number;
    w: number;
    d: number;
    waterSouthY: number;
    roadWestX: number;
    palm: Readonly<{ gx: number; gy: number }>;
    cartIngress: readonly Readonly<{ gx: number; gy: number }>[];
}>;

export type PhaseDefinition = Readonly<{
    id: PhaseId;
    label: string;
    ticks: number;
    spriteKey: 'foundation' | 'structure' | 'enclosure' | 'openings' | 'roof' | 'finish' | null;
}>;

export type InterventionDefinition = Readonly<{
    id: OptionId;
    label: string;
    description: string;
    replaceSprites?: Readonly<Record<string, ConstructionSpriteId>>;
    addSprites?: readonly ConstructionSpriteId[];
}>;

export type PlanDefinition = Readonly<{
    id: PlanId;
    name: string;
    footprint: Readonly<{ w: number; d: number }>;
    tags: readonly [string, string, string];
    siteOffset: Readonly<{ x: number; y: number }>;
    phaseSprites: Readonly<Record<'foundation' | 'structure' | 'enclosure' | 'openings' | 'roof' | 'finish', ConstructionSpriteId>>;
    interventions: readonly [InterventionDefinition, InterventionDefinition, InterventionDefinition];
}>;

const P = CONFIG.palette;
const CONTENT_VERSION = 1;

export const FIXTURE: SiteFixture = Object.freeze({
    id: 'riverside-fixture-01',
    gx: 8,
    gy: 10,
    w: 5,
    d: 5,
    waterSouthY: 15,
    roadWestX: 7,
    palm: Object.freeze({ gx: 8, gy: 10 }),
    cartIngress: Object.freeze([
        Object.freeze({ gx: 7, gy: 12 }),
        Object.freeze({ gx: 8, gy: 12 }),
    ]),
});

export const COMMISSION = Object.freeze({
    id: 'dockworkers-house',
    title: "Dockworkers' House",
    subtitle: 'A fictional memory from the future Alexandria setting',
    residents: Object.freeze(['Mariam Hassan', 'Youssef Hassan', 'Nour Hassan']),
    memory: "My grandmother's balcony always faced the sea.",
    brief: 'Build a shaded riverside home for three dock workers, facing the Nile, with a public entrance connected to the sandstone road.',
});

export const PHASES: readonly PhaseDefinition[] = Object.freeze([
    Object.freeze({ id: 'survey', label: 'Survey', ticks: 160, spriteKey: null }),
    Object.freeze({ id: 'foundation', label: 'Foundation', ticks: 240, spriteKey: 'foundation' }),
    Object.freeze({ id: 'structure', label: 'Structure', ticks: 280, spriteKey: 'structure' }),
    Object.freeze({ id: 'enclosure', label: 'Walls Complete', ticks: 320, spriteKey: 'enclosure' }),
    Object.freeze({ id: 'fitout', label: 'Fit-out', ticks: 280, spriteKey: 'openings' }),
    Object.freeze({ id: 'opening', label: 'Opening', ticks: 160, spriteKey: 'finish' }),
]);

function merge(...parts: readonly Voxel[][]): Voxel[] {
    const map = new Map<string, Voxel>();
    for (const part of parts) {
        for (const voxel of part) map.set(`${voxel.x},${voxel.y},${voxel.z}`, Object.freeze({ ...voxel }));
    }
    return [...map.values()];
}

function columns(points: readonly [number, number][], z: number, h: number, color: string): Voxel[] {
    return points.flatMap(([x, y]) => box(x, y, z, 1, 1, h, color) as Voxel[]);
}

function compactSprites(): Record<string, Voxel[]> {
    const foundation = box(0, 0, 0, 12, 12, 1, P.limestoneDark) as Voxel[];
    const structure = columns([[0, 0], [11, 0], [0, 11], [11, 11], [5, 0], [5, 11]], 1, 5, P.woodDark);
    const enclosure = shell(0, 0, 1, 12, 12, 5, P.mudbrick) as Voxel[];
    const openings = merge(
        box(5, 11, 1, 2, 1, 3, P.woodDark) as Voxel[],
        box(2, 11, 3, 1, 1, 2, P.lapis) as Voxel[],
        box(9, 11, 3, 1, 1, 2, P.lapis) as Voxel[],
    );
    const roof = box(1, 1, 6, 10, 10, 1, P.mudbrickLight) as Voxel[];
    const finish = merge(
        box(0, 11, 6, 12, 1, 1, P.terraLight) as Voxel[],
        box(4, 10, 4, 4, 1, 1, P.clothStripe) as Voxel[],
    );
    const shade = merge(
        box(1, 11, 3, 3, 1, 1, P.woodDark) as Voxel[],
        box(8, 11, 3, 3, 1, 1, P.woodDark) as Voxel[],
        columns([[1, 11], [3, 11], [8, 11], [10, 11]], 2, 3, P.woodLight),
    );
    const courtyardRoof = merge(
        box(1, 1, 6, 10, 3, 1, P.mudbrickLight) as Voxel[],
        box(1, 8, 6, 10, 3, 1, P.mudbrickLight) as Voxel[],
        box(1, 4, 6, 3, 4, 1, P.mudbrickLight) as Voxel[],
        box(8, 4, 6, 3, 4, 1, P.mudbrickLight) as Voxel[],
        box(5, 5, 1, 2, 2, 1, P.nile) as Voxel[],
    );
    return { foundation, structure, enclosure, openings, roof, finish, shade, courtyardRoof };
}

function courtyardSprites(): Record<string, Voxel[]> {
    const foundation = box(0, 0, 0, 16, 16, 1, P.limestoneDark) as Voxel[];
    const structure = columns([[0, 0], [15, 0], [0, 15], [15, 15], [4, 4], [11, 4], [4, 11], [11, 11]], 1, 5, P.woodDark);
    const enclosure = merge(
        shell(0, 0, 1, 16, 16, 5, P.whiteShadow) as Voxel[],
        box(4, 4, 1, 1, 8, 4, P.whiteDeep) as Voxel[],
        box(11, 4, 1, 1, 8, 4, P.whiteDeep) as Voxel[],
    );
    const openings = merge(
        box(7, 15, 1, 2, 1, 3, P.woodDark) as Voxel[],
        box(2, 15, 3, 1, 1, 2, P.lapis) as Voxel[],
        box(13, 15, 3, 1, 1, 2, P.lapis) as Voxel[],
    );
    const roof = merge(
        box(1, 1, 6, 14, 3, 1, P.whiteShadow) as Voxel[],
        box(1, 12, 6, 14, 3, 1, P.whiteShadow) as Voxel[],
        box(1, 4, 6, 3, 8, 1, P.whiteShadow) as Voxel[],
        box(12, 4, 6, 3, 8, 1, P.whiteShadow) as Voxel[],
    );
    const finish = merge(
        box(0, 15, 6, 16, 1, 1, P.gold) as Voxel[],
        box(6, 6, 1, 4, 4, 1, P.pathLight) as Voxel[],
    );
    const shade = box(1, 15, 3, 4, 1, 3, P.woodLight) as Voxel[];
    const deepCourtyardRoof = merge(
        box(1, 1, 6, 14, 2, 1, P.whiteShadow) as Voxel[],
        box(1, 13, 6, 14, 2, 1, P.whiteShadow) as Voxel[],
        box(1, 3, 6, 2, 10, 1, P.whiteShadow) as Voxel[],
        box(13, 3, 6, 2, 10, 1, P.whiteShadow) as Voxel[],
        box(6, 6, 1, 4, 4, 1, P.nileDeep) as Voxel[],
    );
    return { foundation, structure, enclosure, openings, roof, finish, shade, deepCourtyardRoof };
}

function colonnadedSprites(): Record<string, Voxel[]> {
    const foundation = box(0, 0, 0, 16, 12, 1, P.limestoneDark) as Voxel[];
    const columnPoints: [number, number][] = [[0, 0], [15, 0], [0, 11], [15, 11], [2, 11], [5, 11], [8, 11], [11, 11], [14, 11]];
    const structure = columns(columnPoints, 1, 6, P.limestone);
    const enclosure = shell(0, 0, 1, 16, 10, 5, P.white) as Voxel[];
    const openings = merge(
        box(7, 9, 1, 2, 1, 3, P.woodDark) as Voxel[],
        box(3, 9, 3, 1, 1, 2, P.lapis) as Voxel[],
        box(12, 9, 3, 1, 1, 2, P.lapis) as Voxel[],
    );
    const roof = box(1, 1, 6, 14, 8, 1, P.whiteShadow) as Voxel[];
    const finish = merge(
        box(0, 10, 7, 16, 2, 1, P.gold) as Voxel[],
        box(0, 11, 6, 16, 1, 1, P.pathLight) as Voxel[],
    );
    const shade = merge(
        box(1, 11, 3, 4, 1, 3, P.clothTeal) as Voxel[],
        box(6, 11, 3, 4, 1, 3, P.clothStripe) as Voxel[],
        box(11, 11, 3, 4, 1, 3, P.clothTeal) as Voxel[],
    );
    const courtyardRoof = merge(
        box(1, 1, 6, 14, 2, 1, P.whiteShadow) as Voxel[],
        box(1, 7, 6, 14, 2, 1, P.whiteShadow) as Voxel[],
        box(1, 3, 6, 3, 4, 1, P.whiteShadow) as Voxel[],
        box(12, 3, 6, 3, 4, 1, P.whiteShadow) as Voxel[],
    );
    return { foundation, structure, enclosure, openings, roof, finish, shade, courtyardRoof };
}

const RAW_SPRITES = {
    compact: compactSprites(),
    courtyard: courtyardSprites(),
    colonnaded: colonnadedSprites(),
} as const;

const spriteId = (plan: PlanId, key: string): ConstructionSpriteId => `dockworkers:${plan}:${key}@${CONTENT_VERSION}`;

const spriteDefinitions: Record<ConstructionSpriteId, readonly Voxel[]> = {};
for (const [plan, groups] of Object.entries(RAW_SPRITES) as [PlanId, Record<string, Voxel[]>][]) {
    for (const [key, voxels] of Object.entries(groups)) spriteDefinitions[spriteId(plan, key)] = Object.freeze(merge(voxels));
}
export const SPRITE_DEFINITIONS: Readonly<Record<ConstructionSpriteId, readonly Voxel[]>> = Object.freeze(spriteDefinitions);

function phases(plan: PlanId): PlanDefinition['phaseSprites'] {
    return Object.freeze({
        foundation: spriteId(plan, 'foundation'),
        structure: spriteId(plan, 'structure'),
        enclosure: spriteId(plan, 'enclosure'),
        openings: spriteId(plan, 'openings'),
        roof: spriteId(plan, 'roof'),
        finish: spriteId(plan, 'finish'),
    });
}

function interventions(plan: PlanId, courtyardKey: string): PlanDefinition['interventions'] {
    return Object.freeze([
        Object.freeze({
            id: 'shade' as const,
            label: plan === 'colonnaded' ? 'Add woven arcade screens' : 'Add mashrabiya shade',
            description: 'Shade the western rooms without changing the approved footprint.',
            addSprites: Object.freeze([spriteId(plan, 'shade')]),
        }),
        Object.freeze({
            id: 'courtyard' as const,
            label: plan === 'courtyard' ? 'Deepen the courtyard' : 'Open a courtyard',
            description: 'Replace one roof bay with a cooler open-air court.',
            replaceSprites: Object.freeze({ [spriteId(plan, 'roof')]: spriteId(plan, courtyardKey) }),
        }),
        Object.freeze({
            id: 'keep' as const,
            label: 'Keep original plan',
            description: 'Complete the approved design unchanged.',
        }),
    ]);
}

export const PLANS: readonly PlanDefinition[] = Object.freeze([
    Object.freeze({
        id: 'compact',
        name: 'Compact House',
        footprint: Object.freeze({ w: 3, d: 3 }),
        siteOffset: Object.freeze({ x: 1, y: 1 }),
        tags: Object.freeze(['smallest footprint', 'shortest build', 'preserves palm']) as PlanDefinition['tags'],
        phaseSprites: phases('compact'),
        interventions: interventions('compact', 'courtyardRoof'),
    }),
    Object.freeze({
        id: 'courtyard',
        name: 'Courtyard House',
        footprint: Object.freeze({ w: 4, d: 4 }),
        siteOffset: Object.freeze({ x: 1, y: 1 }),
        tags: Object.freeze(['largest courtyard', 'best cross-ventilation', 'private family space']) as PlanDefinition['tags'],
        phaseSprites: phases('courtyard'),
        interventions: interventions('courtyard', 'deepCourtyardRoof'),
    }),
    Object.freeze({
        id: 'colonnaded',
        name: 'Colonnaded House',
        footprint: Object.freeze({ w: 4, d: 3 }),
        siteOffset: Object.freeze({ x: 1, y: 1 }),
        tags: Object.freeze(['shaded public frontage', 'strongest road connection', 'widest Nile view']) as PlanDefinition['tags'],
        phaseSprites: phases('colonnaded'),
        interventions: interventions('colonnaded', 'courtyardRoof'),
    }),
]);

export const PLAN_INDEX: Readonly<Record<PlanId, PlanDefinition>> = Object.freeze(
    Object.fromEntries(PLANS.map((plan) => [plan.id, plan])) as Record<PlanId, PlanDefinition>,
);

export type ContentValidationCode =
    | 'DUPLICATE_PLAN_ID'
    | 'INVALID_TAGS'
    | 'SPRITE_MISSING'
    | 'VOXEL_OUT_OF_BOUNDS'
    | 'VOXEL_INVALID'
    | 'DUPLICATE_VOXEL'
    | 'INTERVENTION_INVALID'
    | 'PHASE_INVALID'
    | 'FIXTURE_INVALID';

export function validateContent(
    plans: readonly PlanDefinition[] = PLANS,
    sprites: Readonly<Record<string, readonly Voxel[]>> = SPRITE_DEFINITIONS,
    options: Readonly<{ fixture?: SiteFixture; phases?: readonly PhaseDefinition[] }> = {},
): Result<true, ContentValidationCode> {
    const fixture = options.fixture ?? FIXTURE;
    const phaseDefinitions = options.phases ?? PHASES;
    if (fixture.gx !== 8 || fixture.gy !== 10 || fixture.w !== 5 || fixture.d !== 5
        || fixture.waterSouthY !== 15 || fixture.roadWestX !== 7) {
        return { ok: false, code: 'FIXTURE_INVALID', recoverable: false, message: 'The authored riverside fixture changed.' };
    }
    const phaseIds = new Set(phaseDefinitions.map((phase) => phase.id));
    if (phaseIds.size !== 6 || phaseDefinitions.some((phase) => !Number.isInteger(phase.ticks) || phase.ticks <= 0)) {
        return { ok: false, code: 'PHASE_INVALID', recoverable: false, message: 'Construction phases are invalid.' };
    }
    const planIds = new Set<string>();
    for (const plan of plans) {
        if (planIds.has(plan.id)) return { ok: false, code: 'DUPLICATE_PLAN_ID', recoverable: false, message: `Duplicate plan ${plan.id}.` };
        planIds.add(plan.id);
        if (plan.tags.length !== 3 || new Set(plan.tags).size !== 3) {
            return { ok: false, code: 'INVALID_TAGS', recoverable: false, message: `Plan ${plan.id} needs three distinct tags.` };
        }
        if (plan.siteOffset.x < 0 || plan.siteOffset.y < 0
            || plan.siteOffset.x + plan.footprint.w > fixture.w
            || plan.siteOffset.y + plan.footprint.d > fixture.d) {
            return { ok: false, code: 'FIXTURE_INVALID', recoverable: false, message: `Plan ${plan.id} offset does not fit the fixture.` };
        }
        const referenced = new Set<string>(Object.values(plan.phaseSprites));
        for (const intervention of plan.interventions) {
            for (const id of intervention.addSprites ?? []) referenced.add(id);
            for (const [from, to] of Object.entries(intervention.replaceSprites ?? {})) {
                referenced.add(from);
                referenced.add(to);
            }
        }
        if (plan.interventions.length !== 3 || new Set(plan.interventions.map((i) => i.id)).size !== 3) {
            return { ok: false, code: 'INTERVENTION_INVALID', recoverable: false, message: `Plan ${plan.id} intervention branches are invalid.` };
        }
        for (const id of referenced) {
            const voxels = sprites[id];
            if (!voxels) return { ok: false, code: 'SPRITE_MISSING', recoverable: false, message: `Missing sprite ${id}.` };
            const seen = new Set<string>();
            for (const voxel of voxels) {
                if (![voxel.x, voxel.y, voxel.z].every(Number.isInteger) || typeof voxel.c !== 'string') {
                    return { ok: false, code: 'VOXEL_INVALID', recoverable: false, message: `Invalid voxel in ${id}.` };
                }
                if (voxel.x < 0 || voxel.y < 0 || voxel.z < 0
                    || voxel.x >= plan.footprint.w * CONFIG.voxel.perTile
                    || voxel.y >= plan.footprint.d * CONFIG.voxel.perTile) {
                    return { ok: false, code: 'VOXEL_OUT_OF_BOUNDS', recoverable: false, message: `Out-of-bounds voxel in ${id}.` };
                }
                const key = `${voxel.x},${voxel.y},${voxel.z}`;
                if (seen.has(key)) return { ok: false, code: 'DUPLICATE_VOXEL', recoverable: false, message: `Duplicate voxel in ${id}.` };
                seen.add(key);
            }
        }
    }
    return { ok: true, value: true };
}


export { CONTENT_VERSION };
