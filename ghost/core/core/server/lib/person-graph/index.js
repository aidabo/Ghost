const models = require('../../models');
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');

const messages = {
    notFound: 'person not found.'
};

const collectionToModels = (collection) => {
    if (!collection) {
        return [];
    }

    if (Array.isArray(collection.models)) {
        return collection.models;
    }

    if (typeof collection.toJSON === 'function') {
        const json = collection.toJSON();
        return Array.isArray(json) ? json : [];
    }

    return [];
};

const fetchOne = async (modelName, options = {}, publishedOnly = false) => {
    const model = models[modelName];
    if (!model) {
        return null;
    }

    return model.findOne(
        {
            ...options,
            ...(publishedOnly ? {status: 'published'} : {})
        },
        options
    );
};

const fetchMany = async (modelName, filter, options = {}) => {
    const model = models[modelName];
    if (!model) {
        return [];
    }

    const collection = await model.findPage({
        ...options,
        filter
    });

    return collectionToModels(collection);
};

const buildPersonGraph = async (id, options = {}, publishedOnly = false) => {
    const queryOptions = {context: {internal: true}};

    const person = await fetchOne('Person', {id}, publishedOnly);

    if (!person) {
        throw new errors.NotFoundError({
            message: tpl(messages.notFound)
        });
    }

    const personJson = typeof person.toJSON === 'function' ? person.toJSON() : person;
    const statusFilter = publishedOnly ? 'status:published' : null;
    const personFilter = `person_id:'${id}'`;

    const roles = await fetchMany('PersonRole', [statusFilter, personFilter].filter(Boolean).join('+'), queryOptions);
    const lifeEvents = await fetchMany('PersonLifeEvent', [statusFilter, personFilter].filter(Boolean).join('+'), queryOptions);
    const storySeriesModels = await fetchMany('PersonStorySeries', [statusFilter, personFilter].filter(Boolean).join('+'), queryOptions);
    const relationsModels = await fetchMany('PersonRelation', [statusFilter, personFilter].filter(Boolean).join('+'), queryOptions);
    const postRelationModels = await fetchMany('PersonPostRelation', [statusFilter, personFilter].filter(Boolean).join('+'), queryOptions);
    const assetModels = await fetchMany('PersonGalleryAsset', [statusFilter, personFilter].filter(Boolean).join('+'), queryOptions);

    const storySeries = [];
    for (const seriesModel of storySeriesModels) {
        const seriesJson = typeof seriesModel.toJSON === 'function' ? seriesModel.toJSON() : seriesModel;
        const episodes = await fetchMany(
            'PersonStoryEpisode',
            [statusFilter, `series_id:'${seriesJson.id}'`].filter(Boolean).join('+'),
            queryOptions
        );
        storySeries.push({
            ...seriesJson,
            episodes: episodes.map((episode) => (typeof episode.toJSON === 'function' ? episode.toJSON() : episode))
        });
    }

    const relations = [];
    for (const relationModel of relationsModels) {
        const relationJson = typeof relationModel.toJSON === 'function' ? relationModel.toJSON() : relationModel;
        const relatedPerson = relationJson.related_person_id
            ? await fetchOne('Person', {id: relationJson.related_person_id}, publishedOnly)
            : null;
        relations.push({
            ...relationJson,
            relatedPerson: relatedPerson ? (typeof relatedPerson.toJSON === 'function' ? relatedPerson.toJSON() : relatedPerson) : null
        });
    }

    const postRelations = [];
    for (const relationModel of postRelationModels) {
        const relationJson = typeof relationModel.toJSON === 'function' ? relationModel.toJSON() : relationModel;
        const post = relationJson.post_id
            ? await fetchOne('Post', {id: relationJson.post_id}, publishedOnly)
            : null;
        postRelations.push({
            ...relationJson,
            post: post ? (typeof post.toJSON === 'function' ? post.toJSON() : post) : null
        });
    }

    return {
        person: personJson,
        roles: roles.map((role) => (typeof role.toJSON === 'function' ? role.toJSON() : role)),
        lifeEvents: lifeEvents.map((event) => (typeof event.toJSON === 'function' ? event.toJSON() : event)),
        storySeries,
        relations,
        postRelations,
        galleryAssets: assetModels.map((asset) => (typeof asset.toJSON === 'function' ? asset.toJSON() : asset))
    };
};

module.exports = {
    buildPersonGraph
};
