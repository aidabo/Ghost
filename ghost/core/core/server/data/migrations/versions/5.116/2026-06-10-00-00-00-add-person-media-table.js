const {addTable} = require('../../utils');

module.exports = addTable('person_media', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id'},
    series_id: {type: 'string', maxlength: 24, nullable: true, references: 'person_story_series.id'},
    media_id: {type: 'string', maxlength: 24, nullable: false, references: 'social_media_assets.id'},
    media_role: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'supplemental', validations: {isIn: [['cover', 'chapter', 'timeline', 'supplemental']]}},
    sort_order: {type: 'integer', nullable: true, defaultTo: 0},
    caption: {type: 'string', maxlength: 500, nullable: true},
    is_primary: {type: 'bool', nullable: true, defaultTo: false},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true}
});
