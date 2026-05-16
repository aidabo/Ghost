const {addTable} = require('../../utils');

module.exports = addTable('estate_properties', {
    id: {type: 'string', maxlength: 24, nullable: false, primary: true},

    // Status and classification
    status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['published', 'draft', 'sold', 'rented']]}},
    property_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'sale', validations: {isIn: [['sale', 'rent', 'investment']]}},

    // Pricing
    price_sale: {type: 'bigInteger', nullable: true},
    price_rent_monthly: {type: 'bigInteger', nullable: true},
    price_deposit: {type: 'bigInteger', nullable: true},
    price_key_money: {type: 'bigInteger', nullable: true},
    price_management_fee: {type: 'bigInteger', nullable: true},
    price_maintenance_fee: {type: 'bigInteger', nullable: true},
    price_other_fees: {type: 'text', maxlength: 2000, nullable: true},

    // Property specs
    floor_plan: {type: 'string', maxlength: 50, nullable: true},
    floor_area: {type: 'string', maxlength: 50, nullable: true},
    land_area: {type: 'string', maxlength: 50, nullable: true},
    building_area: {type: 'string', maxlength: 50, nullable: true},
    year_built: {type: 'string', maxlength: 20, nullable: true},
    floors_total: {type: 'integer', nullable: true},
    floor_number: {type: 'integer', nullable: true},
    layout_description: {type: 'text', maxlength: 2000, nullable: true},

    // Location
    address: {type: 'string', maxlength: 500, nullable: true},
    city: {type: 'string', maxlength: 100, nullable: true},
    ward: {type: 'string', maxlength: 100, nullable: true},
    prefecture: {type: 'string', maxlength: 50, nullable: true},
    postal_code: {type: 'string', maxlength: 20, nullable: true},
    latitude: {type: 'float', nullable: true},
    longitude: {type: 'float', nullable: true},

    // Transport
    transport_info: {type: 'text', maxlength: 5000, nullable: true},
    nearest_station: {type: 'string', maxlength: 200, nullable: true},

    // Building details
    total_units: {type: 'integer', nullable: true},
    structure: {type: 'string', maxlength: 100, nullable: true},
    direction: {type: 'string', maxlength: 50, nullable: true},
    parking_info: {type: 'string', maxlength: 500, nullable: true},
    pets_allowed: {type: 'bool', nullable: true, defaultTo: false},

    // Investment
    expected_yield: {type: 'float', nullable: true},
    current_yield: {type: 'float', nullable: true},
    expected_rent: {type: 'integer', nullable: true},

    // Features (JSON array)
    features: {type: 'text', maxlength: 5000, nullable: true},

    // Metadata
    featured: {type: 'bool', nullable: true, defaultTo: false},
    sort_order: {type: 'integer', nullable: true, defaultTo: 0},

    // Group access control
    group_id: {type: 'string', maxlength: 24, nullable: true},

    // Timestamps
    created_at: {type: 'dateTime', nullable: false},
    updated_at: {type: 'dateTime', nullable: true},
    created_by: {type: 'string', maxlength: 24, nullable: true},
    updated_by: {type: 'string', maxlength: 24, nullable: true}
});
