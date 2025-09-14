const api = require('../../../../api').endpoints;
const {http} = require('@tryghost/api-framework');
const mw = require('./middleware');

/**
 * @returns {import('express').Router}
 */
module.exports = function customApiRoutes(router) {
    // ## social comments
    router.get('/social/comments/post/:post_id', mw.authenticatePublic, http(api.socialCommentsPublic.browse));
    router.get('/social/comments/:id/replies/', mw.authenticatePublic, http(api.socialCommentsPublic.replies));    
    router.get('/social/comments/:id', mw.authenticatePublic, http(api.socialCommentsPublic.read));    
    router.get('/social/comments/counts/:ids', mw.authenticatePublic, http(api.socialCommentsPublic.counts));

    // ## post components
    router.get('/social/components', mw.authenticatePublic, http(api.postComponentsPublic.browse));
    router.get('/social/components/:id', mw.authenticatePublic, http(api.postComponentsPublic.read));

    return router;
};
