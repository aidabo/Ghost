const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const EstateSetting = ghostBookshelf.Model.extend({
    tableName: 'estate_settings',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            type: 'string'
        };
    }
}, {
    permittedAttributes: ['id', 'key', 'value', 'type', 'description', 'created_at', 'updated_at']
});

module.exports = {
    EstateSetting: ghostBookshelf.model('EstateSetting', EstateSetting)
};
