const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PersonStory = ghostBookshelf.Model.extend({
    tableName: 'person_stories',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            subject_type: 'person',
            language: 'zh',
            source_kind: 'seed',
            status: 'published',
            chapter_count: 0,
            volume_count: 0,
            sort_order: 0
        };
    }
}, {
    orderDefaultOptions() {
        return {
            'person_stories.sort_order': 'ASC',
            'person_stories.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'slug',
        'title',
        'subject',
        'gallery_path',
        'subject_type',
        'language',
        'summary',
        'chapter_count',
        'volume_count',
        'time_span',
        'geography',
        'source_path',
        'timeline_html_path',
        'themes_json',
        'structural_notes_json',
        'structure_outline_json',
        'reading_order_json',
        'source_kind',
        'status',
        'sort_order',
        'created_at',
        'updated_at'
    ],

    relationships: [],

    includeRelations: []
});

const PersonStories = ghostBookshelf.Collection.extend({
    model: PersonStory
});

module.exports = {
    PersonStory: ghostBookshelf.model('PersonStory', PersonStory),
    PersonStories: ghostBookshelf.collection('PersonStories', PersonStories)
};
