const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const Person = ghostBookshelf.Model.extend({
    tableName: 'persons',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            subject_type: 'person',
            language: 'zh',
            status: 'draft',
            sort_order: 0
        };
    },

    roles() {
        return this.hasMany('PersonRole', 'person_id');
    },

    lifeEvents() {
        return this.hasMany('PersonLifeEvent', 'person_id');
    },

    storySeries() {
        return this.hasMany('PersonStorySeries', 'person_id');
    },

    relations() {
        return this.hasMany('PersonRelation', 'person_id');
    },

    relatedRelations() {
        return this.hasMany('PersonRelation', 'related_person_id');
    },

    postRelations() {
        return this.hasMany('PersonPostRelation', 'person_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'persons.sort_order': 'ASC',
            'persons.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'slug',
        'name',
        'display_name',
        'gallery_path',
        'subject_type',
        'language',
        'bio_summary',
        'status',
        'sort_order',
        'created_at',
        'updated_at'
    ],

    relationships: [
        'roles',
        'lifeEvents',
        'storySeries',
        'relations',
        'relatedRelations',
        'postRelations'
    ],

    includeRelations: ['roles', 'lifeEvents', 'storySeries']
});

const Persons = ghostBookshelf.Collection.extend({
    model: Person
});

module.exports = {
    Person: ghostBookshelf.model('Person', Person),
    Persons: ghostBookshelf.collection('Persons', Persons)
};
