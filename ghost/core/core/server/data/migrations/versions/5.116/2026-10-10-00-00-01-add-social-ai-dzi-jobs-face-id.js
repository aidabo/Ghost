const {createAddColumnMigration} = require('../../utils');

// Link a DZI job to the desk's face (classification:"face" tag id) — one job
// is one scanned page (面). Same optional/plain-column rules as medium_id.
module.exports = createAddColumnMigration('social_ai_dzi_jobs', 'face_id', {
    type: 'string',
    maxlength: 24,
    nullable: true
});
