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
const assertAssetsUsable = async ({knex, SocialGroup, isSystemAdmin}, actor, assetIds) => {
    const ids = [...new Set((assetIds || []).filter(Boolean))];
    if (!ids.length) {
        return;
    }
    if (!actor) {
        throw new errors.NoPermissionError({message: 'A user is required to use gallery assets.'});
    }
    ids.forEach((id) => {
        if (typeof id !== 'string' || !ASSET_ID.test(id)) {
            throw new errors.ValidationError({message: 'Asset ids must be gallery asset ids.'});
        }
    });
    const rows = await knex('social_media_assets').whereIn('id', ids).select('id', 'user_id', 'group_id');
    const byId = new Map(rows.map(row => [row.id, row]));
    const missing = ids.filter(id => !byId.has(id));
    if (missing.length) {
        throw new errors.NotFoundError({message: `Gallery asset not found: ${missing.join(', ')}`});
    }
    const others = rows.filter(row => row.user_id !== actor);
    if (!others.length || await isSystemAdmin(actor)) {
        return;
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
};

module.exports = {assertAssetsUsable};
