const {addTable} = require('../../utils');

module.exports = addTable('social_pages', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    post_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'posts.id', cascadeDelete: true},
    title: {type: 'string', maxlength: 191, nullable: false},
    excerpt: {type: 'string', maxlength: 500, nullable: true}, 
    image: {type: 'string', maxlength: 500, nullable: true},
    options: {type: 'json', nullable: true},
    props: {type: 'json', nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false},    
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: true}
});
