const {addTable} = require('../../utils');

// Chart Job Agent — P1: generic project container (work order, plan §0-1).
// Not chart-specific: any job family may later attach via project_id
// (plan §0-2 standardization). `status` is DERIVED from the project's jobs
// (no jobs → draft / any queued|running → active / all terminal → completed)
// and kept in sync by the shared recalcProjectStatus helper (review M2).
module.exports = addTable('social_ai_projects', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    name: {type: 'string', maxlength: 191, nullable: false},
    description: {type: 'text', maxlength: 2000, nullable: true},
    tags: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', index: true},
    user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true, index: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    '@@INDEXES@@': [
        ['user_id', 'status']
    ]
});
