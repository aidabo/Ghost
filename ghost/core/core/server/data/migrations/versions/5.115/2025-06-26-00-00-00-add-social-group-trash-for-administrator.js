const {createTransactionalMigration} = require('../../utils');
const ObjectID = require('bson-objectid').default;
const logging = require('@tryghost/logging');

module.exports = createTransactionalMigration(    
    async function up(knex) {
        const role = await knex
            .select('id')
            .from('roles')
            .where('name', 'Owner')
            .first();
        logging.info(`Get Owner role id`, JSON.stringify(role));

        const user = await knex
            .select('user_id')
            .from('roles_users')
            .where('role_id', role.id)
            .first();
        logging.info(`Get Owner user id`, JSON.stringify(user));    

        const now = knex.raw('CURRENT_TIMESTAMP');
        const groupId = ObjectID().toHexString();

        logging.info(`Adding trash group for Administrator`);
        await knex('social_groups')
            .insert({
                id: groupId,
                group_name: 'Trash',
                creator_id: user.user_id, 
                type: 'public',
                status: 'archived',
                description: 'This group is used to store deleted social groups temporarily before permanent deletion.',
                created_by: user.user_id,
                updated_at: now,
                created_at: now
            });
        
        logging.info(`Adding group owner of administrator to trash group`);
        await knex('social_group_members')
            .insert({
                id: ObjectID().toHexString(),
                group_id: groupId,
                user_id: user.user_id, 
                status: 'active',
                role_id: role.id,
                created_by: user.user_id,
                updated_at: now,
                created_at: now
            });
    },

    async function down(knex) {
    }
);
