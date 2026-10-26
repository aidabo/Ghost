const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const EstateDictionaryTerm = ghostBookshelf.Model.extend({
    tableName: 'estate_dictionary_terms',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            category: '共通',
            sort_order: 0
        };
    }
}, {
    permittedAttributes: [
        'id',
        'source',
        'ja',
        'en',
        'zh',
        'category',
        'notes',
        'sort_order',
        'created_at',
        'updated_at'
    ]
});

module.exports = {
    EstateDictionaryTerm: ghostBookshelf.model('EstateDictionaryTerm', EstateDictionaryTerm)
};
