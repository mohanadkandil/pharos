import test from 'node:test';
import assert from 'node:assert/strict';
import { ConstructionSystem, type ConstructionRecord } from '../../src/construction/ConstructionSystem.js';
import { FIXTURE, PHASES, type OptionId, type PlanId } from '../../src/construction/content.js';

type ObjectLike = {
    id: number;
    assetId: string | null;
    gx: number;
    gy: number;
    footprint: { w: number; d: number };
    constructionId?: string;
    renderStatic?: boolean;
    buildingId?: string | null;
    kind?: string;
    occupies?(gx: number, gy: number): boolean;
};

class MockTileMap {
    width = 18;
    height = 18;
    objects: ObjectLike[] = [];
    objectsVersion = 0;
    private next = 1;
    private terrain = new Map<string, string>();

    constructor() {
        for (let gy = 0; gy < this.height; gy++)
            for (let gx = 0; gx < this.width; gx++) this.terrain.set(`${gx},${gy}`, 'fertile_silt');
        for (let gy = FIXTURE.gy; gy < FIXTURE.gy + FIXTURE.d; gy++)
            this.terrain.set(`${FIXTURE.roadWestX},${gy}`, 'sandstone_path');
        for (let gx = FIXTURE.gx; gx < FIXTURE.gx + FIXTURE.w; gx++)
            this.terrain.set(`${gx},${FIXTURE.waterSouthY}`, 'nile_water');
        this.addObject({
            id: this.nextId(),
            assetId: 'date_palm',
            gx: FIXTURE.palm.gx,
            gy: FIXTURE.palm.gy,
            footprint: { w: 1, d: 1 },
        });
    }

    inBounds(gx: number, gy: number): boolean {
        return gx >= 0 && gy >= 0 && gx < this.width && gy < this.height;
    }

    getTerrain(gx: number, gy: number): string | null {
        return this.terrain.get(`${gx},${gy}`) ?? null;
    }

    setTerrain(gx: number, gy: number, id: string | null): void {
        if (id === null) this.terrain.delete(`${gx},${gy}`);
        else this.terrain.set(`${gx},${gy}`, id);
    }

    objectAt(gx: number, gy: number): ObjectLike | null {
        return this.objects.find((object) =>
            gx >= object.gx && gx < object.gx + object.footprint.w
            && gy >= object.gy && gy < object.gy + object.footprint.d) ?? null;
    }

    isFreeFor(gx: number, gy: number, w: number, d: number): boolean {
        for (let y = gy; y < gy + d; y++)
            for (let x = gx; x < gx + w; x++) if (!this.inBounds(x, y) || this.objectAt(x, y)) return false;
        return true;
    }

    nextId(): number { return this.next++; }

    addObject(object: ObjectLike): void {
        if (!object.occupies) {
            object.occupies = (gx, gy) => gx >= object.gx && gx < object.gx + object.footprint.w
                && gy >= object.gy && gy < object.gy + object.footprint.d;
        }
        this.objects.push(object);
        this.objectsVersion++;
    }

    removeObjectAt(gx: number, gy: number): ObjectLike | null {
        const object = this.objectAt(gx, gy);
        if (!object) return null;
        this.objects = this.objects.filter((candidate) => candidate !== object);
        this.objectsVersion++;
        return object;
    }
}

function startSystem(plan: 'compact' | 'courtyard' | 'colonnaded' = 'compact') {
    const tileMap = new MockTileMap();
    const system = new ConstructionSystem(tileMap);
    assert.equal(system.confirmSite().ok, true);
    assert.equal(system.selectPlan(plan).ok, true);
    assert.equal(system.beginConstruction().ok, true);
    return { tileMap, system };
}

test('confirm, select and begin create one non-static reservation', () => {
    const { tileMap, system } = startSystem();
    const record = system.getSerializableRecord();
    assert.ok(record);
    assert.equal(tileMap.objects.length, 2);
    const reservation = tileMap.objects.find((object) => object.id === record.reservationId);
    assert.equal(reservation?.kind, 'construction');
    assert.equal(reservation?.renderStatic, false);
    assert.equal(system.ownsCell(9, 11), true);
    assert.equal(system.getViewModel().status, 'building');
});

