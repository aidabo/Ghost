const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PersonStorySeries = ghostBookshelf.Model.extend({
    tableName: 'person_story_series',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            series_type: 'narrative',
            sort_order: 0,
            status: 'draft'
        };
    },

    person() {
        return this.belongsTo('Person', 'person_id');
    },

    episodes() {
        return this.hasMany('PersonStoryEpisode', 'series_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'person_story_series.sort_order': 'ASC',
            'person_story_series.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'person_id',
        'slug',
        'title',
        'summary',
        'origin_story_slug',
        'series_type',
        'sort_order',
        'status',
        'created_at',
        'updated_at'
    ],

    relationships: ['person', 'episodes'],

    includeRelations: ['person', 'episodes']
});

const PersonStorySerieses = ghostBookshelf.Collection.extend({
    model: PersonStorySeries
});

module.exports = {
    PersonStorySeries: ghostBookshelf.model('PersonStorySeries', PersonStorySeries),
    PersonStorySerieses: ghostBookshelf.collection('PersonStorySerieses', PersonStorySerieses)
};
