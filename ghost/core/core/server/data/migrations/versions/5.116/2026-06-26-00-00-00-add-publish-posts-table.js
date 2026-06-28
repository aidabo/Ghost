const {addTable} = require('../../utils');

module.exports = addTable('publish_posts', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    post_id: {type: 'string', maxlength: 24, nullable: false, unique: true, references: 'posts.id', cascadeDelete: true},
    content_type: {
        type: 'string',
        maxlength: 50,
        nullable: false,
        defaultTo: 'news',
        validations: {
            isIn: [['news', 'government', 'publication', 'comic', 'entertainment']]
        }
    },
    section: {type: 'string', maxlength: 200, nullable: true},
    featured: {type: 'bool', nullable: false, defaultTo: false},
    metadata_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
    sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['content_type'],
        ['featured'],
        ['content_type', 'section']
    ]
});
