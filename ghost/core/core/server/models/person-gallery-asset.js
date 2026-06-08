const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PersonGalleryAsset = ghostBookshelf.Model.extend({
    tableName: 'person_gallery_assets',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            asset_type: 'image',
            sort_order: 0,
            status: 'draft'
        };
    },

    person() {
        return this.belongsTo('Person', 'person_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'person_gallery_assets.sort_order': 'ASC',
            'person_gallery_assets.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'person_id',
        'gallery_path',
        'asset_key',
        'asset_type',
        'title',
        'alt_text',
        'caption',
        'mime_type',
        'storage_key',
        'asset_url',
        'source_path',
        'sort_order',
        'status',
        'created_at',
        'updated_at'
    ],

    relationships: ['person'],

    includeRelations: ['person']
});

const PersonGalleryAssets = ghostBookshelf.Collection.extend({
    model: PersonGalleryAsset
});

module.exports = {
    PersonGalleryAsset: ghostBookshelf.model('PersonGalleryAsset', PersonGalleryAsset),
    PersonGalleryAssets: ghostBookshelf.collection('PersonGalleryAssets', PersonGalleryAssets)
};
