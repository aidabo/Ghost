const {createAddColumnMigration} = require('../../utils');

// Optional UI discovery hints only. Projects remain generic containers and
// may carry multiple purposes; this is not an authorization or lifecycle type.
module.exports = createAddColumnMigration('social_ai_projects', 'project_purposes', {
    type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true
});
