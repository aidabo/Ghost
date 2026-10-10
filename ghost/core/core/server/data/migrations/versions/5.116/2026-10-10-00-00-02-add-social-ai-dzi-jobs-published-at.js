const {createAddColumnMigration} = require('../../utils');

// Publication day of the scanned edition, mirroring posts.published_at:
// publish fills it when still unset so a delayed scan is dated by its paper
// day, not by processing time. Legacy/e-book rows stay NULL — readers fall
// back to completed_at.
module.exports = createAddColumnMigration('social_ai_dzi_jobs', 'published_at', {
    type: 'dateTime',
    nullable: true
});
