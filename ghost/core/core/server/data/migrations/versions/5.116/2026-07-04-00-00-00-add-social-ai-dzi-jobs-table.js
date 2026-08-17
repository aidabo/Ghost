const {addTable} = require('../../utils');

module.exports = addTable('social_ai_dzi_jobs', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true, index: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
    status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'queued'},
    progress: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    source_path: {type: 'string', maxlength: 2000, nullable: false},
    source_name: {type: 'string', maxlength: 500, nullable: true},
    publication_name: {type: 'string', maxlength: 500, nullable: false},
    edition: {type: 'string', maxlength: 500, nullable: false},
    pages: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    error: {type: 'string', maxlength: 2000, nullable: true},
    claim_worker_id: {type: 'string', maxlength: 191, nullable: true},
    claim_expires_at: {type: 'dateTime', nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    started_at: {type: 'dateTime', nullable: true},
    completed_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['status'],
        ['user_id', 'status'],
        ['status', 'claim_expires_at']
    ]
});
