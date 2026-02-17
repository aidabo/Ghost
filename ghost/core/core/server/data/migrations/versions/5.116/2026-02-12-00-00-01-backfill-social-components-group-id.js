const {createIrreversibleMigration} = require('../../utils');

module.exports = createIrreversibleMigration(async function up(knex) {
    await knex('social_components as sc')
        .whereNull('sc.group_id')
        .update({
            group_id: knex.raw(`(
                SELECT p.group_id
                FROM social_post_components spc
                INNER JOIN posts p ON p.id = spc.post_id
                WHERE spc.component_id = sc.id
                  AND p.group_id IS NOT NULL
                ORDER BY p.updated_at DESC
                LIMIT 1
            )`)
        });
});

