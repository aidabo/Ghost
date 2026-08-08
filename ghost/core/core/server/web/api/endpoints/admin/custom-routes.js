const api = require('../../../../api').endpoints;
const models = require('../../../../models');
const { http } = require('@tryghost/api-framework');
const mw = require('./middleware');

const createOrUpdatePost = async (req, res, next) => {
    try {
        const payload = req.body?.posts?.[0] || req.body?.post?.[0];
        if (!payload || !payload.slug) {
            return res.status(400).json({errors: [{message: 'Post payload with slug is required.'}]});
        }

        const existing = await models.Post.findOne({slug: payload.slug}, {context: {internal: true}});
        const options = {context: {internal: true}};
        const saved = existing
            ? await models.Post.edit(payload, {id: existing.id, context: {internal: true}})
            : await models.Post.add(payload, options);

        return res.status(existing ? 200 : 201).json({posts: [saved.toJSON ? saved.toJSON() : saved]});
    } catch (error) {
        return next(error);
    }
};

const createOrUpdateGalleryAsset = async (req, res, next) => {
    try {
        const payload = req.body?.persongalleryassets?.[0] || req.body?.asset?.[0] || req.body?.galleryassets?.[0];
        if (!payload || !payload.person_id || !payload.asset_key) {
            return res.status(400).json({errors: [{message: 'person_id and asset_key are required.'}]});
        }

        const existing = await models.PersonGalleryAsset.findOne({person_id: payload.person_id, asset_key: payload.asset_key}, {context: {internal: true}});
        const options = {context: {internal: true}};
        const saved = existing
            ? await models.PersonGalleryAsset.edit(payload, {id: existing.id, context: {internal: true}})
            : await models.PersonGalleryAsset.add(payload, options);

        return res.status(existing ? 200 : 201).json({persongalleryassets: [saved.toJSON ? saved.toJSON() : saved]});
    } catch (error) {
        return next(error);
    }
};

/**
 * @returns {import('express').Router}
 */
