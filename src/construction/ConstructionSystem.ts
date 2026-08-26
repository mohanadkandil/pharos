import { PlacedObject } from '../building/PlacedObject.js';
import {
    COMMISSION,
    FIXTURE,
    PHASES,
    PLAN_INDEX,
    PLANS,
    type ConstructionSpriteId,
    type OptionId,
    type PhaseId,
    type PlanDefinition,
    type PlanId,
    type Result,
} from './content.js';

export type ConstructionStatus =
    | 'idle'
    | 'site-confirmed'
    | 'plan-selected'
    | 'building'
    | 'awaiting-intervention'
    | 'completed'
    | 'replay';

export type ConstructionErrorCode =
    | 'INVALID_STATE_TRANSITION'
    | 'SITE_OCCUPIED'
    | 'SITE_INVALID'
    | 'PLAN_INVALID'
    | 'INTERVENTION_ALREADY_RESOLVED'
    | 'RESERVATION_MISSING'
    | 'RESERVATION_CONFLICT'
    | 'REPLAY_RECORD_INVALID';

export type DecisionEvent = Readonly<{
    sequence: number;
    phaseIndex: number;
    decisionId: 'afternoon-heat';
    optionId: OptionId;
}>;

export type ConstructionRecord = {
    schemaVersion: 1;
    constructionId: string;
    reservationId: number;
    commissionId: typeof COMMISSION.id;
    siteId: typeof FIXTURE.id;
    approvedPlanId: PlanId;
    originalManifestId: string;
    activeManifestId: string;
    deterministicSeed: number;
    phaseIndex: number;
    phaseElapsedTicks: number;
    playbackSpeed: 1 | 2;
    paused: boolean;
    decisionEvents: DecisionEvent[];
    completed: boolean;
    buildingId: string | null;
};

export type ConstructionRenderSnapshot = Readonly<{
    revision: number;
    status: ConstructionStatus;
    site: Readonly<{ gx: number; gy: number; w: number; d: number }>;
    planId: PlanId | null;
    spriteGroups: readonly Readonly<{
        id: string;
        spriteId: ConstructionSpriteId;
        alpha: number;
        clipProgress: number;
        transform: Readonly<{ x: number; y: number; scale: number }>;
    }>[];
    workers: readonly Readonly<{ id: string; x: number; y: number; pose: 'idle' | 'carry' | 'place' | 'climb' }>[];
    cart: Readonly<{ x: number; y: number; load: 'empty' | 'stone' }> | null;
    dust: readonly Readonly<{ x: number; y: number; age: number; seed: number }>[];
    scaffold: readonly Readonly<{ x1: number; y1: number; x2: number; y2: number; z: number }>[];
    leaderLine: Readonly<{ gx: number; gy: number; z: number }> | null;
    lightCues: readonly Readonly<{ gx: number; gy: number; z: number; strength: number }>[];
}>;

export type ConstructionViewModel = Readonly<{
    revision: number;
    status: ConstructionStatus;
    siteConfirmed: boolean;
    selectedPlanId: PlanId | null;
    plans: readonly PlanDefinition[];
    phaseIndex: number;
    phase: Readonly<{ id: PhaseId; label: string; progress: number }> | null;
    paused: boolean;
    playbackSpeed: 1 | 2;
    intervention: Readonly<{
        prompt: string;
        options: PlanDefinition['interventions'];
    }> | null;
    completed: boolean;
    record: ConstructionRecord | null;
}>;

type ReplayState = {
    phaseIndex: number;
    phaseElapsedTicks: number;
    paused: boolean;
    speed: 1 | 2;
};

type WorldObject = {
    id: number;
    assetId: string | null;
    gx: number;
    gy: number;
    footprint: Readonly<{ w: number; d: number }>;
    flipH?: boolean;
    flipV?: boolean;
    kind?: string;
    constructionId?: string;
    renderStatic?: boolean;
    buildingId?: string | null;
    occupies?(gx: number, gy: number): boolean;
};

type TileMapLike = {
    width: number;
    height: number;
    objects: WorldObject[];
    inBounds(gx: number, gy: number): boolean;
    getTerrain(gx: number, gy: number): string | null;
    objectAt(gx: number, gy: number): WorldObject | null;
    nextId(): number;
    addObject(obj: WorldObject): void;
    removeObjectAt(gx: number, gy: number): WorldObject | null;
    objectsVersion: number;
};

