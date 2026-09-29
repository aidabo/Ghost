const {createAddColumnMigration} = require('../../utils');

// Plain indexed link from social_media_assets to social_ai_news_jobs.
// NOT a FK, for the same reason as chart_job_id / dzi_job_id / content_bundle_job_id:
// the worker finalizes the asset row BEFORE (or independently of) the job row it is
// linked to, so a referential check would fail at insert time and silently null the
// value. Cleanup is explicit — the news job destroy handler deletes rows WHERE
// news_job_id = <job>, and social-ai-projects' JOB_FAMILIES cascade covers project
// deletion.
//
// This column exists so that a news job id can NEVER be written into chart_job_id:
// one family, one column.
module.exports = createAddColumnMigration('social_media_assets', 'news_job_id', {
    type: 'string', maxlength: 24, nullable: true, index: true
});
