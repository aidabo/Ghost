const {createAddColumnMigration} = require('../../utils');

// Per-media "selected for display" flag on the property↔media join. Drives a
// select-or-all rule shared by the gallery slider and the property Post: if any
// media is selected, only selected media are shown/used; otherwise all are.
module.exports = createAddColumnMigration('estate_property_media', 'is_selected', {
    type: 'bool',
    nullable: true,
    defaultTo: false
});
