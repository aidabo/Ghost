const {combineNonTransactionalMigrations, addTable} = require('../../utils');

module.exports = combineNonTransactionalMigrations(
    addTable('persons', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        name: {type: 'string', maxlength: 2000, nullable: false},
        display_name: {type: 'string', maxlength: 2000, nullable: true},
        gallery_path: {type: 'string', maxlength: 2000, nullable: true},
        subject_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'person', validations: {isIn: [['person', 'author', 'legend', 'character']]}},
        language: {type: 'string', maxlength: 10, nullable: false, defaultTo: 'zh', validations: {isIn: [['zh', 'ja', 'en']]}},
        bio_summary: {type: 'text', maxlength: 5000, nullable: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['draft', 'published', 'archived']]}},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['status', 'updated_at'],
            ['subject_type', 'status'],
            ['language', 'status']
        ]
    }),
    addTable('person_roles', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        role_key: {type: 'string', maxlength: 191, nullable: false},
        role_label: {type: 'string', maxlength: 500, nullable: true},
        is_primary: {type: 'bool', nullable: false, defaultTo: false},
        role_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['draft', 'published', 'archived']]}},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'role_order'],
            ['person_id', 'role_key'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['person_id', 'role_key']
        ]
    }),
    addTable('person_life_events', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        event_key: {type: 'string', maxlength: 191, nullable: true},
        title: {type: 'string', maxlength: 500, nullable: false},
        event_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'milestone'},
        description: {type: 'text', maxlength: 5000, nullable: true},
        happened_at: {type: 'dateTime', nullable: true},
        place: {type: 'string', maxlength: 500, nullable: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['draft', 'published', 'archived']]}},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'sort_order'],
            ['person_id', 'happened_at'],
            ['status']
        ]
    }),
    addTable('person_story_series', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        slug: {type: 'string', maxlength: 191, nullable: false},
        title: {type: 'string', maxlength: 2000, nullable: false},
        summary: {type: 'text', maxlength: 5000, nullable: true},
        origin_story_slug: {type: 'string', maxlength: 191, nullable: true},
        series_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'narrative'},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['draft', 'published', 'archived']]}},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'sort_order'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['person_id', 'slug']
        ]
    }),
    addTable('person_story_episodes', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        series_id: {type: 'string', maxlength: 24, nullable: false, references: 'person_story_series.id', cascadeDelete: true},
        slug: {type: 'string', maxlength: 191, nullable: false},
        title: {type: 'string', maxlength: 2000, nullable: false},
        summary: {type: 'text', maxlength: 5000, nullable: true},
        episode_no: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        episode_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'chapter', validations: {isIn: [['chapter', 'supplement', 'afterword', 'timeline']]}},
        post_id: {type: 'string', maxlength: 24, nullable: true, references: 'posts.id', cascadeDelete: true},
        published_at: {type: 'dateTime', nullable: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['draft', 'published', 'archived']]}},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['series_id', 'episode_no'],
            ['person_id', 'sort_order'],
            ['post_id'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['series_id', 'slug']
        ]
    }),
    addTable('person_relations', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        related_person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        relation_key: {type: 'string', maxlength: 191, nullable: false},
        relation_label: {type: 'string', maxlength: 500, nullable: true},
        relation_direction: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'bidirectional', validations: {isIn: [['outgoing', 'incoming', 'bidirectional']]}},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['draft', 'published', 'archived']]}},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'relation_key'],
            ['related_person_id', 'relation_key'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['person_id', 'related_person_id', 'relation_key']
        ]
    }),
    addTable('person_post_relations', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id', cascadeDelete: true},
        relation_key: {type: 'string', maxlength: 191, nullable: false},
        relation_label: {type: 'string', maxlength: 500, nullable: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['draft', 'published', 'archived']]}},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'relation_key'],
            ['post_id', 'relation_key'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['person_id', 'post_id', 'relation_key']
        ]
    })
);
