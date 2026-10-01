const {combineNonTransactionalMigrations, addTable} = require('../../utils');

// Avatar profiles deliberately do not store image URLs. Images are finalized
// through the existing Gallery flow and referenced by social_media_assets.id so
// Project/Gallery search remains the source of truth.
module.exports = combineNonTransactionalMigrations(
    addTable('social_ai_avatar_profiles', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        display_name: {type: 'string', maxlength: 191, nullable: false},
        description: {type: 'string', maxlength: 2000, nullable: true},
        voice_provider: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'qwen'},
        voice_name: {type: 'string', maxlength: 191, nullable: false},
        locale: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'ja-JP'},
        persona: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'neutral'},
        gender_presentation: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'neutral'},
        provider: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'self-hosted'},
        default_for_news: {type: 'boolean', nullable: false, defaultTo: false, index: true},
        status: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'draft', index: true},
        rights_status: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'pending'},
        disclosure_label: {type: 'string', maxlength: 191, nullable: true},
        created_by: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: false},
        '@@INDEXES@@': [
            ['status', 'default_for_news'],
            ['voice_provider', 'voice_name', 'locale']
        ]
    }),
    addTable('social_ai_avatar_profile_versions', {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        profile_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_avatar_profiles.id', cascadeDelete: true},
        version: {type: 'integer', nullable: false, unsigned: true},
        image_asset_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_media_assets.id', setNullDelete: true},
        project_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        source_kind: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'uploaded'},
        generation_model: {type: 'string', maxlength: 191, nullable: true},
        prompt_hash: {type: 'string', maxlength: 64, nullable: true},
        status: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'draft', index: true},
        approved_by: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: false},
        '@@INDEXES@@': [
            ['profile_id', 'status'],
            ['project_id', 'status']
        ],
        '@@UNIQUE_CONSTRAINTS@@': [
            ['profile_id', 'version']
        ]
    })
);
