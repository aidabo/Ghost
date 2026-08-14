const {addTable} = require('../../utils');

module.exports = addTable('post_media', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id', cascadeDelete: true},
    media_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_media_assets.id', setNullDelete: true},
    media_type: {type: 'string', maxlength: 20, nullable: false, validations: {isIn: [['image', 'video', 'audio']]}},
    source_url: {type: 'string', maxlength: 2000, nullable: false},
    source_url_hash: {type: 'string', maxlength: 64, nullable: false, index: true},
    thumbnail_url: {type: 'string', maxlength: 2000, nullable: true},
    caption: {type: 'string', maxlength: 1000, nullable: true},
    alt: {type: 'string', maxlength: 1000, nullable: true},
    role: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'content', validations: {isIn: [['feature', 'content']]}},
    sort_order: {type: 'integer', nullable: false, defaultTo: 0},
    lexical_node_key: {type: 'string', maxlength: 191, nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true},
    '@@INDEXES@@': [
        ['post_id', 'sort_order']
    ],
    '@@UNIQUE_CONSTRAINTS@@': [
        ['post_id', 'source_url_hash', 'role']
    ]
});
