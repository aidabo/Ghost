const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn} = require('../../../schema/commands');

// Optional free-text classification/category label for tags. Nullable string,
// mirrors accent_color (no URL transform, no special model handling). Lets the
// host group/filter tags by classification. Additive and reversible.
const CLASSIFICATION_COLUMN = {
    type: 'string',
    maxlength: 100,
    nullable: true
};

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasColumn = await knex.schema.hasColumn('tags', 'classification');
        if (!hasColumn) {
            await addColumn('tags', 'classification', knex, CLASSIFICATION_COLUMN);
        }
    },
    async function down(knex) {
        const hasColumn = await knex.schema.hasColumn('tags', 'classification');
        if (!hasColumn) {
            logging.warn('classification column already removed from tags');
            return;
        }
        await dropColumn('tags', 'classification', knex, CLASSIFICATION_COLUMN);
    }
);
