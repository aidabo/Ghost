// eslint-disable-next-line no-unused-vars
const _ = require('lodash');
// @ts-nocheck
const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');
const errors = require('@tryghost/errors');
const models = require('./index');
const logging = require('@tryghost/logging');

const PostComponent = ghostBookshelf.Model.extend({
    tableName: 'post_components',

    defaults() {
        return {
            id: ObjectId().toHexString()
        };
    },

    posts() {
        return this.belongsTo('Post');
    },

    initialize() {
        // @ts-ignore
        ghostBookshelf.Model.prototype.initialize.call(this);
        this.on('saving', this.validateFields);
    },

    async validateFields(model) {
        logging.info(JSON.stringify(model));

        const componentName = model.get('name');
        const title = model.get('title');
        const postId = model.get('post_id');

        if (!componentName) {
            throw new errors.ValidationError({message: 'name of component is required.'});
        }

        if (!title) {
            throw new errors.ValidationError({message: 'title is required.'});
        }

        if (!postId) {
            throw new errors.ValidationError({message: 'post_id is required.'});
        }        
 
        // @ts-ignore
        const post = await models.Post.findOne({id: postId, status: 'all'});
        if (!post) {
            throw new errors.NotFoundError({message: `Post id ${postId} not found.`});
        }        
    }
},{

});

module.exports = {
    PostComponent: ghostBookshelf.model('PostComponent', PostComponent)
};

