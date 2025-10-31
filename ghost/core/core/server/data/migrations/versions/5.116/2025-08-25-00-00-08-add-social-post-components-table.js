const {addTable} = require('../../utils');

module.exports = addTable('post_components', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    name: {type: 'string', maxlength: 60, nullable: false, index: true},
    title: {type: 'string', maxlength: 191, nullable: false},
    excerpt: {type: 'string', maxlength: 500, nullable: true},
    image: {type: 'string', maxlength: 500, nullable: true},
    attributes: {type: 'text', maxlength: 1000000000, nullable: true},
    layout: {type: 'text', maxlength: 1000000000, nullable: true},
    tag: {type: 'string', maxlength: 32, nullable: true, index: true},
    status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['published', 'draft']]}},
    created_at: {type: 'dateTime', nullable: false},
    created_by: {type: 'string', maxlength: 24, nullable: false},
    updated_at: {type: 'dateTime', nullable: false},
    updated_by: {type: 'string', maxlength: 24, nullable: true}
});

