// News avatar profile registry.
//
// Profile metadata lives here; image bytes stay in social_media_assets and are
// uploaded through the existing Gallery presign/finalize flow. Versions are
// immutable once active so a News job can snapshot a presenter reliably.
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
const ObjectId = require('bson-objectid').default;

const PROFILES = 'social_ai_avatar_profiles';
const VERSIONS = 'social_ai_avatar_profile_versions';
const ASSETS = 'social_media_assets';
const MANAGER_ROLES = new Set(['Owner', 'Administrator', 'Admin', 'Editor', 'Super Editor']);

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'Avatar profile not found.',
    versionNotFound: 'Avatar profile version not found.',
    noPermission: 'You are not allowed to manage avatar profiles.',
    invalidAsset: 'The avatar image asset must be an image in the Gallery.',
    invalidVersion: 'The avatar version is invalid.'
};

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const currentUserId = frame => frame.options?.context?.user || null;
const currentIntegrationId = frame => frame.options?.context?.integration || null;
const payload = frame => frame.data?.socialaiavatarprofiles?.[0] || frame.data || {};

async function canManage(userId) {
    if (!userId) return false;
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    if (!user) return false;
    return (user.related('roles')?.models || []).some(role => MANAGER_ROLES.has(role.get('name')));
}

async function requireManager(frame) {
    const userId = currentUserId(frame);
    if (!userId && !currentIntegrationId(frame)) {
        throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
    }
    if (currentIntegrationId(frame) || !(await canManage(userId))) {
        throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
    }
    return userId;
}

const serializeVersion = row => ({
    id: row.id,
    profile_id: row.profile_id,
    version: Number(row.version),
    image_asset_id: row.image_asset_id || null,
    project_id: row.project_id || null,
    source_kind: row.source_kind,
    generation_model: row.generation_model || null,
    prompt_hash: row.prompt_hash || null,
    status: row.status,
    approved_by: row.approved_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at
});

const serializeProfile = (row, versions = []) => ({
    id: row.id,
    slug: row.slug,
    display_name: row.display_name,
    description: row.description || null,
    voice_provider: row.voice_provider,
    voice_name: row.voice_name,
    locale: row.locale,
    persona: row.persona,
    gender_presentation: row.gender_presentation,
    provider: row.provider,
    default_for_news: Boolean(row.default_for_news),
    status: row.status,
    rights_status: row.rights_status,
    disclosure_label: row.disclosure_label || null,
    active_version: versions.find(version => version.status === 'active') || null,
    versions
});

async function versionsFor(knex, profileIds) {
    if (!profileIds.length) return new Map();
    const rows = await knex(VERSIONS).whereIn('profile_id', profileIds).orderBy('version', 'desc');
    const grouped = new Map();
    for (const row of rows) {
        const list = grouped.get(row.profile_id) || [];
        list.push(serializeVersion(row));
        grouped.set(row.profile_id, list);
    }
    return grouped;
}

