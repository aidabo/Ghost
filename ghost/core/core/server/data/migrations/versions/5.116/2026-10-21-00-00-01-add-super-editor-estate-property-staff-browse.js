// The estate staff browse permission was added after the main Super Editor
// estate read backfill had already been applied. Keep this as a separate
// migration so existing databases receive the missing relation permission.
const {addPermissionToRole} = require('../../utils');

module.exports = addPermissionToRole({
    permission: 'Browse estate property staff',
    role: 'Super Editor'
});
