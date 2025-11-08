const {addTable} = require('../../utils');

module.exports = addTable('social_post_components', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id'},
    component_id: {type: 'string', maxlength: 24, nullable: false, references: 'social_components.id'},
    sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
    '@@INDEXES@@': [
        ['post_id','component_id']
    ]
});
