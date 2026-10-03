const {combineTransactionalMigrations, addPermissionWithRoles} = require('../../utils');

// 編集局の作業台（/dashboard/news）は、既にある口 /ghost/api/admin/publish/content/ を
// ブラウザセッションで読む。ところが Super Editor は 2026-06-26 の migration
// （add-publish-post-permissions）で書き（add/edit/destroy）だけを貰っており、
// 読み（browse/read）が無い。テナントの運用ロールは Super Editor なので、
// 台は 403 "cannot browse publishcontent" で全滅する。
// ここで読みを足して、書きと読みの非対称を解消する。
const READ_PERMISSIONS = [
    {name: 'Browse publish content', action: 'browse', object: 'publishcontent'},
    {name: 'Read publish content', action: 'read', object: 'publishcontent'}
];

// 対象は Super Editor だけ。他のロールは既に読みを持っている（管理者は all、Author / Contributor は browse/read）。
module.exports = combineTransactionalMigrations(
    ...READ_PERMISSIONS.map((permission) => addPermissionWithRoles(permission, ['Super Editor']))
);
