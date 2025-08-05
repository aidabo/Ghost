const {addTable} = require('../../utils');

//social_post_comment_reports
module.exports = addTable('social_post_comment_reports', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},
    comment_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'social_post_comments.id', cascadeDelete: true},
    user_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'users.id', cascadeDelete: true},
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: false}
});
