const errors = require('@tryghost/errors');
const {serviceLimits} = require('./video-job-budget');

// Minimal validation of a video job's `payload` (front repo
// docs/planning/video-job-runner-plan.md §4, §7). Ghost only refuses what must
// never reach the worker: an unknown template, oversized input, a talking face
// without consent, and a job whose cost estimate is over the cap. The worker
// re-validates each template's props with its own schema before rendering.
//
// Every limit is an env value so it can be tuned per tenant without a release.

const ASSET_ID = /^[a-f0-9]{24}$/;
const KEY = /^[A-Za-z0-9_-]{1,64}$/;
const SLUG = /^[a-z0-9_-]{1,50}$/;
const ASPECTS = ['9:16', '16:9', '1:1'];
const PLACEMENTS = ['bottom-left', 'bottom-right', 'center', 'none'];
const VOICE_PROVIDERS = ['qwen'];
const MAX_PAYLOAD_BYTES = 200000;

// An unset OR empty variable (`VIDEO_JOB_MAX_COST_USD=` in an env file) means the
// default: Number('') is 0, which would turn every limit into 0.
const envNumber = (name, fallback) => {
    const raw = process.env[name];
    if (raw === undefined || String(raw).trim() === '') {
        return fallback;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const limits = () => ({
    templateIds: String(process.env.VIDEO_JOB_TEMPLATE_IDS || 'intro,memories')
        .split(',').map(id => id.trim()).filter(Boolean),
    maxScenes: envNumber('VIDEO_JOB_MAX_SCENES', 30),
    maxLines: envNumber('VIDEO_JOB_MAX_LINES', 40),
    maxFaceLines: envNumber('VIDEO_JOB_MAX_FACE_LINES', 20),
    maxLineChars: envNumber('VIDEO_JOB_MAX_LINE_CHARS', 300),
    // Cost estimate (USD). The rates are placeholders until a real Wan3 call is
    // measured (plan §9.2); the cap is the plan's recommended 3 USD. The face is
    // billed by the SECOND of speech it lip-syncs (the worker sends the voice in
    // 12-15 second chunks, not line by line), so its rate is per second — the
    // same env name as the worker's.
    maxCostUsd: envNumber('VIDEO_JOB_MAX_COST_USD', 3),
    voiceLineCostUsd: envNumber('VIDEO_JOB_VOICE_LINE_COST_USD', 0.002),
    faceSecondCostUsd: envNumber('VIDEO_JOB_FACE_SECOND_COST_USD', 0.02),
    faceEnabled: String(process.env.VIDEO_JOB_FACE_ENABLED || '').toLowerCase() === 'true'
});

const fail = (message, code = 'VIDEO_JOB_INVALID_PAYLOAD') => {
    throw new errors.ValidationError({message, code});
};

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const optionalText = (value, field, max) => {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== 'string' || value.length > max) {
        fail(`${field} must be a string of at most ${max} characters.`);
    }
    return value;
};

const optionalAssetId = (value, field) => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    if (typeof value !== 'string' || !ASSET_ID.test(value)) {
        fail(`${field} must be a gallery asset id.`);
    }
    return value;
};

const uniqueKeys = (list, field) => {
    const keys = new Set();
    list.forEach((entry, index) => {
        if (!isObject(entry)) {
            fail(`${field}[${index}] must be an object.`);
        }
        if (typeof entry.key !== 'string' || !KEY.test(entry.key)) {
            fail(`${field}[${index}].key must be 1-64 letters, digits, '-' or '_'.`);
        }
        if (keys.has(entry.key)) {
            fail(`${field}[${index}].key is duplicated: ${entry.key}`);
        }
        keys.add(entry.key);
    });
    return keys;
};

const lipsyncLines = (payload) => {
    const avatar = payload.avatar;
    if (!isObject(avatar) || avatar.lipsync !== true || !Array.isArray(payload.lines)) {
        return [];
    }
    return payload.lines;
};

// At add time the voice is not made yet, so its length is estimated from the
// text: characters per second of speech at tempo 1, by language (rough, on the
// generous side so the estimate stays an upper bound). Japanese ~7 (kana and
// kanji mixed), Chinese ~4.5, Korean ~6, anything else (Latin script,
// spaces and punctuation counted) ~14. A slower tempo means more seconds.
const CHARS_PER_SECOND = {ja: 7, zh: 4.5, ko: 6};
const DEFAULT_CHARS_PER_SECOND = 14;

const charsPerSecond = (lang) => {
    const base = String(lang || '').toLowerCase().split(/[-_]/)[0];
    return CHARS_PER_SECOND[base] || DEFAULT_CHARS_PER_SECOND;
};

const lineSeconds = (line, rate) => (isObject(line) && typeof line.text === 'string' ? [...line.text.trim()].length / rate : 0);

const speechRate = (payload) => {
    const tempo = isObject(payload.voice) && typeof payload.voice.tempo === 'number' && payload.voice.tempo > 0
        ? payload.voice.tempo
        : 1;
    return charsPerSecond(payload.lang) * tempo;
};

