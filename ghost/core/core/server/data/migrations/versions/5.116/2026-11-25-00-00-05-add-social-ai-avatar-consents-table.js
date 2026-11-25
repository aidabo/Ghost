const {addTable} = require('../../utils');

// Consent to use a person's face photo as a video avatar (front repo
// docs/planning/video-job-runner-plan.md §7.2). Never deleted: revoking sets
// revoked_at. `photo_asset_id` is a plain link (NOT a FK) so the record outlives
// the photo. `user_id` is a plain column too (NOT a users FK with cascade):
// deleting the staff user must not delete the consent record. Declared in
// schema.js too (init() does not run versions/**).
module.exports = addTable('social_ai_avatar_consents', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    photo_asset_id: {type: 'string', maxlength: 24, nullable: false, index: true},
    subject_name: {type: 'string', maxlength: 191, nullable: false},
    consented_by_name: {type: 'string', maxlength: 191, nullable: true},
    consented_at: {type: 'dateTime', nullable: false},
    uses: {type: 'text', maxlength: 65535, nullable: true},
    note: {type: 'text', maxlength: 65535, nullable: true},
    user_id: {type: 'string', maxlength: 24, nullable: false, index: true},
    revoked_at: {type: 'dateTime', nullable: true},
    revoked_by: {type: 'string', maxlength: 24, nullable: true},
    revoke_reason: {type: 'string', maxlength: 500, nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false},
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: false},
    '@@INDEXES@@': [
        ['user_id', 'revoked_at']
    ]
});
