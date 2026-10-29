const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const EstatePropertyTranslation = ghostBookshelf.Model.extend({
    tableName: 'estate_property_translations',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            origin: 'ai',
            created_at: new Date(),
            updated_at: new Date()
        };
    }
}, {
    permittedAttributes: [
        'id', 'property_id', 'field', 'locale', 'source_hash', 'text',
        'origin', 'dictionary_version', 'created_at', 'updated_at'
    ]
});

module.exports = {
    EstatePropertyTranslation: ghostBookshelf.model('EstatePropertyTranslation', EstatePropertyTranslation)
};