module.exports = function customApiRoutes(router) {
    // bookmarks
    // post search index (admin: includes drafts / non-public, for logged-in surfaces)
    // NOTE: mounted under /search/* — NOT /posts/* — because the core `/posts/:id`
    // route is registered before customApi() and would otherwise capture
    // `/posts/search-index` as id="search-index" (422 on the 24-hex id validator).
    router.get('/search/posts', mw.authAdminApi, http(api.postsSearchIndex.search));

    router.get('/social/bookmarks', mw.authAdminApi, http(api.socialBookmarks.browse));
    router.get('/social/bookmarks/:id', mw.authAdminApi, http(api.socialBookmarks.read));
    router.post('/social/bookmarks', mw.authAdminApi, http(api.socialBookmarks.add));
    router.del('/social/bookmarks/:id', mw.authAdminApi, http(api.socialBookmarks.destroy));

    // forwards
    router.get('/social/forwards', mw.authAdminApi, http(api.socialForwards.browse));
    router.get('/social/forwards/:id', mw.authAdminApi, http(api.socialForwards.read));
    router.post('/social/forwards', mw.authAdminApi, http(api.socialForwards.add));
    router.del('/social/forwards/:id', mw.authAdminApi, http(api.socialForwards.destroy));

    //follows
    router.get('/social/follows', mw.authAdminApi, http(api.socialFollows.browse));
    router.get('/social/follows/:id', mw.authAdminApi, http(api.socialFollows.read));
    router.post('/social/follows', mw.authAdminApi, http(api.socialFollows.add));
    router.del('/social/follows/:id', mw.authAdminApi, http(api.socialFollows.destroy));

    //favors
    router.get('/social/favors', mw.authAdminApi, http(api.socialFavors.browse));
    router.get('/social/favors/:id', mw.authAdminApi, http(api.socialFavors.read));
    router.post('/social/favors', mw.authAdminApi, http(api.socialFavors.add));
    router.del('/social/favors/:id', mw.authAdminApi, http(api.socialFavors.destroy));

    //social groups
    router.get('/social/groups', mw.authAdminApi, http(api.socialGroups.browse));
    router.get('/social/groups/:id', mw.authAdminApi, http(api.socialGroups.read));
    router.get('/social/groups_count', mw.authAdminApi, http(api.socialGroups.count));
    router.post('/social/groups', mw.authAdminApi, http(api.socialGroups.add));
    router.put('/social/groups/:id', mw.authAdminApi, http(api.socialGroups.edit));
    router.del('/social/groups/:id', mw.authAdminApi, http(api.socialGroups.destroy));

    //social group members
    router.get('/social/members', mw.authAdminApi, http(api.socialGroupMembers.browse));
    router.get('/social/members/:id', mw.authAdminApi, http(api.socialGroupMembers.read));
    router.post('/social/members', mw.authAdminApi, http(api.socialGroupMembers.add));
    router.put('/social/members/:id', mw.authAdminApi, http(api.socialGroupMembers.edit));
    router.del('/social/members/:id', mw.authAdminApi, http(api.socialGroupMembers.destroy));

    // ## Tags
    router.get('/tags/all/count', mw.authAdminApi, http(api.tags.count));

    // ## social comments
    router.get('/social/comments/post/:post_id', mw.authAdminApi, http(api.socialComments.browse));
    router.get('/social/comments/:id/replies', mw.authAdminApi, http(api.socialComments.replies));

    router.post('/social/comments/post', mw.authAdminApi, http(api.socialComments.add));
    router.get('/social/comments/:id', mw.authAdminApi, http(api.socialComments.read));
    router.put('/social/comments/:id', mw.authAdminApi, http(api.socialComments.edit));

    router.post('/social/comments/:id/like', mw.authAdminApi, http(api.socialComments.like));
    router.post('/social/comments/:id/unlike', mw.authAdminApi, http(api.socialComments.unlike));
    router.post('/social/comments/:id/report', mw.authAdminApi, http(api.socialComments.report));

    router.get('/social/comments/counts/:ids', mw.authAdminApi, http(api.socialComments.counts));

    // ## for Admin user
    router.get('/social/comments/status/:post_id', mw.authAdminApi, http(api.socialCommentReports.browse));
    router.put('/social/comments/:id/status', mw.authAdminApi, http(api.socialCommentReports.edit));
    router.get('/social/comments/:id/new-replies', mw.authAdminApi, http(api.socialCommentReplies.browse));

    router.get('/social/components', mw.authAdminApi, http(api.socialComponents.browse));
    router.get('/social/components/:id', mw.authAdminApi, http(api.socialComponents.read));
    router.post('/social/components', mw.authAdminApi, http(api.socialComponents.add));
    router.put('/social/components/:id', mw.authAdminApi, http(api.socialComponents.edit));
    router.del('/social/components/:id', mw.authAdminApi, http(api.socialComponents.destroy));

    router.get('/social/charts', mw.authAdminApi, http(api.socialCharts.browse));
    router.get('/social/charts/:id', mw.authAdminApi, http(api.socialCharts.read));
    router.post('/social/charts', mw.authAdminApi, http(api.socialCharts.add));
    router.put('/social/charts/:id', mw.authAdminApi, http(api.socialCharts.edit));
    router.del('/social/charts/:id', mw.authAdminApi, http(api.socialCharts.destroy));

    router.get('/social/postcomponents', mw.authAdminApi, http(api.socialPostComponents.browse));
    router.get('/social/postcomponents/:id', mw.authAdminApi, http(api.socialPostComponents.read));
    router.post('/social/postcomponents', mw.authAdminApi, http(api.socialPostComponents.add));
    router.put('/social/postcomponents/:id', mw.authAdminApi, http(api.socialPostComponents.edit));
    router.del('/social/postcomponents/:id', mw.authAdminApi, http(api.socialPostComponents.destroy));

    // ## lambda logs
    router.get('/social/userlogs', mw.authAdminApi, http(api.socialUserLogs.browse));
    router.get('/social/userlogs/:id', mw.authAdminApi, http(api.socialUserLogs.read));
    router.post('/social/userlogs', mw.authAdminApi, http(api.socialUserLogs.add));
    router.put('/social/userlogs/:id', mw.authAdminApi, http(api.socialUserLogs.edit));
    router.del('/social/userlogs/:id', mw.authAdminApi, http(api.socialUserLogs.destroy));

    // ## gallery
    router.get('/social/gallery/chartjobs', mw.authAdminApi, http(api.socialGallery.chartjobs));
    router.get('/social/gallery/chartjobs/', mw.authAdminApi, http(api.socialGallery.chartjobs));
    router.get('/social/gallery/user', mw.authAdminApi, http(api.socialGallery.user));
    router.get('/social/gallery/user/', mw.authAdminApi, http(api.socialGallery.user));
    router.get('/social/gallery/group', mw.authAdminApi, http(api.socialGallery.group));
    router.get('/social/gallery/group/', mw.authAdminApi, http(api.socialGallery.group));
    router.get('/social/gallery/group/:id', mw.authAdminApi, http(api.socialGallery.group));
    router.get('/social/gallery/group/:id/', mw.authAdminApi, http(api.socialGallery.group));
    router.get('/social/gallery/property', mw.authAdminApi, http(api.socialGallery.property));
    router.get('/social/gallery/property/', mw.authAdminApi, http(api.socialGallery.property));
    router.get('/social/gallery/property/:id', mw.authAdminApi, http(api.socialGallery.property));
    router.get('/social/gallery/property/:id/', mw.authAdminApi, http(api.socialGallery.property));
    router.post('/social/gallery/presign', mw.authAdminApi, http(api.socialGallery.presign));
    router.post('/social/gallery/presign/', mw.authAdminApi, http(api.socialGallery.presign));
    router.post('/social/gallery/finalize', mw.authAdminApi, http(api.socialGallery.finalize));
    router.post('/social/gallery/finalize/', mw.authAdminApi, http(api.socialGallery.finalize));
    router.post('/social/gallery/sync-tags', mw.authAdminApi, http(api.socialGallery.syncTags));
    router.post('/social/gallery/sync-tags/', mw.authAdminApi, http(api.socialGallery.syncTags));
    router.put('/social/gallery/tag', mw.authAdminApi, http(api.socialGallery.updateTag));
    router.put('/social/gallery/tag/', mw.authAdminApi, http(api.socialGallery.updateTag));

    // ## ai chats
    router.get('/social/ai/chats', mw.authAdminApi, http(api.socialAiChats.browse));
    router.get('/social/ai/chats/:id', mw.authAdminApi, http(api.socialAiChats.read));
    router.post('/social/ai/chats', mw.authAdminApi, http(api.socialAiChats.add));
    router.delete('/social/ai/chats/:id', mw.authAdminApi, http(api.socialAiChats.destroy));
    router.get('/social/ai/devices', mw.authAdminApi, http(api.socialAiDevices.browse));
    router.post('/social/ai/devices', mw.authAdminApi, http(api.socialAiDevices.add));
    router.put('/social/ai/devices/:id', mw.authAdminApi, http(api.socialAiDevices.edit));
    router.delete('/social/ai/devices/:id', mw.authAdminApi, http(api.socialAiDevices.destroy));
    router.get('/social/ai/sms-logs', mw.authAdminApi, http(api.socialAiSmsLogs.browse));
    router.post('/social/ai/sms-logs', mw.authAdminApi, http(api.socialAiSmsLogs.add));

    // ## ai usages
    router.get('/social/ai/usages', mw.authAdminApi, http(api.socialAiUsages.browse));
    router.get('/social/ai/usages/:id', mw.authAdminApi, http(api.socialAiUsages.read));

    // ## ai reminders
    router.get('/social/ai/reminders', mw.authAdminApi, http(api.socialAiReminders.browse));
    router.get('/social/ai/reminders/:id', mw.authAdminApi, http(api.socialAiReminders.read));
    router.post('/social/ai/reminders', mw.authAdminApi, http(api.socialAiReminders.add));
    router.put('/social/ai/reminders/:id', mw.authAdminApi, http(api.socialAiReminders.edit));
    router.get('/social/ai/reminder-events', mw.authAdminApi, http(api.socialAiReminderEvents.browse));
    router.post('/social/ai/reminder-events', mw.authAdminApi, http(api.socialAiReminderEvents.add));
    router.get('/social/ai/reminders/dispatch', mw.authAdminApi, http(api.socialAiReminderDispatch.browse));
    router.get('/social/ai/user-phones', mw.authAdminApi, http(api.socialAiUserPhones.browse));
    router.post('/social/ai/user-phones', mw.authAdminApi, http(api.socialAiUserPhones.add));
    router.put('/social/ai/user-phones', mw.authAdminApi, http(api.socialAiUserPhones.edit));
    router.get('/social/ai/agent-settings', mw.authAdminApi, http(api.socialAiAgentSettings.browse));
    router.get('/social/ai/agent-settings/:id', mw.authAdminApi, http(api.socialAiAgentSettings.read));
    router.post('/social/ai/agent-settings', mw.authAdminApi, http(api.socialAiAgentSettings.add));
    router.put('/social/ai/agent-settings/:id', mw.authAdminApi, http(api.socialAiAgentSettings.edit));

    // ## ai media jobs
    router.get('/social/ai/media/jobs', mw.authAdminApi, http(api.socialAiMediaJobs.browse));
    router.get('/social/ai/media/jobs/:id', mw.authAdminApi, http(api.socialAiMediaJobs.read));
    router.post('/social/ai/media/jobs', mw.authAdminApi, http(api.socialAiMediaJobs.add));
    router.put('/social/ai/media/jobs/:id', mw.authAdminApi, http(api.socialAiMediaJobs.edit));
    router.post('/social/ai/media/jobs/:id/cancel', mw.authAdminApi, http(api.socialAiMediaJobs.cancel));
    router.post('/social/ai/media/jobs/:id/retry', mw.authAdminApi, http(api.socialAiMediaJobs.retry));
    router.post('/social/ai/media/jobs/claim', mw.authAdminApi, http(api.socialAiMediaJobs.claim));
    router.post('/social/ai/media/jobs/:id/progress', mw.authAdminApi, http(api.socialAiMediaJobs.progress));
    router.post('/social/ai/media/jobs/:id/complete', mw.authAdminApi, http(api.socialAiMediaJobs.complete));
    router.post('/social/ai/media/jobs/:id/fail', mw.authAdminApi, http(api.socialAiMediaJobs.fail));
    // ## social ai dzi jobs
    router.get('/social/ai/dzi/jobs', mw.authAdminApi, http(api.socialAiDziJobs.browse));
    router.get('/social/ai/dzi/jobs/:id', mw.authAdminApi, http(api.socialAiDziJobs.read));
    router.post('/social/ai/dzi/jobs/:id/publish', mw.authAdminApi, http(api.socialAiDziJobs.publish));
    router.post('/social/ai/dzi/jobs/:id/unpublish', mw.authAdminApi, http(api.socialAiDziJobs.unpublish));
    router.post('/social/ai/dzi/jobs', mw.authAdminApi, http(api.socialAiDziJobs.add));
    router.post('/social/ai/dzi/jobs/:id/cancel', mw.authAdminApi, http(api.socialAiDziJobs.cancel));
    router.post('/social/ai/dzi/jobs/claim', mw.authAdminApi, http(api.socialAiDziJobs.claim));
    router.post('/social/ai/dzi/jobs/:id/progress', mw.authAdminApi, http(api.socialAiDziJobs.progress));
    router.post('/social/ai/dzi/jobs/:id/complete', mw.authAdminApi, http(api.socialAiDziJobs.complete));
    router.post('/social/ai/dzi/jobs/:id/fail', mw.authAdminApi, http(api.socialAiDziJobs.fail));
    router.del('/social/ai/dzi/jobs/:id', mw.authAdminApi, http(api.socialAiDziJobs.destroy));
    // ## social ai chart jobs
    router.get('/social/ai/chart/jobs', mw.authAdminApi, http(api.socialAiChartJobs.browse));
    router.get('/social/ai/chart/jobs/:id', mw.authAdminApi, http(api.socialAiChartJobs.read));
    router.post('/social/ai/chart/jobs', mw.authAdminApi, http(api.socialAiChartJobs.add));
    router.post('/social/ai/chart/jobs/:id/cancel', mw.authAdminApi, http(api.socialAiChartJobs.cancel));
    router.post('/social/ai/chart/jobs/claim', mw.authAdminApi, http(api.socialAiChartJobs.claim));
    router.post('/social/ai/chart/jobs/:id/progress', mw.authAdminApi, http(api.socialAiChartJobs.progress));
    router.post('/social/ai/chart/jobs/:id/complete', mw.authAdminApi, http(api.socialAiChartJobs.complete));
    router.post('/social/ai/chart/jobs/:id/fail', mw.authAdminApi, http(api.socialAiChartJobs.fail));
    router.post('/social/ai/chart/jobs/:id/link-assets', mw.authAdminApi, http(api.socialAiChartJobs.linkAssets));
    router.post('/social/ai/chart/jobs/:id/rerun', mw.authAdminApi, http(api.socialAiChartJobs.rerun));
    router.del('/social/ai/chart/jobs/:id', mw.authAdminApi, http(api.socialAiChartJobs.destroy));
    // ## social ai chart projects (generic work container, P1 — chart-scoped jobs hang off the general project path)
    router.get('/social/ai/projects', mw.authAdminApi, http(api.socialAiProjects.browse));
    router.post('/social/ai/projects', mw.authAdminApi, http(api.socialAiProjects.add));
    router.get('/social/ai/projects/:id', mw.authAdminApi, http(api.socialAiProjects.read));
    router.put('/social/ai/projects/:id', mw.authAdminApi, http(api.socialAiProjects.edit));
    router.del('/social/ai/projects/:id', mw.authAdminApi, http(api.socialAiProjects.destroy));

    // ## estate admin routes
    router.get('/estate/properties', mw.authAdminApi, http(api.estateProperties.browse));
    router.get('/estate/properties/:id', mw.authAdminApi, http(api.estateProperties.read));
    router.post('/estate/properties', mw.authAdminApi, http(api.estateProperties.add));
    router.put('/estate/properties/:id', mw.authAdminApi, http(api.estateProperties.edit));
    router.del('/estate/properties/:id', mw.authAdminApi, http(api.estateProperties.destroy));

    // ## person story admin routes
    router.get('/person/stories', mw.authAdminApi, http(api.personStories.browse));
    router.get('/person/stories/:id', mw.authAdminApi, http(api.personStories.read));
    router.post('/person/stories', mw.authAdminApi, http(api.personStories.add));
    router.put('/person/stories/:id', mw.authAdminApi, http(api.personStories.edit));
    router.del('/person/stories/:id', mw.authAdminApi, http(api.personStories.destroy));

    // ## person graph admin routes
    router.post('/person/graph/posts', mw.authAdminApi, createOrUpdatePost);
    router.post('/person/graph/gallery-assets', mw.authAdminApi, createOrUpdateGalleryAsset);

    router.get('/person/persons', mw.authAdminApi, http(api.persons.browse));
    router.get('/person/persons/:id', mw.authAdminApi, http(api.persons.read));
    router.get('/person/persons/:id/graph', mw.authAdminApi, http(api.persons.graph));
    router.post('/person/persons', mw.authAdminApi, http(api.persons.add));
    router.put('/person/persons/:id', mw.authAdminApi, http(api.persons.edit));
    router.del('/person/persons/:id', mw.authAdminApi, http(api.persons.destroy));

    router.get('/person/roles', mw.authAdminApi, http(api.personRoles.browse));
    router.get('/person/roles/:id', mw.authAdminApi, http(api.personRoles.read));
    router.post('/person/roles', mw.authAdminApi, http(api.personRoles.add));
    router.put('/person/roles/:id', mw.authAdminApi, http(api.personRoles.edit));
    router.del('/person/roles/:id', mw.authAdminApi, http(api.personRoles.destroy));

    router.get('/person/life-events', mw.authAdminApi, http(api.personLifeEvents.browse));
    router.get('/person/life-events/:id', mw.authAdminApi, http(api.personLifeEvents.read));
    router.post('/person/life-events', mw.authAdminApi, http(api.personLifeEvents.add));
    router.put('/person/life-events/:id', mw.authAdminApi, http(api.personLifeEvents.edit));
    router.del('/person/life-events/:id', mw.authAdminApi, http(api.personLifeEvents.destroy));

    router.get('/person/story-series', mw.authAdminApi, http(api.personStorySeries.browse));
    router.get('/person/story-series/:id', mw.authAdminApi, http(api.personStorySeries.read));
    router.post('/person/story-series', mw.authAdminApi, http(api.personStorySeries.add));
    router.put('/person/story-series/:id', mw.authAdminApi, http(api.personStorySeries.edit));
    router.del('/person/story-series/:id', mw.authAdminApi, http(api.personStorySeries.destroy));

    router.get('/person/story-episodes', mw.authAdminApi, http(api.personStoryEpisodes.browse));
    router.get('/person/story-episodes/:id', mw.authAdminApi, http(api.personStoryEpisodes.read));
    router.post('/person/story-episodes', mw.authAdminApi, http(api.personStoryEpisodes.add));
    router.put('/person/story-episodes/:id', mw.authAdminApi, http(api.personStoryEpisodes.edit));
    router.del('/person/story-episodes/:id', mw.authAdminApi, http(api.personStoryEpisodes.destroy));

    router.get('/person/relations', mw.authAdminApi, http(api.personRelations.browse));
    router.get('/person/relations/:id', mw.authAdminApi, http(api.personRelations.read));
    router.post('/person/relations', mw.authAdminApi, http(api.personRelations.add));
    router.put('/person/relations/:id', mw.authAdminApi, http(api.personRelations.edit));
    router.del('/person/relations/:id', mw.authAdminApi, http(api.personRelations.destroy));

    router.get('/person/post-relations', mw.authAdminApi, http(api.personPostRelations.browse));
    router.get('/person/post-relations/:id', mw.authAdminApi, http(api.personPostRelations.read));
    router.post('/person/post-relations', mw.authAdminApi, http(api.personPostRelations.add));
    router.put('/person/post-relations/:id', mw.authAdminApi, http(api.personPostRelations.edit));
    router.del('/person/post-relations/:id', mw.authAdminApi, http(api.personPostRelations.destroy));

    router.get('/person/gallery-assets', mw.authAdminApi, http(api.personGalleryAssets.browse));
    router.get('/person/gallery-assets/:id', mw.authAdminApi, http(api.personGalleryAssets.read));
    router.post('/person/gallery-assets', mw.authAdminApi, createOrUpdateGalleryAsset);
    router.put('/person/gallery-assets/:id', mw.authAdminApi, createOrUpdateGalleryAsset);
    router.del('/person/gallery-assets/:id', mw.authAdminApi, http(api.personGalleryAssets.destroy));

    router.get('/person/media', mw.authAdminApi, http(api.personMedia.browse));
    router.post('/person/media', mw.authAdminApi, http(api.personMedia.add));
    router.get('/person/media/:id', mw.authAdminApi, http(api.personMedia.read));
    router.put('/person/media/:id', mw.authAdminApi, http(api.personMedia.edit));
    router.del('/person/media/:id', mw.authAdminApi, http(api.personMedia.destroy));

    router.get('/estate/properties/:propertyId/posts', mw.authAdminApi, http(api.estatePropertyPosts.browse));
    router.post('/estate/properties/:propertyId/posts', mw.authAdminApi, http(api.estatePropertyPosts.add));
    router.del('/estate/properties/:propertyId/posts/:id', mw.authAdminApi, http(api.estatePropertyPosts.destroy));

    router.get('/estate/properties/:propertyId/tags', mw.authAdminApi, http(api.estatePropertyTags.browse));
    router.post('/estate/properties/:propertyId/tags', mw.authAdminApi, http(api.estatePropertyTags.add));
    router.del('/estate/properties/:propertyId/tags/:id', mw.authAdminApi, http(api.estatePropertyTags.destroy));

    router.get('/estate/properties/:propertyId/media', mw.authAdminApi, http(api.estatePropertyMedia.browse));
    router.post('/estate/properties/:propertyId/media', mw.authAdminApi, http(api.estatePropertyMedia.add));
    router.put('/estate/properties/:propertyId/media/:id', mw.authAdminApi, http(api.estatePropertyMedia.edit));
    router.del('/estate/properties/:propertyId/media/:id', mw.authAdminApi, http(api.estatePropertyMedia.destroy));

    router.get('/estate/properties/:propertyId/staff', mw.authAdminApi, http(api.estatePropertyStaff.browse));
    router.post('/estate/properties/:propertyId/staff', mw.authAdminApi, http(api.estatePropertyStaff.add));
    router.del('/estate/properties/:propertyId/staff/:id', mw.authAdminApi, http(api.estatePropertyStaff.destroy));

    router.get('/estate/inquiries', mw.authAdminApi, http(api.estateInquiries.browse));
    router.get('/estate/inquiries/:id', mw.authAdminApi, http(api.estateInquiries.read));
    router.put('/estate/inquiries/:id', mw.authAdminApi, http(api.estateInquiries.edit));
    router.del('/estate/inquiries/:id', mw.authAdminApi, http(api.estateInquiries.destroy));

    router.get('/estate/settings', mw.authAdminApi, http(api.estateSettings.browse));
    router.get('/estate/settings/:key', mw.authAdminApi, http(api.estateSettings.read));
    router.put('/estate/settings/:key', mw.authAdminApi, http(api.estateSettings.edit));

    // ## publish content admin routes
    router.get('/publish/content', mw.authAdminApi, http(api.publishContent.browse));
    router.get('/publish/content/:id', mw.authAdminApi, http(api.publishContent.read));
    router.post('/publish/content', mw.authAdminApi, http(api.publishContent.add));
    router.put('/publish/content/:id', mw.authAdminApi, http(api.publishContent.edit));
    router.del('/publish/content/:id', mw.authAdminApi, http(api.publishContent.destroy));

    return router;
};
