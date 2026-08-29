const {addTable} = require('../../utils');

// Chart-job ↔ media junction (docs/chart-job-agent-design-addendum.md §2-1).
// One chart job handles MANY assets (input materials, output images/CSV/manifest),
// so a single link column cannot express role / person / source. FKs cascade on
// job and media delete (both rows exist before the junction is written — the
// playbook §4 FK-timing trap does not apply here).
module.exports = addTable('social_ai_chart_job_media', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    chart_job_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_chart_jobs.id', cascadeDelete: true},
    media_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_media_assets.id', cascadeDelete: true},
    role: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'output', index: true, validations: {isIn: [['input', 'source', 'material', 'intermediate', 'preview', 'output']]}},
    source_kind: {type: 'string', maxlength: 20, nullable: true},
    step_id: {type: 'string', maxlength: 64, nullable: true},
    person_name: {type: 'string', maxlength: 191, nullable: true, index: true},
    sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    caption: {type: 'string', maxlength: 2000, nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    '@@INDEXES@@': [
        ['chart_job_id', 'role', 'sort_order'],
        ['chart_job_id', 'person_name']
    ]
});
