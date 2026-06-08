const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PersonLifeEvent = ghostBookshelf.Model.extend({
    tableName: 'person_life_events',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            event_type: 'milestone',
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
            'person_life_events.sort_order': 'ASC',
            'person_life_events.happened_at': 'ASC',
            'person_life_events.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'person_id',
        'event_key',
        'title',
        'event_type',
        'description',
        'happened_at',
        'place',
        'sort_order',
        'status',
        'created_at',
        'updated_at'
    ],

    relationships: ['person'],

    includeRelations: ['person']
});

const PersonLifeEvents = ghostBookshelf.Collection.extend({
    model: PersonLifeEvent
});

module.exports = {
    PersonLifeEvent: ghostBookshelf.model('PersonLifeEvent', PersonLifeEvent),
    PersonLifeEvents: ghostBookshelf.collection('PersonLifeEvents', PersonLifeEvents)
};
