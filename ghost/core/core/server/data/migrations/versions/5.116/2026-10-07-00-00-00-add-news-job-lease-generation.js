const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn} = require('../../../schema/commands');

const TABLE = 'social_ai_news_jobs';
const GENERATION = {type: 'integer', nullable: false, unsigned: true, defaultTo: 0};
const TOKEN = {type: 'string', maxlength: 36, nullable: true};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        if (!(await knex.schema.hasColumn(TABLE, 'claim_generation'))) {
            await addColumn(TABLE, 'claim_generation', knex, GENERATION);
        }
        if (!(await knex.schema.hasColumn(TABLE, 'claim_token'))) {
            await addColumn(TABLE, 'claim_token', knex, TOKEN);
        }
    },
    async function down(knex) {
        if (await knex.schema.hasColumn(TABLE, 'claim_token')) {
            await dropColumn(TABLE, 'claim_token', knex, TOKEN);
        }
        if (await knex.schema.hasColumn(TABLE, 'claim_generation')) {
            await dropColumn(TABLE, 'claim_generation', knex, GENERATION);
        }
    }
);
