const errors = require('@tryghost/errors');
const moment = require('moment-timezone');

// The tenant's monthly video budget (front repo docs/planning/video-job-runner-plan.md
// §7.1: 30 USD a month by default). One Ghost is one tenant, so the month total
// is the sum over every video job of this database.
//
// Amounts are kept in micro-USD integers (1 USD = 1,000,000) so sums never pick
// up float noise (0.1 + 0.2). The API speaks USD.
//
// Each job carries:
//   cost_month            'YYYY-MM' in the SITE timezone (settings `timezone`),
//                         the month the job's cost counts in
//   cost_estimate_micros  the add-time estimate (cache ignored, an upper bound)
//   cost_reserved_micros  the job's hold: the estimate at add, then whatever
//                         total the worker reserves (POST .../reserve-cost)
//   cost_actual_micros    what the worker reports it really spent (null = not
//                         reported)
//
// What a job counts in its month:
//   queued / running              max(reserved, actual)
//   completed / failed / canceled actual when reported, else reserved (a paid
//                                 call that was sent is paid even if canceled)
// A queued job that is canceled before any worker claimed it releases its hold
// (cancel sets reserved to 0).
//
// Two requests at once cannot both pass: every check runs in a transaction that
// first locks the month's row in social_ai_video_cost_months (SELECT … FOR
// UPDATE), so checks of one month are serialized.

const MICROS = 1000000;
// Columns are unsigned integers; anything above this is refused, not stored.
const MAX_MICROS = 4000 * MICROS;
const LOCKS = 'social_ai_video_cost_months';
const OPEN_STATUSES = new Set(['queued', 'running']);
const MONTHLY_BUDGET_EXCEEDED = 'VIDEO_JOB_MONTHLY_BUDGET_EXCEEDED';
const MONTHLY_COUNT_EXCEEDED = 'VIDEO_JOB_MONTHLY_COUNT_EXCEEDED';

const toMicros = usd => Math.round(Number(usd) * MICROS);
const toUsd = micros => Math.round(Number(micros || 0)) / MICROS;

// An unset or empty variable means the default (Number('') would be 0).
const monthlyMaxMicros = () => {
    const raw = process.env.VIDEO_JOB_MONTHLY_MAX_COST_USD;
    if (raw === undefined || String(raw).trim() === '') {
        return toMicros(30);
    }
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? toMicros(value) : toMicros(30);
};

/**
 * @param {Date} date
 * @param {string|null|undefined} timezone site timezone (settings `timezone`)
 * @returns {string} 'YYYY-MM'
 */
const monthOf = (date, timezone) => {
    const zone = timezone && moment.tz.zone(timezone) ? timezone : 'Etc/UTC';
    return moment(date).tz(zone).format('YYYY-MM');
};

const chargeOf = (row) => {
    const reserved = Number(row.cost_reserved_micros || 0);
    const actual = row.cost_actual_micros === null || row.cost_actual_micros === undefined
        ? null
        : Number(row.cost_actual_micros);
    if (OPEN_STATUSES.has(row.status)) {
        return Math.max(reserved, actual || 0);
    }
    return actual === null ? reserved : actual;
};

/**
 * A USD amount from a request, as micro-USD. Refuses anything that is not a
 * finite number in [0, 4000].
 */
const parseUsd = (value, field) => {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || toMicros(number) > MAX_MICROS) {
        throw new errors.ValidationError({message: `${field} must be a number of USD between 0 and ${MAX_MICROS / MICROS}.`});
    }
    return toMicros(number);
};

// Locks the month (creating its row the first time). Must run inside `trx`.
const lockMonth = async (trx, month) => {
    await trx(LOCKS).insert({month, created_at: new Date().toISOString().slice(0, 19).replace('T', ' ')})
        .onConflict('month').ignore();
    await trx(LOCKS).where({month}).forUpdate().first();
};

// What a person may use, as the screen shows it: the length of one video and the
// number of videos a month (the USD caps above are the inner guard). Read from
// env for now; the one place to switch to the service-plan table later.
const envCount = (name, fallback) => {
    const raw = process.env[name];
    if (raw === undefined || String(raw).trim() === '') {
        return fallback;
    }
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
};

