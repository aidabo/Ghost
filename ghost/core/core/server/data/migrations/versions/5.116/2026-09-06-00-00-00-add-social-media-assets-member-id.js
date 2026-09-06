const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('social_media_assets', 'member_id', {
    type: 'string',
    maxlength: 24,
    nullable: true,
    index: true,
    references: 'members.id',
    cascadeDelete: true
});
