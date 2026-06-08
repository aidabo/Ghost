const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PersonStoryEpisode = ghostBookshelf.Model.extend({
    tableName: 'person_story_episodes',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            episode_type: 'chapter',
            episode_no: 0,
            sort_order: 0,
            status: 'draft'
        };
    },

    person() {
        return this.belongsTo('Person', 'person_id');
    },

    series() {
        return this.belongsTo('PersonStorySeries', 'series_id');
    },

    post() {
        return this.belongsTo('Post', 'post_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'person_story_episodes.sort_order': 'ASC',
            'person_story_episodes.episode_no': 'ASC',
            'person_story_episodes.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'person_id',
        'series_id',
        'slug',
        'title',
        'summary',
        'episode_no',
        'episode_type',
        'post_id',
        'published_at',
        'sort_order',
        'status',
        'created_at',
        'updated_at'
    ],

    relationships: ['person', 'series', 'post'],

    includeRelations: ['person', 'series', 'post']
});

const PersonStoryEpisodes = ghostBookshelf.Collection.extend({
    model: PersonStoryEpisode
});

module.exports = {
    PersonStoryEpisode: ghostBookshelf.model('PersonStoryEpisode', PersonStoryEpisode),
    PersonStoryEpisodes: ghostBookshelf.collection('PersonStoryEpisodes', PersonStoryEpisodes)
};