/** @type {import('@tryghost/api-framework').Controller} */
module.exports = {
    docName: 'socialaiavatarprofiles',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['status', 'voice_name', 'include_versions'],
        permissions: false,
        async query(frame) {
            if (!currentUserId(frame) && !currentIntegrationId(frame)) {
                throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
            }
            const knex = models.Base.knex;
            let query = knex(PROFILES).orderBy('default_for_news', 'desc').orderBy('display_name', 'asc');
            if (frame.options?.status) query = query.where('status', String(frame.options.status));
            if (frame.options?.voice_name) query = query.where('voice_name', String(frame.options.voice_name));
            const rows = await query;
            const versionMap = await versionsFor(knex, rows.map(row => row.id));
            return {data: rows.map(row => serializeProfile(row, versionMap.get(row.id) || [])), meta: {}};
        }
    },

    read: {
        headers: {cacheInvalidate: false},
        options: ['id', 'include_versions'],
        permissions: false,
        async query(frame) {
            if (!currentUserId(frame) && !currentIntegrationId(frame)) {
                throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
            }
            const knex = models.Base.knex;
            const id = String(frame.options?.id || payload(frame).id || '').trim();
            const row = await knex(PROFILES).where(builder => builder.where('id', id).orWhere('slug', id)).first();
            if (!row) throw new errors.NotFoundError({message: tpl(messages.notFound)});
            const versionMap = await versionsFor(knex, [row.id]);
            return {data: [serializeProfile(row, versionMap.get(row.id) || [])], meta: {}};
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: [],
        permissions: false,
        async query(frame) {
            const userId = await requireManager(frame);
            const body = payload(frame);
            const slug = String(body.slug || '').trim().toLowerCase();
            const displayName = String(body.display_name || '').trim();
            const voiceName = String(body.voice_name || '').trim();
            if (!slug || !displayName || !voiceName) {
                throw new errors.ValidationError({message: 'slug, display_name and voice_name are required.'});
            }
            const knex = models.Base.knex;
            const exists = await knex(PROFILES).where({slug}).first();
            if (exists) throw new errors.ValidationError({message: 'Avatar profile slug already exists.'});
            const stamp = now();
            const row = {
                id: ObjectId().toHexString(), slug, display_name: displayName,
                description: body.description || null,
                voice_provider: body.voice_provider || 'qwen', voice_name: voiceName,
                locale: body.locale || 'ja-JP', persona: body.persona || 'neutral',
                gender_presentation: body.gender_presentation || 'neutral',
                provider: body.provider || 'self-hosted', default_for_news: Boolean(body.default_for_news),
                status: 'draft', rights_status: body.rights_status || 'pending',
                disclosure_label: body.disclosure_label || 'AI生成アナウンサー',
                created_by: userId, created_at: stamp, updated_at: stamp
            };
            await knex(PROFILES).insert(row);
            return {data: [serializeProfile(row)], meta: {}};
        }
    },

    edit: {
        headers: {cacheInvalidate: false},
        options: ['id'],
        permissions: false,
        async query(frame) {
            await requireManager(frame);
            const id = String(frame.options?.id || payload(frame).id || '').trim();
            const body = payload(frame);
            const knex = models.Base.knex;
            const existing = await knex(PROFILES).where({id}).first();
            if (!existing) throw new errors.NotFoundError({message: tpl(messages.notFound)});
            const changes = {};
            for (const field of ['display_name', 'description', 'persona', 'gender_presentation', 'disclosure_label', 'rights_status']) {
                if (body[field] !== undefined) changes[field] = body[field];
            }
            if (body.default_for_news !== undefined) changes.default_for_news = Boolean(body.default_for_news);
            if (body.status !== undefined && ['draft', 'active', 'retired'].includes(body.status)) changes.status = body.status;
            changes.updated_at = now();
            await knex(PROFILES).where({id}).update(changes);
            const updated = await knex(PROFILES).where({id}).first();
            const versionMap = await versionsFor(knex, [id]);
            return {data: [serializeProfile(updated, versionMap.get(id) || [])], meta: {}};
        }
    },

    addVersion: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['id'],
        permissions: false,
        async query(frame) {
            const userId = await requireManager(frame);
            const profileId = String(frame.options?.id || '').trim();
            const body = payload(frame);
            const knex = models.Base.knex;
            const profile = await knex(PROFILES).where({id: profileId}).first();
            if (!profile) throw new errors.NotFoundError({message: tpl(messages.notFound)});
            const assetId = String(body.image_asset_id || '').trim();
            if (!assetId) throw new errors.ValidationError({message: '`image_asset_id` is required.'});
            const asset = await knex(ASSETS).where({id: assetId}).first();
            if (!asset || asset.asset_type !== 'image') throw new errors.ValidationError({message: tpl(messages.invalidAsset)});
            const latest = await knex(VERSIONS).where({profile_id: profileId}).max('version as version').first();
            const version = Number(latest?.version || 0) + 1;
            const stamp = now();
            const row = {
                id: ObjectId().toHexString(), profile_id: profileId, version,
                image_asset_id: assetId, project_id: body.project_id || asset.project_id || null,
                source_kind: body.source_kind || 'uploaded', generation_model: body.generation_model || null,
                prompt_hash: body.prompt_hash || null, status: 'draft', approved_by: null,
                created_at: stamp, updated_at: stamp
            };
            await knex(VERSIONS).insert(row);
            return {data: [serializeVersion(row)], meta: {created_by: userId}};
        }
    },

    activateVersion: {
        headers: {cacheInvalidate: false},
        options: ['id', 'version'],
        permissions: false,
        async query(frame) {
            const userId = await requireManager(frame);
            const profileId = String(frame.options?.id || '').trim();
            const versionNumber = Number(frame.options?.version);
            const knex = models.Base.knex;
            const profile = await knex(PROFILES).where({id: profileId}).first();
            const target = await knex(VERSIONS).where({profile_id: profileId, version: versionNumber}).first();
            if (!profile) throw new errors.NotFoundError({message: tpl(messages.notFound)});
            if (!target) throw new errors.NotFoundError({message: tpl(messages.versionNotFound)});
            if (!target.image_asset_id || profile.rights_status !== 'approved') {
                throw new errors.ValidationError({message: 'Profile rights must be approved before activation.'});
            }
            const stamp = now();
            await knex.transaction(async trx => {
                await trx(VERSIONS).where({profile_id: profileId}).update({status: 'retired', updated_at: stamp});
                await trx(VERSIONS).where({id: target.id}).update({status: 'active', approved_by: userId, updated_at: stamp});
                await trx(PROFILES).where({id: profileId}).update({status: 'active', updated_at: stamp});
            });
            const updated = await knex(VERSIONS).where({id: target.id}).first();
            return {data: [serializeVersion(updated)], meta: {}};
        }
    }
};
