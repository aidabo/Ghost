const {addTable} = require('../../utils');

// One explicit avatar-broadcast choice per Post, independent of its producer.
// The shared gallery media row is the selected pointer; source-specific
// provenance is validated by each producer's API adapter.
module.exports = addTable('social_ai_avatar_broadcast_selections', {
    post_id: {type: 'string', maxlength: 24, nullable: false, primary: true, references: 'posts.id', cascadeDelete: true},
    project_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_ai_projects.id', setNullDelete: true},
    media_id: {type: 'string', maxlength: 24, nullable: true, unique: true, references: 'social_media_assets.id', cascadeDelete: true},
    rendition: {type: 'string', maxlength: 40, nullable: false},
    revision: {type: 'integer', nullable: false, unsigned: true, defaultTo: 1},
    created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false},
    '@@INDEXES@@': [
        ['project_id', 'updated_at'],
        ['media_id']
    ]
});
