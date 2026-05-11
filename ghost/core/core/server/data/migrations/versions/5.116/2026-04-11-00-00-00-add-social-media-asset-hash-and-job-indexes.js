const crypto = require('crypto');
const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn, addIndex, dropIndex} = require('../../../schema/commands');

const STORAGE_KEY_HASH_COLUMN = {
    type: 'string',
    maxlength: 64,
    nullable: true
};

const buildStorageKeyHash = (value) => {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return null;
    }
    return crypto.createHash('sha256').update(normalized).digest('hex');
};

async function backfillStorageKeyHashes(knex) {
    const batchSize = 500;
    let lastId = null;

    while (true) {
        let query = knex('social_media_assets')
            .select('id', 'storage_key')
            .whereNull('storage_key_hash')
            .orderBy('id', 'asc')
            .limit(batchSize);

        if (lastId) {
            query = query.andWhere('id', '>', lastId);
        }

        const rows = await query;
        if (!rows.length) {
            break;
        }

        for (const row of rows) {
            await knex('social_media_assets')
                .where({id: row.id})
                .update({
                    storage_key_hash: buildStorageKeyHash(row.storage_key)
                });
        }

        lastId = rows[rows.length - 1].id;
    }
}

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasHashColumn = await knex.schema.hasColumn('social_media_assets', 'storage_key_hash');
        if (!hasHashColumn) {
            await addColumn('social_media_assets', 'storage_key_hash', knex, STORAGE_KEY_HASH_COLUMN);
        }

        await backfillStorageKeyHashes(knex);

        await addIndex('social_media_assets', ['storage_key_hash'], knex);
        await addIndex('social_ai_media_jobs', ['user_id', 'updated_at'], knex);
        await addIndex('social_ai_media_jobs', ['group_id', 'updated_at'], knex);
        await addIndex('social_ai_media_jobs', ['status', 'claim_expires_at'], knex);
    },
    async function down(knex) {
        await dropIndex('social_ai_media_jobs', ['status', 'claim_expires_at'], knex);
        await dropIndex('social_ai_media_jobs', ['group_id', 'updated_at'], knex);
        await dropIndex('social_ai_media_jobs', ['user_id', 'updated_at'], knex);
        await dropIndex('social_media_assets', ['storage_key_hash'], knex);

        const hasHashColumn = await knex.schema.hasColumn('social_media_assets', 'storage_key_hash');
        if (!hasHashColumn) {
            logging.warn('storage_key_hash column already removed from social_media_assets');
            return;
        }
        await dropColumn('social_media_assets', 'storage_key_hash', knex, STORAGE_KEY_HASH_COLUMN);
    }
);
