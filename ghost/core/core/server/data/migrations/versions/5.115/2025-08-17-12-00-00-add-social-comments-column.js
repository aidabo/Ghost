const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('social_post_comments', 'edited_at', {
    type: 'dateTime',
    nullable: true
});
