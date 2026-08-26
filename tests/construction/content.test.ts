import test from 'node:test';
import assert from 'node:assert/strict';
import {
    FIXTURE,
    PHASES,
    PLANS,
    SPRITE_DEFINITIONS,
    validateContent,
    type PhaseDefinition,
    type PlanDefinition,
    type SiteFixture,
    type Voxel,
} from '../../src/construction/content.js';

test('default authored registry is valid and fixture is exact', () => {
    assert.deepEqual(FIXTURE, {
        id: 'riverside-fixture-01',
        gx: 8,
        gy: 10,
        w: 5,
        d: 5,
        waterSouthY: 15,
        roadWestX: 7,
        palm: { gx: 8, gy: 10 },
        cartIngress: [{ gx: 7, gy: 12 }, { gx: 8, gy: 12 }],
    });
    assert.deepEqual(validateContent(), { ok: true, value: true });
});

test('every plan has distinct tags, fits, and owns three interventions', () => {
    for (const plan of PLANS) {
        assert.equal(plan.tags.length, 3);
        assert.equal(new Set(plan.tags).size, 3);
        assert.equal(plan.interventions.length, 3);
        assert.ok(plan.siteOffset.x + plan.footprint.w <= FIXTURE.w);
        assert.ok(plan.siteOffset.y + plan.footprint.d <= FIXTURE.d);
    }
});

test('missing referenced sprite fails closed', () => {
    const sprites = { ...SPRITE_DEFINITIONS };
    delete sprites[PLANS[0].phaseSprites.foundation];
    const result = validateContent(PLANS, sprites);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'SPRITE_MISSING');
});

test('duplicate plan id and invalid tags are rejected', () => {
    const duplicate = [...PLANS, PLANS[0]];
    const duplicateResult = validateContent(duplicate, SPRITE_DEFINITIONS);
    assert.equal(duplicateResult.ok, false);
    if (!duplicateResult.ok) assert.equal(duplicateResult.code, 'DUPLICATE_PLAN_ID');

    const broken = structuredClone(PLANS[0]) as unknown as PlanDefinition;
    const brokenPlan = { ...broken, tags: ['same', 'same', 'same'] } as unknown as PlanDefinition;
    const tagResult = validateContent([brokenPlan], SPRITE_DEFINITIONS);
    assert.equal(tagResult.ok, false);
    if (!tagResult.ok) assert.equal(tagResult.code, 'INVALID_TAGS');
});

test('out-of-bounds and duplicate voxels are rejected', () => {
    const plan = PLANS[0];
    const spriteId = plan.phaseSprites.foundation;
    const outOfBounds: Voxel = { x: 999, y: 0, z: 0, c: '#fff' };
    const sprites = { ...SPRITE_DEFINITIONS, [spriteId]: [outOfBounds] };
    const boundsResult = validateContent([plan], sprites);
    assert.equal(boundsResult.ok, false);
    if (!boundsResult.ok) assert.equal(boundsResult.code, 'VOXEL_OUT_OF_BOUNDS');

    const voxel: Voxel = { x: 0, y: 0, z: 0, c: '#fff' };
    const duplicates = { ...SPRITE_DEFINITIONS, [spriteId]: [voxel, voxel] };
    const duplicateResult = validateContent([plan], duplicates);
    assert.equal(duplicateResult.ok, false);
    if (!duplicateResult.ok) assert.equal(duplicateResult.code, 'DUPLICATE_VOXEL');
});

test('fixture, phase, offset and intervention invariants fail closed', () => {
    const fixture = { ...FIXTURE, gx: 9 } as SiteFixture;
    const fixtureResult = validateContent(PLANS, SPRITE_DEFINITIONS, { fixture });
    assert.equal(fixtureResult.ok, false);
    if (!fixtureResult.ok) assert.equal(fixtureResult.code, 'FIXTURE_INVALID');

    const phases = PHASES.map((phase, index) =>
        index === 0 ? { ...phase, ticks: 0 } : phase) as readonly PhaseDefinition[];
    const phaseResult = validateContent(PLANS, SPRITE_DEFINITIONS, { phases });
    assert.equal(phaseResult.ok, false);
    if (!phaseResult.ok) assert.equal(phaseResult.code, 'PHASE_INVALID');

    const offsetPlan = { ...structuredClone(PLANS[0]), siteOffset: { x: -1, y: 0 } } as PlanDefinition;
    const offsetResult = validateContent([offsetPlan], SPRITE_DEFINITIONS);
    assert.equal(offsetResult.ok, false);
    if (!offsetResult.ok) assert.equal(offsetResult.code, 'FIXTURE_INVALID');

    const interventions = [...PLANS[0].interventions] as [
        PlanDefinition['interventions'][0],
        PlanDefinition['interventions'][1],
        PlanDefinition['interventions'][2],
    ];
    interventions[2] = interventions[0];
    const branchPlan = { ...structuredClone(PLANS[0]), interventions } as PlanDefinition;
    const branchResult = validateContent([branchPlan], SPRITE_DEFINITIONS);
    assert.equal(branchResult.ok, false);
    if (!branchResult.ok) assert.equal(branchResult.code, 'INTERVENTION_INVALID');
});

test('invalid voxel scalar data is rejected', () => {
    const plan = PLANS[0];
    const spriteId = plan.phaseSprites.foundation;
    const invalid = { x: 0.5, y: 0, z: 0, c: '#fff' } as Voxel;
    const sprites = { ...SPRITE_DEFINITIONS, [spriteId]: [invalid] };
    const result = validateContent([plan], sprites);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'VOXEL_INVALID');
});
