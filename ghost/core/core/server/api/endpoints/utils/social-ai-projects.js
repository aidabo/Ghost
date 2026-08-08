// Shared helpers for the generic project container (P1, plan §0-1/§2-2).
// The project `status` is DERIVED from its jobs on every job transition
// (add/complete/fail/cancel/rerun/destroy) — review M2.

const PROJECT_STATUS = {
    DRAFT: 'draft',
    ACTIVE: 'active',
    COMPLETED: 'completed'
};

/**
 * no jobs → draft
 * any queued|running job → active (continuation remains — days later too)
 * all jobs terminal (completed/failed/canceled) → completed
 */
// @ts-ignore
const deriveProjectStatus = (jobStatuses) => {
    const list = Array.isArray(jobStatuses) ? jobStatuses : [];
    if (list.length === 0) {
        return PROJECT_STATUS.DRAFT;
    }
    if (list.some((s) => s === 'queued' || s === 'running')) {
        return PROJECT_STATUS.ACTIVE;
    }
    return PROJECT_STATUS.COMPLETED;
};

// Job-family tables that a project can own. Register additional
// `social_ai_<name>_jobs` tables here as more job types join the project model —
// otherwise their jobs would be invisible to the derived status.
const PROJECT_JOB_TABLES = ['social_ai_chart_jobs'];

/**
 * Recompute + persist the project status from ALL its job rows (across every
 * registered job-family table). Called by every job state-transition endpoint
 * (jobs add/complete/fail/cancel/rerun/destroy) so the derived column never goes stale.
 * @returns {Promise<string|null>} the new status (null when projectId empty)
 */
// @ts-ignore
const recalcProjectStatus = async (knex, projectId, jobTables = PROJECT_JOB_TABLES) => {
    if (!projectId) {
        return null;
    }
    const statuses = [];
    for (const table of jobTables) {
        // A registered table may not be migrated yet — skip it rather than throw.
        // eslint-disable-next-line no-await-in-loop
        if (!(await knex.schema.hasTable(table))) {
            continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const rows = await knex(table).where({project_id: projectId}).select('status');
        for (const r of rows) {
            statuses.push(r.status);
        }
    }
    const status = deriveProjectStatus(statuses);
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await knex('social_ai_projects')
        .where({id: projectId})
        .update({status, updated_at: now});
    return status;
};

module.exports = {
    PROJECT_STATUS,
    PROJECT_JOB_TABLES,
    deriveProjectStatus,
    recalcProjectStatus
};
