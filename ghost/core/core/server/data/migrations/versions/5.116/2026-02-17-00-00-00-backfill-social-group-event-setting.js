const logging = require('@tryghost/logging');
const {createIrreversibleMigration} = require('../../utils');

module.exports = createIrreversibleMigration(async function up(knex) {
    logging.info('Backfilling social_groups.optional_settings.groupEventSetting');

    const groups = await knex('social_groups')
        .select('id', 'optional_settings');

    let updatedCount = 0;

    for (const group of groups) {
        let settings = group.optional_settings;

        if (typeof settings === 'string') {
            try {
                settings = JSON.parse(settings);
            } catch (err) {
                settings = {};
            }
        }

        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
            settings = {};
        }

        if (!Array.isArray(settings.groupEventSetting)) {
            settings.groupEventSetting = [];
            await knex('social_groups')
                .where({id: group.id})
                .update({optional_settings: JSON.stringify(settings)});
            updatedCount += 1;
        }
    }

    logging.info(`Backfilled groupEventSetting for ${updatedCount} social_groups rows`);
});

