const models = require('../../models');
const errors = require('@tryghost/errors');

const loadExistingAsset = async (personId, assetKey) => {
    if (!personId || !assetKey) {
        return null;
    }

    return models.PersonGalleryAsset.findOne({person_id: personId, asset_key: assetKey}, {context: {internal: true}});
};

module.exports = {
    docName: 'persongalleryassets',
    add: {
        headers: {
            cacheInvalidate: true
        },
        permissions: true,
        async query(frame) {
            const payload = frame.data.persongalleryassets?.[0] || frame.data.galleryassets?.[0] || frame.data.asset?.[0];

            if (!payload || !payload.person_id || !payload.asset_key) {
                throw new errors.BadRequestError({
                    message: 'person_id and asset_key are required.'
                });
            }

            const existing = await loadExistingAsset(payload.person_id, payload.asset_key);
            const options = {context: {internal: true}};

            if (existing) {
                return models.PersonGalleryAsset.edit(payload, {id: existing.id, context: {internal: true}});
            }

            return models.PersonGalleryAsset.add(payload, options);
        }
    }
};
