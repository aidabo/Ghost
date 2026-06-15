const {createAddColumnMigration} = require('../../utils');

const addSeriesId = createAddColumnMigration('person_media', 'series_id', {
    type: 'string',
    maxlength: 24,
    nullable: true,
    references: 'person_story_series.id'
});

const addUpdatedAt = createAddColumnMigration('person_media', 'updated_at', {
    type: 'dateTime',
    nullable: true
});

module.exports = {
    config: {
        transaction: true
    },
    async up(knex) {
        await addSeriesId.up(knex);
        await addUpdatedAt.up(knex);
    },
    async down(knex) {
        await addSeriesId.down(knex);
        await addUpdatedAt.down(knex);
    }
};
