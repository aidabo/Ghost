const {addTable} = require('../../utils');

module.exports = addTable('estate_settings', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    key: {type: 'string', maxlength: 200, nullable: false, unique: true},
    value: {type: 'text', maxlength: 10000, nullable: true},
    type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'string'},
    description: {type: 'string', maxlength: 500, nullable: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true}
});
