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
    router.get('/social/ai/dzi/jobs', mw.authenticatePublic, http(api.socialAiDziPublic.browse));
    router.get('/social/ai/dzi/jobs/:id', mw.authenticatePublic, http(api.socialAiDziPublic.read));
    router.post('/estate/inquiries', mw.authenticatePublic, http(api.estateInquiriesPublic.add));
    router.post('/estate/inquiries/:id/resend-confirmation', mw.authenticatePublic, http(api.estateInquiriesPublic.resendConfirmation));
    router.post('/estate/agent-contact', mw.authenticatePublic, http(api.estateAgentContactPublic.add));

    // ## person story content routes
    router.get('/person/stories', mw.authenticatePublic, http(api.personStoriesPublic.browse));
    router.get('/person/stories/:id', mw.authenticatePublic, http(api.personStoriesPublic.read));

    // ## person graph content routes
    router.get('/person/persons', mw.authenticatePublic, http(api.personsPublic.browse));
    router.get('/person/persons/:id', mw.authenticatePublic, http(api.personsPublic.read));
    router.get('/person/persons/:id/graph', mw.authenticatePublic, http(api.personsPublic.graph));

    router.get('/person/roles', mw.authenticatePublic, http(api.personRolesPublic.browse));
    router.get('/person/roles/:id', mw.authenticatePublic, http(api.personRolesPublic.read));

    router.get('/person/life-events', mw.authenticatePublic, http(api.personLifeEventsPublic.browse));
    router.get('/person/life-events/:id', mw.authenticatePublic, http(api.personLifeEventsPublic.read));

    router.get('/person/story-series', mw.authenticatePublic, http(api.personStorySeriesPublic.browse));
    router.get('/person/story-series/:id', mw.authenticatePublic, http(api.personStorySeriesPublic.read));

    router.get('/person/story-episodes', mw.authenticatePublic, http(api.personStoryEpisodesPublic.browse));
    router.get('/person/story-episodes/:id', mw.authenticatePublic, http(api.personStoryEpisodesPublic.read));

    router.get('/person/relations', mw.authenticatePublic, http(api.personRelationsPublic.browse));
    router.get('/person/relations/:id', mw.authenticatePublic, http(api.personRelationsPublic.read));

    router.get('/person/post-relations', mw.authenticatePublic, http(api.personPostRelationsPublic.browse));
    router.get('/person/post-relations/:id', mw.authenticatePublic, http(api.personPostRelationsPublic.read));

    router.get('/person/gallery-assets', mw.authenticatePublic, http(api.personGalleryAssetsPublic.browse));
    router.get('/person/gallery-assets/:id', mw.authenticatePublic, http(api.personGalleryAssetsPublic.read));

    // ## publish content routes
    router.get('/publish/content', mw.authenticatePublic, http(api.publishContentPublic.browse));
    router.get('/publish/content/:id', mw.authenticatePublic, http(api.publishContentPublic.read));

    return router;
};
