const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

// 編集局の作業台（/dashboard/news）は、既にある口 /ghost/api/admin/publish/content/ を
// ブラウザセッションで読む。Super Editorにbrowse/readが無いと403になるため、読み権限を追加する。
const READ_PERMISSIONS = [
    {name: 'Browse publish content', action: 'browse', object: 'publishcontent'},
    {name: 'Read publish content', action: 'read', object: 'publishcontent'}
];

module.exports = combineTransactionalMigrations(
    ...READ_PERMISSIONS.map((permission) => addPermissionWithRoles(permission, ['Super Editor']))
);
