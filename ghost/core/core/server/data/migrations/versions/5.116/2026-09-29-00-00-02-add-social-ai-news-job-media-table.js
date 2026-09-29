const {addTable} = require('../../utils');

// News-job ↔ media junction.
//
// One news job produces MANY assets: for each selected article a voice file, a
// video, and (for later types) stills and a paper page. A single link column cannot
// say which ARTICLE an artifact belongs to, so the junction carries it:
//   - item_key : the job's `items[].key` (the article slug) — always present
//   - post_id  : the Ghost post id when the item came from a post (nullable)
//   - source_kind / step_id / person_name / caption / sort_order : as in chart.
//
// FKs cascade on job and media delete: both rows exist before the junction row is
// written, so the playbook §4 FK-timing trap does not apply here (same reasoning as
// social_ai_chart_job_media).
module.exports = addTable('social_ai_news_job_media', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    news_job_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_news_jobs.id', cascadeDelete: true},
    media_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_media_assets.id', cascadeDelete: true},
    role: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'output', index: true, validations: {isIn: [['input', 'source', 'material', 'intermediate', 'preview', 'output']]}},
    source_kind: {type: 'string', maxlength: 20, nullable: true},
    step_id: {type: 'string', maxlength: 64, nullable: true},
    item_key: {type: 'string', maxlength: 191, nullable: true, index: true},
    post_id: {type: 'string', maxlength: 24, nullable: true, index: true},
    person_name: {type: 'string', maxlength: 191, nullable: true, index: true},
    sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    caption: {type: 'string', maxlength: 2000, nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    '@@INDEXES@@': [
        ['news_job_id', 'role', 'sort_order'],
        ['news_job_id', 'item_key'],
        ['item_key', 'source_kind']
    ]
});
