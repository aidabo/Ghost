// Super Editor was granted add/edit/destroy for Social Charts but omitted from
// the browse/read grant: 2026-07-29-00-00-02-add-social-charts-permissions.js
// put Super Editor in WRITE_ROLES only, while browse/read went to DEFAULT_ROLES
// (Administrator/Author/Editor/Contributor/Admin Integration). The result is a
// Super Editor that can create charts but cannot list or open them — the chart
// list 403s ("cannot list socialcharts") and a published chart opened from a
// ChartGridCard fails to load ("cannot read socialchart").
//
// Backfill the two missing read-side permissions so Super Editor — already in
// social-charts' ADMIN_ROLES at the query layer — can actually browse and read
// charts. The permissions already exist (created by the 2026-07-29 migration);
// this only links them to the role, and addPermissionToRole is idempotent.
const {combineTransactionalMigrations, addPermissionToRole} = require('../../utils');

const ROLE = 'Super Editor';

const PERMISSIONS = [
    'Browse Social Charts',
    'Read Social Charts'
];

module.exports = combineTransactionalMigrations(
    ...PERMISSIONS.map(permission => addPermissionToRole({permission, role: ROLE}))
);