const TICK_MS = 50;
const MAX_TICKS_PER_FRAME = 5;
const DETERMINISTIC_SEED = 104729;

function fail(code: ConstructionErrorCode, message: string, recoverable = true, details?: unknown): Result<never, ConstructionErrorCode> {
    return Object.freeze({ ok: false, code, recoverable, message, details });
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

export class ConstructionSystem {
    private readonly tileMap: TileMapLike;
    private status: ConstructionStatus = 'idle';
    private siteConfirmed = false;
    private selectedPlanId: PlanId | null = null;
    private record: ConstructionRecord | null = null;
    private reservation: WorldObject | null = null;
    private replay: ReplayState | null = null;
    private revision = 0;
    private renderSnapshot: ConstructionRenderSnapshot;
    private lastFrameAt: number | null = null;
    private wasVisible = true;
    private accumulatorMs = 0;
    private onChange: (() => void) | null = null;
    private onMilestone: (() => void) | null = null;

    constructor(tileMap: TileMapLike) {
        this.tileMap = tileMap;
        this.renderSnapshot = this.buildRenderSnapshot();
    }

    setCallbacks(callbacks: { onChange?: () => void; onMilestone?: () => void }): void {
        this.onChange = callbacks.onChange ?? null;
        this.onMilestone = callbacks.onMilestone ?? null;
    }

    getViewModel(): ConstructionViewModel {
        const clock = this.replay ?? this.record;
        const phaseIndex = clock ? clock.phaseIndex : -1;
        const phase = clock && phaseIndex >= 0 && phaseIndex < PHASES.length
            ? Object.freeze({
                id: PHASES[phaseIndex].id,
                label: PHASES[phaseIndex].label,
                progress: clamp01(clock.phaseElapsedTicks / PHASES[phaseIndex].ticks),
            })
            : null;
        const selected = this.selectedPlanId ? PLAN_INDEX[this.selectedPlanId] : null;
        return Object.freeze({
            revision: this.revision,
            status: this.status,
            siteConfirmed: this.siteConfirmed,
            selectedPlanId: this.selectedPlanId,
            plans: PLANS,
            phaseIndex,
            phase,
            paused: clock ? clock.paused : false,
            playbackSpeed: this.replay ? this.replay.speed : (this.record ? this.record.playbackSpeed : 1),
            intervention: this.status === 'awaiting-intervention' && selected
                ? Object.freeze({
                    prompt: 'The western rooms overheat after noon.',
                    options: selected.interventions,
                })
                : null,
            completed: this.record?.completed ?? false,
            record: this.record ? structuredClone(this.record) : null,
        });
    }
    ownsCell(gx: number, gy: number): boolean {
        return this.reservation?.occupies?.(gx, gy) === true;
    }

    reset(): void {
        this.record = null;
        this.reservation = null;
        this.replay = null;
        this.selectedPlanId = null;
        this.siteConfirmed = false;
        this.status = 'idle';
        this.lastFrameAt = null;
        this.wasVisible = true;
        this.accumulatorMs = 0;
        this.markChanged();
    }

    getRenderSnapshot(): ConstructionRenderSnapshot {
        return this.renderSnapshot;
    }

    getSerializableRecord(): ConstructionRecord | null {
        return this.record ? structuredClone(this.record) : null;
    }

    confirmSite(): Result<true, ConstructionErrorCode> {
        if (this.status !== 'idle') return fail('INVALID_STATE_TRANSITION', 'The construction site is already active.');
        const validation = this.validateSite();
        if (!validation.ok) return validation;
        this.siteConfirmed = true;
        this.status = 'site-confirmed';
        this.markChanged();
        return { ok: true, value: true };
    }

    selectPlan(planId: PlanId): Result<PlanDefinition, ConstructionErrorCode> {
        if (this.status !== 'site-confirmed' && this.status !== 'plan-selected') {
            return fail('INVALID_STATE_TRANSITION', 'Confirm the riverside site before choosing a plan.');
        }
        const plan = PLAN_INDEX[planId];
        if (!plan) return fail('PLAN_INVALID', 'That authored plan is unavailable.', false);
        this.selectedPlanId = planId;
        this.status = 'plan-selected';
        this.markChanged();
        return { ok: true, value: plan };
    }

    beginConstruction(): Result<ConstructionRecord, ConstructionErrorCode> {
        if (this.status !== 'plan-selected' || !this.selectedPlanId) {
            return fail('INVALID_STATE_TRANSITION', 'Choose an authored plan before construction begins.');
        }
        const validation = this.validateSite();
        if (!validation.ok) return validation;
        const plan = PLAN_INDEX[this.selectedPlanId];
        const gx = FIXTURE.gx + plan.siteOffset.x;
        const gy = FIXTURE.gy + plan.siteOffset.y;
        const id = this.tileMap.nextId();
        const constructionId = `construction-${id}`;
        const reservation: WorldObject = Object.assign(new PlacedObject({
            id,
            assetId: null,
            gx,
            gy,
            footprint: plan.footprint,
        }), {
            kind: 'construction',
            constructionId,
            renderStatic: false,
            buildingId: null,
        });
        this.tileMap.addObject(reservation);
        this.reservation = reservation;
        this.record = {
            schemaVersion: 1,
            constructionId,
            reservationId: id,
            commissionId: COMMISSION.id,
            siteId: FIXTURE.id,
            approvedPlanId: plan.id,
            originalManifestId: `${plan.id}@1`,
            activeManifestId: `${plan.id}@1`,
            deterministicSeed: DETERMINISTIC_SEED,
            phaseIndex: 0,
            phaseElapsedTicks: 0,
            playbackSpeed: 1,
            paused: false,
            decisionEvents: [],
            completed: false,
            buildingId: null,
        };
        this.status = 'building';
        this.lastFrameAt = null;
        this.accumulatorMs = 0;
        this.markChanged(true);
        return { ok: true, value: structuredClone(this.record) };
    }

    setPaused(paused: boolean): Result<true, ConstructionErrorCode> {
        const clock = this.replay ?? this.record;
        if (!clock || (this.status !== 'building' && this.status !== 'replay')) {
            return fail('INVALID_STATE_TRANSITION', 'Construction is not currently playing.');
        }
        clock.paused = paused;
        this.lastFrameAt = null;
        this.accumulatorMs = 0;
        this.markChanged();
        return { ok: true, value: true };
    }

    setPlaybackSpeed(speed: 1 | 2): Result<true, ConstructionErrorCode> {
        const clock = this.replay ?? this.record;
        if (!clock) return fail('INVALID_STATE_TRANSITION', 'No construction is active.');
        if (this.replay) this.replay.speed = speed;
        else if (this.record) this.record.playbackSpeed = speed;
        this.markChanged();
        return { ok: true, value: true };
    }

    skipToNextPhase(): Result<true, ConstructionErrorCode> {
        const clock = this.replay ?? this.record;
        if (!clock || (this.status !== 'building' && this.status !== 'replay')) {
            return fail('INVALID_STATE_TRANSITION', 'There is no active phase to skip.');
        }
        clock.phaseElapsedTicks = PHASES[clock.phaseIndex].ticks;
        this.completeCurrentPhase();
        this.markChanged(true);
        return { ok: true, value: true };
    }

    resolveIntervention(optionId: OptionId): Result<true, ConstructionErrorCode> {
        if (this.status !== 'awaiting-intervention' || !this.record || !this.selectedPlanId) {
            return fail('INVALID_STATE_TRANSITION', 'The intervention is not currently available.');
        }
        const option = PLAN_INDEX[this.selectedPlanId].interventions.find((entry) => entry.id === optionId);
        if (!option) return fail('PLAN_INVALID', 'That intervention does not belong to the approved plan.', false);
        this.record.decisionEvents.push(Object.freeze({
            sequence: 1,
            phaseIndex: 4,
            decisionId: 'afternoon-heat',
            optionId,
        }));
        this.record.activeManifestId = `${this.selectedPlanId}@1:afternoon-heat:${optionId}`;
        this.record.phaseIndex = 4;
        this.record.phaseElapsedTicks = 0;
        this.record.paused = false;
        this.status = 'building';
        this.markChanged(true);
        return { ok: true, value: true };
    }

    update(now: number, visible = true): boolean {
        if (this.status !== 'building' && this.status !== 'replay') {
            this.lastFrameAt = now;
            this.accumulatorMs = 0;
            return false;
        }
        if (!visible) {
            this.wasVisible = false;
            this.lastFrameAt = now;
            this.accumulatorMs = 0;
            return false;
        }
        if (!this.wasVisible) {
            this.wasVisible = true;
            this.lastFrameAt = now;
            this.accumulatorMs = 0;
            return false;
        }
        const clock = this.replay ?? this.record;
        if (!clock || clock.paused) {
            this.lastFrameAt = now;
            this.accumulatorMs = 0;
            return false;
        }
        if (this.lastFrameAt == null) {
            this.lastFrameAt = now;
            return false;
        }
        const delta = Math.max(0, Math.min(250, now - this.lastFrameAt));
        this.lastFrameAt = now;
        const speed = this.replay ? this.replay.speed : this.record!.playbackSpeed;
        this.accumulatorMs += delta * speed;
        let ticks = 0;
        while (this.accumulatorMs >= TICK_MS && ticks < MAX_TICKS_PER_FRAME) {
            this.accumulatorMs -= TICK_MS;
            const stop = this.advanceTick();
            ticks++;
            if (stop) break;
        }
        if (ticks > 0) this.markChanged();
        return ticks > 0;
    }

    startReplay(): Result<true, ConstructionErrorCode> {
        if (!this.record?.completed || !this.record.decisionEvents.length) {
            return fail('REPLAY_RECORD_INVALID', 'Finish a building before replaying its construction.');
        }
        this.replay = { phaseIndex: 0, phaseElapsedTicks: 0, paused: false, speed: 1 };
        this.status = 'replay';
        this.lastFrameAt = null;
        this.accumulatorMs = 0;
        this.markChanged();
        return { ok: true, value: true };
    }

    stopReplay(): Result<true, ConstructionErrorCode> {
        if (!this.replay) return fail('INVALID_STATE_TRANSITION', 'Replay is not active.');
        this.replay = null;
        this.status = 'completed';
        this.markChanged();
        return { ok: true, value: true };
    }

    abandon(): Result<true, ConstructionErrorCode> {
        if (!this.reservation || !this.record) return fail('RESERVATION_MISSING', 'No construction reservation exists.');
        this.tileMap.removeObjectAt(this.reservation.gx, this.reservation.gy);
        this.record = null;
        this.reservation = null;
        this.replay = null;
        this.selectedPlanId = null;
        this.siteConfirmed = false;
        this.status = 'idle';
        this.markChanged(true);
        return { ok: true, value: true };
    }

    restoreRecord(record: ConstructionRecord | null): Result<true, ConstructionErrorCode> {
        if (!record) {
            this.record = null;
            return { ok: true, value: true };
        }
        const plan = PLAN_INDEX[record.approvedPlanId];
        if (!plan || record.schemaVersion !== 1 || record.siteId !== FIXTURE.id) {
            return fail('REPLAY_RECORD_INVALID', 'The saved construction record is incompatible.');
        }
        const reservation = this.tileMap.objects.find((object) => object.id === record.reservationId);
        if (!reservation) return fail('RESERVATION_MISSING', 'The saved construction plot reservation is missing.');
        if (reservation.constructionId !== record.constructionId) {
            return fail('RESERVATION_CONFLICT', 'The construction plot belongs to a different record.');
        }
        this.record = structuredClone(record);
        this.reservation = reservation;
        this.selectedPlanId = record.approvedPlanId;
        this.siteConfirmed = true;
        this.status = record.completed
            ? 'completed'
            : (record.phaseIndex === 4 && record.decisionEvents.length === 0 ? 'awaiting-intervention' : 'building');
        this.markChanged();
        return { ok: true, value: true };
    }

    seedCompletedDemo(planId: PlanId = 'compact', optionId: OptionId = 'shade'): Result<true, ConstructionErrorCode> {
        if (this.status !== 'idle') return fail('INVALID_STATE_TRANSITION', 'A construction record already exists.');
        const site = this.confirmSite();
        if (!site.ok) return site;
        const selected = this.selectPlan(planId);
        if (!selected.ok) return selected;
        this.beginConstruction();
        const record = this.record!;
        record.decisionEvents = [{
            sequence: 1,
            phaseIndex: 4,
            decisionId: 'afternoon-heat',
            optionId,
        }];
        record.activeManifestId = `${planId}@1:afternoon-heat:${optionId}`;
        record.phaseIndex = PHASES.length - 1;
        record.phaseElapsedTicks = PHASES[PHASES.length - 1].ticks;
        this.completeBuilding();
        this.markChanged(true);
        return { ok: true, value: true };
    }

    private validateSite(): Result<true, ConstructionErrorCode> {
        for (let gy = FIXTURE.gy; gy < FIXTURE.gy + FIXTURE.d; gy++) {
            for (let gx = FIXTURE.gx; gx < FIXTURE.gx + FIXTURE.w; gx++) {
                if (!this.tileMap.inBounds(gx, gy)) return fail('SITE_INVALID', 'The authored riverside site is outside the city.');
                const object = this.tileMap.objectAt(gx, gy);
                const isPreservedPalm = gx === FIXTURE.palm.gx && gy === FIXTURE.palm.gy
                    && object?.assetId === 'date_palm';
                if (object && !isPreservedPalm) return fail('SITE_OCCUPIED', 'The riverside construction plot contains another object.', true, { gx, gy });
            }
        }
        for (let gx = FIXTURE.gx; gx < FIXTURE.gx + FIXTURE.w; gx++) {
            if (this.tileMap.getTerrain(gx, FIXTURE.waterSouthY) !== 'nile_water') {
                return fail('SITE_INVALID', 'The authored plot must face Nile water.', false, { gx, gy: FIXTURE.waterSouthY });
            }
        }
        for (let gy = FIXTURE.gy; gy < FIXTURE.gy + FIXTURE.d; gy++) {
            if (this.tileMap.getTerrain(FIXTURE.roadWestX, gy) !== 'sandstone_path') {
                return fail('SITE_INVALID', 'The authored plot must connect to the western sandstone road.', false, { gx: FIXTURE.roadWestX, gy });
            }
        }
        return { ok: true, value: true };
    }

    private advanceTick(): boolean {
        const clock = (this.replay ?? this.record)!;
        clock.phaseElapsedTicks++;
        if (clock.phaseElapsedTicks >= PHASES[clock.phaseIndex].ticks) this.completeCurrentPhase();
        return this.status !== 'building' && this.status !== 'replay';
    }

    private completeCurrentPhase(): void {
        const clock = (this.replay ?? this.record)!;
        clock.phaseElapsedTicks = 0;
        if (clock.phaseIndex >= PHASES.length - 1) {
            if (this.replay) {
                this.replay = null;
                this.status = 'completed';
            } else {
                this.completeBuilding();
            }
            return;
        }
        clock.phaseIndex++;
        if (!this.replay && clock.phaseIndex === 4 && this.record?.decisionEvents.length === 0) {
            this.status = 'awaiting-intervention';
            this.record.paused = true;
        }
        this.onMilestone?.();
    }

    private completeBuilding(): void {
        const record = this.record!;
        const reservation = this.reservation!;
        record.completed = true;
        record.phaseIndex = PHASES.length - 1;
        record.phaseElapsedTicks = PHASES[PHASES.length - 1].ticks;
        record.paused = true;
        record.buildingId = `bld-${reservation.id}`;
        reservation.kind = 'construction-complete';
        reservation.buildingId = record.buildingId;
        this.status = 'completed';
        this.tileMap.objectsVersion++;
        this.onMilestone?.();
    }

    private markChanged(milestone = false): void {
        this.revision++;
        this.renderSnapshot = this.buildRenderSnapshot();
        if (milestone) this.onMilestone?.();
        this.onChange?.();
    }

    private buildRenderSnapshot(): ConstructionRenderSnapshot {
        const plan = this.selectedPlanId ? PLAN_INDEX[this.selectedPlanId] : null;
        const activeClock = this.replay ?? this.record;
        const phaseIndex = activeClock ? activeClock.phaseIndex : -1;
        const elapsedTicks = activeClock ? activeClock.phaseElapsedTicks : 0;
        const progress = phaseIndex >= 0 && phaseIndex < PHASES.length
            ? clamp01(elapsedTicks / PHASES[phaseIndex].ticks)
            : 0;
        const groups: Array<{
            id: string;
            spriteId: ConstructionSpriteId;
            alpha: number;
            clipProgress: number;
            transform: { x: number; y: number; scale: number };
        }> = [];
        if (plan) {
            const origin = {
                x: FIXTURE.gx + plan.siteOffset.x,
                y: FIXTURE.gy + plan.siteOffset.y,
                scale: 1,
            };
            const option = this.record?.decisionEvents[0]?.optionId ?? null;
            const intervention = option ? plan.interventions.find((entry) => entry.id === option) : null;
            const replacement = intervention?.replaceSprites ?? {};
            const addGroup = (key: keyof PlanDefinition['phaseSprites'], alpha: number, clipProgress: number): void => {
                const base = plan.phaseSprites[key];
                groups.push({
                    id: `${plan.id}:${key}`,
                    spriteId: replacement[base] ?? base,
                    alpha,
                    clipProgress,
                    transform: origin,
                });
            };
            if (this.status === 'plan-selected' || this.status === 'site-confirmed') {
                for (const key of ['foundation', 'structure', 'enclosure', 'openings', 'roof', 'finish'] as const) addGroup(key, 0.28, 1);
            } else if (phaseIndex >= 0) {
                if (phaseIndex > 1) addGroup('foundation', 1, 1);
                else if (phaseIndex === 1) addGroup('foundation', 1, progress);
                if (phaseIndex > 2) addGroup('structure', 1, 1);
                else if (phaseIndex === 2) addGroup('structure', 1, progress);
                if (phaseIndex > 3) addGroup('enclosure', 1, 1);
                else if (phaseIndex === 3) addGroup('enclosure', 1, progress);
                if (phaseIndex > 4) {
                    addGroup('openings', 1, 1);
                    addGroup('roof', 1, 1);
                    addGroup('finish', 1, 1);
                } else if (phaseIndex === 4) {
                    addGroup('openings', 1, clamp01(progress * 3));
                    addGroup('roof', 1, clamp01(progress * 3 - 1));
                    addGroup('finish', 1, clamp01(progress * 3 - 2));
                }
                for (const id of intervention?.addSprites ?? []) {
                    groups.push({ id: `${plan.id}:intervention:${option}`, spriteId: id, alpha: 1, clipProgress: phaseIndex === 4 ? progress : 1, transform: origin });
                }
            }
        }

        const workers: ConstructionRenderSnapshot['workers'] = plan && phaseIndex >= 0 && phaseIndex <= 4
            ? Object.freeze([0, 1, 2, 3].map((index) => Object.freeze({
                id: `worker-${index + 1}`,
                x: FIXTURE.gx + 1.2 + index * 0.72 + Math.sin(elapsedTicks * 0.08 + index) * 0.12,
                y: FIXTURE.gy + 2.0 + (index % 2) * 1.2,
                pose: (phaseIndex === 2 ? 'climb' : phaseIndex === 1 ? 'carry' : 'place') as 'carry' | 'place' | 'climb',
            })))
            : Object.freeze([]);
        const cart = phaseIndex === 1
            ? Object.freeze({
                x: FIXTURE.roadWestX + clamp01(progress) * 1.1,
                y: 12,
                load: (progress < 0.65 ? 'stone' : 'empty') as 'stone' | 'empty',
            })
            : null;
        const dustCount = phaseIndex >= 0 && phaseIndex <= 4 ? (this.tileMap.width >= 40 ? 30 : 80) : 0;
        const dust = Object.freeze(Array.from({ length: dustCount }, (_, index) => Object.freeze({
            x: FIXTURE.gx + 0.5 + ((index * 37 + elapsedTicks) % 100) / 25,
            y: FIXTURE.gy + 0.5 + ((index * 61) % 100) / 25,
            age: (elapsedTicks + index * 7) % 30,
            seed: DETERMINISTIC_SEED + index,
        })));
        const scaffold = plan && phaseIndex >= 2 && phaseIndex <= 4
            ? Object.freeze([
                Object.freeze({ x1: FIXTURE.gx + 1, y1: FIXTURE.gy + 1, x2: FIXTURE.gx + 1 + plan.footprint.w, y2: FIXTURE.gy + 1, z: 5 }),
                Object.freeze({ x1: FIXTURE.gx + 1, y1: FIXTURE.gy + 1 + plan.footprint.d, x2: FIXTURE.gx + 1 + plan.footprint.w, y2: FIXTURE.gy + 1 + plan.footprint.d, z: 5 }),
            ])
            : Object.freeze([]);

        return Object.freeze({
            revision: this.revision,
            status: this.status,
            site: Object.freeze({ gx: FIXTURE.gx, gy: FIXTURE.gy, w: FIXTURE.w, d: FIXTURE.d }),
            planId: this.selectedPlanId,
            spriteGroups: Object.freeze(groups.map((group) => Object.freeze({ ...group, transform: Object.freeze(group.transform) }))),
            workers,
            cart,
            dust,
            scaffold,
            leaderLine: this.status === 'awaiting-intervention'
                ? Object.freeze({ gx: FIXTURE.gx + 2.5, gy: FIXTURE.gy + 3.5, z: 5 })
                : null,
            lightCues: this.record?.completed
                ? Object.freeze([Object.freeze({ gx: FIXTURE.gx + 2.5, gy: FIXTURE.gy + 3.5, z: 4, strength: 1 })])
                : Object.freeze([]),
        });
    }
}
