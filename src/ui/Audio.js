/**
 * Synthesized UI sound effects — no audio files anywhere.
 *
 * Every cue is built live from oscillators, filtered noise, and short
 * gain envelopes on a lazily-created AudioContext. Browsers gate audio
 * behind a user gesture, so loadUiAudio() registers one-time gesture
 * listeners that create/resume the context; until then every play call
 * is a silent no-op.
 */

const MASTER_LEVEL = 0.3;
const DEBOUNCE_MS = 60;

let _ctx = null;
let _master = null;
let _noiseBuffer = null;
let _initialized = false;

const _lastPlay = new Map();

function unlock() {
    if (!_ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        try {
            _ctx = new Ctx();
            _master = _ctx.createGain();
            _master.gain.value = MASTER_LEVEL;
            _master.connect(_ctx.destination);
        } catch {
            _ctx = null;
            return;
        }
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    if (_ctx.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
    }
}

/**
 * Idempotent init. Cheap: just wires the gesture listeners that will
 * spin the AudioContext up on the first pointerdown / keydown.
 */
export function loadUiAudio() {
    if (_initialized) return;
    _initialized = true;
    if (typeof window === 'undefined') return;
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
}

function ready(key) {
    if (!_ctx || _ctx.state !== 'running') {
        if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
        return false;
    }
    const now = performance.now();
    const last = _lastPlay.get(key) ?? -Infinity;
    if (now - last < DEBOUNCE_MS) return false;
    _lastPlay.set(key, now);
    return true;
}

function noiseBuffer() {
    if (_noiseBuffer) return _noiseBuffer;
    const len = Math.floor(_ctx.sampleRate * 0.3);
    const buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    _noiseBuffer = buf;
    return buf;
}

/** Gain node with an attack/decay envelope, pre-wired to the master bus. */
function envelope(peak, attack, duration) {
    const t0 = _ctx.currentTime;
    const g = _ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    g.connect(_master);
    return g;
}

/** One oscillator with an optional pitch glide, auto-stopped. */
function tone(type, f0, f1, duration, gainNode) {
    const t0 = _ctx.currentTime;
    const osc = _ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + duration);
    osc.connect(gainNode);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
}

/** Filtered noise burst, auto-stopped. Sweep moves the filter cutoff. */
function noise(filterType, freq0, freq1, q, duration, gainNode) {
    const t0 = _ctx.currentTime;
    const src = _ctx.createBufferSource();
    src.buffer = noiseBuffer();
    const filter = _ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq0, t0);
    if (freq1 && freq1 !== freq0) {
        filter.frequency.exponentialRampToValueAtTime(freq1, t0 + duration);
    }
    filter.Q.value = q;
    src.connect(filter).connect(gainNode);
    src.start(t0);
    src.stop(t0 + duration + 0.02);
}

/* ── Per-category placement cues ────────────────────────────────── */

function terrainThud() {
    noise('lowpass', 320, 140, 0.8, 0.11, envelope(0.7, 0.004, 0.11));
    tone('sine', 95, 58, 0.13, envelope(0.55, 0.004, 0.13));
}

function buildingClack() {
    tone('sine', 430, 380, 0.06, envelope(0.5, 0.002, 0.06));
    tone('sine', 476, 410, 0.05, envelope(0.4, 0.002, 0.05));
    noise('highpass', 2400, 2400, 1.2, 0.035, envelope(0.3, 0.001, 0.035));
    tone('sine', 120, 80, 0.09, envelope(0.35, 0.003, 0.09));
}

function natureSwish() {
    noise('bandpass', 750, 2400, 1.6, 0.18, envelope(0.5, 0.03, 0.18));
}

function waterPlip() {
    tone('sine', 880, 290, 0.1, envelope(0.5, 0.003, 0.1));
    noise('bandpass', 1800, 900, 2.0, 0.12, envelope(0.28, 0.015, 0.12));
}

function propKnock() {
    tone('triangle', 225, 180, 0.06, envelope(0.55, 0.002, 0.06));
    tone('triangle', 335, 280, 0.045, envelope(0.35, 0.002, 0.045));
    noise('lowpass', 900, 500, 1.0, 0.04, envelope(0.3, 0.001, 0.04));
}

const PLACEMENT_SOUNDS = {
    terrain: terrainThud,
    nature: natureSwish,
    props: propKnock,
    water: waterPlip,
    buildings: buildingClack,
};

/* ── Public API ─────────────────────────────────────────────────── */

/** Placement cue keyed by asset category; unknown categories thud. */
export function playPlacement(category) {
    const key = `place:${category}`;
    if (!ready(key)) return;
    try {
        (PLACEMENT_SOUNDS[category] ?? terrainThud)();
    } catch { /* sound failures never break the UI */ }
}

/** Reverse swoosh: rising bandpass noise that snips off. */
export function playErase() {
    if (!ready('erase')) return;
    try {
        noise('bandpass', 500, 2600, 1.4, 0.13, envelope(0.45, 0.06, 0.14));
        tone('sine', 210, 340, 0.1, envelope(0.2, 0.03, 0.1));
    } catch { /* non-fatal */ }
}

/** Short, dry tick for buttons and tabs. */
export function playUiClick() {
    if (!ready('ui')) return;
    try {
        tone('square', 1750, 1400, 0.028, envelope(0.22, 0.001, 0.028));
        noise('highpass', 3200, 3200, 1.0, 0.02, envelope(0.12, 0.001, 0.02));
    } catch { /* non-fatal */ }
}
