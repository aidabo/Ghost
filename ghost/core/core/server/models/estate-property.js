const path = require('path');
const ObjectId = require('bson-objectid').default;
const errors = require('@tryghost/errors');
const tpl = require('@tryghost/tpl');
const storage = require('../adapters/storage');
const ghostBookshelf = require('./base');

const messages = {
    notFound: 'estate property not found.',
    publishedDeleteBlocked: 'Published estate properties cannot be deleted.'
};

function resolveStorageKeyRef(store, rawValue) {
    const value = String(rawValue || '').trim();
    if (!value) {
        return null;
    }

    let key = value;
    if (/^https?:\/\//i.test(value)) {
        try {
            key = new URL(value).pathname || value;
        } catch (err) {
            key = value;
        }
    }

    const host = String(store?.host || '').trim();
    if (host && key.startsWith(host)) {
        key = key.slice(host.length);
    }

    key = key.replace(/^\/+/, '');
    if (!key) {
        return null;
    }

    return {
        key,
        targetDir: path.dirname(key),
        fileName: path.basename(key)
    };
}

async function cleanupGalleryFiles(propertyId, assets) {
    const propertyPrefix = `gallery/properties/${String(propertyId || '').trim()}`;
    if (!propertyPrefix) {
        return;
    }

    const mediaStore = storage.getStorage('media');
    if (!mediaStore || typeof mediaStore.delete !== 'function') {
        return;
    }

    const deleteByPrefix = async () => {
        if (typeof mediaStore.list !== 'function') {
            return false;
        }

        try {
            let continuationToken = null;
            do {
                const listing = await mediaStore.list({
                    prefix: propertyPrefix,
                    continuationToken
                });
                const items = Array.isArray(listing?.items) ? listing.items : [];
                for (const item of items) {
                    const key = String(item?.path || item?.key || '').trim();
                    if (!key) {
                        continue;
                    }
                    const targetDir = path.dirname(key);
                    const fileName = path.basename(key);
                    await mediaStore.delete(fileName, targetDir);
                }
                continuationToken = listing?.nextCursor || null;
            } while (continuationToken);
            return true;
        } catch (err) {
            return false;
        }
    }

    const listed = await deleteByPrefix();
    if (listed) {
        return;
    }

    const fallbackAssets = Array.isArray(assets) ? assets : [];
    for (const asset of fallbackAssets) {
        for (const url of [asset?.storage_url, asset?.thumbnail_url]) {
            const normalized = String(url || '').trim();
            if (!normalized) {
                continue;
            }

            try {
                const fileRef = resolveStorageKeyRef(mediaStore, normalized);
                if (!fileRef) {
                    continue;
                }
                const {targetDir, fileName} = fileRef;
                await mediaStore.delete(fileName, targetDir);
            } catch (err) {
                // Best-effort cleanup. DB cleanup should still succeed.
            }
        }
    }
}

