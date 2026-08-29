const crypto = require('crypto');
const logging = require('@tryghost/logging');
const {createNonTransactionalMigration} = require('../../utils');
const {addColumn, dropColumn} = require('../../../schema/commands');

// device_key can be up to 2000 chars, which is too long to index under utf8mb4
// (exceeds the 3072-byte / 768-char key limit). Store a fixed-length sha256 of
// device_key and enforce uniqueness on (user_id, device_key_hash) so a device
// is registered once per user+key and the upsert lookup is index-backed.
const COLUMN = {type: 'string', maxlength: 64, nullable: true};
const UNIQUE = ['user_id', 'device_key_hash'];
const UNIQUE_NAME = 'social_ai_devices_user_id_device_key_hash_unique';
const hashKey = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');

module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasTable = await knex.schema.hasTable('social_ai_devices');
        if (!hasTable) {
            logging.warn('social_ai_devices table does not exist, skipping device_key_hash');
            return;
        }

        const hasColumn = await knex.schema.hasColumn('social_ai_devices', 'device_key_hash');
        if (!hasColumn) {
            await addColumn('social_ai_devices', 'device_key_hash', knex, COLUMN);
        }

        // Backfill hashes for existing rows.
        const rows = await knex('social_ai_devices')
            .select('id', 'device_key')
            .where(function () {
                this.whereNull('device_key_hash').orWhere('device_key_hash', '');
            });
        await Promise.all(rows.map(row => knex('social_ai_devices')
            .where({id: row.id})
            .update({device_key_hash: hashKey(row.device_key)})));

        // Remove duplicate registrations (same user_id + device_key_hash), keeping the
        // most recently updated row, so the unique constraint can be added safely.
        const dupes = await knex('social_ai_devices')
            .select('user_id', 'device_key_hash')
            .count('* as count')
            .groupBy('user_id', 'device_key_hash')
            .having(knex.raw('count(*) > 1'));
        await Promise.all(dupes.map(async (dupe) => {
            const keep = await knex('social_ai_devices')
                .where({user_id: dupe.user_id, device_key_hash: dupe.device_key_hash})
                .orderBy('updated_at', 'desc')
                .first('id');
            if (keep) {
                await knex('social_ai_devices')
                    .where({user_id: dupe.user_id, device_key_hash: dupe.device_key_hash})
                    .andWhereNot('id', keep.id)
                    .del();
            }
        }));

        await knex.schema.alterTable('social_ai_devices', (table) => {
            table.unique(UNIQUE, UNIQUE_NAME);
        });
    },
    async function down(knex) {
        const hasTable = await knex.schema.hasTable('social_ai_devices');
        if (!hasTable) {
            return;
        }

        try {
            await knex.schema.alterTable('social_ai_devices', (table) => {
                table.dropUnique(UNIQUE, UNIQUE_NAME);
            });
        } catch (err) {
            logging.warn(`Could not drop unique ${UNIQUE_NAME}: ${err.message}`);
        }

        const hasColumn = await knex.schema.hasColumn('social_ai_devices', 'device_key_hash');
        if (hasColumn) {
            await dropColumn('social_ai_devices', 'device_key_hash', knex, COLUMN);
        }
    }
);
