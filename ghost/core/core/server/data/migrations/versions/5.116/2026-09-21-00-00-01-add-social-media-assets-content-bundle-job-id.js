const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('social_media_assets', 'content_bundle_job_id', {
    type: 'string', maxlength: 24, nullable: true, index: true
});
