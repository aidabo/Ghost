// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
const db = require('../../data/db');
const logging = require('@tryghost/logging');

const ALLOWED_INCLUDES = [
    'user',
    'group'
];

const messages = {
    notFound: 'social chart not found.',
    noPermission: 'You are not allowed to access this social chart.'
};

const appendGroupFilter = (frame) => {
    const groupId = frame.options?.group_id;
    if (!groupId) {
        return;
    }

    if (!/\bgroup_id:/.test(frame.options.filter || '')) {
        frame.options.filter = frame.options.filter ? `${frame.options.filter}+group_id:${groupId}` : `group_id:${groupId}`;
    }

    delete frame.options.group_id;
};

const appendDefaultPublicBrowseScopeFilter = async (frame) => {
    // @ts-ignore
    const publicGroups = await models.SocialGroup.findAll({
        filter: 'type:public',
        columns: ['id']
    });

    const publicGroupIds = (publicGroups?.models || [])
        .map(group => group.get('id'))
        .filter(Boolean);

    const publicScopeFilter = publicGroupIds.length > 0
        ? `(group_id:null,group_id:[${publicGroupIds.join(',')}])`
        : 'group_id:null';

    frame.options.filter = frame.options.filter
        ? `${frame.options.filter}+${publicScopeFilter}`
        : publicScopeFilter;
};

const isPublicGroup = async (groupId) => {
    if (!groupId) {
        return false;
    }

    const group = await db.knex('social_groups')
        .select('id', 'status', db.knex.raw('type as groupType'))
        .where('id', groupId)
        .first();
    if (!group) {
        return false;
    }

    return group.groupType === 'public' && group.status === 'active';
};

const enforcePublicBrowseScope = async (frame) => {
    const groupId = frame.options?.group_id;

    if (groupId) {
        const allowed = await isPublicGroup(groupId);
        if (!allowed) {
            throw new errors.NoPermissionError({
                message: tpl(messages.noPermission)
            });
        }

        appendGroupFilter(frame);
        return;
    }

    // Public browsing scope without explicit group_id:
    // include charts with no group plus charts that belong to public groups.
    await appendDefaultPublicBrowseScopeFilter(frame);
};

const appendPublicGroupFilterIfRequested = async (frame) => {
    const groupId = frame.options?.group_id;
    if (!groupId) {
        return;
    }

    const allowed = await isPublicGroup(groupId);
    if (!allowed) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }

    appendGroupFilter(frame);
};

const addPublishedStatusFilter = (frame) => {
    let filter = frame.options.filter;

    if (filter && typeof filter === 'string') {
        if (!filter.includes('status:')) {
            filter = filter + '+status:published';
        }
    } else {
        filter = 'status:published';
    }

    frame.options.filter = filter;
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialcharts',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'include',
            'filter',
            'group_id',
            'fields',
            'collection',
            'formats',
            'limit',
            'order',
            'page',
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            await enforcePublicBrowseScope(frame);
            addPublishedStatusFilter(frame);
            logging.info('Fetching social charts with published status filter:', JSON.stringify(frame.options));
            // @ts-ignore
            return await models.SocialChart.findPage({ ...frame.options, withRelated: ALLOWED_INCLUDES });
        }
    },

    read: {
        headers: { cacheInvalidate: false },
        options: [
            'filter',
            'include',
            'group_id'
        ],
        data: ['id'],
        permissions: true,
        async query(frame) {
            await appendPublicGroupFilterIfRequested(frame);
            addPublishedStatusFilter(frame);
            // @ts-ignore
            const entry = await models.SocialChart.findOne(frame.data, { ...frame.options, withRelated: ALLOWED_INCLUDES });
            if (!entry) {
                return Promise.reject(new errors.NotFoundError({
                    message: tpl(messages.notFound)
                }));
            }

            // Content API is public: group-scoped charts are only readable when group is public.
            if (entry.get('group_id')) {
                const allowed = await isPublicGroup(entry.get('group_id'));
                if (!allowed) {
                    throw new errors.NoPermissionError({
                        message: tpl(messages.noPermission)
                    });
                }
            }

            return entry;
        }
    }
};

module.exports = controller;
