import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateV1ToV2, SaveSystem } from '../../src/storage/SaveSystem.js';

const KEY = 'pharos.save.v1';

class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    length = 0;
    throwQuota = false;

    clear(): void {
        this.values.clear();
        this.length = 0;
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(key);
        this.length = this.values.size;
    }

    setItem(key: string, value: string): void {
        if (this.throwQuota) throw new DOMException('full', 'QuotaExceededError');
        this.values.set(key, String(value));
        this.length = this.values.size;
    }
}

function installStorage(storage = new MemoryStorage()): MemoryStorage {
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
    return storage;
}

function mockWorld() {
    const tileMap = {
        restored: null as unknown,
        serialize: () => ({ width: 2, height: 2, terrain: ['fertile_silt', null, null, null], objects: [], nextId: 1 }),
        deserialize(value: unknown) { this.restored = value; },
    };
    const camera = { offsetX: 10, offsetY: 20, zoom: 1.2 };
    return { tileMap, camera };
}

test('pure v1 migration preserves city and adds empty construction sections', () => {
    const v1 = { v: 1, tileMap: { width: 2 }, camera: { zoom: 1 } };
    const before = structuredClone(v1);
    const result = migrateV1ToV2(v1);
    assert.equal(result.ok, true);
    if ('value' in result) {
        assert.equal(result.value.v, 2);
        assert.deepEqual(result.value.tileMap, v1.tileMap);
        assert.deepEqual(result.value.constructions, []);
        assert.deepEqual(result.value.buildingHistory, []);
    }
    assert.deepEqual(v1, before);
});

test('v1 load migrates and next save verifies v2', () => {
    const storage = installStorage();
    storage.setItem(KEY, JSON.stringify({
        v: 1,
        tileMap: { width: 2, height: 2, terrain: [], objects: [], nextId: 1 },
        camera: { offsetX: 3, offsetY: 4, zoom: 0.9 },
    }));
    const world = mockWorld();
    const loaded = SaveSystem.load(world.tileMap, world.camera);
    assert.equal(loaded.ok, true);
    if ('value' in loaded) {
        assert.equal(loaded.value.loaded, true);
        assert.equal(loaded.value.migrated, true);
    }
    assert.equal(world.camera.zoom, 0.9);
    const saved = SaveSystem.save(world.tileMap, world.camera, null, []);
    assert.equal(saved.ok, true);
    assert.equal(JSON.parse(storage.getItem(KEY) ?? '{}').v, 2);
    assert.equal(storage.getItem(`${KEY}.backup.v1`), null);
});

test('valid v2 keeps city while filtering invalid construction/history', () => {
    const storage = installStorage();
    storage.setItem(KEY, JSON.stringify({
        v: 2,
        tileMap: { width: 2, height: 2, terrain: [], objects: [], nextId: 1 },
        camera: null,
        constructions: [{ nonsense: true }],
        buildingHistory: [{ nope: true }],
    }));
    const world = mockWorld();
    const result = SaveSystem.load(world.tileMap, world.camera);
    assert.equal(result.ok, true);
    if ('value' in result) {
        assert.equal(result.value.loaded, true);
        assert.equal(result.value.constructionRecord, null);
        assert.deepEqual(result.value.buildingHistory, []);
    }
    assert.ok(world.tileMap.restored);
});

test('unknown version and corrupt JSON fail without deleting raw save', () => {
    const storage = installStorage();
    storage.setItem(KEY, JSON.stringify({ v: 99, tileMap: {} }));
    const world = mockWorld();
    const unknown = SaveSystem.load(world.tileMap, world.camera);
    assert.equal(unknown.ok, false);
    if ('code' in unknown) assert.equal(unknown.code, 'SAVE_VERSION_UNSUPPORTED');
    assert.ok(storage.getItem(KEY));

    storage.setItem(KEY, '{bad json');
    const corrupt = SaveSystem.load(world.tileMap, world.camera);
    assert.equal(corrupt.ok, false);
    if ('code' in corrupt) assert.equal(corrupt.code, 'SAVE_PARSE_FAILED');
    assert.equal(storage.getItem(`${KEY}.corrupt`), '{bad json');
});

test('quota errors return stable code and preserve prior data', () => {
    const storage = installStorage();
    storage.setItem(KEY, JSON.stringify({ v: 2, tileMap: {}, camera: null, constructions: [], buildingHistory: [] }));
    const prior = storage.getItem(KEY);
    storage.throwQuota = true;
    const world = mockWorld();
    const result = SaveSystem.save(world.tileMap, world.camera, null, []);
    assert.equal(result.ok, false);
    if ('code' in result) assert.equal(result.code, 'SAVE_QUOTA_EXCEEDED');
    assert.equal(storage.getItem(KEY), prior);
});
