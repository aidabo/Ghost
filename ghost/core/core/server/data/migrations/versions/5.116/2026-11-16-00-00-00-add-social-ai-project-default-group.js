const logging = require('@tryghost/logging');
const DatabaseInfo = require('@tryghost/database-info');
const {createNonTransactionalMigration} = require('../../utils');

const UNIQUE_NAME = 'social_ai_projects_default_group_id_unique';

const hasUniqueIndex = async (knex) => {
    if (DatabaseInfo.isMySQL(knex)) {
        const [rows] = await knex.raw(
            'SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1',
            ['social_ai_projects', UNIQUE_NAME]
        );
        return rows.length > 0;
    }
    const rows = await knex.raw('PRAGMA index_list("social_ai_projects")');
    return rows.some(row => String(row.name) === UNIQUE_NAME);
};

// 家族ページの「既定 project」(docs/planning/simple-family-page-bootstrap-design.md)。
// 既定の project だけ default_group_id = group_id を持ち、それ以外は NULL。
// MySQL の UNIQUE は NULL を複数許すので、1家族に1つだけ既定を持てる。
// 列は schema.js にもある（新規DB用）。ここは既存DB向け。
module.exports = createNonTransactionalMigration(
    async function up(knex) {
        const hasColumn = await knex.schema.hasColumn('social_ai_projects', 'default_group_id');
        if (!hasColumn) {
            await knex.schema.alterTable('social_ai_projects', (table) => {
                table.string('default_group_id', 24).nullable();
                table.foreign('default_group_id')
                    .references('social_groups.id')
                    .onDelete('SET NULL');
            });
        }

        // 既にある場合は何もしない（再実行・別経路で作られた場合）。
        if (!await hasUniqueIndex(knex)) {
            await knex.schema.alterTable('social_ai_projects', (table) => {
                table.unique(['default_group_id'], UNIQUE_NAME);
            });
        }
    },
    async function down(knex) {
        // FK を先に外す（MySQL は UNIQUE 索引が FK に使われていると索引を消せない）。
        try {
            await knex.schema.alterTable('social_ai_projects', (table) => {
                table.dropForeign(['default_group_id']);
            });
        } catch (err) {
            logging.warn(`Dropping FK social_ai_projects.default_group_id failed: ${err.message}`);
        }
        try {
            if (await hasUniqueIndex(knex)) {
                await knex.schema.alterTable('social_ai_projects', (table) => {
                    table.dropUnique(['default_group_id'], UNIQUE_NAME);
                });
            }
        } catch (err) {
            logging.warn(`Dropping UNIQUE ${UNIQUE_NAME} failed: ${err.message}`);
        }
        try {
            await knex.schema.alterTable('social_ai_projects', (table) => {
                table.dropColumn('default_group_id');
            });
        } catch (err) {
            logging.warn(`Dropping column default_group_id failed: ${err.message}`);
        }
    }
);