test('invalid command order returns stable code', () => {
    const system = new ConstructionSystem(new MockTileMap());
    const begin = system.beginConstruction();
    assert.equal(begin.ok, false);
    if (!begin.ok) assert.equal(begin.code, 'INVALID_STATE_TRANSITION');
    assert.equal(system.selectPlan('compact').ok, false);
    assert.equal(system.resolveIntervention('shade').ok, false);
    assert.equal(system.startReplay().ok, false);
});

test('all phases, intervention, completion and replay are deterministic', () => {
    const { system } = startSystem('compact');
    for (let phase = 0; phase < 4; phase++) assert.equal(system.skipToNextPhase().ok, true);
    assert.equal(system.getViewModel().status, 'awaiting-intervention');
    assert.equal(system.skipToNextPhase().ok, false);
    assert.equal(system.resolveIntervention('shade').ok, true);
    assert.equal(system.resolveIntervention('keep').ok, false);
    assert.equal(system.skipToNextPhase().ok, true);
    assert.equal(system.skipToNextPhase().ok, true);
    const completed = system.getViewModel();
    assert.equal(completed.status, 'completed');
    assert.equal(completed.record?.buildingId?.startsWith('bld-'), true);
    assert.equal(completed.record?.decisionEvents[0].optionId, 'shade');
    assert.equal(system.startReplay().ok, true);
    for (let phase = 0; phase < PHASES.length; phase++) assert.equal(system.skipToNextPhase().ok, true);
    assert.equal(system.getViewModel().status, 'completed');
});

test('fixed clock pauses while hidden and caps catch-up', () => {
    const { system } = startSystem();
    assert.equal(system.update(1000, true), false);
    assert.equal(system.update(2000, false), false);
    assert.equal(system.getViewModel().phase?.progress, 0);
    assert.equal(system.update(3000, true), false);
    assert.equal(system.update(4000, true), true);
    const progress = system.getViewModel().phase?.progress ?? 0;
    assert.equal(progress, 5 / PHASES[0].ticks);
    assert.equal(system.setPaused(true).ok, true);
    assert.equal(system.update(5000, true), false);
    assert.equal(system.setPaused(false).ok, true);
    assert.equal(system.setPlaybackSpeed(2).ok, true);

    const foundation = startSystem().system;
    assert.equal(foundation.skipToNextPhase().ok, true);
    let foundationNow = 0;
    foundation.update(foundationNow, true);
    for (let i = 0; i < 34; i++) {
        foundationNow += 250;
        foundation.update(foundationNow, true);
    }
    assert.equal(foundation.getRenderSnapshot().cart?.load, 'empty');
});

test('site validation preserves palm but rejects new obstruction', () => {
    const map = new MockTileMap();
    map.addObject({ id: map.nextId(), assetId: 'amphora', gx: 10, gy: 12, footprint: { w: 1, d: 1 } });
    const system = new ConstructionSystem(map);
    const result = system.confirmSite();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'SITE_OCCUPIED');
});

test('serialized record restores only with matching reservation', () => {
    const first = startSystem();
    const record = first.system.getSerializableRecord();
    assert.ok(record);

    const missing = new ConstructionSystem(new MockTileMap());
    const missingResult = missing.restoreRecord(record);
    assert.equal(missingResult.ok, false);
    if (!missingResult.ok) assert.equal(missingResult.code, 'RESERVATION_MISSING');

    const restored = new ConstructionSystem(first.tileMap);
    assert.equal(restored.restoreRecord(record).ok, true);
    assert.equal(restored.getViewModel().selectedPlanId, 'compact');
});

