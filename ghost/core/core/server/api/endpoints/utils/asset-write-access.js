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

// Who may change a gallery row's tag (sync-tags, PUT /social/gallery/tag) or link it to a new chart job
// (social-ai-chart-jobs add): who may rename it (the uploader, the owner
// of the chart job that made it), a member who may write the row's group, or a system admin.
const canRetagAsset = async (knex, row, userId) => {
    if (!userId) {
        return false;
    }
    let chartJobUserId = null;
    if (row.chart_job_id) {
        const job = await knex('social_ai_chart_jobs').where({id: row.chart_job_id}).first('user_id');
        chartJobUserId = job?.user_id || null;
    }
    if (canRenameAsset({...row, chart_job_user_id: chartJobUserId}, userId)) {
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
    canRenameAsset,
    canRetagAsset
};
