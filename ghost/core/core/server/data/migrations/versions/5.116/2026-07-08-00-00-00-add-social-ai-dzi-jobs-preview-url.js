const {createAddColumnMigration} = require('../../utils');

// Small page-1 preview image URL so the agent + jobs UI can identify a PDF
// visually without opening it. Additive + nullable — no impact on existing rows.
module.exports = createAddColumnMigration('social_ai_dzi_jobs', 'preview_url', {
    type: 'string',
    maxlength: 2000,
    nullable: true
});
