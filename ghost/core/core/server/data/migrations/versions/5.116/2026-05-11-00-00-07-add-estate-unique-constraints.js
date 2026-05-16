const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasEstateProperties = await knex.schema.hasTable('estate_properties');
        if (!hasEstateProperties) {
            logging.warn('estate_properties table does not exist, skipping estate index/constraint creation');
            return;
        }

        // Unique constraints on junction tables
        const propertyPostsExists = await knex.schema.hasTable('estate_property_posts');
        if (propertyPostsExists) {
            const hasConstraint = await knex.schema.hasColumn('estate_property_posts', 'property_id');
            if (hasConstraint) {
                await knex.schema.alterTable('estate_property_posts', (table) => {
                    table.unique(['property_id', 'post_id', 'locale'], 'estate_property_posts_unique');
                });
                logging.info('Added unique constraint on estate_property_posts(property_id, post_id, locale)');
            }
        }

        const propertyTagsExists = await knex.schema.hasTable('estate_property_tags');
        if (propertyTagsExists) {
            const hasTagConstraint = await knex.schema.hasColumn('estate_property_tags', 'property_id');
            if (hasTagConstraint) {
                await knex.schema.alterTable('estate_property_tags', (table) => {
                    table.unique(['property_id', 'tag_id'], 'estate_property_tags_unique');
                });
                logging.info('Added unique constraint on estate_property_tags(property_id, tag_id)');
            }
        }

        const propertyMediaExists = await knex.schema.hasTable('estate_property_media');
        if (propertyMediaExists) {
            const hasMediaConstraint = await knex.schema.hasColumn('estate_property_media', 'property_id');
            if (hasMediaConstraint) {
                await knex.schema.alterTable('estate_property_media', (table) => {
                    table.unique(['property_id', 'media_id', 'media_type'], 'estate_property_media_unique');
                });
                logging.info('Added unique constraint on estate_property_media(property_id, media_id, media_type)');
            }
        }

        // Indexes on estate_properties
        const propsCols = await knex('estate_properties').columnInfo();
        if (propsCols.status && !propsCols.status.index) {
            await knex.schema.alterTable('estate_properties', (table) => {
                table.index('status', 'estate_properties_status_index');
                table.index('property_type', 'estate_properties_type_index');
            });
            if (propsCols.group_id) {
                await knex.schema.alterTable('estate_properties', (table) => {
                    table.index('group_id', 'estate_properties_group_index');
                });
            }
            if (propsCols.featured) {
                await knex.schema.alterTable('estate_properties', (table) => {
                    table.index('featured', 'estate_properties_featured_index');
                });
            }
            logging.info('Added indexes on estate_properties');
        }

        // Indexes on estate_inquiries
        const inquiriesExist = await knex.schema.hasTable('estate_inquiries');
        if (inquiriesExist) {
            const inquiryCols = await knex('estate_inquiries').columnInfo();
            if (inquiryCols.status && !inquiryCols.status.index) {
                await knex.schema.alterTable('estate_inquiries', (table) => {
                    table.index('status', 'estate_inquiries_status_index');
                    table.index('property_id', 'estate_inquiries_property_index');
                });
                logging.info('Added indexes on estate_inquiries');
            }
        }
    },
    async function down(knex) {
        // Drop unique constraints
        try {
            await knex.schema.alterTable('estate_property_posts', (table) => {
                table.dropUnique(null, 'estate_property_posts_unique');
            });
        } catch (_) { /* ignore if not exists */ }

        try {
            await knex.schema.alterTable('estate_property_tags', (table) => {
                table.dropUnique(null, 'estate_property_tags_unique');
            });
        } catch (_) { /* ignore if not exists */ }

        try {
            await knex.schema.alterTable('estate_property_media', (table) => {
                table.dropUnique(null, 'estate_property_media_unique');
            });
        } catch (_) { /* ignore if not exists */ }

        // Drop indexes
        try {
            await knex.schema.alterTable('estate_properties', (table) => {
                table.dropIndex(null, 'estate_properties_status_index');
                table.dropIndex(null, 'estate_properties_type_index');
                table.dropIndex(null, 'estate_properties_group_index');
                table.dropIndex(null, 'estate_properties_featured_index');
            });
        } catch (_) { /* ignore if not exists */ }

        try {
            await knex.schema.alterTable('estate_inquiries', (table) => {
                table.dropIndex(null, 'estate_inquiries_status_index');
                table.dropIndex(null, 'estate_inquiries_property_index');
            });
        } catch (_) { /* ignore if not exists */ }
    }
);
