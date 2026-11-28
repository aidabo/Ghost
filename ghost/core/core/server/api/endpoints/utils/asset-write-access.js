const models = require('../../../models');
const staffScope = require('./staff-scope');

// System admin (Owner / Administrator / Admin).
const isAdminUser = async userId => (await staffScope.getStaffScope(userId)).isSystemAdmin;

// Who may rename a gallery file: the uploader, or the owner of the chart job that produced the row
// (the same people destroyAsset lets delete). row carries user_id and the chart job's user_id.
const canRenameAsset = (row, userId) => {
    if (!userId) {
        return false;
    }
    return String(row.user_id || '') === String(userId) ||
        (Boolean(row.chart_job_user_id) && String(row.chart_job_user_id) === String(userId));
};

// The owner of the chart job that made the row (row.chart_job_id), or null.
const chartJobUserIdOf = async (knex, row) => {
    if (!row.chart_job_id) {
        return null;
    }
    const job = await knex('social_ai_chart_jobs').where({id: row.chart_job_id}).first('user_id');
    return job?.user_id || null;
};

// Who may link a gallery row to a new chart job (social-ai-chart-jobs add): who may delete it directly
// (canRenameAsset = destroyAsset: the uploader, the owner of the chart job that made it), or a system admin.
// Narrower than canRetagAsset on purpose: destroying the job deletes the rows linked to it.
const canLinkAssetToChartJob = async (knex, row, userId) => {
    if (!userId) {
        return false;
    }
    if (canRenameAsset({...row, chart_job_user_id: await chartJobUserIdOf(knex, row)}, userId)) {
        return true;
    }
    return isAdminUser(userId);
};

// Who may change a gallery row's tag (sync-tags, PUT /social/gallery/tag): who may rename it (the uploader, the owner
// of the chart job that made it), a member who may write the row's group, or a system admin.
const canRetagAsset = async (knex, row, userId) => {
    if (!userId) {
        return false;
    }
    if (canRenameAsset({...row, chart_job_user_id: await chartJobUserIdOf(knex, row)}, userId)) {
        return true;
    }
    if (row.group_id) {
        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: row.group_id});
        // @ts-ignore
        if (group && await models.SocialGroup.canAccessGroup(group, userId, 'write')) {
            return true;
        }
    }
    return isAdminUser(userId);
};

module.exports = {
    isAdminUser,
    canRenameAsset,
    canLinkAssetToChartJob,
    canRetagAsset
};
