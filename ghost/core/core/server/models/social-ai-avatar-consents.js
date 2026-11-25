const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

// Consent to use a person's face photo as a video avatar. The endpoint
// (api/endpoints/social-ai-avatar-consents.js) writes rows through knex; this
// model exists so the table is a first-class Ghost model (permittedAttributes
// come from schema.js).
const SocialAiAvatarConsent = ghostBookshelf.Model.extend({
    tableName: 'social_ai_avatar_consents',

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    user() {
        return this.belongsTo('User', 'user_id');
    }
});

module.exports = {
    SocialAiAvatarConsent: ghostBookshelf.model('SocialAiAvatarConsent', SocialAiAvatarConsent)
};
