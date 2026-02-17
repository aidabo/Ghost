const {addTable} = require('../../utils');

module.exports = addTable('social_media_assets', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    storage_key: {type: 'string', maxlength: 2000, nullable: false, unique: true, index: true},
    storage_url: {type: 'string', maxlength: 2000, nullable: false},
    asset_type: {type: 'string', maxlength: 50, nullable: false, index: true},
    owner_scope: {type: 'string', maxlength: 20, nullable: false, index: true},
    user_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'users.id', cascadeDelete: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
    tag_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'tags.id', setNullDelete: true},
    tag_slug: {type: 'string', maxlength: 191, nullable: true, index: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['owner_scope', 'user_id', 'created_at'],
        ['owner_scope', 'group_id', 'created_at']
    ]
});
