const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');
// @ts-ignore
const logging = require('@tryghost/logging');

const allStates = ['active', 'archived', 'disabled'];
const activeStates = ['active'];

let SocialGroupMember;
let SocialGroupMembers;

SocialGroupMember = ghostBookshelf.Model.extend({
    tableName: 'social_group_members',
 
    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },
    
    group() {
        return this.belongsTo('SocialGroup', 'group_id');
    },

    role() {
        return this.belongsTo('Role', 'role_id');
    },

    user() {
        return this.belongsTo('User', 'user_id');
    },
    
    initialize() {
        // @ts-ignore
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        logging.info('validateFields model:', JSON.stringify(model));

        const userId = model.get('user_id');
        const groupId = model.get('group_id');
        const roleId = model.get('role_id');
        const status = model.get('status');

        if (!userId) {
            throw new errors.ValidationError({message: '`user_id` is required.'});
        }
 
        if (!groupId) {
            throw new errors.ValidationError({message: '`group_id` is required.'});
        }

        if (!roleId) {
            throw new errors.ValidationError({message: '`role_id` is required.'});
        }

        if (!status) {
            throw new errors.ValidationError({message: '`status` is required.'});
        }

        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: groupId});
        if (!group) {
            throw new errors.NotFoundError({message: `Group with ID ${groupId} not found.`});
        }

        if (group.get('status') !== 'active') {
            throw new errors.ValidationError({message: `Group with ID ${groupId} is not active.`});
        }
        
        // @ts-ignore
        const user = await models.User.findOne({id: userId});
        if (!user) {
            throw new errors.NotFoundError({message: `User with ID ${userId} not found.`});
        }

        // @ts-ignore
        const role = await models.Role.findOne({id: roleId});
        if (!role) {
            throw new errors.NotFoundError({message: `Role with ID ${roleId} not found.`});
        }

        if (model.get('id')) {
            this.validateMemberPermission(groupId, userId);
        }
    },

    async validateMemberPermission(groupId, userId) {
        const allowed = await SocialGroupMember.canManageGroupMembers(groupId, userId);
        if (!allowed) {
            throw new errors.NoPermissionError({
                message: 'You do not have permission to modify group members'
            });
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
}, {

    validateDestroyMemberPermission: async function validateDestroyMemberPermission(groupId, userId) {
        // @ts-ignore
        const allowed = await this.canManageGroupMembers(groupId, userId);
        if (!allowed) {
            throw new errors.NoPermissionError({
                message: 'You do not have permission to modify group members'
            });
        }
    },

    canManageGroupMembers: async function canManageGroupMembers(groupId, userId) {
        logging.info('canManageGroupMembers:', groupId, userId);
        if (!groupId || !userId) {
            logging.warn('No groupId or userId');
            return false;
        }

        // 1. Check if the user is a global Administrator or Owner
        // @ts-ignore
        const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
        const isAdminOrOwner = user?.related('roles').some(role => role.get('name') === 'Administrator' || role.get('name') === 'Owner');        
        if (isAdminOrOwner) {
            return true;
        }

        // 2. Check if the user is the creator (owner) of the group
        // @ts-ignore
        const group = await models.SocialGroup.findOne({id: groupId});
        if (group?.get('creator_id') === userId) {
            return true;
        }

        // 3. Check if the user is a group admin in that group
        // @ts-ignore
        const groupMember = await models.SocialGroupMember.findOne({
            group_id: groupId,
            user_id: userId,
            status: 'active'
        }, {
            withRelated: ['role'] 
        });

        const roleName = groupMember?.related('role')?.get('name');
        const allowed = roleName === 'Social Group Admin' || roleName === 'Social Group Owner';
        if (!allowed) {
            logging.warn('Not group admin or owner', groupId, userId);
        }
        return allowed;
    },

    // Single authoritative predicate for who may EDIT/DELETE a piece of content
    // (charts, pages, projects, deepzoom jobs). Backend source of truth; the same
    // value is surfaced to the frontend as a computed `can_edit` flag on read, so
    // the UI never re-implements the rule.
    //
    //   allowed = system admin (Owner/Administrator)
    //          OR the content author (authorId === userId)
    //
    // Content CRUD depends on the STAFF role + system admin + author only — NOT
    // on the group role. Group roles (owner/admin) govern GROUP MANAGEMENT
    // (adding members, promoting/demoting members) via canManageGroupMembers,
    // not content editing. A group owner/admin who is not the author cannot edit
    // another member's content. (`groupId` is accepted for call-site symmetry but
    // is intentionally not consulted here.)
    // eslint-disable-next-line no-unused-vars
    canEditGroupContent: async function canEditGroupContent({groupId, authorId, userId}) {
        if (!userId) {
            return false;
        }

        // Author can edit their own content.
        if (authorId && String(authorId) === String(userId)) {
            return true;
        }

        // System admin (Owner / Administrator) can edit anything.
        // @ts-ignore
        const user = await models.User.findOne({id: userId}, {withRelated: ['roles']});
        return Boolean(user?.related('roles').some(role => role.get('name') === 'Administrator' || role.get('name') === 'Owner'));
    }

});

SocialGroupMembers = ghostBookshelf.Collection.extend({
    model: SocialGroupMember
});

module.exports = {
    SocialGroupMember: ghostBookshelf.model('SocialGroupMember', SocialGroupMember),
    // @ts-ignore
    SocialGroupMembers: ghostBookshelf.collection('SocialGroupMembers', SocialGroupMembers)
};