test('mobile demo seeds a completed replayable building', () => {
    const system = new ConstructionSystem(new MockTileMap());
    let completionMilestones = 0;
    system.setCallbacks({ onMilestone: () => completionMilestones++ });
    assert.equal(system.seedCompletedDemo('courtyard', 'courtyard').ok, true);
    assert.ok(completionMilestones > 0);
    assert.equal(system.getViewModel().status, 'completed');
    assert.equal(system.startReplay().ok, true);
    assert.equal(system.stopReplay().ok, true);
});

test('callbacks, reset, render snapshot and null record paths are stable', () => {
    const system = new ConstructionSystem(new MockTileMap());
    let changes = 0;
    let milestones = 0;
    system.setCallbacks({ onChange: () => changes++, onMilestone: () => milestones++ });
    assert.equal(system.getSerializableRecord(), null);
    assert.equal(system.update(1, true), false);
    assert.equal(system.getRenderSnapshot().status, 'idle');
    assert.equal(system.confirmSite().ok, true);
    assert.ok(changes > 0);
    assert.equal(system.selectPlan('compact').ok, true);
    assert.equal(system.beginConstruction().ok, true);
    assert.equal(system.skipToNextPhase().ok, true);
    assert.ok(milestones > 0);
    system.reset();
    assert.equal(system.getViewModel().status, 'idle');
    assert.equal(system.restoreRecord(null).ok, true);
    assert.ok(milestones >= 1);
});

test('command guards cover pause, speed, replay, abandon and duplicate site confirmation', () => {
    const system = new ConstructionSystem(new MockTileMap());
    assert.equal(system.setPaused(true).ok, false);
    assert.equal(system.setPlaybackSpeed(2).ok, false);
    assert.equal(system.stopReplay().ok, false);
    const emptyCallbacks = new ConstructionSystem(new MockTileMap());
    emptyCallbacks.setCallbacks({});
    assert.equal(emptyCallbacks.confirmSite().ok, true);
    assert.equal(system.abandon().ok, false);
    assert.equal(system.confirmSite().ok, true);
    assert.equal(system.confirmSite().ok, false);
});

test('begin rechecks footprint occupancy after plan selection', () => {
    const map = new MockTileMap();
    const system = new ConstructionSystem(map);
    assert.equal(system.selectPlan('invalid' as PlanId).ok, false);
    assert.equal(system.confirmSite().ok, true);
    assert.equal(system.selectPlan('compact').ok, true);
    map.addObject({ id: map.nextId(), assetId: 'amphora', gx: 9, gy: 11, footprint: { w: 1, d: 1 } });
    const result = system.beginConstruction();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'SITE_OCCUPIED');
});

test('site validation rejects bounds, missing water and missing road', () => {
    const outOfBounds = new MockTileMap();
    outOfBounds.width = 10;
    const boundsResult = new ConstructionSystem(outOfBounds).confirmSite();
    assert.equal(boundsResult.ok, false);
    if (!boundsResult.ok) assert.equal(boundsResult.code, 'SITE_INVALID');

    const noWater = new MockTileMap();
    noWater.setTerrain(FIXTURE.gx, FIXTURE.waterSouthY, 'fertile_silt');
    const waterResult = new ConstructionSystem(noWater).confirmSite();
    assert.equal(waterResult.ok, false);
    if (!waterResult.ok) assert.equal(waterResult.code, 'SITE_INVALID');

    const noRoad = new MockTileMap();
    noRoad.setTerrain(FIXTURE.roadWestX, FIXTURE.gy, 'fertile_silt');
    const roadResult = new ConstructionSystem(noRoad).confirmSite();
    assert.equal(roadResult.ok, false);
    if (!roadResult.ok) assert.equal(roadResult.code, 'SITE_INVALID');
});

test('invalid option, duplicate decision and successful abandon are explicit', () => {
    const { system } = startSystem('colonnaded');
    for (let phase = 0; phase < 4; phase++) assert.equal(system.skipToNextPhase().ok, true);
    const invalid = system.resolveIntervention('invalid' as OptionId);
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, 'PLAN_INVALID');
    assert.equal(system.resolveIntervention('keep').ok, true);
    assert.equal(system.resolveIntervention('shade').ok, false);
    assert.equal(system.abandon().ok, true);
    assert.equal(system.getViewModel().status, 'idle');
});

