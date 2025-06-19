// @ts-ignore
const _ = require('lodash');
// @ts-nocheck
const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');
// @ts-ignore
const logging = require('@tryghost/logging');

const allStates = ['active', 'archived', 'approval'];
const activeStates = ['active'];

const SocialGroup = ghostBookshelf.Model.extend({
    tableName: 'social_groups',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            max_members: 15,
            require_approval: false
        };
    },

    owner() {
        return this.belongsTo('User', 'creator_id');
    },

    members() {
        return this.hasMany('SocialGroupMember', 'group_id');
    },

    posts() {
        return this.hasMany('Post', 'group_id');
    },   

    initialize() {
        // @ts-ignore
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        logging.info(JSON.stringify(model));
        
        const userId = model.get('creator_id');
        const groupName = model.get('group_name');
        const groupType = model.get('type');
        const groupStatus = model.get('status');

        if (!userId) {
            throw new errors.ValidationError({message: '`creator_id` is required.'});
        }

        if (!groupName) {
            throw new errors.ValidationError({message: '`group_name` is required.'});
        }

        if (!groupType) {
            throw new errors.ValidationError({message: '`type` is required.'});
        }

        if (!groupStatus) {
            throw new errors.ValidationError({message: '`status` is required.'});
        }        
 
        // @ts-ignore
        const user = await models.User.findOne({id: userId});
        if (!user) {
            throw new errors.NotFoundError({message: `User of creator with ID ${userId} not found.`});
        } 
        
        // No permission to update for archived group 
        if (model.get('id')) {
            // @ts-ignore
            const group = await models.SocialGroup.findOne({id: model.get('id')});
            if (group && group.status === 'archived'){
                throw new errors.NoPermissionError({message: `No permission for update archived group: ${group.id} not found.`});
            }
        }
    },

    enforcedFilters: function enforcedFilters(options) {
        if (options.context && options.context.internal) {
            return null;
        }

        return options.context && options.context.public ? 'status:[' + allStates.join(',') + ']' : null;
    },

    defaultFilters: function defaultFilters(options) {
        const ctx = options.context || {};

        // 1. Internal context (e.g., background tasks): no filters
        if (ctx.internal) {
            return null;
        }

        // 3. Otherwise (public or non-admin user): only show active groups
        return 'status:active';
    },

    /**
     * You can pass an extra `status=VALUES` field.
     * Long-Term: We should deprecate these short cuts and force users to use the filter param.
     */
    extraFilters: function extraFilters(options) {
        if (!options.status) {
            return null;
        }

        let filter = null;

        // CASE: Check if the incoming status value is valid, otherwise fallback to "active"
        if (options.status !== 'all') {
            options.status = allStates.indexOf(options.status) > -1 ? options.status : 'active';
        }

        if (options.status === 'active') {
            filter = `status:[${activeStates}]`;
        } else if (options.status === 'all') {
            filter = `status:[${allStates}]`;
        } else {
            filter = `status:${options.status}`;
        }

        delete options.status;

        return filter;
    }
},{
    getGroupsCount: async function getGroupsCount(options) {
        const knex = ghostBookshelf.knex('social_groups');
        const allCounts = await knex.count('social_groups.id as count')
            .select('social_groups.type')
            .from('social_groups')
            .groupBy('social_groups.type');

        const counts = await knex.count('social_groups.id as count')
            .select('social_groups.type')
            .from('social_groups')
            .join('social_group_members', 'social_group_members.group_id', 'social_groups.id')
            .whereRaw('social_group_members.user_id = ?', options.context.user)
            //.andWhereRaw('social_groups.status = ?', 'active')
            .andWhereRaw('social_group_members.status <> ?', 'disabled')
            .groupBy('social_groups.type');
        
        return {admin_groups: allCounts, user_groups: counts};
    },

    canAccessGroup: async function canAccessGroup(groupModel, userId, mode = 'read') {
        if (!groupModel || !userId) {
            return false;
        }

        // 'active', 'archived', etc.
        const groupStatus = groupModel.get('status'); 

        // Check admin
        // @ts-ignore
        const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
        const isAdmin = user?.related('roles').some(role => role.get('name') === 'Administrator' || role.get('name') === 'Owner');
        
        if (isAdmin) {
            // Admins can't write to archived groups
            if (groupStatus === 'archived' && mode === 'write') {
                logging.warn(`Administrator can not write post in archived group ${groupModel.get('id')}`);
                return false; 
            }
            return true;
        }

        // Check if the user is a group member
        // @ts-ignore
        const member = await models.SocialGroupMember.findOne({
            group_id: groupModel.id,
            user_id: userId
        });

        // not a member
        if (!member) {
            logging.warn(`You are not a member of group ${groupModel.get('id')}, ${userId}`);
            return false; 
        }

        // 'active', 'archived', 'disabled', etc.
        const memberStatus = member.get('status'); 

        // Disabled members get no access
        if (memberStatus === 'disabled') {
            logging.warn(`You are disabled member of group ${groupModel.get('id')}, ${userId}`);
            return false;
        }

        // All valid members (active or archived) can read
        if (mode === 'read') {
            return true;
        }

        // Members can write only if group is active and member is active
        return groupStatus === 'active' && memberStatus === 'active';
    },

    countRelations() {
        return {
            members(modelOrCollection) {
                modelOrCollection.query('columns', 'social_groups.*', (qb) => {
                    qb.count('social_group_members.id')
                        .from('social_group_members')
                        .whereRaw('social_group_members.group_id = social_groups.id and social_group_members.status = ?', 'active')
                        .as('count__members');
                });
            },
            posts(modelOrCollection) {
                modelOrCollection.query('columns', 'social_groups.*', (qb) => {
                    qb.count('posts.id')
                        .from('posts')
                        .whereRaw('posts.group_id = social_groups.id')
                        .as('count__posts');
                });
            },
            inactive_members(modelOrCollection) {
                modelOrCollection.query('columns', 'social_groups.*', (qb) => {
                    qb.count('social_group_members.id')
                        .from('social_group_members')
                        .whereRaw('social_group_members.group_id = social_groups.id and social_group_members.status <> ?', 'active')
                        .as('count__inactive_members');
                });
            }
        };
    }

});

module.exports = {
    SocialGroup: ghostBookshelf.model('SocialGroup', SocialGroup)
};