/**
 * @returns {{maxVideoSeconds: number, monthlyMaxJobs: number}}
 */
const serviceLimits = () => ({
    maxVideoSeconds: envCount('VIDEO_JOB_MAX_SECONDS', 60),
    // A placeholder until the plan table exists.
    monthlyMaxJobs: Math.floor(envCount('VIDEO_JOB_MONTHLY_MAX_JOBS', 30))
});

// A job counts as one of the month's videos while it is queued / running /
// completed, and when it failed or was canceled after costing something. A
// failed or canceled job that cost nothing does not count.
const countsAsVideo = row => ['queued', 'running', 'completed'].includes(row.status) || chargeOf(row) > 0;

// The month's use without `exceptJobId` (the job being checked). `locking`
// reads the latest committed rows (FOR SHARE) instead of the transaction's
// snapshot, so a check never sums an older view than the lock it holds.
const monthUsage = async (trx, month, exceptJobId = null, {locking = false} = {}) => {
    const query = trx('social_ai_video_jobs')
        .where({cost_month: month})
        .select('status', 'cost_reserved_micros', 'cost_actual_micros');
    if (exceptJobId) {
        query.whereNot('id', exceptJobId);
    }
    if (locking) {
        query.forShare();
    }
    const rows = await query;
    return {
        micros: rows.reduce((sum, row) => sum + chargeOf(row), 0),
        jobs: rows.filter(countsAsVideo).length
    };
};

const summary = (month, usage, maxMicros = monthlyMaxMicros(), limits = serviceLimits()) => ({
    month,
    max_video_seconds: limits.maxVideoSeconds,
    monthly_max_jobs: limits.monthlyMaxJobs,
    month_jobs: usage.jobs,
    remaining_jobs: Math.max(0, limits.monthlyMaxJobs - usage.jobs),
    monthly_max_usd: toUsd(maxMicros),
    month_total_usd: toUsd(usage.micros),
    remaining_usd: toUsd(Math.max(0, maxMicros - usage.micros))
});

/**
 * Locks the month and refuses when (the rest of the month) + `chargeMicros` is
 * over the monthly USD cap, or — with `newVideo` (a job that is not yet one of
 * this month's) — when the month already has its number of videos. Exactly at
 * a cap passes. Must run inside `trx`.
 *
 * @returns {Promise<object>} the month summary including this job
 */
const assertMonthlyBudget = async (trx, {month, chargeMicros, exceptJobId = null, newVideo = false}) => {
    await lockMonth(trx, month);
    const maxMicros = monthlyMaxMicros();
    const limits = serviceLimits();
    const others = await monthUsage(trx, month, exceptJobId, {locking: true});
    if (newVideo && others.jobs + 1 > limits.monthlyMaxJobs) {
        throw new errors.ValidationError({
            message: `This month (${month}) already has ${others.jobs} of ${limits.monthlyMaxJobs} videos.`,
            code: MONTHLY_COUNT_EXCEEDED,
            context: JSON.stringify(summary(month, others, maxMicros, limits))
        });
    }
    if (others.micros + chargeMicros > maxMicros) {
        throw new errors.ValidationError({
            message: `The monthly video budget of ${toUsd(maxMicros)} USD for ${month} would be exceeded: ${toUsd(others.micros)} USD is used or reserved and this needs ${toUsd(chargeMicros)} USD.`,
            code: MONTHLY_BUDGET_EXCEEDED,
            context: JSON.stringify(summary(month, others, maxMicros, limits))
        });
    }
    return summary(month, {micros: others.micros + chargeMicros, jobs: others.jobs + 1}, maxMicros, limits);
};

module.exports = {
    MICROS,
    MONTHLY_BUDGET_EXCEEDED,
    MONTHLY_COUNT_EXCEEDED,
    serviceLimits,
    toMicros,
    toUsd,
    monthOf,
    chargeOf,
    parseUsd,
    monthlyMaxMicros,
    monthUsage,
    assertMonthlyBudget,
    lockMonth,
    summary
};
