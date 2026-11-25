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

// Sum of the month without `exceptJobId` (the job being checked). `locking`
// reads the latest committed rows (FOR SHARE) instead of the transaction's
// snapshot, so a check never sums an older view than the lock it holds.
const monthTotalMicros = async (trx, month, exceptJobId = null, {locking = false} = {}) => {
    const query = trx('social_ai_video_jobs')
        .where({cost_month: month})
        .select('status', 'cost_reserved_micros', 'cost_actual_micros');
    if (exceptJobId) {
        query.whereNot('id', exceptJobId);
    }
    if (locking) {
        query.forShare();
    }
    return (await query).reduce((sum, row) => sum + chargeOf(row), 0);
};

const summary = (month, usedMicros, maxMicros = monthlyMaxMicros()) => ({
    month,
    monthly_max_usd: toUsd(maxMicros),
    month_total_usd: toUsd(usedMicros),
    remaining_usd: toUsd(Math.max(0, maxMicros - usedMicros))
});

/**
 * Locks the month and refuses when (the rest of the month) + `chargeMicros` is
 * over the monthly cap. Exactly at the cap passes. Must run inside `trx`.
 *
 * @returns {Promise<object>} the month summary including this charge
 */
const assertMonthlyBudget = async (trx, {month, chargeMicros, exceptJobId = null}) => {
    await lockMonth(trx, month);
    const maxMicros = monthlyMaxMicros();
    const others = await monthTotalMicros(trx, month, exceptJobId, {locking: true});
    if (others + chargeMicros > maxMicros) {
        throw new errors.ValidationError({
            message: `The monthly video budget of ${toUsd(maxMicros)} USD for ${month} would be exceeded: ${toUsd(others)} USD is used or reserved and this needs ${toUsd(chargeMicros)} USD.`,
            code: MONTHLY_BUDGET_EXCEEDED,
            context: JSON.stringify(summary(month, others, maxMicros))
        });
    }
    return summary(month, others + chargeMicros, maxMicros);
};

module.exports = {
    MICROS,
    MONTHLY_BUDGET_EXCEEDED,
    toMicros,
    toUsd,
    monthOf,
    chargeOf,
    parseUsd,
    monthlyMaxMicros,
    monthTotalMicros,
    assertMonthlyBudget,
    lockMonth,
    summary
};
