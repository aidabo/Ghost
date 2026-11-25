const {addTable} = require('../../utils');

// Video family — job table (docs/planning/video-job-runner-plan.md in the front
// repo, §3). A SEPARATE FAMILY from news/media/chart: one family = one table = one
// `<name>_job_id` column (social_media_assets.video_job_id) = one owner_scope
// ('video_jobs') = one S3 work prefix. Same lease columns as news
// (claim_generation / claim_token) from the start.
//
// The same table is declared in schema.js because init() records versions/**
// without running them — a fresh database gets it from schema.js only.
module.exports = addTable('social_ai_video_jobs', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    type: {type: 'string', maxlength: 100, nullable: false, defaultTo: 'video-render'},
    status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'queued'},
    progress: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    current_step_id: {type: 'string', maxlength: 191, nullable: true},
    status_message: {type: 'string', maxlength: 500, nullable: true},
    steps: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    items: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    payload: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    result: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    artifacts: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    error_code: {type: 'string', maxlength: 100, nullable: true},
    error_message: {type: 'text', nullable: true},
    project_id: {type: 'string', maxlength: 24, nullable: true, index: true},
    base_job_id: {type: 'string', maxlength: 24, nullable: true, index: true},
    avatar_consent_id: {type: 'string', maxlength: 24, nullable: true, index: true},
    user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true, index: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
    scope_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'user'},
    claim_worker_id: {type: 'string', maxlength: 191, nullable: true},
    claim_expires_at: {type: 'dateTime', nullable: true},
    claim_generation: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    claim_token: {type: 'string', maxlength: 36, nullable: true},
    retry_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    started_at: {type: 'dateTime', nullable: true},
    completed_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['status'],
        ['type', 'status'],
        ['project_id', 'status'],
        ['user_id', 'status'],
        ['status', 'claim_expires_at']
    ]
});
