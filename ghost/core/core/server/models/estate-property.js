const ObjectId = require('bson-objectid').default;
const ghostBookshelf = require('./base');

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

    relationships: ['posts', 'propertyTags', 'tags', 'media', 'socialMediaAssets', 'ghostPosts'],

    includeRelations: ['posts', 'tags', 'media', 'socialMediaAssets']
});

const EstateProperties = ghostBookshelf.Collection.extend({
    model: EstateProperty
});

module.exports = {
    EstateProperty: ghostBookshelf.model('EstateProperty', EstateProperty),
    EstateProperties: ghostBookshelf.collection('EstateProperties', EstateProperties)
};
