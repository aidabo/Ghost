const {buildPersonGraph} = require('../../lib/person-graph');
const {buildCrudController} = require('./person-graph-base');

const controllerDefs = {
    persons: {
        ...buildCrudController({
            docName: 'persons',
            modelName: 'Person',
            permissionObject: 'person',
            notFoundMessage: 'person not found.',
            publishedOnly: true
        }),
        graph: {
            headers: {
                cacheInvalidate: false
            },
            options: ['id'],
            data: ['id'],
            permissions: {
                method: 'read'
            },
            async query(frame) {
                return buildPersonGraph(frame.data.id, frame.options, true);
            }
        }
    },
    personroles: buildCrudController({
        docName: 'personroles',
        modelName: 'PersonRole',
        permissionObject: 'personrole',
        notFoundMessage: 'person role not found.',
        publishedOnly: true
    }),
    personlifeevents: buildCrudController({
        docName: 'personlifeevents',
        modelName: 'PersonLifeEvent',
        permissionObject: 'personlifeevent',
        notFoundMessage: 'person life event not found.',
        publishedOnly: true
    }),
    personstoryseries: buildCrudController({
        docName: 'personstoryseries',
        modelName: 'PersonStorySeries',
        permissionObject: 'personstoryseries',
        notFoundMessage: 'person story series not found.',
        publishedOnly: true
    }),
    personstoryepisodes: buildCrudController({
        docName: 'personstoryepisodes',
        modelName: 'PersonStoryEpisode',
        permissionObject: 'personstoryepisode',
        notFoundMessage: 'person story episode not found.',
        publishedOnly: true
    }),
    personrelations: buildCrudController({
        docName: 'personrelations',
        modelName: 'PersonRelation',
        permissionObject: 'personrelation',
        notFoundMessage: 'person relation not found.',
        publishedOnly: true
    }),
    personpostrelations: buildCrudController({
        docName: 'personpostrelations',
        modelName: 'PersonPostRelation',
        permissionObject: 'personpostrelation',
        notFoundMessage: 'person post relation not found.',
        publishedOnly: true
    }),
    persongalleryassets: buildCrudController({
        docName: 'persongalleryassets',
        modelName: 'PersonGalleryAsset',
        permissionObject: 'persongalleryasset',
        notFoundMessage: 'person gallery asset not found.',
        publishedOnly: true
    })
};

module.exports = controllerDefs;
