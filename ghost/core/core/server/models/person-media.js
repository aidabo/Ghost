const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PersonMedia = ghostBookshelf.Model.extend({
    tableName: 'person_media',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            media_role: 'supplemental',
            sort_order: 0,
            is_primary: false
        };
    },

    person() {
        return this.belongsTo('Person', 'person_id');
    },

    series() {
        return this.belongsTo('PersonStorySeries', 'series_id');
    },

    media() {
        return this.belongsTo('SocialMediaAsset', 'media_id');
    }
}, {
    permittedAttributes: ['id', 'person_id', 'series_id', 'media_id', 'media_role', 'sort_order', 'caption', 'is_primary', 'created_at', 'updated_at'],

    relationships: ['person', 'series', 'media']
});

module.exports = {
    PersonMedia: ghostBookshelf.model('PersonMedia', PersonMedia)
};
