const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PersonRelation = ghostBookshelf.Model.extend({
    tableName: 'person_relations',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            relation_direction: 'bidirectional',
            sort_order: 0,
            status: 'draft'
        };
    },

    person() {
        return this.belongsTo('Person', 'person_id');
    },

    relatedPerson() {
        return this.belongsTo('Person', 'related_person_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'person_relations.sort_order': 'ASC',
            'person_relations.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'person_id',
        'related_person_id',
        'relation_key',
        'relation_label',
        'relation_direction',
        'sort_order',
        'status',
        'created_at',
        'updated_at'
    ],

    relationships: ['person', 'relatedPerson'],

    includeRelations: ['person', 'relatedPerson']
});

const PersonRelations = ghostBookshelf.Collection.extend({
    model: PersonRelation
});

module.exports = {
    PersonRelation: ghostBookshelf.model('PersonRelation', PersonRelation),
    PersonRelations: ghostBookshelf.collection('PersonRelations', PersonRelations)
};
