const {addTable} = require('../../utils');

// Chart Job Agent — pipeline job table.
// A job is an ordered array of steps (stored as JSON in `steps`). MVP jobs have a
// single step (image-fetch); later phases link multiple steps (csv-create →
// image-fetch → image-review → …). Job-level `status` is derived from steps in
// the endpoint (all completed → completed, any failed → failed, else queued).
module.exports = addTable('social_ai_chart_jobs', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    type: {type: 'string', maxlength: 100, nullable: false, defaultTo: 'image-fetch'},
    status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'queued', index: true},
    steps: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    payload: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    result: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    progress: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    source_path: {type: 'string', maxlength: 2000, nullable: true},
    preview_url: {type: 'string', maxlength: 2000, nullable: true},
    error: {type: 'string', maxlength: 2000, nullable: true},
    claim_worker_id: {type: 'string', maxlength: 191, nullable: true},
    claim_expires_at: {type: 'dateTime', nullable: true},
    user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true, index: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    started_at: {type: 'dateTime', nullable: true},
    completed_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['status'],
        ['type', 'status'],
        ['user_id', 'status'],
        ['status', 'claim_expires_at']
    ]
});
