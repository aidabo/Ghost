const {addTable} = require('../../utils');

module.exports = addTable('person_stories', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
    title: {type: 'string', maxlength: 2000, nullable: false},
    subject: {type: 'string', maxlength: 191, nullable: false},
    subject_type: {
        type: 'string',
        maxlength: 50,
        nullable: false,
        defaultTo: 'person',
        validations: {
            isIn: [['person', 'author', 'legend', 'character']]
        }
    },
    language: {
        type: 'string',
        maxlength: 10,
        nullable: false,
        defaultTo: 'zh',
        validations: {
            isIn: [['zh', 'ja', 'en']]
        }
    },
    summary: {type: 'text', maxlength: 5000, nullable: true},
    chapter_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    volume_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    time_span: {type: 'string', maxlength: 191, nullable: true},
    geography: {type: 'string', maxlength: 500, nullable: true},
    source_path: {type: 'string', maxlength: 2000, nullable: true},
    timeline_html_path: {type: 'string', maxlength: 2000, nullable: true},
    themes_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
    structural_notes_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
    structure_outline_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
    reading_order_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
    source_kind: {
        type: 'string',
        maxlength: 50,
        nullable: false,
        defaultTo: 'seed',
        validations: {
            isIn: [['seed', 'registered']]
        }
    },
    status: {
        type: 'string',
        maxlength: 50,
        nullable: false,
        defaultTo: 'published',
        validations: {
            isIn: [['draft', 'published', 'archived']]
        }
    },
    sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['status', 'updated_at'],
        ['subject'],
        ['subject_type', 'subject'],
        ['source_kind', 'status']
    ]
});