// The length of the finished video, as the worker lays it out (front
// tools/video-worker/src/templates.js sceneSeconds): each scene lasts
// max(its lines' speech + 0.6 s, time to read its title and body, 3 s), at most
// 60 s; the video is the sum of its scenes. Speech is estimated from the text.
const SCENE_GAP_SECONDS = 0.6;
const MIN_SCENE_SECONDS = 3;
const MAX_SCENE_SECONDS = 60;
const readingSeconds = scene => ([...`${scene.title || ''}${scene.body || ''}`.replace(/\s+/g, '')].length * 0.12) + 1.5;

/**
 * Estimated length of the video in whole seconds (rounded up).
 * @param {object} payload
 */
const videoSeconds = (payload) => {
    if (!isObject(payload) || !Array.isArray(payload.scenes)) {
        return 0;
    }
    const rate = speechRate(payload);
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const total = payload.scenes.reduce((sum, scene) => {
        if (!isObject(scene)) {
            return sum;
        }
        const spoken = lines.filter(line => isObject(line) && line.scene_key === scene.key)
            .reduce((acc, line) => acc + lineSeconds(line, rate), 0);
        const seconds = Math.max(spoken > 0 ? spoken + SCENE_GAP_SECONDS : 0, readingSeconds(scene), MIN_SCENE_SECONDS);
        return sum + Math.min(MAX_SCENE_SECONDS, seconds);
    }, 0);
    return Math.ceil(Math.round(total * 10) / 10);
};

/**
 * Estimated seconds of speech to lip-sync (whole seconds, rounded up).
 * @param {object} payload
 */
const faceSeconds = (payload) => {
    const lines = lipsyncLines(payload);
    if (!lines.length) {
        return 0;
    }
    const rate = speechRate(payload);
    const chars = lines.reduce((sum, line) => sum + (isObject(line) && typeof line.text === 'string' ? [...line.text.trim()].length : 0), 0);
    return Math.ceil(chars / rate);
};

// The estimate is what the job WOULD cost if nothing were cached (the worker
// skips cached lines, so the real cost is at most this).
const estimate = (payload) => {
    const cfg = limits();
    const lines = isObject(payload) && Array.isArray(payload.lines) ? payload.lines.length : 0;
    const faceLines = isObject(payload) ? lipsyncLines(payload).length : 0;
    const seconds = isObject(payload) ? faceSeconds(payload) : 0;
    const cost = (lines * cfg.voiceLineCostUsd) + (seconds * cfg.faceSecondCostUsd);
    return {
        voice_lines: lines,
        face_lines: faceLines,
        face_seconds: seconds,
        video_seconds: videoSeconds(payload),
        cost_usd: Math.round(cost * 10000) / 10000,
        max_cost_usd: cfg.maxCostUsd
    };
};

/**
 * Validates the payload shape. Database checks (consent, base job) are done by
 * the endpoint with the ids this returns.
 *
 * @param {unknown} payload
 * @returns {{payload: object, consentId: string|null, photoAssetId: string|null, lipsync: boolean, baseJobId: string|null, assetIds: string[], estimate: object}}
 */
