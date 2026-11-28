// 古い person の仕組み（人物の表・/person/* の API）を消す（front の person-legacy-removal-plan.md の PR 5）。
// 人物の物語は今、下書きの Post ＋ タグ ＋ プロジェクトで登録し、この表は使っていない（API は Ghost #100 で消した）。
// - 表が在るときだけ DROP する（子の表から、persons を最後に）。何度流しても同じ。
// - person の権限（permissions の object_type が person 系）と、その役割との結び付き（permissions_roles）も消す。無ければ何もしない。
// - 戻せない（irreversible）: down で空の表を作り直してもデータは戻らない。戻すときは配布前に取ったダンプから入れ直す。
const logging = require('@tryghost/logging');
const {createIrreversibleMigration} = require('../../utils');
const {commands} = require('../../../schema');

// 子 → 親の順。persons を最後に
const TABLES = [
    'person_media',
    'person_post_relations',
    'person_relations',
    'person_story_episodes',
    'person_story_series',
    'person_life_events',
    'person_roles',
    'person_stories',
    'persons'
];

// fixtures.json と古い migration（2026-06-02・06-03）が足した権限の object_type
const PERMISSION_OBJECT_TYPES = [
    'person',
    'personrole',
    'personlifeevent',
    'personrelation',
    'personstory',
    'personstoryseries',
    'personstoryepisode',
    'personpostrelation',
    'persongalleryasset'
];

module.exports = createIrreversibleMigration(async function up(connection) {
    const permissionIds = (await connection('permissions').whereIn('object_type', PERMISSION_OBJECT_TYPES).select('id')).map(row => row.id);
    if (permissionIds.length > 0) {
        const grants = await connection('permissions_roles').whereIn('permission_id', permissionIds).del();
        const permissions = await connection('permissions').whereIn('id', permissionIds).del();
        logging.info(`Removed person permissions: ${permissions} (role grants: ${grants})`);
    } else {
        logging.warn('Skipping removing person permissions - none found');
    }

    for (const name of TABLES) {
        if (!await connection.schema.hasTable(name)) {
            logging.warn(`Skipping dropping table: ${name} - table does not exist`);
            continue;
        }
        logging.info(`Dropping table: ${name}`);
        await commands.deleteTable(name, connection);
    }
});

// permission-migrations-parity.test.js が「古い migration が足した person の権限は、もう fixtures に無くてよい」と読む
module.exports.removedPermissionObjectTypes = PERMISSION_OBJECT_TYPES;
module.exports.droppedTables = TABLES;
