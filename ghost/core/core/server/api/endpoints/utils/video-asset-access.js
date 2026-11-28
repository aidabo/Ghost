const errors = require('@tryghost/errors');

const ASSET_ID = /^[a-f0-9]{24}$/;

// The one check for "may this staff user put this gallery asset into a video"
// (video jobs: scene images and the avatar photo; avatar consents: the photo).
// The video worker reads assets with the integration key, so Ghost must refuse
// any asset the creator could not open themselves — otherwise a job could pull
// another user's private photo into a video the creator can watch.
//
// Allowed: the asset's own user, a system admin, or a user with write access to
// the asset's group. Dependencies are passed in so the endpoints' tests can run
// it against an in-memory database.
//
// @param {object} deps
// @param {Function} deps.knex
// @param {object} deps.SocialGroup  model with findOne and canAccessGroup
// @param {Function} deps.isSystemAdmin  async (userId) => boolean
// @param {string} actor
// @param {string[]} assetIds
// @returns {Promise<object[]>} the asset rows that were checked (id, user_id,
//   group_id, storage_key, storage_url, asset_type, original_filename). A caller
//   that needs the asset's fields must use these rows, not read them again: a
//   second read could see a group change made after the check.
const assertAssetsUsable = async ({knex, SocialGroup, isSystemAdmin}, actor, assetIds) => {
    const ids = [...new Set((assetIds || []).filter(Boolean))];
    if (!ids.length) {
        return [];
    }
    if (!actor) {
        throw new errors.NoPermissionError({message: 'A user is required to use gallery assets.'});
    }
    ids.forEach((id) => {
        if (typeof id !== 'string' || !ASSET_ID.test(id)) {
            throw new errors.ValidationError({message: 'Asset ids must be gallery asset ids.'});
        }
    });
    const rows = await knex('social_media_assets').whereIn('id', ids).select('id', 'user_id', 'group_id', 'storage_key', 'storage_url', 'asset_type', 'original_filename');
    const byId = new Map(rows.map(row => [row.id, row]));
    const missing = ids.filter(id => !byId.has(id));
    if (missing.length) {
        throw new errors.NotFoundError({message: `Gallery asset not found: ${missing.join(', ')}`});
    }
    const others = rows.filter(row => row.user_id !== actor);
    if (!others.length || await isSystemAdmin(actor)) {
        return rows;
    }
    const groupAccess = new Map();
    for (const row of others) {
        const groupId = row.group_id || null;
        if (!groupId) {
            throw new errors.NoPermissionError({message: 'You are not allowed to use this gallery asset.'});
        }
        if (!groupAccess.has(groupId)) {
            const group = await SocialGroup.findOne({id: groupId});
            groupAccess.set(groupId, Boolean(group) && Boolean(await SocialGroup.canAccessGroup(group, actor, 'write')));
        }
        if (!groupAccess.get(groupId)) {
            throw new errors.NoPermissionError({message: 'You are not allowed to use this gallery asset.'});
        }
    }
    return rows;
};

// clip-presenter's phone video (front repo docs/planning/phone-video-avatar-plan.md
// §7.3): only the caller's OWN video, uploaded to their own area (owner_scope
// 'user', no group). Stricter than assertAssetsUsable on purpose: a video of
// people is not pulled in from a group or by an admin.
//
// @param {object} deps
// @param {Function} deps.knex
// @param {string} actor
// @param {string} assetId
const assertOwnVideo = async ({knex}, actor, assetId) => {
    if (!actor) {
        throw new errors.NoPermissionError({message: 'A user is required to use gallery assets.'});
    }
    const row = await knex('social_media_assets').where({id: assetId}).first('id', 'user_id', 'group_id', 'owner_scope', 'asset_type');
    if (!row) {
        throw new errors.NotFoundError({message: `Gallery asset not found: ${assetId}`});
    }
    if (row.user_id !== actor || row.group_id || row.owner_scope !== 'user') {
        throw new errors.NoPermissionError({message: 'Only a video you uploaded to your own area can be used.'});
    }
    if (String(row.asset_type || '').trim().toLowerCase() !== 'video') {
        throw new errors.ValidationError({message: 'clip.video_asset_id must be a video.'});
    }
    return row;
};

module.exports = {assertAssetsUsable, assertOwnVideo};
