const {createAddColumnMigration} = require('../../utils');

// Plain indexed link from social_media_assets to social_ai_video_jobs. NOT a FK,
// for the same reason as news_job_id: the worker finalizes the asset row before
// (or independently of) the job row it is linked to. Cleanup is explicit — the
// video job destroy handler and social-ai-projects' JOB_FAMILIES cascade.
module.exports = createAddColumnMigration('social_media_assets', 'video_job_id', {
    type: 'string', maxlength: 24, nullable: true, index: true
});
