const {addTable} = require('../../utils');

//social_post_comments
module.exports = addTable('social_post_comments', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    post_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'posts.id', cascadeDelete: true},
    parent_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'social_post_comments.id', cascadeDelete: true},
    in_reply_to_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'social_post_comments.id', setNullDelete: true},
    status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'published', validations: {isIn: [['published', 'hidden', 'deleted']]}},
    html: {type: 'text', maxlength: 1024, fieldtype: 'long', nullable: false},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false},    
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: true},
    '@@INDEXES@@': [
        ['post_id', 'status']
    ]
});
