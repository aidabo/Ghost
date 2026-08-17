const {commands} = require('../../../schema');
const {createNonTransactionalMigration} = require('../../utils');

const TABLE_INDEXES = {
    social_ai_dzi_jobs: [
        ['status'],
        ['user_id', 'status'],
        ['status', 'claim_expires_at']
    ],
    social_ai_chart_jobs: [
        ['status'],
        ['type', 'status'],
        ['user_id', 'status'],
        ['status', 'claim_expires_at']
    ]
};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        await Object.entries(TABLE_INDEXES).reduce(async (previousTable, [table, indexes]) => {
            await previousTable;
            if (!await knex.schema.hasTable(table)) {
                return;
            }

            await indexes.reduce(async (previousIndex, columns) => {
                await previousIndex;
                await commands.addIndex(table, columns, knex);
            }, Promise.resolve());
        }, Promise.resolve());
    },
    async function down() {
        // These indexes belong to the original table definitions. Do not drop
        // an index that may have existed before this repair migration ran.
    }
);