test('restore rejects incompatible and conflicting records and maps paused states', () => {
    const first = startSystem('compact');
    const record = first.system.getSerializableRecord();
    assert.ok(record);

    const incompatible = { ...record, schemaVersion: 9 } as unknown as ConstructionRecord;
    const invalid = new ConstructionSystem(first.tileMap).restoreRecord(incompatible);
    assert.equal(invalid.ok, false);
    if (!invalid.ok) assert.equal(invalid.code, 'REPLAY_RECORD_INVALID');

    const conflict = { ...record, constructionId: 'other' };
    const conflictResult = new ConstructionSystem(first.tileMap).restoreRecord(conflict);
    assert.equal(conflictResult.ok, false);
    if (!conflictResult.ok) assert.equal(conflictResult.code, 'RESERVATION_CONFLICT');

    const awaiting = { ...record, phaseIndex: 4, decisionEvents: [], paused: true };

    const completedRecord = { ...record, completed: true, buildingId: 'bld-2' };
    const completedSystem = new ConstructionSystem(first.tileMap);
    assert.equal(completedSystem.restoreRecord(completedRecord).ok, true);
    assert.equal(completedSystem.getViewModel().status, 'completed');
    const awaitingSystem = new ConstructionSystem(first.tileMap);
    assert.equal(awaitingSystem.restoreRecord(awaiting).ok, true);
    assert.equal(awaitingSystem.getViewModel().status, 'awaiting-intervention');

    const building = { ...record, phaseIndex: 2, decisionEvents: [], paused: false };
    const buildingSystem = new ConstructionSystem(first.tileMap);
    assert.equal(buildingSystem.restoreRecord(building).ok, true);
    assert.equal(buildingSystem.getViewModel().status, 'building');
});

test('replay speed branch and seed guards cover remaining public paths', () => {
    const system = new ConstructionSystem(new MockTileMap());
    assert.equal(system.seedCompletedDemo('colonnaded', 'keep').ok, true);
    assert.equal(system.seedCompletedDemo().ok, false);
    assert.equal(system.startReplay().ok, true);
    assert.equal(system.setPlaybackSpeed(2).ok, true);
    assert.equal(system.setPaused(true).ok, true);
    assert.equal(system.setPaused(false).ok, true);
    assert.equal(system.stopReplay().ok, true);
});

test('replay clock, large-world dust tier and seed failure branches are covered', () => {
    const largeMap = new MockTileMap();
    largeMap.width = 40;
    const system = new ConstructionSystem(largeMap);
    assert.equal(system.seedCompletedDemo('compact', 'shade').ok, true);
    assert.equal(system.startReplay().ok, true);
    assert.equal(system.setPlaybackSpeed(2).ok, true);
    assert.equal(system.getViewModel().playbackSpeed, 2);
    assert.equal(system.update(1000, true), false);
    assert.equal(system.update(1250, true), true);
    assert.equal(system.getRenderSnapshot().dust.length, 30);

    const blocked = new MockTileMap();
    blocked.addObject({ id: blocked.nextId(), assetId: 'amphora', gx: 10, gy: 12, footprint: { w: 1, d: 1 } });
    const blockedSeed = new ConstructionSystem(blocked).seedCompletedDemo();
    assert.equal(blockedSeed.ok, false);

    const invalidPlan = new ConstructionSystem(new MockTileMap()).seedCompletedDemo('invalid' as PlanId, 'shade');
    assert.equal(invalidPlan.ok, false);
});

test('natural tick completion enters and stops at intervention', () => {
    const { system } = startSystem();
    let now = 0;
    system.update(now, true);
    while (system.getViewModel().status === 'building' && system.getViewModel().phaseIndex < 4) {
        now += 250;
        system.update(now, true);
    }
    assert.equal(system.getViewModel().status, 'awaiting-intervention');
});
