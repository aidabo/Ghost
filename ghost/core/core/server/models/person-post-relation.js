const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PersonPostRelation = ghostBookshelf.Model.extend({
    tableName: 'person_post_relations',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            sort_order: 0,
            status: 'draft'
        };
    },

    person() {
        return this.belongsTo('Person', 'person_id');
    },

    post() {
        return this.belongsTo('Post', 'post_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'person_post_relations.sort_order': 'ASC',
            'person_post_relations.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'person_id',
        'post_id',
        'relation_key',
        'relation_label',
        'sort_order',
        'status',
        'created_at',
        'updated_at'
    ],

    relationships: ['person', 'post'],

    includeRelations: ['person', 'post']
});

const PersonPostRelations = ghostBookshelf.Collection.extend({
    model: PersonPostRelation
});

module.exports = {
    PersonPostRelation: ghostBookshelf.model('PersonPostRelation', PersonPostRelation),
    PersonPostRelations: ghostBookshelf.collection('PersonPostRelations', PersonPostRelations)
};
