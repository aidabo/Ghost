const {combineNonTransactionalMigrations, createAddColumnMigration, addTable} = require('../../utils');

// Monthly video budget (front repo docs/planning/video-job-runner-plan.md §7.1,
// counted by Ghost: api/endpoints/utils/video-job-budget.js). The cost of a job
// in micro-USD and the month it counts in, plus one lock row per month so two
// budget checks of the same month are serialized. Declared in schema.js too
// (init() does not run versions/**).
//
// Jobs made before this migration have no cost_month: they count in no month
// (the worker's own records covered them until now).
module.exports = combineNonTransactionalMigrations(
    createAddColumnMigration('social_ai_video_jobs', 'cost_month', {
        type: 'string', maxlength: 7, nullable: true, index: true
    }),
    createAddColumnMigration('social_ai_video_jobs', 'cost_estimate_micros', {
        type: 'integer', nullable: false, unsigned: true, defaultTo: 0
    }),
    createAddColumnMigration('social_ai_video_jobs', 'cost_reserved_micros', {
        type: 'integer', nullable: false, unsigned: true, defaultTo: 0
    }),
    createAddColumnMigration('social_ai_video_jobs', 'cost_actual_micros', {
        type: 'integer', nullable: true, unsigned: true
    }),
    addTable('social_ai_video_cost_months', {
        month: {type: 'string', maxlength: 7, nullable: false, primary: true},
        created_at: {type: 'dateTime', nullable: false}
    })
);
