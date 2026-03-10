// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const ObjectId = require('bson-objectid').default;
const models = require('../../models');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'Phone record not found.',
    noPermission: 'You are not allowed to access this phone record.'
};

const getCurrentUserId = frame => frame.options?.context?.user || null;
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const PHONES_TABLE = models.SocialAiUserPhone?.prototype?.tableName || 'social_ai_user_phones';

const isAdminUser = async (userId) => {
    if (!userId) return false;
    // @ts-ignore
    const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
    if (!user) return false;
    const roles = user.related('roles')?.models || [];
    return roles.some(role => ADMIN_ROLES.has(role.get('name')));
};

const resolveTargetUserId = async (frame) => {
    const currentUserId = getCurrentUserId(frame);
    const currentIntegrationId = getCurrentIntegrationId(frame);
    const requestedUserId = frame.options?.user_id || frame.data?.user_id || null;

    if (!currentUserId && !currentIntegrationId) {
        throw new errors.NoPermissionError({message: tpl(messages.userRequired)});
    }
    if (currentIntegrationId) {
        if (!requestedUserId) {
            throw new errors.ValidationError({message: '`user_id` is required.'});
        }
        return requestedUserId;
    }
    if (!requestedUserId || requestedUserId === currentUserId) {
        return currentUserId;
    }
    const isAdmin = await isAdminUser(currentUserId);
    if (isAdmin) return requestedUserId;
    throw new errors.NoPermissionError({message: tpl(messages.noPermission)});
};

const formatPhone = (row) => ({
    id: row.id,
    user_id: row.user_id,
    phone_e164: row.phone_e164,
    phone_last4: row.phone_last4,
    status: row.status,
    verified_at: row.verified_at,
    created_at: row.created_at,
    updated_at: row.updated_at
});

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaiuserphones',

    browse: {
        headers: {cacheInvalidate: false},
        options: ['user_id', 'limit'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const limit = Math.min(Math.max(Number(frame.options?.limit || 20), 1), 100);

            const rows = await knex(PHONES_TABLE)
                .where({user_id: targetUserId})
                .orderBy('updated_at', 'desc')
                .limit(limit);

            return {data: rows.map(formatPhone), meta: {count: rows.length}};
        }
    },

    add: {
        statusCode: 201,
        headers: {cacheInvalidate: false},
        options: ['user_id'],
        data: [
            'user_id',
            'phone_e164',
            'phone_hash',
            'phone_last4',
            'verification_code_hash',
            'code_expires_at'
        ],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const payload = frame.data.socialaiuserphones?.[0] || {};
            const phoneHash = String(payload.phone_hash || '').trim();
            const phoneE164 = String(payload.phone_e164 || '').trim();
            const phoneLast4 = String(payload.phone_last4 || '').trim();
            const codeHash = String(payload.verification_code_hash || '').trim();
            const codeExpiresAt = payload.code_expires_at || null;

            if (!phoneHash || !phoneE164 || !codeHash) {
                throw new errors.ValidationError({message: 'phone_e164, phone_hash, verification_code_hash are required.'});
            }

            const existing = await knex(PHONES_TABLE)
                .where({user_id: targetUserId, phone_hash: phoneHash})
                .first();

            const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
            if (existing) {
                await knex(PHONES_TABLE)
                    .where({id: existing.id})
                    .update({
                        phone_e164: phoneE164,
                        phone_last4: phoneLast4 || null,
                        status: 'pending',
                        verification_code_hash: codeHash,
                        code_expires_at: codeExpiresAt,
                        verified_at: null,
                        updated_at: nowSql
                    });
                const updated = await knex(PHONES_TABLE).where({id: existing.id}).first();
                return formatPhone(updated);
            }

            const id = ObjectId().toHexString();
            await knex(PHONES_TABLE).insert({
                id,
                user_id: targetUserId,
                phone_e164: phoneE164,
                phone_hash: phoneHash,
                phone_last4: phoneLast4 || null,
                status: 'pending',
                verification_code_hash: codeHash,
                code_expires_at: codeExpiresAt,
                verified_at: null,
                created_at: nowSql,
                updated_at: nowSql
            });
            const created = await knex(PHONES_TABLE).where({id}).first();
            return formatPhone(created);
        }
    },

    edit: {
        headers: {cacheInvalidate: false},
        options: ['user_id'],
        data: ['user_id', 'phone_hash', 'verification_code_hash'],
        permissions: false,
        async query(frame) {
            const knex = models.Base.knex;
            const targetUserId = await resolveTargetUserId(frame);
            const payload = frame.data.socialaiuserphones?.[0] || {};
            const phoneHash = String(payload.phone_hash || '').trim();
            const codeHash = String(payload.verification_code_hash || '').trim();
            if (!phoneHash || !codeHash) {
                throw new errors.ValidationError({message: 'phone_hash and verification_code_hash are required.'});
            }

            const existing = await knex(PHONES_TABLE)
                .where({user_id: targetUserId, phone_hash: phoneHash})
                .first();
            if (!existing) {
                throw new errors.NotFoundError({message: tpl(messages.notFound)});
            }

            const expiresAt = existing.code_expires_at ? new Date(existing.code_expires_at) : null;
            if (expiresAt && expiresAt.getTime() < Date.now()) {
                throw new errors.ValidationError({message: 'Verification code expired.'});
            }
            if (String(existing.verification_code_hash || '') !== codeHash) {
                throw new errors.ValidationError({message: 'Verification code invalid.'});
            }

            const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
            await knex(PHONES_TABLE)
                .where({id: existing.id})
                .update({
                    status: 'verified',
                    verified_at: nowSql,
                    verification_code_hash: null,
                    code_expires_at: null,
                    updated_at: nowSql
                });
            const updated = await knex(PHONES_TABLE).where({id: existing.id}).first();
            return formatPhone(updated);
        }
    }
};

module.exports = controller;
