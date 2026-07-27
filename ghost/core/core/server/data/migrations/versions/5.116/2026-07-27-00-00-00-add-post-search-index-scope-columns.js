const {createNonTransactionalMigration} = require('../../utils');
const logging = require('@tryghost/logging');

// Add scope columns to post_search_index so the session / "my home" datasource can
// filter keyword search to the logged-in user's own posts and a selected group:
//   group_id   — the post's group_id (nullable; NULL = group-less)
//   author_ids — comma-separated author ids (FIND_IN_SET(userId, author_ids))
// Additive only; existing rows get the values on the next backfill / post edit.
const TABLE = 'post_search_index';
const COLUMNS = [
    {name: 'group_id', add: (table) => table.string('group_id', 24).nullable()},
    {name: 'author_ids', add: (table) => table.text('author_ids').nullable()}
];

async function columnExists(knex, column) {
    return knex.schema.hasColumn(TABLE, column);
}

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        if (!await knex.schema.hasTable(TABLE)) {
            return;
        }
        for (const col of COLUMNS) {
            if (await columnExists(knex, col.name)) {
                continue;
            }
            await knex.schema.alterTable(TABLE, (table) => {
                col.add(table);
            });
            logging.info(`[post-search-index] added column ${col.name} to ${TABLE}`);
        }
    },
    async function down(knex) {
        if (!await knex.schema.hasTable(TABLE)) {
            return;
        }
        for (const col of [...COLUMNS].reverse()) {
            if (!await columnExists(knex, col.name)) {
                continue;
            }
            await knex.schema.alterTable(TABLE, (table) => {
                table.dropColumn(col.name);
            });
        }
    }
);
