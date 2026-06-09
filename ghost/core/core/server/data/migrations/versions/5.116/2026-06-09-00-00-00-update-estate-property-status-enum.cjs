const logging = require('@tryghost/logging');
const {createTransactionalMigration} = require('../../utils');
const DatabaseInfo = require('@tryghost/database-info');

const STATUS_VALUES = ['published', 'draft', 'working', 'contracted', 'booked', 'invalid'];
const STATUS_ENUM_SQL = STATUS_VALUES.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');

module.exports = createTransactionalMigration(
    async function up(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping estate property status enum migration for SQLite3');
            return;
        }

        logging.info('Normalize estate property status values');
        await knex.raw(`
            UPDATE estate_properties
            SET status = CASE
                WHEN status IN ('commit', 'sold') THEN 'contracted'
                WHEN status IN ('booked', 'rented') THEN 'booked'
                WHEN status NOT IN (${STATUS_VALUES.map(() => '?').join(', ')}) THEN 'invalid'
                ELSE status
            END
        `, STATUS_VALUES);

        logging.info('Alter estate_properties.status to enum');
        await knex.raw(`
            ALTER TABLE estate_properties
            MODIFY COLUMN status ENUM(${STATUS_ENUM_SQL}) NOT NULL DEFAULT 'draft'
        `);
    },
    async function down(knex) {
        if (DatabaseInfo.isSQLite(knex)) {
            logging.warn('Skipping estate property status enum rollback for SQLite3');
            return;
        }

        logging.info('Revert estate_properties.status to varchar');
        await knex.raw(`
            ALTER TABLE estate_properties
            MODIFY COLUMN status VARCHAR(50) NOT NULL DEFAULT 'draft'
        `);
    }
);
