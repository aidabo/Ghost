const {addTable} = require('../../utils');

// Project Content Links — Phase 1: generic link table for attaching
// posts/StackPages/gallery to a project. project_id is a plain indexed
// column (no DB FK) — cascade is handled explicitly in the project destroy
// endpoint (same pattern as chart_jobs.project_id and social_media_assets).
module.exports = addTable('social_ai_project_links', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    project_id: {type: 'string', maxlength: 24, nullable: false, index: true},
    link_type: {type: 'string', maxlength: 50, nullable: false},
    link_id: {type: 'string', maxlength: 24, nullable: false},
    link_title: {type: 'string', maxlength: 191, nullable: true},
    link_url: {type: 'string', maxlength: 2000, nullable: true},
    sort_order: {type: 'integer', nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: true}
});
