// 家族・グループの招待: 招待の行に group_id（登録したらこのグループに入る。jibunsee-react docs/planning/invite-links.md の D3）。
// 新しい DB は schema.js から作られるので、ここは今ある DB だけ（欄があれば何もしない）
const {createAddColumnMigration} = require('../../utils');

module.exports = createAddColumnMigration('invites', 'group_id', {
    type: 'string',
    maxlength: 24,
    nullable: true
});
