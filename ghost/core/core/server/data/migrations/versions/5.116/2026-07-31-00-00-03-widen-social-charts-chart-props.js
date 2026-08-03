const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');

// social_charts.chart_props was created as a plain TEXT column (~64KB on MySQL) — the create
// migration was missing `fieldtype: 'long'`. Large charts (e.g. hundreds of nodes) overflow it
// and Ghost fails to save with ER_DATA_TOO_LONG. Widen it to LONGTEXT to match schema.js.
// SQLite's TEXT is already unlimited, so nothing to do there.
module.exports = createTransactionalMigration(
    async function up(knex) {
        if (knex.client.config.client === 'sqlite3') {
            logging.info('SQLite: social_charts.chart_props (TEXT) is already unlimited — skipping');
            return;
        }
        logging.info('Widening social_charts.chart_props to LONGTEXT');
        await knex.schema.alterTable('social_charts', function (table) {
            table.text('chart_props', 'longtext').nullable().alter();
        });
    },
    async function down(knex) {
        if (knex.client.config.client === 'sqlite3') {
            return;
        }
        logging.info('Reverting social_charts.chart_props to TEXT');
        await knex.schema.alterTable('social_charts', function (table) {
            table.text('chart_props').nullable().alter();
        });
    }
);
