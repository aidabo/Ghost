// Super Editor was never linked to "Count Tags": the permission was created by
// 5.115/2025-07-12-00-00-00-add-social-tag-count-permissions.js for Editor and
// Author only, after the Super Editor role already existed (5.113). The result
// is a Super Editor that can add/edit/delete tags but gets 403 on
// /tags/all/count/ ("You do not have permission to count tags") — the host's
// /panel calls it on every open.
//
// fixtures.json already gives Super Editor `"tag": "all"`, so a fresh database
// gets Count Tags through the fixtures; this backfills existing databases.
// The permission already exists — this only links it to the role, and
// addPermissionToRole is idempotent.
const {combineTransactionalMigrations, addPermissionToRole} = require('../../utils');

module.exports = combineTransactionalMigrations(
    addPermissionToRole({permission: 'Count Tags', role: 'Super Editor'})
);
