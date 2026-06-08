const {addTable} = require('../../utils');

module.exports = addTable('person_gallery_assets', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
    gallery_path: {type: 'string', maxlength: 2000, nullable: true},
    asset_key: {type: 'string', maxlength: 2000, nullable: false},
    asset_type: {
        type: 'string',
        maxlength: 50,
        nullable: false,
        defaultTo: 'image',
        validations: {
            isIn: [['image', 'video', 'audio', 'file']]
        }
    },
    title: {type: 'string', maxlength: 500, nullable: true},
    alt_text: {type: 'string', maxlength: 500, nullable: true},
    caption: {type: 'text', maxlength: 5000, nullable: true},
    mime_type: {type: 'string', maxlength: 100, nullable: true},
    storage_key: {type: 'string', maxlength: 2000, nullable: true},
    asset_url: {type: 'string', maxlength: 2000, nullable: true},
    source_path: {type: 'string', maxlength: 2000, nullable: true},
    sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    status: {
        type: 'string',
        maxlength: 50,
        nullable: false,
        defaultTo: 'draft',
        validations: {
            isIn: [['draft', 'published', 'archived']]
        }
    },
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['person_id', 'sort_order'],
        ['gallery_path'],
        ['asset_type', 'status'],
        ['status']
    ],
    '@@UNIQUE INDEXES@@': [
        ['person_id', 'asset_key']
    ]
});
