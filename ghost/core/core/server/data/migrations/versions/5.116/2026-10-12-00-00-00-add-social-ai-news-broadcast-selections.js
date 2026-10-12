const {addTable} = require('../../utils');

// One explicit public broadcast choice per post. The media relationship itself
// stays in social_ai_news_job_media; this row is the post-level selection pointer.
module.exports = addTable('social_ai_news_broadcast_selections', {
    post_id: {type: 'string', maxlength: 24, nullable: false, primary: true, references: 'posts.id', cascadeDelete: true},
    project_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_ai_projects.id', setNullDelete: true},
    news_job_media_id: {type: 'string', maxlength: 24, nullable: true, unique: true, references: 'social_ai_news_job_media.id', cascadeDelete: true},
    rendition: {type: 'string', maxlength: 40, nullable: false},
    revision: {type: 'integer', nullable: false, unsigned: true, defaultTo: 1},
    created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false},
    '@@INDEXES@@': [
        ['project_id', 'updated_at'],
        ['news_job_media_id']
    ]
});
