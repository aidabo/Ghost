const {createAddColumnMigration} = require('../../utils');

// Link a DZI job to the desk's medium (classification:"medium" tag id).
// Optional and additive: e-book jobs keep NULL and the stored
// publication_name stays the display snapshot. Plain column, no FK — a
// deleted tag must never break the job row.
module.exports = createAddColumnMigration('social_ai_dzi_jobs', 'medium_id', {
    type: 'string',
    maxlength: 24,
    nullable: true
});
