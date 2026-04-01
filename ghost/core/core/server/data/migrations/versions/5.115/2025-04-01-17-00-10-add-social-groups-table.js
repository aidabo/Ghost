const {addTable} = require('../../utils');

//group
module.exports = addTable('social_groups', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    creator_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'users.id', cascadeDelete: true},
    group_name: {type: 'string', maxlength: 240, nullable: false, unique: true, index: true},
    type: {type: 'string', maxlength: 60, nullable: false, default: 'family', index: true, 
        validations: {
            isIn: [[
                'family',
                'company',
                'private',
                'public',
                'secret'
            ]]
        }}, /// e.g., public, private, secret, family, company
    status: {type: 'string', maxlength: 60, nullable: false, default: 'active', index: true,
        validations: {
            isIn: [[
                'approval',
                'active',
                'archived'
            ]]
        }}, /// e.g., waitapproval active, archived
    max_members: {type: 'integer', nullable: false, unsigned: true, defaultTo: 100}, // ← new    
    require_approval: {type: 'boolean', nullable: true, defaultTo: false}, // ← new
    optional_settings: {type: 'json', nullable: true, defaultTo: {}}, // ← new
    approved_at: {type: 'dateTime', nullable: true},
    approved_by: {type: 'string', maxlength: 24, nullable: true},
    description: {type: 'text', nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: true}
});
