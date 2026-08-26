/**
 * Versioned localStorage persistence. City data is validated/loaded separately
 * from construction history so one bad build can never discard the world.
 */

import { CONFIG } from '../config.js';
import { PlacedObject } from '../building/PlacedObject.js';

const KEY = CONFIG.storageKey;
const BACKUP_KEY = `${KEY}.backup.v1`;
let pendingV1Raw = null;

const success = value => ({ ok: true, value });
const failure = (code, message, recoverable = true, details) => ({
    ok: false, code, recoverable, message, details,
});

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function migrateV1ToV2(data) {
    if (!isRecord(data) || data.v !== 1 || !isRecord(data.tileMap)) {
        return failure('SAVE_PARSE_FAILED', 'This city save is not a valid v1 record.', false);
    }
    return success({
        v: 2,
        productBrand: 'HYPATIA',
        tileMap: data.tileMap,
        camera: isRecord(data.camera) ? data.camera : null,
        constructions: [],
        buildingHistory: [],
    });
}

function validateV2(data) {
    if (!isRecord(data) || data.v !== 2 || !isRecord(data.tileMap)) {
        return failure('SAVE_PARSE_FAILED', 'This city save is not a valid HYPATIA record.', false);
    }
    const constructions = Array.isArray(data.constructions)
        ? data.constructions.filter(item =>
            isRecord(item)
            && item.schemaVersion === 1
            && typeof item.constructionId === 'string'
            && typeof item.approvedPlanId === 'string')
        : [];
    const buildingHistory = Array.isArray(data.buildingHistory)
        ? data.buildingHistory.filter(item => isRecord(item) && typeof item.buildingId === 'string')
        : [];
    return success({
        v: 2,
        productBrand: 'HYPATIA',
        tileMap: data.tileMap,
        camera: isRecord(data.camera) ? data.camera : null,
        constructions,
        buildingHistory,
    });
}

export const SaveSystem = {
    save(tileMap, camera, constructionRecord = null, buildingHistory = []) {
        const payload = {
            v: 2,
            productBrand: 'HYPATIA',
            tileMap: tileMap.serialize(),
            camera: {
                offsetX: camera.offsetX,
                offsetY: camera.offsetY,
                zoom: camera.zoom,
            },
            constructions: constructionRecord ? [constructionRecord] : [],
            buildingHistory,
        };
        try {
            if (pendingV1Raw !== null && localStorage.getItem(BACKUP_KEY) === null) {
                localStorage.setItem(BACKUP_KEY, pendingV1Raw);
            }
            const serialized = JSON.stringify(payload);
            localStorage.setItem(KEY, serialized);
            const verify = validateV2(JSON.parse(localStorage.getItem(KEY)));
            if (!verify.ok) return verify;
            if (pendingV1Raw !== null) {
                localStorage.removeItem(BACKUP_KEY);
                pendingV1Raw = null;
            }
            return success(true);
        } catch (error) {
            const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
            return failure(
                quota ? 'SAVE_QUOTA_EXCEEDED' : 'SAVE_PARSE_FAILED',
                quota ? 'Storage is full. Your city remains open but is not saved.' : 'The city could not be saved.',
                true,
                error,
            );
        }
    },

    load(tileMap, camera) {
        let raw;
        try {
            raw = localStorage.getItem(KEY);
            if (!raw) return success({ loaded: false, constructionRecord: null, buildingHistory: [], migrated: false });
            const parsed = JSON.parse(raw);
            let validated;
            let migrated = false;
            if (parsed?.v === 1) {
                validated = migrateV1ToV2(parsed);
                migrated = true;
                pendingV1Raw = raw;
            } else if (parsed?.v === 2) {
                validated = validateV2(parsed);
            } else {
                return failure('SAVE_VERSION_UNSUPPORTED', 'This save was created by an unsupported version.', false);
            }
            if (!validated.ok) return validated;
            const data = validated.value;
            tileMap.deserialize(data.tileMap, value => new PlacedObject(value));
            if (data.camera) {
                camera.offsetX = Number.isFinite(data.camera.offsetX) ? data.camera.offsetX : camera.offsetX;
                camera.offsetY = Number.isFinite(data.camera.offsetY) ? data.camera.offsetY : camera.offsetY;
                camera.zoom = Number.isFinite(data.camera.zoom) ? data.camera.zoom : camera.zoom;
            }
            return success({
                loaded: true,
                constructionRecord: data.constructions[0] ?? null,
                buildingHistory: data.buildingHistory,
                migrated,
            });
        } catch (error) {
            if (raw) {
                try { localStorage.setItem(`${KEY}.corrupt`, raw); } catch {}
            }
            return failure('SAVE_PARSE_FAILED', 'The saved city could not be read. A recovery copy was preserved.', true, error);
        }
    },

    clear() {
        try {
            localStorage.removeItem(KEY);
            localStorage.removeItem(BACKUP_KEY);
            localStorage.removeItem(`${KEY}.corrupt`);
            pendingV1Raw = null;
        } catch { /* private mode */ }
    },
};
