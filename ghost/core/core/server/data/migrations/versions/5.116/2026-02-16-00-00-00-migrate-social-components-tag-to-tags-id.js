const logging = require('@tryghost/logging');
const {createIrreversibleMigration} = require('../../utils');
const {addForeign, addIndex} = require('../../../schema/commands');

const TAG_ID_REGEX = /^[a-f0-9]{24}$/;

module.exports = createIrreversibleMigration(async function up(knex) {
    logging.info('Migrating social_components.tag values to tags.id references');

    const tagRows = await knex('tags')
        .select('id', 'slug', 'name');

    const tagIds = new Set();
    const tagBySlug = new Map();
    const tagByName = new Map();

    for (const row of tagRows) {
        const id = row.id;
        if (!id) {
            continue;
        }

        tagIds.add(id);

        if (typeof row.slug === 'string' && row.slug.trim()) {
            tagBySlug.set(row.slug.trim().toLowerCase(), id);
        }

        if (typeof row.name === 'string' && row.name.trim() && !tagByName.has(row.name.trim())) {
            tagByName.set(row.name.trim(), id);
        }
    }

    const componentRows = await knex('social_components')
        .select('id', 'tag')
        .whereNotNull('tag');

    for (const row of componentRows) {
        const currentTag = typeof row.tag === 'string' ? row.tag.trim() : '';
        let resolvedTagId = null;

        if (currentTag) {
            if (TAG_ID_REGEX.test(currentTag) && tagIds.has(currentTag)) {
                resolvedTagId = currentTag;
            } else {
                resolvedTagId = tagBySlug.get(currentTag.toLowerCase()) || tagByName.get(currentTag) || null;
            }
        }

        if (row.tag !== resolvedTagId) {
            await knex('social_components')
                .where({id: row.id})
                .update({tag: resolvedTagId});
        }
    }

    await knex.schema.alterTable('social_components', function (table) {
        table.string('tag', 24).nullable().alter();
    });

    await addForeign({
        fromTable: 'social_components',
        fromColumn: 'tag',
        toTable: 'tags',
        toColumn: 'id',
        setNullDelete: true,
        transaction: knex
    });

    await addIndex('social_components', 'tag', knex);
});