const validateVideoJobPayload = (payload) => {
    const cfg = limits();
    if (!isObject(payload)) {
        fail('payload must be an object.');
    }
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_PAYLOAD_BYTES) {
        fail(`payload must be at most ${MAX_PAYLOAD_BYTES} bytes.`);
    }

    if (typeof payload.template_id !== 'string' || !cfg.templateIds.includes(payload.template_id)) {
        fail('template_id is not an allowed template.', 'VIDEO_JOB_UNKNOWN_TEMPLATE');
    }
    if (payload.template_version !== undefined
        && (!Number.isSafeInteger(payload.template_version) || payload.template_version < 1)) {
        fail('template_version must be a positive integer.');
    }
    if (payload.aspect !== undefined && !ASPECTS.includes(payload.aspect)) {
        fail(`aspect must be one of ${ASPECTS.join(', ')}.`);
    }
    optionalText(payload.lang, 'lang', 16);

    if (!Array.isArray(payload.scenes) || payload.scenes.length < 1 || payload.scenes.length > cfg.maxScenes) {
        fail(`scenes must have 1-${cfg.maxScenes} entries.`, 'VIDEO_JOB_TOO_LARGE');
    }
    const sceneKeys = uniqueKeys(payload.scenes, 'scenes');
    const sceneAssetIds = [];
    payload.scenes.forEach((scene, index) => {
        const imageAssetId = optionalAssetId(scene.image_asset_id, `scenes[${index}].image_asset_id`);
        if (imageAssetId) {
            sceneAssetIds.push(imageAssetId);
        }
        optionalText(scene.kicker, `scenes[${index}].kicker`, 100);
        optionalText(scene.title, `scenes[${index}].title`, 200);
        optionalText(scene.body, `scenes[${index}].body`, 1000);
        if (scene.pan !== undefined && (typeof scene.pan !== 'number' || !Number.isFinite(scene.pan) || Math.abs(scene.pan) > 1)) {
            fail(`scenes[${index}].pan must be a number between -1 and 1.`);
        }
    });

    const lines = payload.lines === undefined ? [] : payload.lines;
    if (!Array.isArray(lines) || lines.length > cfg.maxLines) {
        fail(`lines must have at most ${cfg.maxLines} entries.`, 'VIDEO_JOB_TOO_LARGE');
    }
    uniqueKeys(lines, 'lines');
    lines.forEach((line, index) => {
        if (typeof line.scene_key !== 'string' || !sceneKeys.has(line.scene_key)) {
            fail(`lines[${index}].scene_key must name a scene.`);
        }
        if (typeof line.text !== 'string' || !line.text.trim() || line.text.length > cfg.maxLineChars) {
            // A line is one voice clip and at most one 15-second face clip; long
            // text is refused so the person splits it (the runner never cuts it).
            fail(`lines[${index}].text must be 1-${cfg.maxLineChars} characters. Split long lines.`, 'VIDEO_JOB_LINE_TOO_LONG');
        }
    });

    if (payload.voice !== undefined && payload.voice !== null) {
        if (!isObject(payload.voice)) {
            fail('voice must be an object.');
        }
        if (payload.voice.provider !== undefined && !VOICE_PROVIDERS.includes(payload.voice.provider)) {
            fail(`voice.provider must be one of ${VOICE_PROVIDERS.join(', ')}.`);
        }
        optionalText(payload.voice.voice, 'voice.voice', 100);
        const tempo = payload.voice.tempo;
        if (tempo !== undefined && (typeof tempo !== 'number' || tempo < 0.5 || tempo > 2)) {
            fail('voice.tempo must be a number between 0.5 and 2.');
        }
    }

    // avatar: absent / null = no presenter at all. With a photo it may be a still
    // presenter (lipsync false) or a talking face (lipsync true). `motion` is the
    // presenter's movement preset, chosen by the screen (a slug, not free code).
    let consentId = null;
    let photoAssetId = null;
    let lipsync = false;
    if (payload.avatar !== undefined && payload.avatar !== null) {
        const avatar = payload.avatar;
        if (!isObject(avatar)) {
            fail('avatar must be an object or null.');
        }
        photoAssetId = optionalAssetId(avatar.photo_asset_id, 'avatar.photo_asset_id');
        consentId = optionalAssetId(avatar.consent_id, 'avatar.consent_id');
        if (avatar.placement !== undefined && !PLACEMENTS.includes(avatar.placement)) {
            fail(`avatar.placement must be one of ${PLACEMENTS.join(', ')}.`);
        }
        if (avatar.motion !== undefined && avatar.motion !== null
            && (typeof avatar.motion !== 'string' || !SLUG.test(avatar.motion))) {
            fail('avatar.motion must be a preset name.');
        }
        if (avatar.lipsync !== undefined && typeof avatar.lipsync !== 'boolean') {
            fail('avatar.lipsync must be true or false.');
        }
        lipsync = avatar.lipsync === true;
        if (lipsync) {
            if (!cfg.faceEnabled) {
                fail('Talking-face video is not enabled.', 'VIDEO_JOB_FACE_DISABLED');
            }
            if (!photoAssetId) {
                fail('avatar.photo_asset_id is required for lipsync.');
            }
            if (!consentId) {
                fail('avatar.consent_id is required for lipsync.', 'VIDEO_JOB_CONSENT_REQUIRED');
            }
            if (lines.length < 1) {
                fail('lipsync needs at least one line.');
            }
            if (lines.length > cfg.maxFaceLines) {
                fail(`A talking-face job may have at most ${cfg.maxFaceLines} lines.`, 'VIDEO_JOB_TOO_LARGE');
            }
        }
    }

    const baseJobId = optionalAssetId(payload.base_job_id, 'base_job_id');

    const cost = estimate(payload);
    const maxVideoSeconds = serviceLimits().maxVideoSeconds;
    if (cost.video_seconds > maxVideoSeconds) {
        fail(`The video would be about ${cost.video_seconds} seconds; at most ${maxVideoSeconds} seconds are allowed.`, 'VIDEO_JOB_TOO_LONG');
    }
    if (cost.cost_usd > cfg.maxCostUsd) {
        fail(`Estimated cost ${cost.cost_usd} USD is over the limit of ${cfg.maxCostUsd} USD.`, 'VIDEO_JOB_BUDGET_EXCEEDED');
    }

    // Every gallery asset the worker will read. The endpoint checks that the
    // creator may use each one (utils/video-asset-access.js), lipsync or not.
    const assetIds = [...new Set([...sceneAssetIds, photoAssetId].filter(Boolean))];

    return {payload, consentId, photoAssetId, lipsync, baseJobId, assetIds, estimate: cost};
};

module.exports = {
    validateVideoJobPayload,
    estimate,
    faceSeconds,
    videoSeconds,
    limits
};
