const {addTable} = require('../../utils');

// Individual staff access for a generic Project. Group membership remains the
// group-level access path; this table is only for explicit Project participants.
module.exports = addTable('social_ai_project_members', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    project_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_projects.id', cascadeDelete: true},
    user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
    role: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'viewer', validations: {isIn: [['viewer', 'editor']]}},
    created_by: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true},
    '@@UNIQUE_CONSTRAINTS@@': [
        ['project_id', 'user_id']
    ],
    '@@INDEXES@@': [
        ['project_id', 'role'],
        ['user_id', 'role']
    ]
});
