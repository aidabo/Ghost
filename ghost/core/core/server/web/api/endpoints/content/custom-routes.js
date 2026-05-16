const api = require('../../../../api').endpoints;
const {http} = require('@tryghost/api-framework');
const mw = require('./middleware');

/**
 * @returns {import('express').Router}
 */
module.exports = function customApiRoutes(router) {
    router.get('/social/comments/post/:post_id', mw.authenticatePublic, http(api.socialCommentsPublic.browse));
    router.get('/social/comments/:id/replies/', mw.authenticatePublic, http(api.socialCommentsPublic.replies));    
    router.get('/social/comments/:id', mw.authenticatePublic, http(api.socialCommentsPublic.read));    
    router.get('/social/comments/counts/:ids', mw.authenticatePublic, http(api.socialCommentsPublic.counts));

    router.get('/social/components', mw.authenticatePublic, http(api.socialComponentsPublic.browse));
    router.get('/social/components/:id', mw.authenticatePublic, http(api.socialComponentsPublic.read));

    // ## estate content routes
    router.get('/estate/properties', mw.authenticatePublic, http(api.estatePropertiesPublic.browse));
    router.get('/estate/properties/search', mw.authenticatePublic, http(api.estatePropertiesPublic.search));
    router.get('/estate/properties/:id', mw.authenticatePublic, http(api.estatePropertiesPublic.read));
    router.post('/estate/inquiries', mw.authenticatePublic, http(api.estateInquiriesPublic.add));

    return router;
};
