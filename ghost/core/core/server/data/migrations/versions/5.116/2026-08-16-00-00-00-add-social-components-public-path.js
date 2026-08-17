const security = require('@tryghost/security');
const {createTransactionalMigration} = require('../../utils');

const findAvailableSlug = (base, used, suffix = 1) => {
    const suffixText = suffix === 1 ? '' : `-${suffix}`;
    const candidate = `${base.slice(0, 191 - suffixText.length)}${suffixText}`;
    return used.has(candidate) ? findAvailableSlug(base, used, suffix + 1) : candidate;
};

module.exports = createTransactionalMigration(
    async function up(knex) {
        await knex.schema.alterTable('social_components', (table) => {
            table.string('public_path', 191).nullable().unique();
        });

        const existingRows = await knex('social_components').select('slug');
        const used = new Set(existingRows.map(row => row.slug).filter(Boolean));
        const missingRows = await knex('social_components')
            .select('id', 'title')
            .whereNull('slug')
            .orWhere('slug', '')
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc');

        await missingRows.reduce(async (previous, row) => {
            await previous;
            let base = security.string.safe(row.title || '').slice(0, 185);
            if (!base) {
                base = `page-${row.id}`;
            }

            const candidate = findAvailableSlug(base, used);
            await knex('social_components').where({id: row.id}).update({slug: candidate});
            used.add(candidate);
        }, Promise.resolve());
    },

    async function down(knex) {
        await knex.schema.alterTable('social_components', (table) => {
            table.dropColumn('public_path');
        });
    }
);
