const {addTable} = require('../../utils');

// MCP Content Automation job. The manifest and ordered steps are the durable
// orchestration contract; Posts remain the canonical published content.
module.exports = addTable('social_ai_content_bundle_jobs', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    type: {type: 'string', maxlength: 100, nullable: false, defaultTo: 'content-bundle'},
    status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'queued'},
    progress: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    current_step_id: {type: 'string', maxlength: 191, nullable: true},
    status_message: {type: 'string', maxlength: 500, nullable: true},
    steps: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    manifest: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: false},
    result: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    artifacts: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    error_code: {type: 'string', maxlength: 100, nullable: true},
    error_message: {type: 'text', nullable: true},
    project_id: {type: 'string', maxlength: 24, nullable: true, index: true},
    user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true, index: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
    scope_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'user'},
    claim_worker_id: {type: 'string', maxlength: 191, nullable: true},
    claim_expires_at: {type: 'dateTime', nullable: true},
    retry_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    started_at: {type: 'dateTime', nullable: true},
    completed_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['status'],
        ['project_id', 'status'],
        ['user_id', 'status'],
        ['status', 'claim_expires_at']
    ]
});
