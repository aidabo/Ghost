const {addTable} = require('../../utils');

// News Agent — pipeline job table.
//
// A SEPARATE FAMILY from Chart (docs/architecture/job-runner-feature-playbook.md
// §1 and user decision 2026-09-29): chart draws relationship diagrams, news makes
// news jobs. Different agents therefore get their own job table, their own job-id
// column on social_media_assets, their own junction, their own owner_scope and
// their own S3 work prefix. Job ids are NEVER shared across families; within this
// family every `news-*` type shares this one table and this one id.
//
// Two different progress shapes live here on purpose:
//   - `steps` is the PIPELINE (ingest → read → publish), one entry per stage.
//   - `items` is the WORK LIST — one entry per selected article, each with its own
//     status. One job may carry many articles, so a single percentage cannot say
//     "article 3 of 8 just finished". The desk UI polls `items` for that.
// When `items` is present the endpoint derives the integer `progress` from it, so
// the bar and the list can never disagree.
module.exports = addTable('social_ai_news_jobs', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    type: {type: 'string', maxlength: 100, nullable: false, defaultTo: 'news-read'},
    status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'queued'},
    progress: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    current_step_id: {type: 'string', maxlength: 191, nullable: true},
    status_message: {type: 'string', maxlength: 500, nullable: true},
    steps: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    items: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    payload: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    result: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    artifacts: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
    error_code: {type: 'string', maxlength: 100, nullable: true},
    error_message: {type: 'text', nullable: true},
    project_id: {type: 'string', maxlength: 24, nullable: true, index: true},
    user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true, index: true},
    group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
    scope_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'user'},
    claim_worker_id: {type: 'string', maxlength: 191, nullable: true},
    claim_expires_at: {type: 'dateTime', nullable: true},
    retry_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
    started_at: {type: 'dateTime', nullable: true},
    completed_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['status'],
        ['type', 'status'],
        ['project_id', 'status'],
        ['user_id', 'status'],
        ['status', 'claim_expires_at']
    ]
});
