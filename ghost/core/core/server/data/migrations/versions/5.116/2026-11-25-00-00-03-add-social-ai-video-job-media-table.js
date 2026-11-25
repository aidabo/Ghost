const {addTable} = require('../../utils');

// Video-job ↔ media junction. `item_key` is the line / scene key an artifact
// belongs to (one voice and one face clip per line). FKs cascade on job and media
// delete: both rows exist before the junction row is written.
module.exports = addTable('social_ai_video_job_media', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    video_job_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_video_jobs.id', cascadeDelete: true},
    media_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_media_assets.id', cascadeDelete: true},
    role: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'output', index: true},
    source_kind: {type: 'string', maxlength: 20, nullable: true},
    step_id: {type: 'string', maxlength: 64, nullable: true},
    item_key: {type: 'string', maxlength: 191, nullable: true, index: true},
    sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    caption: {type: 'string', maxlength: 2000, nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    '@@INDEXES@@': [
        ['video_job_id', 'role', 'sort_order'],
        ['video_job_id', 'item_key']
    ]
});