const EstateProperty = ghostBookshelf.Model.extend({
    tableName: 'estate_properties',

    defaults() {
        return {
            id: ObjectId().toHexString(),
            status: 'draft',
            property_type: 'sale',
            sort_order: 0,
            featured: false,
            pets_allowed: false
        };
    },

    // Relations
    posts() {
        return this.hasMany('EstatePropertyPost', 'property_id');
    },

    propertyTags() {
        return this.hasMany('EstatePropertyTag', 'property_id');
    },

    tags() {
        return this.belongsToMany('Tag', 'estate_property_tags', 'property_id', 'tag_id');
    },

    media() {
        return this.hasMany('EstatePropertyMedium', 'property_id');
    },

    inquiries() {
        return this.hasMany('EstateInquiry', 'property_id');
    },

    socialMediaAssets() {
        return this.belongsToMany('SocialMediaAsset', 'estate_property_media', 'property_id', 'media_id');
    },

    ghostPosts() {
        return this.belongsToMany('Post', 'estate_property_posts', 'property_id', 'post_id');
    }
}, {
    orderDefaultOptions() {
        return {
            'estate_properties.sort_order': 'ASC',
            'estate_properties.created_at': 'DESC'
        };
    },

    permittedAttributes: [
        'id', 'status', 'property_type',
        'price_sale', 'price_rent_monthly', 'price_management_fee',
        'price_deposit', 'price_key_money', 'price_maintenance_fee', 'price_other_fees',
        'floor_plan', 'floor_area', 'land_area', 'building_area',
        'year_built', 'floors_total', 'floor_number',
        'layout_description',
        'address', 'city', 'ward', 'prefecture',
        'postal_code', 'latitude', 'longitude',
        'transport_info', 'nearest_station',
        'total_units', 'structure', 'direction', 'parking_info', 'pets_allowed',
        'expected_yield', 'current_yield', 'expected_rent',
        'features', 'featured', 'sort_order',
        'group_id',
        'created_at', 'updated_at', 'created_by', 'updated_by',
        'google_map_url', 'google_3d_url', 'google_places_data', 'mlit_summary_data', 'street_view_url', 'hazard_map_url',
        'nearby_stores', 'nearby_hospitals', 'nearby_schools', 'nearby_parks',
        'elementary_school_info', 'junior_school_info', 'school_info', 'preschool_info',
        'liquefaction_info', 'flood_inundation_info', 'storm_surge_info', 'tsunami_info',
        'landslide_warning_info', 'disaster_hazard_area_info', 'large_scale_fill_info',
        'landslide_prevention_info', 'steep_slope_info',
        'building_auto_lock', 'building_manager',
        'mlit_data'
    ],

    relationships: ['posts', 'propertyTags', 'tags', 'media', 'inquiries', 'socialMediaAssets', 'ghostPosts'],

    includeRelations: ['posts', 'tags', 'media', 'inquiries', 'socialMediaAssets'],

    destroy: function destroy(unfilteredOptions) {
        const options = this.filterOptions(unfilteredOptions, 'destroy', {extraAllowedProperties: ['id']});
        options.withRelated = ['ghostPosts', 'tags', 'media', 'inquiries'];

        const destroyEstateProperty = async () => {
            const property = await this.forge({id: options.id})
                .fetch({
                    ...options,
                    require: false,
                    withRelated: options.withRelated
                });

            if (!property) {
                throw new errors.NotFoundError({
                    message: tpl(messages.notFound)
                });
            }

            if (String(property.get('status') || '').trim() === 'published') {
                throw new errors.ValidationError({
                    message: tpl(messages.publishedDeleteBlocked)
                });
            }

            const mediaRows = property.related('media') ? property.related('media').toJSON() : [];
            const mediaIds = Array.from(new Set(
                mediaRows
                    .map((row) => String(row.media_id || '').trim())
                    .filter(Boolean)
            ));

            const assets = mediaIds.length > 0
                ? await ghostBookshelf.knex('social_media_assets')
                    .whereIn('id', mediaIds)
                    .select(['id', 'storage_url', 'thumbnail_url'])
                : [];

            if (property.related('ghostPosts')) {
                await property.related('ghostPosts').detach(null, options);
            }
            if (property.related('tags')) {
                await property.related('tags').detach(null, options);
            }
            if (property.related('socialMediaAssets')) {
                await property.related('socialMediaAssets').detach(null, options);
            }

            await ghostBookshelf.knex('estate_inquiries')
                .where({property_id: property.id})
                .transacting(options.transacting)
                .del();

            if (assets.length > 0) {
                await ghostBookshelf.knex('social_media_assets')
                    .whereIn('id', assets.map((asset) => asset.id))
                    .transacting(options.transacting)
                    .del();
            }

            await ghostBookshelf.Model.destroy.call(this, options);

            return assets;
        };

        if (!options.transacting) {
            return ghostBookshelf.transaction(async (transacting) => {
                options.transacting = transacting;
                const assets = await destroyEstateProperty();
                await cleanupGalleryFiles(options.id, assets);
                return true;
            });
        }

        return destroyEstateProperty().then(async (assets) => {
            await cleanupGalleryFiles(options.id, assets);
            return true;
        });
    }
});

const EstateProperties = ghostBookshelf.Collection.extend({
    model: EstateProperty
});

module.exports = {
    EstateProperty: ghostBookshelf.model('EstateProperty', EstateProperty),
    EstateProperties: ghostBookshelf.collection('EstateProperties', EstateProperties)
};
