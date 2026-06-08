const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

const PersonRole = ghostBookshelf.Model.extend({
    tableName: 'person_roles',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            is_primary: false,
            role_order: 0,
            status: 'draft'
        };
    },

    person() {
        return this.belongsTo('Person', 'person_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'person_roles.role_order': 'ASC',
            'person_roles.updated_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id',
        'person_id',
        'role_key',
        'role_label',
        'is_primary',
        'role_order',
        'status',
        'created_at',
        'updated_at'
    ],

    relationships: ['person'],

    includeRelations: ['person']
});

const PersonRoles = ghostBookshelf.Collection.extend({
    model: PersonRole
});

module.exports = {
    PersonRole: ghostBookshelf.model('PersonRole', PersonRole),
    PersonRoles: ghostBookshelf.collection('PersonRoles', PersonRoles)
};
