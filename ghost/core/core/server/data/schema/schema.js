/* String Column Sizes Information
 * (From: https://github.com/TryGhost/Ghost/pull/7932)
 *
 * Small strings = length 50
 * Medium strings = length 191
 * Large strings = length 1000-2000
 * Text = length 65535 (64 KiB)
 * Long text = length 1,000,000,000
 */
module.exports = {
    newsletters: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        uuid: {type: 'string', maxlength: 36, nullable: false, unique: true, validations: {isUUID: true}},
        name: {type: 'string', maxlength: 191, nullable: false, unique: true},
        description: {type: 'string', maxlength: 2000, nullable: true},
        feedback_enabled: {type: 'boolean', nullable: false, defaultTo: false},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        sender_name: {type: 'string', maxlength: 191, nullable: true},
        sender_email: {type: 'string', maxlength: 191, nullable: true},
        sender_reply_to: {type: 'string', maxlength: 191, nullable: false, defaultTo: 'newsletter'},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'active', validations: {isIn: [['active', 'archived']]}},
        visibility: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'members'
        },
        subscribe_on_signup: {type: 'boolean', nullable: false, defaultTo: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        header_image: {type: 'string', maxlength: 2000, nullable: true},
        show_header_icon: {type: 'boolean', nullable: false, defaultTo: true},
        show_header_title: {type: 'boolean', nullable: false, defaultTo: true},
        show_excerpt: {type: 'boolean', nullable: false, defaultTo: false},
        title_font_category: {type: 'string', maxlength: 191, nullable: false, defaultTo: 'sans_serif', validations: {isIn: [['serif', 'sans_serif']]}},
        title_alignment: {type: 'string', maxlength: 191, nullable: false, defaultTo: 'center', validations: {isIn: [['center', 'left']]}},
        show_feature_image: {type: 'boolean', nullable: false, defaultTo: true},
        body_font_category: {type: 'string', maxlength: 191, nullable: false, defaultTo: 'sans_serif', validations: {isIn: [['serif', 'sans_serif']]}},
        footer_content: {type: 'text', maxlength: 1000000000, nullable: true},
        show_badge: {type: 'boolean', nullable: false, defaultTo: true},
        show_header_name: {type: 'boolean', nullable: false, defaultTo: true},
        show_post_title_section: {type: 'boolean', nullable: false, defaultTo: true},
        show_comment_cta: {type: 'boolean', nullable: false, defaultTo: true},
        show_subscription_details: {type: 'boolean', nullable: false, defaultTo: false},
        show_latest_posts: {type: 'boolean', nullable: false, defaultTo: false},
        background_color: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'light'},
        border_color: {type: 'string', maxlength: 50, nullable: true},
        title_color: {type: 'string', maxlength: 50, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    posts: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        uuid: {type: 'string', maxlength: 36, nullable: false, index: true, validations: {isUUID: true}},
        title: {type: 'string', maxlength: 2000, nullable: false, validations: {isLength: {max: 255}}},
        slug: {type: 'string', maxlength: 191, nullable: false},
        mobiledoc: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        lexical: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        html: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        comment_id: {type: 'string', maxlength: 50, nullable: true},
        plaintext: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        feature_image: {type: 'string', maxlength: 2000, nullable: true},
        featured: {type: 'boolean', nullable: false, defaultTo: false},
        type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'post', validations: {isIn: [['post', 'page']]}},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['published', 'draft', 'scheduled', 'sent', 'hidden']]}},
        // NOTE: unused at the moment and reserved for future features
        locale: {type: 'string', maxlength: 6, nullable: true},
        visibility: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'public'
        },
        email_recipient_filter: {
            type: 'text',
            maxlength: 1000000000,
            nullable: false
        },
        created_at: {type: 'dateTime', nullable: false},
        /**
         * @deprecated: https://github.com/TryGhost/Ghost/issues/10286
         *
         * This is valid for all x_by fields.
         */
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true, index: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true},
        published_at: {type: 'dateTime', nullable: true, index: true},
        published_by: {type: 'string', maxlength: 24, nullable: true},
        custom_excerpt: {type: 'string', maxlength: 2000, nullable: true, validations: {isLength: {max: 300}}},
        codeinjection_head: {type: 'text', maxlength: 65535, nullable: true},
        codeinjection_foot: {type: 'text', maxlength: 65535, nullable: true},
        custom_template: {type: 'string', maxlength: 100, nullable: true},
        canonical_url: {type: 'text', maxlength: 2000, nullable: true},
        newsletter_id: {type: 'string', maxlength: 24, nullable: true, references: 'newsletters.id'},
        show_title_and_feature_image: {type: 'boolean', nullable: false, defaultTo: true},

        group_id: {type: 'string', maxlength: 24, nullable: true},
        /**
         * group.type === 'public' -> public_post = true
         * group.type !== 'public' -> public_post = false
         * no group -> public_post = true
         */
        public_post: {type: 'boolean', nullable: false, index: true, defaultTo: true},
        related_date: {type: 'dateTime', nullable: true, index: true},
        related_events: {type: 'string', maxlength: 2000, nullable: true},
        post_approved: {type: 'boolean', nullable: false, index: true, defaultTo: true},
        post_comment_closed: {type: 'boolean', nullable: true, defaultTo: false},

        /*custom page data*/
        '@@INDEXES@@': [
            ['type', 'status', 'updated_at'],
            ['group_id', 'status', 'updated_at']
        ],
        '@@UNIQUE_CONSTRAINTS@@': [
            ['slug', 'type']
        ]
    },
    posts_meta: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id', unique: true},
        og_image: {type: 'string', maxlength: 2000, nullable: true},
        og_title: {type: 'string', maxlength: 300, nullable: true},
        og_description: {type: 'string', maxlength: 500, nullable: true},
        twitter_image: {type: 'string', maxlength: 2000, nullable: true},
        twitter_title: {type: 'string', maxlength: 300, nullable: true},
        twitter_description: {type: 'string', maxlength: 500, nullable: true},
        meta_title: {type: 'string', maxlength: 2000, nullable: true, validations: {isLength: {max: 300}}},
        meta_description: {type: 'string', maxlength: 2000, nullable: true, validations: {isLength: {max: 500}}},
        email_subject: {type: 'string', maxlength: 300, nullable: true},
        frontmatter: {type: 'text', maxlength: 65535, nullable: true},
        feature_image_alt: {type: 'string', maxlength: 191, nullable: true},
        feature_image_caption: {type: 'text', maxlength: 65535, nullable: true},
        email_only: {type: 'boolean', nullable: false, defaultTo: false}
    },
    // NOTE: this is the staff table
    users: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 191, nullable: false},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        media_folder_alias: {type: 'string', maxlength: 32, nullable: true, unique: true},
        password: {type: 'string', maxlength: 60, nullable: false},
        email: {type: 'string', maxlength: 191, nullable: false, unique: true, validations: {isEmail: true}},
        profile_image: {type: 'string', maxlength: 2000, nullable: true},
        cover_image: {type: 'string', maxlength: 2000, nullable: true},
        bio: {type: 'text', maxlength: 65535, nullable: true, validations: {isLength: {max: 5000}}},
        website: {type: 'string', maxlength: 2000, nullable: true, validations: {isEmptyOrURL: true}},
        location: {type: 'text', maxlength: 65535, nullable: true, validations: {isLength: {max: 150}}},
        facebook: {type: 'string', maxlength: 2000, nullable: true},
        twitter: {type: 'string', maxlength: 2000, nullable: true},
        accessibility: {type: 'text', maxlength: 65535, nullable: true},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'active',
            validations: {
                isIn: [[
                    'active',
                    'inactive',
                    'locked',
                    'warn-1',
                    'warn-2',
                    'warn-3',
                    'warn-4'
                ]]
            }
        },
        // NOTE: unused at the moment and reserved for future features
        locale: {type: 'string', maxlength: 6, nullable: true},
        visibility: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'public',
            validations: {isIn: [['public']]}
        },
        meta_title: {type: 'string', maxlength: 2000, nullable: true, validations: {isLength: {max: 300}}},
        meta_description: {type: 'string', maxlength: 2000, nullable: true, validations: {isLength: {max: 500}}},
        tour: {type: 'text', maxlength: 65535, nullable: true},
        // NOTE: Used to determine whether a user has logged in previously
        last_seen: {type: 'dateTime', nullable: true},
        comment_notifications: {type: 'boolean', nullable: false, defaultTo: true},
        free_member_signup_notification: {type: 'boolean', nullable: false, defaultTo: true},
        paid_subscription_started_notification: {type: 'boolean', nullable: false, defaultTo: true},
        paid_subscription_canceled_notification: {type: 'boolean', nullable: false, defaultTo: false},
        mention_notifications: {type: 'boolean', nullable: false, defaultTo: true},
        recommendation_notifications: {type: 'boolean', nullable: false, defaultTo: true},
        milestone_notifications: {type: 'boolean', nullable: false, defaultTo: true},
        donation_notifications: {type: 'boolean', nullable: false, defaultTo: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    posts_authors: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id'},
        author_id: {type: 'string', maxlength: 24, nullable: false, references: 'users.id'},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0}
    },
    roles: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 50, nullable: false, unique: true},
        description: {type: 'string', maxlength: 2000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    roles_users: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        role_id: {type: 'string', maxlength: 24, nullable: false},
        user_id: {type: 'string', maxlength: 24, nullable: false}
    },
    permissions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 50, nullable: false, unique: true},
        object_type: {type: 'string', maxlength: 50, nullable: false},
        action_type: {type: 'string', maxlength: 50, nullable: false},
        object_id: {type: 'string', maxlength: 24, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    permissions_users: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false},
        permission_id: {type: 'string', maxlength: 24, nullable: false}
    },
    permissions_roles: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        role_id: {type: 'string', maxlength: 24, nullable: false},
        permission_id: {type: 'string', maxlength: 24, nullable: false}
    },
    settings: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        group: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'core',
            validations: {
                isIn: [[
                    'amp',
                    'core',
                    'email',
                    'labs',
                    'members',
                    'portal',
                    'private',
                    'site',
                    'slack',
                    'theme',
                    'unsplash',
                    'views'
                ]]
            }
        },
        key: {type: 'string', maxlength: 50, nullable: false, unique: true},
        // NOTE: as JSON objects are no longer stored in `value` we could potentially reduce the maxlength
        value: {type: 'text', maxlength: 65535, nullable: true},
        type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            validations: {
                isIn: [[
                    'array',
                    'string',
                    'number',
                    'boolean',
                    'object'
                ]]
            }
        },
        flags: {type: 'string', maxlength: 50, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    tags: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 191, nullable: false, validations: {matches: /^([^,]|$)/}},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        description: {type: 'text', maxlength: 65535, nullable: true, validations: {isLength: {max: 500}}},
        feature_image: {type: 'string', maxlength: 2000, nullable: true},
        parent_id: {type: 'string', nullable: true},
        visibility: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'public',
            validations: {isIn: [['public', 'internal']]}
        },
        og_image: {type: 'string', maxlength: 2000, nullable: true},
        og_title: {type: 'string', maxlength: 300, nullable: true},
        og_description: {type: 'string', maxlength: 500, nullable: true},
        twitter_image: {type: 'string', maxlength: 2000, nullable: true},
        twitter_title: {type: 'string', maxlength: 300, nullable: true},
        twitter_description: {type: 'string', maxlength: 500, nullable: true},
        meta_title: {type: 'string', maxlength: 2000, nullable: true, validations: {isLength: {max: 300}}},
        meta_description: {type: 'string', maxlength: 2000, nullable: true, validations: {isLength: {max: 500}}},
        codeinjection_head: {type: 'text', maxlength: 65535, nullable: true},
        codeinjection_foot: {type: 'text', maxlength: 65535, nullable: true},
        canonical_url: {type: 'string', maxlength: 2000, nullable: true},
        accent_color: {type: 'string', maxlength: 50, nullable: true},
        classification: {type: 'string', maxlength: 100, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    posts_tags: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id'},
        tag_id: {type: 'string', maxlength: 24, nullable: false, references: 'tags.id'},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        '@@INDEXES@@': [
            ['post_id', 'tag_id']
        ]
    },
    invites: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        role_id: {type: 'string', maxlength: 24, nullable: false},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'pending',
            validations: {isIn: [['pending', 'sent']]}
        },
        token: {type: 'string', maxlength: 191, nullable: false, unique: true},
        email: {type: 'string', maxlength: 191, nullable: false, unique: true, validations: {isEmail: true}},
        expires: {type: 'bigInteger', nullable: false},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    brute: {
        key: {type: 'string', maxlength: 191, primary: true},
        firstRequest: {type: 'bigInteger'},
        lastRequest: {type: 'bigInteger'},
        lifetime: {type: 'bigInteger'},
        count: {type: 'integer'}
    },
    sessions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        session_id: {type: 'string', maxlength: 32, nullable: false, unique: true},
        user_id: {type: 'string', maxlength: 24, nullable: false},
        session_data: {type: 'string', maxlength: 2000, nullable: false},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    integrations: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'custom',
            validations: {isIn: [['internal', 'builtin', 'custom', 'core']]}
        },
        name: {type: 'string', maxlength: 191, nullable: false},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        icon_image: {type: 'string', maxlength: 2000, nullable: true},
        description: {type: 'string', maxlength: 2000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    webhooks: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        event: {type: 'string', maxlength: 50, nullable: false, validations: {isLowercase: true}},
        target_url: {type: 'string', maxlength: 2000, nullable: false},
        name: {type: 'string', maxlength: 191, nullable: true},
        secret: {type: 'string', maxlength: 191, nullable: true},
        // @NOTE: the defaultTo does not make sense to set on DB layer as it leads to unnecessary maintenance every major release
        //       would be ideal if we can remove the default and instead have "isIn" validation checking if it's a valid version e.g: 'v3', 'v4', 'canary'
        api_version: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'v2'},
        // NOTE: integration_id column needs "nullable: true" -> "nullable: false" migration (recreate table with nullable: false)
        // CASE: Ghost instances initialized pre 4.0 will have this column set to nullable: true in db schema
        integration_id: {type: 'string', maxlength: 24, nullable: false, references: 'integrations.id', cascadeDelete: true},
        last_triggered_at: {type: 'dateTime', nullable: true},
        last_triggered_status: {type: 'string', maxlength: 50, nullable: true},
        last_triggered_error: {type: 'string', maxlength: 50, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    api_keys: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            validations: {isIn: [['content', 'admin']]}
        },
        secret: {
            type: 'string',
            maxlength: 191,
            nullable: false,
            unique: true,
            validations: {isLength: {min: 26, max: 128}}
        },
        role_id: {type: 'string', maxlength: 24, nullable: true},
        // integration_id is nullable to allow "internal" API keys that don't show in the UI
        integration_id: {type: 'string', maxlength: 24, nullable: true},
        user_id: {type: 'string', maxlength: 24, nullable: true},
        last_seen_at: {type: 'dateTime', nullable: true},
        last_seen_version: {type: 'string', maxlength: 50, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    mobiledoc_revisions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, index: true},
        mobiledoc: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        created_at_ts: {type: 'bigInteger', nullable: false},
        created_at: {type: 'dateTime', nullable: false}
    },
    post_revisions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, index: true},
        lexical: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        created_at_ts: {type: 'bigInteger', nullable: false},
        created_at: {type: 'dateTime', nullable: false},
        author_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', cascadeDelete: false, constraintName: 'post_revs_author_id_foreign'},
        title: {type: 'string', maxlength: 2000, nullable: true, validations: {isLength: {max: 255}}},
        post_status: {type: 'string', maxlength: 50, nullable: true, validations: {isIn: [['draft', 'published', 'scheduled', 'sent', 'hidden']]}},
        reason: {type: 'string', maxlength: 50, nullable: true},
        feature_image: {type: 'string', maxlength: 2000, nullable: true},
        feature_image_alt: {type: 'string', maxlength: 191, nullable: true},
        feature_image_caption: {type: 'text', maxlength: 65535, nullable: true},
        custom_excerpt: {type: 'string', maxlength: 2000, nullable: true, validations: {isLength: {max: 300}}}
    },
    members: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        uuid: {type: 'string', maxlength: 36, nullable: true, unique: true, validations: {isUUID: true}},
        transient_id: {type: 'string', maxlength: 191, nullable: false, unique: true},
        email: {type: 'string', maxlength: 191, nullable: false, unique: true, validations: {isEmail: true}},
        status: {
            type: 'string', maxlength: 50, nullable: false, defaultTo: 'free', validations: {
                isIn: [['free', 'paid', 'comped']]
            }
        },
        name: {type: 'string', maxlength: 191, nullable: true},
        expertise: {type: 'string', maxlength: 191, nullable: true, validations: {isLength: {max: 50}}},
        note: {type: 'string', maxlength: 2000, nullable: true},
        geolocation: {type: 'string', maxlength: 2000, nullable: true},
        enable_comment_notifications: {type: 'boolean', nullable: false, defaultTo: true},
        email_count: {type: 'integer', unsigned: true, nullable: false, defaultTo: 0},
        email_opened_count: {type: 'integer', unsigned: true, nullable: false, defaultTo: 0},
        email_open_rate: {type: 'integer', unsigned: true, nullable: true, index: true},
        email_disabled: {type: 'boolean', nullable: false, defaultTo: false},
        last_seen_at: {type: 'dateTime', nullable: true},
        last_commented_at: {type: 'dateTime', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    // NOTE: this is the tiers table
    products: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 191, nullable: false},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        // @deprecated: use a status enum with isIn validation, not an `active` boolean
        active: {type: 'boolean', nullable: false, defaultTo: true},
        welcome_page_url: {type: 'string', maxlength: 2000, nullable: true},
        visibility: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'none',
            validations: {isIn: [['public', 'none']]}
        },
        trial_days: {type: 'integer', unsigned: true, nullable: false, defaultTo: 0},
        description: {type: 'string', maxlength: 191, nullable: true},
        type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'paid',
            validations: {
                isIn: [['paid', 'free']]
            }
        },
        currency: {type: 'string', maxlength: 50, nullable: true},
        monthly_price: {type: 'integer', unsigned: true, nullable: true},
        yearly_price: {type: 'integer', unsigned: true, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        // To be removed in future
        monthly_price_id: {type: 'string', maxlength: 24, nullable: true},
        yearly_price_id: {type: 'string', maxlength: 24, nullable: true}
    },
    offers: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        // @deprecated: use a status enum with isIn validation, not an `active` boolean
        active: {type: 'boolean', nullable: false, defaultTo: true},
        name: {type: 'string', maxlength: 191, nullable: false, unique: true},
        code: {type: 'string', maxlength: 191, nullable: false, unique: true},
        product_id: {type: 'string', maxlength: 24, nullable: false, references: 'products.id'},
        stripe_coupon_id: {type: 'string', maxlength: 255, nullable: true, unique: true},
        interval: {type: 'string', maxlength: 50, nullable: false, validations: {isIn: [['month', 'year']]}},
        currency: {type: 'string', maxlength: 50, nullable: true},
        discount_type: {type: 'string', maxlength: 50, nullable: false, validations: {isIn: [['percent', 'amount', 'trial']]}},
        discount_amount: {type: 'integer', nullable: false},
        duration: {type: 'string', maxlength: 50, nullable: false, validations: {isIn: [['trial', 'once', 'repeating', 'forever']]}},
        duration_in_months: {type: 'integer', nullable: true},
        portal_title: {type: 'string', maxlength: 191, nullable: true},
        portal_description: {type: 'string', maxlength: 2000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    benefits: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 191, nullable: false},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    products_benefits: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        product_id: {type: 'string', maxlength: 24, nullable: false, references: 'products.id', cascadeDelete: true},
        benefit_id: {type: 'string', maxlength: 24, nullable: false, references: 'benefits.id', cascadeDelete: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0}
    },
    members_products: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        product_id: {type: 'string', maxlength: 24, nullable: false, references: 'products.id', cascadeDelete: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        expiry_at: {type: 'dateTime', nullable: true}
    },
    posts_products: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id', cascadeDelete: true},
        product_id: {type: 'string', maxlength: 24, nullable: false, references: 'products.id', cascadeDelete: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0}
    },
    members_created_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        created_at: {type: 'dateTime', nullable: false},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        attribution_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        attribution_type: {
            type: 'string', maxlength: 50, nullable: true, validations: {
                isIn: [['url', 'post', 'page', 'author', 'tag']]
            }
        },
        attribution_url: {type: 'string', maxlength: 2000, nullable: true},
        referrer_source: {type: 'string', maxlength: 191, nullable: true},
        referrer_medium: {type: 'string', maxlength: 191, nullable: true},
        referrer_url: {type: 'string', maxlength: 2000, nullable: true},
        source: {
            type: 'string', maxlength: 50, nullable: false, validations: {
                isIn: [['member', 'import', 'system', 'api', 'admin']]
            }
        },
        batch_id: {type: 'string', maxlength: 24, nullable: true}
    },
    members_cancel_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        from_plan: {type: 'string', maxlength: 255, nullable: false},
        created_at: {type: 'dateTime', nullable: false}
    },
    members_payment_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        amount: {type: 'integer', nullable: false},
        // @note: this is longer than originally intended due to a bug - https://github.com/TryGhost/Ghost/pull/15606
        // so we should decide whether we should reduce it down in the future
        currency: {type: 'string', maxlength: 191, nullable: false},
        source: {type: 'string', maxlength: 50, nullable: false},
        created_at: {type: 'dateTime', nullable: false}
    },
    members_login_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false}
    },
    members_email_change_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        to_email: {type: 'string', maxlength: 191, nullable: false, unique: false, validations: {isEmail: true}},
        from_email: {type: 'string', maxlength: 191, nullable: false, unique: false, validations: {isEmail: true}},
        created_at: {type: 'dateTime', nullable: false}
    },
    members_status_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        from_status: {
            type: 'string', maxlength: 50, nullable: true, validations: {
                isIn: [['free', 'paid', 'comped']]
            }
        },
        to_status: {
            type: 'string', maxlength: 50, nullable: true, validations: {
                isIn: [['free', 'paid', 'comped']]
            }
        },
        created_at: {type: 'dateTime', nullable: false}
    },
    members_product_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        product_id: {type: 'string', maxlength: 24, nullable: false, references: 'products.id', cascadeDelete: false},
        action: {
            type: 'string', maxlength: 50, nullable: true, validations: {
                isIn: [['added', 'removed']]
            }
        },
        created_at: {type: 'dateTime', nullable: false}
    },
    members_paid_subscription_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        type: {type: 'string', maxlength: 50, nullable: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        subscription_id: {type: 'string', maxlength: 24, nullable: true},
        from_plan: {type: 'string', maxlength: 255, nullable: true},
        to_plan: {type: 'string', maxlength: 255, nullable: true},
        // @note: this is longer than originally intended due to a bug - https://github.com/TryGhost/Ghost/pull/15606
        // so we should decide whether we should reduce it down in the future
        currency: {type: 'string', maxlength: 191, nullable: false},
        source: {
            type: 'string', maxlength: 50, nullable: false, validations: {
                isIn: [['stripe']]
            }
        },
        mrr_delta: {type: 'integer', nullable: false},
        created_at: {type: 'dateTime', nullable: false}
    },
    labels: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 191, nullable: false, unique: true},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    members_labels: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        label_id: {type: 'string', maxlength: 24, nullable: false, references: 'labels.id', cascadeDelete: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0}
    },
    members_stripe_customers: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'members.id', cascadeDelete: true},
        customer_id: {type: 'string', maxlength: 255, nullable: false, unique: true},
        name: {type: 'string', maxlength: 191, nullable: true},
        email: {type: 'string', maxlength: 191, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    subscriptions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        type: {
            type: 'string', maxlength: 50, nullable: false, validations: {
                isIn: [['free', 'comped', 'paid']]
            }
        },
        status: {
            type: 'string', maxlength: 50, nullable: false, validations: {
                isIn: [['active', 'expired', 'canceled']]
            }
        },
        member_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'members.id', cascadeDelete: true},
        tier_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'products.id'},

        // These are null if type !== 'paid'
        cadence: {
            type: 'string', maxlength: 50, nullable: true, validations: {
                isIn: [['month', 'year']]
            }
        },
        currency: {type: 'string', maxlength: 50, nullable: true},
        amount: {type: 'integer', nullable: true},

        // e.g. 'stripe'
        payment_provider: {type: 'string', maxlength: 50, nullable: true},
        // e.g. Stripe Subscription Link
        payment_subscription_url: {type: 'string', maxlength: 2000, nullable: true},
        // e.g. Stripe Customer Link
        payment_user_url: {type: 'string', maxlength: 2000, nullable: true},

        offer_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'offers.id'},

        expires_at: {type: 'dateTime', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    members_stripe_customers_subscriptions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        customer_id: {type: 'string', maxlength: 255, nullable: false, unique: false, references: 'members_stripe_customers.customer_id', cascadeDelete: true},
        ghost_subscription_id: {type: 'string', maxlength: 24, nullable: true, references: 'subscriptions.id', constraintName: 'mscs_ghost_subscription_id_foreign', cascadeDelete: true},
        subscription_id: {type: 'string', maxlength: 255, nullable: false, unique: true},
        stripe_price_id: {type: 'string', maxlength: 255, nullable: false, unique: false, index: true, defaultTo: ''},
        status: {type: 'string', maxlength: 50, nullable: false},
        cancel_at_period_end: {type: 'boolean', nullable: false, defaultTo: false},
        cancellation_reason: {type: 'string', maxlength: 500, nullable: true},
        current_period_end: {type: 'dateTime', nullable: false},
        start_date: {type: 'dateTime', nullable: false},
        default_payment_card_last4: {type: 'string', maxlength: 4, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true},
        mrr: {type: 'integer', unsigned: true, nullable: false, defaultTo: 0},
        offer_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'offers.id'},
        trial_start_at: {type: 'dateTime', nullable: true},
        trial_end_at: {type: 'dateTime', nullable: true},
        /* Below fields are now redundant as we link stripe_price_id to stripe_prices table */
        plan_id: {type: 'string', maxlength: 255, nullable: false, unique: false},
        plan_nickname: {type: 'string', maxlength: 50, nullable: false},
        plan_interval: {type: 'string', maxlength: 50, nullable: false},
        plan_amount: {type: 'integer', nullable: false},
        // @note: this is longer than originally intended due to a bug - https://github.com/TryGhost/Ghost/pull/15606
        // so we should decide whether we should reduce it down in the future
        plan_currency: {type: 'string', maxlength: 191, nullable: false}
    },
    members_subscription_created_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        created_at: {type: 'dateTime', nullable: false},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        subscription_id: {type: 'string', maxlength: 24, nullable: false, references: 'members_stripe_customers_subscriptions.id', cascadeDelete: true},
        attribution_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        attribution_type: {
            type: 'string', maxlength: 50, nullable: true, validations: {
                isIn: [['url', 'post', 'page', 'author', 'tag']]
            }
        },
        attribution_url: {type: 'string', maxlength: 2000, nullable: true},
        referrer_source: {type: 'string', maxlength: 191, nullable: true},
        referrer_medium: {type: 'string', maxlength: 191, nullable: true},
        referrer_url: {type: 'string', maxlength: 2000, nullable: true},
        batch_id: {type: 'string', maxlength: 24, nullable: true}
    },
    offer_redemptions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        offer_id: {type: 'string', maxlength: 24, nullable: false, references: 'offers.id', cascadeDelete: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        subscription_id: {type: 'string', maxlength: 24, nullable: false, references: 'members_stripe_customers_subscriptions.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false}
    },
    members_subscribe_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'members.id', cascadeDelete: true},
        subscribed: {type: 'boolean', nullable: false, defaultTo: true},
        created_at: {type: 'dateTime', nullable: false},
        source: {
            type: 'string', maxlength: 50, nullable: true, validations: {
                isIn: [['member', 'import', 'system', 'api', 'admin']]
            }
        },
        newsletter_id: {type: 'string', maxlength: 24, nullable: true, references: 'newsletters.id', cascadeDelete: false}
    },
    donation_payment_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 191, nullable: true},
        email: {type: 'string', maxlength: 191, nullable: false, unique: false, validations: {isEmail: true}},
        member_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'members.id', setNullDelete: true},
        amount: {type: 'integer', nullable: false},
        currency: {type: 'string', maxlength: 50, nullable: false},
        attribution_id: {type: 'string', maxlength: 24, nullable: true},
        attribution_type: {
            type: 'string', maxlength: 50, nullable: true, validations: {
                isIn: [['url', 'post', 'page', 'author', 'tag']]
            }
        },
        attribution_url: {type: 'string', maxlength: 2000, nullable: true},
        referrer_source: {type: 'string', maxlength: 191, nullable: true},
        referrer_medium: {type: 'string', maxlength: 191, nullable: true},
        referrer_url: {type: 'string', maxlength: 2000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        donation_message: {type: 'string', maxlength: 255, nullable: true} // https://docs.stripe.com/payments/checkout/custom-fields
    },
    stripe_products: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        product_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'products.id'},
        stripe_product_id: {type: 'string', maxlength: 255, nullable: false, unique: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    stripe_prices: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        stripe_price_id: {type: 'string', maxlength: 255, nullable: false, unique: true},
        stripe_product_id: {type: 'string', maxlength: 255, nullable: false, unique: false, references: 'stripe_products.stripe_product_id'},
        active: {type: 'boolean', nullable: false},
        nickname: {type: 'string', maxlength: 255, nullable: true},
        // @note: this is longer than originally intended due to a bug - https://github.com/TryGhost/Ghost/pull/15606
        // so we should decide whether we should reduce it down in the future
        currency: {type: 'string', maxlength: 191, nullable: false},
        amount: {type: 'integer', nullable: false},
        type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'recurring', validations: {isIn: [['recurring', 'one_time', 'donation']]}},
        interval: {type: 'string', maxlength: 50, nullable: true},
        description: {type: 'string', maxlength: 191, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    actions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        resource_id: {type: 'string', maxlength: 24, nullable: true},
        resource_type: {type: 'string', maxlength: 50, nullable: false},
        actor_id: {type: 'string', maxlength: 24, nullable: false},
        actor_type: {type: 'string', maxlength: 50, nullable: false},
        // @NOTE: The event column contains short buzzwords e.g. subscribed, started, added, deleted, edited etc.
        //        We already store and require the target resource type. No need to remember e.g. post.edited
        event: {type: 'string', maxlength: 50, nullable: false},
        // @NOTE: The context object can be used to store information about an action e.g. diffs, meta
        context: {type: 'text', maxlength: 1000000000, nullable: true},
        created_at: {type: 'dateTime', nullable: false}
    },
    emails: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, index: true, unique: true},
        uuid: {type: 'string', maxlength: 36, nullable: false, validations: {isUUID: true}},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'pending',
            validations: {isIn: [['pending', 'submitting', 'submitted', 'failed']]}
        },
        recipient_filter: {
            type: 'text',
            maxlength: 1000000000,
            nullable: false
        },
        error: {type: 'string', maxlength: 2000, nullable: true},
        error_data: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        email_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        delivered_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        opened_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        failed_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        subject: {type: 'string', maxlength: 300, nullable: true},
        from: {type: 'string', maxlength: 2000, nullable: true},
        reply_to: {type: 'string', maxlength: 2000, nullable: true},
        html: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        plaintext: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        source: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        source_type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'html',
            validations: {isIn: [['html', 'lexical', 'mobiledoc']]}
        },
        track_opens: {type: 'boolean', nullable: false, defaultTo: false},
        track_clicks: {type: 'boolean', nullable: false, defaultTo: false},
        feedback_enabled: {type: 'boolean', nullable: false, defaultTo: false},
        submitted_at: {type: 'dateTime', nullable: false},
        newsletter_id: {type: 'string', maxlength: 24, nullable: true, references: 'newsletters.id'},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    email_batches: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        email_id: {type: 'string', maxlength: 24, nullable: false, references: 'emails.id'},
        provider_id: {type: 'string', maxlength: 255, nullable: true},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'pending',
            validations: {isIn: [['pending', 'submitting', 'submitted', 'failed']]}
        },
        member_segment: {type: 'text', maxlength: 2000, nullable: true},
        error_status_code: {type: 'integer', nullable: true, unsigned: true},
        error_message: {type: 'string', maxlength: 2000, nullable: true},
        error_data: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: false}
    },
    email_recipients: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        email_id: {type: 'string', maxlength: 24, nullable: false, references: 'emails.id'},
        member_id: {type: 'string', maxlength: 24, nullable: false, index: true},
        batch_id: {type: 'string', maxlength: 24, nullable: false, references: 'email_batches.id'},
        processed_at: {type: 'dateTime', nullable: true},
        delivered_at: {type: 'dateTime', nullable: true},
        opened_at: {type: 'dateTime', nullable: true},
        failed_at: {type: 'dateTime', nullable: true},
        member_uuid: {type: 'string', maxlength: 36, nullable: false},
        member_email: {type: 'string', maxlength: 191, nullable: false},
        member_name: {type: 'string', maxlength: 191, nullable: true},
        '@@INDEXES@@': [
            ['email_id', 'member_email'],
            ['email_id', 'delivered_at'],
            ['email_id', 'opened_at'],
            ['email_id', 'failed_at']
        ]
    },
    email_recipient_failures: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        email_id: {type: 'string', maxlength: 24, nullable: false, references: 'emails.id'},
        member_id: {type: 'string', maxlength: 24, nullable: true},
        email_recipient_id: {type: 'string', maxlength: 24, nullable: false, references: 'email_recipients.id'},
        code: {type: 'integer', nullable: false, unsigned: true},
        enhanced_code: {type: 'string', maxlength: 50, nullable: true},
        message: {type: 'string', maxlength: 2000, nullable: false},
        severity: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'permanent',
            validations: {isIn: [['temporary', 'permanent']]}
        },
        failed_at: {type: 'dateTime', nullable: false},
        event_id: {type: 'string', maxlength: 255, nullable: true}
    },
    tokens: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        token: {type: 'string', maxlength: 32, nullable: false, index: true},
        data: {type: 'string', maxlength: 2000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        first_used_at: {type: 'dateTime', nullable: true},
        used_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        created_by: {type: 'string', maxlength: 24, nullable: false}
    },
    snippets: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 191, nullable: false, unique: true},
        mobiledoc: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: false},
        lexical: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    custom_theme_settings: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        theme: {type: 'string', maxlength: 191, nullable: false},
        key: {type: 'string', maxlength: 191, nullable: false},
        type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            validations: {
                isIn: [[
                    'select',
                    'boolean',
                    'color',
                    'text',
                    'image'
                ]]
            }
        },
        value: {type: 'text', maxlength: 65535, nullable: true}
    },
    members_newsletters: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        newsletter_id: {type: 'string', maxlength: 24, nullable: false, references: 'newsletters.id', cascadeDelete: true},
        '@@INDEXES@@': [
            ['newsletter_id', 'member_id']
        ]
    },
    comments: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'posts.id', cascadeDelete: true},
        member_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'members.id', setNullDelete: true},
        parent_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'comments.id', cascadeDelete: true},
        in_reply_to_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'comments.id', setNullDelete: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'published', validations: {isIn: [['published', 'hidden', 'deleted']]}},
        html: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        edited_at: {type: 'dateTime', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: false}
    },
    comment_likes: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        comment_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'comments.id', cascadeDelete: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'members.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: false}
    },
    comment_reports: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        comment_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'comments.id', cascadeDelete: true},
        member_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'members.id', setNullDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: false}
    },
    jobs: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 191, nullable: false, unique: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'queued', validations: {isIn: [['started', 'finished', 'failed', 'queued']]}},
        started_at: {type: 'dateTime', nullable: true},
        finished_at: {type: 'dateTime', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        metadata: {type: 'string', maxlength: 2000, nullable: true},
        queue_entry: {type: 'integer', nullable: true, unsigned: true}
    },
    redirects: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        from: {type: 'string', maxlength: 191, nullable: false, index: true},
        to: {type: 'string', maxlength: 2000, nullable: false},
        post_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'posts.id', setNullDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    members_click_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        redirect_id: {type: 'string', maxlength: 24, nullable: false, references: 'redirects.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false}
    },
    members_feedback: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        score: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    suppressions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        email: {type: 'string', maxlength: 191, nullable: false, unique: true, validations: {isEmail: true}},
        email_id: {type: 'string', maxlength: 24, nullable: true, references: 'emails.id'},
        reason: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            validations: {
                isIn: [[
                    'spam',
                    'bounce'
                ]]
            }
        },
        created_at: {type: 'dateTime', nullable: false}
    },
    email_spam_complaint_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        member_id: {type: 'string', maxlength: 24, nullable: false, references: 'members.id', cascadeDelete: true},
        email_id: {type: 'string', maxlength: 24, nullable: false, references: 'emails.id'},
        email_address: {type: 'string', maxlength: 191, nullable: false, unique: false, validations: {isEmail: true}},
        created_at: {type: 'dateTime', nullable: false},
        '@@UNIQUE_CONSTRAINTS@@': [
            ['email_id', 'member_id']
        ]
    },
    mentions: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        source: {type: 'string', maxlength: 2000, nullable: false},
        source_title: {type: 'string', maxlength: 2000, nullable: true},
        source_site_title: {type: 'string', maxlength: 2000, nullable: true},
        source_excerpt: {type: 'string', maxlength: 2000, nullable: true},
        source_author: {type: 'string', maxlength: 2000, nullable: true},
        source_featured_image: {type: 'string', maxlength: 2000, nullable: true},
        source_favicon: {type: 'string', maxlength: 2000, nullable: true},
        target: {type: 'string', maxlength: 2000, nullable: false},
        resource_id: {type: 'string', maxlength: 24, nullable: true},
        resource_type: {type: 'string', maxlength: 50, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        payload: {type: 'text', maxlength: 65535, nullable: true},
        deleted: {type: 'boolean', nullable: false, defaultTo: false},
        verified: {type: 'boolean', nullable: false, defaultTo: false}
    },
    milestones: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        type: {type: 'string', maxlength: 24, nullable: false},
        value: {type: 'integer', nullable: false},
        currency: {type: 'string', maxlength: 24, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        email_sent_at: {type: 'dateTime', nullable: true}
    },
    temp_mail_events: {
        id: {type: 'string', maxlength: 100, nullable: false, primary: true},
        type: {type: 'string', maxlength: 50, nullable: false},
        message_id: {type: 'string', maxlength: 150, nullable: false},
        recipient: {type: 'string', maxlength: 191, nullable: false},
        occurred_at: {type: 'dateTime', nullable: false}
    },
    collections: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        title: {type: 'string', maxlength: 191, nullable: false},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        description: {type: 'string', maxlength: 2000, nullable: true},
        type: {type: 'string', maxlength: 50, nullable: false},
        filter: {type: 'text', maxlength: 1000000000, nullable: true},
        feature_image: {type: 'string', maxlength: 2000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    collections_posts: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        collection_id: {type: 'string', maxlength: 24, nullable: false, references: 'collections.id', cascadeDelete: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id', cascadeDelete: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0}
    },
    recommendations: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        url: {type: 'string', maxlength: 2000, nullable: false},
        title: {type: 'string', maxlength: 2000, nullable: false},
        excerpt: {type: 'string', maxlength: 2000, nullable: true},
        featured_image: {type: 'string', maxlength: 2000, nullable: true},
        favicon: {type: 'string', maxlength: 2000, nullable: true},
        description: {type: 'string', maxlength: 2000, nullable: true},
        one_click_subscribe: {type: 'boolean', nullable: false, defaultTo: false},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },
    recommendation_click_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        recommendation_id: {type: 'string', maxlength: 24, nullable: false, references: 'recommendations.id', unique: false, cascadeDelete: true},
        member_id: {type: 'string', maxlength: 24, nullable: true, references: 'members.id', unique: false, setNullDelete: true},
        created_at: {type: 'dateTime', nullable: false}
    },
    recommendation_subscribe_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        recommendation_id: {type: 'string', maxlength: 24, nullable: false, references: 'recommendations.id', unique: false, cascadeDelete: true},
        member_id: {type: 'string', maxlength: 24, nullable: true, references: 'members.id', unique: false, setNullDelete: true},
        created_at: {type: 'dateTime', nullable: false}
    },

    //202504 add custom social tables begin
    social_bookmarks: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'users.id', cascadeDelete: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'posts.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        '@@UNIQUE_CONSTRAINTS@@': [
            ['user_id', 'post_id']
        ]
    },
    social_follows: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        followed_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'users.id', cascadeDelete: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'users.id', cascadeDelete: true},
        follow_couple: {type: 'string', maxlength: 48, nullable: false, unique: true, index: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false}
    },
    social_favors: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'users.id', cascadeDelete: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'posts.id', cascadeDelete: true},
        type: {type: 'string', maxlength: 24, nullable: false, defaultTo: 'like'},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        '@@UNIQUE_CONSTRAINTS@@': [
            ['user_id', 'post_id']
        ]
    },
    social_forwards: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        sender_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'users.id', cascadeDelete: true},
        receiver_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'users.id', cascadeDelete: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'posts.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        '@@UNIQUE_CONSTRAINTS@@': [
            ['sender_id', 'receiver_id', 'post_id']
        ]
    },
    social_groups: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        creator_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'users.id', cascadeDelete: true},
        group_name: {type: 'string', maxlength: 240, nullable: false, unique: true, index: true},
        type: {
            type: 'string', maxlength: 60, nullable: false, default: 'family', index: true,
            validations: {
                isIn: [[
                    'public',
                    'family',
                    'company',
                    'private',
                    'secret'
                ]]
            }
        }, /// e.g., public, private, secret, family, company
        status: {
            type: 'string', maxlength: 60, nullable: false, default: 'active', index: true,
            validations: {
                isIn: [[
                    'approval',
                    'active',
                    'archived'
                ]]
            }
        }, /// e.g., waitapproval active, archived
        max_members: {type: 'integer', nullable: false, unsigned: true, defaultTo: 100},
        group_image: {type: 'string', maxlength: 2000, nullable: true},
        media_folder_alias: {type: 'string', maxlength: 32, nullable: true, unique: true, index: true},
        require_approval: {type: 'boolean', nullable: true, defaultTo: false}, // ← new
        optional_settings: {type: 'json', nullable: true, defaultTo: {}}, // ← new
        approved_at: {type: 'dateTime', nullable: true},
        approved_by: {type: 'string', maxlength: 24, nullable: true},
        description: {type: 'text', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    social_group_members: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        group_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'social_groups.id', cascadeDelete: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'users.id', cascadeDelete: true},
        status: {type: 'string', maxlength: 60, nullable: false, default: 'active', index: true, validations: {isIn: [['active', 'disabled']]}},
        role_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'roles.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true},
        '@@UNIQUE_CONSTRAINTS@@': [
            ['group_id', 'user_id']
        ]
    },
    social_post_comments: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, unique: false, index: true, references: 'posts.id', cascadeDelete: true},
        parent_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'social_post_comments.id', cascadeDelete: true},
        in_reply_to_id: {type: 'string', maxlength: 24, nullable: true, unique: false, references: 'social_post_comments.id', setNullDelete: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'published', validations: {isIn: [['published', 'hidden', 'deleted']]}},
        html: {type: 'text', maxlength: 1024, fieldtype: 'long', nullable: false},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: false},
        updated_by: {type: 'string', maxlength: 24, nullable: true},
        edited_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['post_id', 'status']
        ]
    },
    social_post_comment_likes: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        comment_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'social_post_comments.id', cascadeDelete: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'users.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: false}
    },
    social_post_comment_reports: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        comment_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'social_post_comments.id', cascadeDelete: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'users.id', cascadeDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: false}
    },
    social_components: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        slug: {type: 'string', maxlength: 191, nullable: true, unique: true},
        public_path: {type: 'string', maxlength: 191, nullable: true, unique: true},
        type: {type: 'string', maxlength: 60, nullable: false, index: true},
        title: {type: 'string', maxlength: 191, nullable: false},
        tag: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'tags.id', setNullDelete: true},
        excerpt: {type: 'string', maxlength: 500, nullable: true},
        image: {type: 'string', maxlength: 500, nullable: true},
        attributes: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        layout: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        source: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['published', 'draft']]}},
        published_at: {type: 'dateTime', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: false},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    social_charts: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        slug: {type: 'string', maxlength: 191, nullable: true, unique: true},
        title: {type: 'string', maxlength: 191, nullable: false},
        excerpt: {type: 'string', maxlength: 500, nullable: true},
        image: {type: 'string', maxlength: 500, nullable: true},
        chart_props: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['published', 'draft']]}},
        published_at: {type: 'dateTime', nullable: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        category: {type: 'string', maxlength: 100, nullable: true},
        thumbnail: {type: 'string', maxlength: 2000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false},
        updated_at: {type: 'dateTime', nullable: false},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },
    social_post_components: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id'},
        component_id: {type: 'string', maxlength: 24, nullable: false, references: 'social_components.id'},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        '@@INDEXES@@': [
            ['post_id', 'component_id']
        ]
    },

    social_user_logs: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, unique: false, references: 'users.id', cascadeDelete: true},
        function_used: {type: 'string', maxlength: 60, nullable: true},
        metadata: {type: 'text', maxlength: 1000000000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },

    social_media_assets: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        // Keep non-indexed because MySQL/InnoDB key length limits are exceeded for utf8mb4 varchar(2000).
        storage_key: {type: 'string', maxlength: 2000, nullable: false},
        storage_key_hash: {type: 'string', maxlength: 64, nullable: true, index: true},
        storage_url: {type: 'string', maxlength: 2000, nullable: false},
        thumbnail_storage_key: {type: 'string', maxlength: 2000, nullable: true},
        thumbnail_url: {type: 'string', maxlength: 2000, nullable: true},
        original_filename: {type: 'string', maxlength: 1000, nullable: true},
        asset_type: {type: 'string', maxlength: 50, nullable: false, index: true},
        owner_scope: {type: 'string', maxlength: 20, nullable: false, index: true},
        user_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'users.id', cascadeDelete: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
        // Media job ID. Keep the initial table creation independent from the
        // social_ai_media_jobs table; the FK is added by a later migration
        // after both tables exist.
        job_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        // Deep Zoom source-PDF link. A plain indexed link, NOT a FK: the upload
        // flow finalizes the source-PDF asset BEFORE the social_ai_dzi_jobs row
        // is created, so a FK here would always fail its referential check at
        // insert time. Cleanup is done explicitly in the DZI destroy endpoint
        // (delete assets WHERE dzi_job_id = <job>), not via ON DELETE CASCADE.
        dzi_job_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        // Chart thumbnail link. A plain indexed link, NOT a FK: same reason as
        // dzi_job_id — the asset is created before the thumbnail URL is written
        // back to social_charts. Cleanup is handled explicitly by the host.
        social_chart_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        // Chart-job artifact link. A plain indexed link, NOT a FK: chart-job
        // artifacts are written by the worker BEFORE the job's asset rows are
        // linked (worker has no browser session). Cleanup is handled explicitly
        // by the chart-jobs destroy endpoint (delete assets WHERE chart_job_id = <job>).
        chart_job_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        // Plain indexed link to social_ai_chart_projects (NOT a FK, same reasoning
        // as chart_job_id). Lets project-scoped gallery, direct project uploads and
        // the "clear project artifacts" action target rows by project_id directly.
        project_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        tag_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'tags.id', setNullDelete: true},
        tag_slug: {type: 'string', maxlength: 191, nullable: true, index: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['owner_scope', 'user_id', 'created_at'],
            ['owner_scope', 'group_id', 'created_at'],
            ['job_id', 'created_at']
        ]
    },

    social_ai_conversations: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
        title: {type: 'string', maxlength: 500, nullable: true},
        provider: {type: 'string', maxlength: 50, nullable: true, index: true},
        model: {type: 'string', maxlength: 191, nullable: true},
        response_mode: {type: 'string', maxlength: 50, nullable: true},
        visibility: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'private', index: true},
        is_pinned: {type: 'bool', nullable: false, defaultTo: false},
        is_marked: {type: 'bool', nullable: false, defaultTo: false},
        created_at: {type: 'dateTime', nullable: false, index: true},
        updated_at: {type: 'dateTime', nullable: false, index: true},
        '@@INDEXES@@': [
            ['user_id', 'group_id', 'updated_at']
        ]
    },

    social_ai_messages: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        conversation_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_conversations.id', cascadeDelete: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
        role: {type: 'string', maxlength: 20, nullable: false, index: true},
        content: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: false},
        created_at: {type: 'dateTime', nullable: false, index: true},
        '@@INDEXES@@': [
            ['conversation_id', 'created_at']
        ]
    },

    social_ai_usages: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        conversation_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_conversations.id', cascadeDelete: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
        provider: {type: 'string', maxlength: 50, nullable: true, index: true},
        model: {type: 'string', maxlength: 191, nullable: true},
        prompt_tokens: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        completion_tokens: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        total_tokens: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        cost_usd_micros: {type: 'bigInteger', nullable: false, unsigned: true, defaultTo: 0},
        currency: {type: 'string', maxlength: 10, nullable: false, defaultTo: 'USD'},
        usage_source: {type: 'string', maxlength: 32, nullable: true, index: true},
        created_at: {type: 'dateTime', nullable: false, index: true},
        '@@INDEXES@@': [
            ['user_id', 'group_id', 'created_at'],
            ['provider', 'model', 'created_at']
        ]
    },

    social_ai_devices: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
        device_type: {type: 'string', maxlength: 24, nullable: false, index: true},
        device_key: {type: 'string', maxlength: 1500, nullable: false},
        locale: {type: 'string', maxlength: 16, nullable: true},
        timezone: {type: 'string', maxlength: 64, nullable: true},
        push_subscription: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        enabled: {type: 'bool', nullable: false, defaultTo: true, index: true},
        created_at: {type: 'dateTime', nullable: false, index: true},
        updated_at: {type: 'dateTime', nullable: false, index: true},
        '@@INDEXES@@': [
            ['user_id', 'enabled'],
            ['group_id', 'enabled', 'updated_at']
        ]
    },

    social_ai_sms_logs: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, index: true, references: 'social_groups.id', cascadeDelete: true},
        phone_hash: {type: 'string', maxlength: 128, nullable: false},
        phone_last4: {type: 'string', maxlength: 8, nullable: true},
        message: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        message_category: {type: 'string', maxlength: 32, nullable: true},
        provider: {type: 'string', maxlength: 32, nullable: false, index: true},
        message_id: {type: 'string', maxlength: 128, nullable: true},
        status: {type: 'string', maxlength: 24, nullable: false, index: true},
        error: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        region: {type: 'string', maxlength: 64, nullable: true},
        sender_id: {type: 'string', maxlength: 128, nullable: true},
        sms_type: {type: 'string', maxlength: 32, nullable: true},
        created_at: {type: 'dateTime', nullable: false, index: true},
        updated_at: {type: 'dateTime', nullable: false, index: true},
        '@@INDEXES@@': [
            ['user_id', 'created_at'],
            ['status', 'created_at'],
            ['provider', 'created_at']
        ]
    },

    social_ai_user_phones: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true},
        phone_e164: {type: 'string', maxlength: 32, nullable: false},
        phone_hash: {type: 'string', maxlength: 128, nullable: false},
        phone_last4: {type: 'string', maxlength: 8, nullable: true},
        status: {type: 'string', maxlength: 24, nullable: false, defaultTo: 'pending', index: true},
        verification_code_hash: {type: 'string', maxlength: 128, nullable: true},
        code_expires_at: {type: 'dateTime', nullable: true},
        verified_at: {type: 'dateTime', nullable: true},
        created_at: {type: 'dateTime', nullable: false, index: true},
        updated_at: {type: 'dateTime', nullable: false, index: true},
        '@@INDEXES@@': [
            ['user_id', 'phone_hash'],
            ['status', 'updated_at']
        ]
    },

    social_ai_agent_settings: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'users.id', cascadeDelete: true, unique: true},
        settings_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: false},
        created_at: {type: 'dateTime', nullable: false, index: true},
        updated_at: {type: 'dateTime', nullable: false, index: true}
    },

    // 202601 add custom social tables end
    social_ai_media_jobs: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        job_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'media_translation'},
        user_id: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true, index: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
        visibility: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'private'},
        scope_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'user'},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'queued', index: true},
        progress: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        priority: {type: 'integer', nullable: false, defaultTo: 0},
        mode: {type: 'string', maxlength: 50, nullable: false},
        source_lang: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'auto'},
        target_lang: {type: 'string', maxlength: 50, nullable: false},
        stt_model: {type: 'string', maxlength: 191, nullable: true},
        translation_model: {type: 'string', maxlength: 191, nullable: true},
        tts_model: {type: 'string', maxlength: 191, nullable: true},
        tts_voice: {type: 'string', maxlength: 191, nullable: true},
        tts_tone: {type: 'string', maxlength: 191, nullable: true},
        subtitle_render: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'soft'},
        output_playback_speed: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'normal'},
        input_asset_url: {type: 'string', maxlength: 2000, nullable: false},
        input_file_name: {type: 'string', maxlength: 255, nullable: true},
        settings_json: {type: 'text', nullable: false},
        artifacts_json: {type: 'text', nullable: false},
        artifact_manifest_json: {type: 'text', nullable: true},
        error_code: {type: 'string', maxlength: 100, nullable: true},
        error_message: {type: 'text', nullable: true},
        claim_worker_id: {type: 'string', maxlength: 191, nullable: true},
        claim_expires_at: {type: 'dateTime', nullable: true},
        retry_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        started_at: {type: 'dateTime', nullable: true},
        completed_at: {type: 'dateTime', nullable: true},
        canceled_at: {type: 'dateTime', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
        updated_at: {type: 'dateTime', nullable: false},
        updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
        '@@INDEXES@@': [
            ['user_id', 'status'],
            ['group_id', 'status'],
            ['user_id', 'updated_at'],
            ['group_id', 'updated_at'],
            ['status', 'claim_expires_at']
        ]

    },

    // Keep the initial table small. REINS, MLIT, neighborhood, school,
    // hazard, Google, and inquiry fields are added by their dated migrations.
    // This must stay aligned with 2026-05-11-00-00-01-add-estate-properties-table.js
    // so a fresh database follows the same incremental path as an existing one.
    estate_properties: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', validations: {isIn: [['published', 'draft', 'working', 'contracted', 'booked', 'invalid']]}},
        property_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'sale', validations: {isIn: [['sale', 'rent', 'investment']]}},
        price_sale: {type: 'bigInteger', nullable: true},
        price_rent_monthly: {type: 'bigInteger', nullable: true},
        price_deposit: {type: 'bigInteger', nullable: true},
        price_key_money: {type: 'bigInteger', nullable: true},
        price_management_fee: {type: 'bigInteger', nullable: true},
        price_maintenance_fee: {type: 'bigInteger', nullable: true},
        price_other_fees: {type: 'text', maxlength: 2000, nullable: true},
        floor_plan: {type: 'string', maxlength: 50, nullable: true},
        floor_area: {type: 'string', maxlength: 50, nullable: true},
        land_area: {type: 'string', maxlength: 50, nullable: true},
        building_area: {type: 'string', maxlength: 50, nullable: true},
        year_built: {type: 'string', maxlength: 20, nullable: true},
        floors_total: {type: 'integer', nullable: true},
        floor_number: {type: 'integer', nullable: true},
        layout_description: {type: 'text', maxlength: 2000, nullable: true},
        address: {type: 'string', maxlength: 500, nullable: true},
        city: {type: 'string', maxlength: 100, nullable: true},
        ward: {type: 'string', maxlength: 100, nullable: true},
        prefecture: {type: 'string', maxlength: 50, nullable: true},
        postal_code: {type: 'string', maxlength: 20, nullable: true},
        latitude: {type: 'float', nullable: true},
        longitude: {type: 'float', nullable: true},
        transport_info: {type: 'text', maxlength: 5000, nullable: true},
        nearest_station: {type: 'string', maxlength: 200, nullable: true},
        total_units: {type: 'integer', nullable: true},
        structure: {type: 'string', maxlength: 100, nullable: true},
        direction: {type: 'string', maxlength: 50, nullable: true},
        parking_info: {type: 'string', maxlength: 500, nullable: true},
        pets_allowed: {type: 'bool', nullable: true, defaultTo: false},
        expected_yield: {type: 'float', nullable: true},
        current_yield: {type: 'float', nullable: true},
        expected_rent: {type: 'integer', nullable: true},
        features: {type: 'text', maxlength: 5000, nullable: true},
        featured: {type: 'bool', nullable: true, defaultTo: false},
        sort_order: {type: 'integer', nullable: true, defaultTo: 0},
        group_id: {type: 'string', maxlength: 24, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        created_by: {type: 'string', maxlength: 24, nullable: true},
        updated_by: {type: 'string', maxlength: 24, nullable: true}
    },

    estate_property_search_index: {
        property_id: {type: 'string', maxlength: 24, nullable: false, primary: true, references: 'estate_properties.id'},
        searchable_text: {type: 'text', maxlength: 65535, nullable: true},
        normalized_text: {type: 'text', maxlength: 65535, nullable: true},
        address_text: {type: 'text', maxlength: 10000, nullable: true},
        station_text: {type: 'text', maxlength: 10000, nullable: true},
        line_text: {type: 'text', maxlength: 10000, nullable: true},
        tag_text: {type: 'text', maxlength: 10000, nullable: true},
        feature_text: {type: 'text', maxlength: 10000, nullable: true},
        equipment_text: {type: 'text', maxlength: 10000, nullable: true},
        surrounding_text: {type: 'text', maxlength: 20000, nullable: true},
        hazard_text: {type: 'text', maxlength: 20000, nullable: true},
        mlit_text: {type: 'text', maxlength: 65535, nullable: true},
        property_type: {type: 'string', maxlength: 50, nullable: true},
        transaction_type: {type: 'string', maxlength: 50, nullable: true},
        source_type: {type: 'string', maxlength: 50, nullable: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft'},
        featured: {type: 'bool', nullable: false, defaultTo: false},
        prefecture: {type: 'string', maxlength: 50, nullable: true},
        city: {type: 'string', maxlength: 100, nullable: true},
        ward: {type: 'string', maxlength: 100, nullable: true},
        town: {type: 'string', maxlength: 200, nullable: true},
        latitude: {type: 'float', nullable: true},
        longitude: {type: 'float', nullable: true},
        price_search_num: {type: 'bigInteger', nullable: true},
        price_sale_num: {type: 'bigInteger', nullable: true},
        price_rent_monthly_num: {type: 'bigInteger', nullable: true},
        total_monthly_cost_num: {type: 'bigInteger', nullable: true},
        management_fee_num: {type: 'bigInteger', nullable: true},
        repair_reserve_fee_num: {type: 'bigInteger', nullable: true},
        deposit_num: {type: 'bigInteger', nullable: true},
        key_money_num: {type: 'bigInteger', nullable: true},
        expected_rent_num: {type: 'bigInteger', nullable: true},
        current_rent_num: {type: 'bigInteger', nullable: true},
        expected_yield_num: {type: 'float', nullable: true},
        current_yield_num: {type: 'float', nullable: true},
        floor_area_sqm_num: {type: 'float', nullable: true},
        land_area_sqm_num: {type: 'float', nullable: true},
        building_area_sqm_num: {type: 'float', nullable: true},
        balcony_area_sqm_num: {type: 'float', nullable: true},
        layout_text: {type: 'string', maxlength: 100, nullable: true},
        room_count_num: {type: 'integer', nullable: true},
        ldk_count_num: {type: 'integer', nullable: true},
        floor_number_num: {type: 'integer', nullable: true},
        floors_total_num: {type: 'integer', nullable: true},
        total_units_num: {type: 'integer', nullable: true},
        year_built_num: {type: 'integer', nullable: true},
        building_age_num: {type: 'integer', nullable: true},
        structure_text: {type: 'string', maxlength: 100, nullable: true},
        direction_text: {type: 'string', maxlength: 50, nullable: true},
        nearest_station_name: {type: 'string', maxlength: 200, nullable: true},
        nearest_line_name: {type: 'string', maxlength: 200, nullable: true},
        nearest_station_walk_minutes_num: {type: 'integer', nullable: true},
        station_count_num: {type: 'integer', nullable: true},
        line_count_num: {type: 'integer', nullable: true},
        media_count_num: {type: 'integer', nullable: false, defaultTo: 0},
        has_building_image: {type: 'bool', nullable: true},
        has_floor_plan_image: {type: 'bool', nullable: true},
        has_room_image: {type: 'bool', nullable: true},
        has_map_image: {type: 'bool', nullable: true},
        has_video: {type: 'bool', nullable: true},
        has_panorama: {type: 'bool', nullable: true},
        has_pet_allowed: {type: 'bool', nullable: true},
        has_parking: {type: 'bool', nullable: true},
        has_bicycle_parking: {type: 'bool', nullable: true},
        has_bike_parking: {type: 'bool', nullable: true},
        has_auto_lock: {type: 'bool', nullable: true},
        has_elevator: {type: 'bool', nullable: true},
        has_delivery_box: {type: 'bool', nullable: true},
        has_bath_toilet_separate: {type: 'bool', nullable: true},
        has_independent_washstand: {type: 'bool', nullable: true},
        has_indoor_washer_space: {type: 'bool', nullable: true},
        has_aircon: {type: 'bool', nullable: true},
        has_floor_heating: {type: 'bool', nullable: true},
        has_reheating_bath: {type: 'bool', nullable: true},
        has_bathroom_dryer: {type: 'bool', nullable: true},
        has_system_kitchen: {type: 'bool', nullable: true},
        has_renovated: {type: 'bool', nullable: true},
        has_reformed: {type: 'bool', nullable: true},
        has_furniture: {type: 'bool', nullable: true},
        has_internet_free: {type: 'bool', nullable: true},
        is_corner_room: {type: 'bool', nullable: true},
        is_top_floor: {type: 'bool', nullable: true},
        is_south_facing: {type: 'bool', nullable: true},
        is_new_earthquake_standard: {type: 'bool', nullable: true},
        is_investment_property: {type: 'bool', nullable: true},
        zoning_text: {type: 'string', maxlength: 200, nullable: true},
        building_coverage_ratio_num: {type: 'float', nullable: true},
        floor_area_ratio_num: {type: 'float', nullable: true},
        hazard_risk_text: {type: 'text', maxlength: 10000, nullable: true},
        parse_warnings_json: {type: 'text', maxlength: 10000, nullable: true},
        source_updated_at: {type: 'dateTime', nullable: true},
        indexed_at: {type: 'dateTime', nullable: false},
        '@@INDEXES@@': [
            ['status', 'property_type'],
            ['city', 'ward']
        ]
    },

    estate_property_station_index: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
        station_name: {type: 'string', maxlength: 200, nullable: true, index: true},
        railway_line: {type: 'string', maxlength: 200, nullable: true, index: true},
        walk_minutes: {type: 'integer', nullable: true, index: true},
        bus_minutes: {type: 'integer', nullable: true},
        bus_stop_name: {type: 'string', maxlength: 200, nullable: true},
        sort_order: {type: 'integer', nullable: true, defaultTo: 0},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['property_id', 'walk_minutes'],
            ['station_name', 'walk_minutes'],
            ['railway_line', 'walk_minutes']
        ]
    },

    estate_search_index_meta: {
        key: {type: 'string', maxlength: 191, nullable: false, primary: true},
        value: {type: 'text', maxlength: 10000, nullable: true},
        updated_at: {type: 'dateTime', nullable: false}
    },

    estate_property_posts: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id'},
        locale: {type: 'string', maxlength: 10, nullable: false, defaultTo: 'ja'},
        sort_order: {type: 'integer', nullable: true, defaultTo: 0},
        is_primary: {type: 'bool', nullable: true, defaultTo: false},
        created_at: {type: 'dateTime', nullable: false},
        '@@INDEXES@@': [
            ['property_id', 'post_id', 'locale']
        ]
    },

    estate_property_tags: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
        tag_id: {type: 'string', maxlength: 24, nullable: false, references: 'tags.id'},
        created_at: {type: 'dateTime', nullable: false},
        '@@INDEXES@@': [
            ['property_id', 'tag_id']
        ]
    },

    estate_property_media: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
        media_id: {type: 'string', maxlength: 24, nullable: false, references: 'social_media_assets.id'},
        media_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'image'},
        sort_order: {type: 'integer', nullable: true, defaultTo: 0},
        caption: {type: 'string', maxlength: 500, nullable: true},
        is_primary: {type: 'bool', nullable: true, defaultTo: false},
        is_selected: {type: 'bool', nullable: true, defaultTo: false},
        created_at: {type: 'dateTime', nullable: false},
        '@@INDEXES@@': [
            ['property_id', 'media_id', 'media_type']
        ]
    },

    estate_property_staff: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        property_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_properties.id'},
        user_id: {type: 'string', maxlength: 24, nullable: false, references: 'users.id'},
        role: {type: 'string', maxlength: 100, nullable: true, defaultTo: '担当者'},
        sort_order: {type: 'integer', nullable: true, defaultTo: 0},
        is_primary: {type: 'bool', nullable: true, defaultTo: false},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['property_id', 'user_id']
        ]
    },

    estate_inquiries: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        property_id: {type: 'string', maxlength: 24, nullable: true, references: 'estate_properties.id'},
        name: {type: 'string', maxlength: 200, nullable: false},
        email: {type: 'string', maxlength: 254, nullable: false},
        phone: {type: 'string', maxlength: 50, nullable: true},
        message: {type: 'text', maxlength: 10000, nullable: true},
        inquiry_type: {type: 'string', maxlength: 50, nullable: true, defaultTo: 'general'},
        status: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'unread'},
        reference_code: {type: 'string', maxlength: 20, nullable: true, unique: true},
        referrer_url: {type: 'string', maxlength: 2000, nullable: true},
        metadata: {type: 'text', maxlength: 10000, nullable: true},
        user_agent: {type: 'string', maxlength: 500, nullable: true},
        ip_address: {type: 'string', maxlength: 45, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['status'],
            ['property_id']
        ]
    },

    estate_inquiry_properties: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        inquiry_id: {type: 'string', maxlength: 24, nullable: false, references: 'estate_inquiries.id', cascadeDelete: true},
        property_id: {type: 'string', maxlength: 24, nullable: true, references: 'estate_properties.id', setNullDelete: true},
        internal_inquiry_id: {type: 'string', maxlength: 100, nullable: true},
        property_name: {type: 'string', maxlength: 500, nullable: true},
        address: {type: 'string', maxlength: 1000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        '@@INDEXES@@': [
            ['inquiry_id'],
            ['property_id']
        ]
    },

    estate_settings: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        key: {type: 'string', maxlength: 200, nullable: false, unique: true},
        value: {type: 'text', maxlength: 10000, nullable: true},
        type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'string'},
        description: {type: 'string', maxlength: 500, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },

    person_stories: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        title: {type: 'string', maxlength: 2000, nullable: false},
        subject: {type: 'string', maxlength: 191, nullable: false},
        gallery_path: {type: 'string', maxlength: 2000, nullable: true},
        subject_type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'person',
            validations: {
                isIn: [['person', 'author', 'legend', 'character']]
            }
        },
        language: {
            type: 'string',
            maxlength: 10,
            nullable: false,
            defaultTo: 'zh',
            validations: {
                isIn: [['zh', 'ja', 'en']]
            }
        },
        summary: {type: 'text', maxlength: 5000, nullable: true},
        chapter_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        volume_count: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        time_span: {type: 'string', maxlength: 191, nullable: true},
        geography: {type: 'string', maxlength: 500, nullable: true},
        source_path: {type: 'string', maxlength: 2000, nullable: true},
        timeline_html_path: {type: 'string', maxlength: 2000, nullable: true},
        themes_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        structural_notes_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        structure_outline_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        reading_order_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        source_kind: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'seed',
            validations: {
                isIn: [['seed', 'registered']]
            }
        },
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'published',
            validations: {
                isIn: [['draft', 'published', 'archived']]
            }
        },
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['status', 'updated_at'],
            ['subject'],
            ['subject_type', 'subject'],
            ['source_kind', 'status']
        ]
    },

    publish_posts: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, unique: true, references: 'posts.id'},
        content_type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'news',
            validations: {
                isIn: [['news', 'government', 'publication', 'comic', 'entertainment']]
            }
        },
        section: {type: 'string', maxlength: 200, nullable: true},
        featured: {type: 'bool', nullable: false, defaultTo: false},
        metadata_json: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['content_type'],
            ['featured'],
            ['content_type', 'section']
        ]
    },

    persons: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        slug: {type: 'string', maxlength: 191, nullable: false, unique: true},
        name: {type: 'string', maxlength: 2000, nullable: false},
        display_name: {type: 'string', maxlength: 2000, nullable: true},
        gallery_path: {type: 'string', maxlength: 2000, nullable: true},
        subject_type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'person',
            validations: {
                isIn: [['person', 'author', 'legend', 'character']]
            }
        },
        language: {
            type: 'string',
            maxlength: 10,
            nullable: false,
            defaultTo: 'zh',
            validations: {
                isIn: [['zh', 'ja', 'en']]
            }
        },
        bio_summary: {type: 'text', maxlength: 5000, nullable: true},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'draft',
            validations: {
                isIn: [['draft', 'published', 'archived']]
            }
        },
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['status', 'updated_at'],
            ['subject_type', 'status'],
            ['language', 'status']
        ]
    },

    person_roles: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        role_key: {type: 'string', maxlength: 191, nullable: false},
        role_label: {type: 'string', maxlength: 500, nullable: true},
        is_primary: {type: 'bool', nullable: false, defaultTo: false},
        role_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'draft',
            validations: {
                isIn: [['draft', 'published', 'archived']]
            }
        },
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'role_order'],
            ['person_id', 'role_key'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['person_id', 'role_key']
        ]
    },

    person_life_events: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        event_key: {type: 'string', maxlength: 191, nullable: true},
        title: {type: 'string', maxlength: 500, nullable: false},
        event_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'milestone'},
        description: {type: 'text', maxlength: 5000, nullable: true},
        happened_at: {type: 'dateTime', nullable: true},
        place: {type: 'string', maxlength: 500, nullable: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'draft',
            validations: {
                isIn: [['draft', 'published', 'archived']]
            }
        },
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'sort_order'],
            ['person_id', 'happened_at'],
            ['status']
        ]
    },

    person_story_series: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        slug: {type: 'string', maxlength: 191, nullable: false},
        title: {type: 'string', maxlength: 2000, nullable: false},
        summary: {type: 'text', maxlength: 5000, nullable: true},
        origin_story_slug: {type: 'string', maxlength: 191, nullable: true},
        series_type: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'narrative'},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'draft',
            validations: {
                isIn: [['draft', 'published', 'archived']]
            }
        },
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'sort_order'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['person_id', 'slug']
        ]
    },

    person_story_episodes: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        series_id: {type: 'string', maxlength: 24, nullable: false, references: 'person_story_series.id', cascadeDelete: true},
        slug: {type: 'string', maxlength: 191, nullable: false},
        title: {type: 'string', maxlength: 2000, nullable: false},
        summary: {type: 'text', maxlength: 5000, nullable: true},
        episode_no: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        episode_type: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'chapter',
            validations: {
                isIn: [['chapter', 'supplement', 'afterword', 'timeline']]
            }
        },
        post_id: {type: 'string', maxlength: 24, nullable: true, references: 'posts.id', cascadeDelete: true},
        published_at: {type: 'dateTime', nullable: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'draft',
            validations: {
                isIn: [['draft', 'published', 'archived']]
            }
        },
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['series_id', 'episode_no'],
            ['person_id', 'sort_order'],
            ['post_id'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['series_id', 'slug']
        ]
    },

    person_relations: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        related_person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        relation_key: {type: 'string', maxlength: 191, nullable: false},
        relation_label: {type: 'string', maxlength: 500, nullable: true},
        relation_direction: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'bidirectional',
            validations: {
                isIn: [['outgoing', 'incoming', 'bidirectional']]
            }
        },
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'draft',
            validations: {
                isIn: [['draft', 'published', 'archived']]
            }
        },
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'relation_key'],
            ['related_person_id', 'relation_key'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['person_id', 'related_person_id', 'relation_key']
        ]
    },

    person_post_relations: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id', cascadeDelete: true},
        relation_key: {type: 'string', maxlength: 191, nullable: false},
        relation_label: {type: 'string', maxlength: 500, nullable: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        status: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'draft',
            validations: {
                isIn: [['draft', 'published', 'archived']]
            }
        },
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['person_id', 'relation_key'],
            ['post_id', 'relation_key'],
            ['status']
        ],
        '@@UNIQUE INDEXES@@': [
            ['person_id', 'post_id', 'relation_key']
        ]
    },

    person_media: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        person_id: {type: 'string', maxlength: 24, nullable: false, references: 'persons.id', cascadeDelete: true},
        series_id: {type: 'string', maxlength: 24, nullable: true, references: 'person_story_series.id'},
        media_id: {type: 'string', maxlength: 24, nullable: false, references: 'social_media_assets.id'},
        media_role: {
            type: 'string',
            maxlength: 50,
            nullable: false,
            defaultTo: 'supplemental',
            validations: {
                isIn: [['cover', 'chapter', 'timeline', 'supplemental', 'source', 'profile']]
            }
        },
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        caption: {type: 'string', maxlength: 500, nullable: true},
        is_primary: {type: 'bool', nullable: true, defaultTo: false},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true}
    },

    social_ai_dzi_jobs: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true, index: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'queued'},
        is_public: {type: 'bool', nullable: false, defaultTo: false, index: true},
        progress: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        source_path: {type: 'string', maxlength: 2000, nullable: false},
        source_name: {type: 'string', maxlength: 500, nullable: true},
        publication_name: {type: 'string', maxlength: 500, nullable: false},
        edition: {type: 'string', maxlength: 500, nullable: false},
        pages: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
        preview_url: {type: 'string', maxlength: 2000, nullable: true},
        error: {type: 'string', maxlength: 2000, nullable: true},
        claim_worker_id: {type: 'string', maxlength: 191, nullable: true},
        claim_expires_at: {type: 'dateTime', nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
        updated_at: {type: 'dateTime', nullable: false},
        updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
        started_at: {type: 'dateTime', nullable: true},
        completed_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['status'],
            ['user_id', 'status'],
            ['status', 'claim_expires_at']
        ]
    },

    social_ai_dzi_job_projects: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        dzi_job_id: {type: 'string', maxlength: 24, nullable: false, index: true},
        project_id: {type: 'string', maxlength: 24, nullable: false, index: true},
        created_at: {type: 'dateTime', nullable: false},
        '@@UNIQUE_CONSTRAINTS@@': [
            ['dzi_job_id', 'project_id']
        ]
    },

    social_ai_chart_jobs: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        // Leading step type (image-fetch / csv-create / …), for display & filtering.
        type: {type: 'string', maxlength: 100, nullable: false, defaultTo: 'image-fetch'},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'queued'},
        // Ordered step array: [{id, type, status, payload, result, artifacts, error, history, progress}].
        // Job-level status is DERIVED from steps in the endpoint.
        steps: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
        payload: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
        result: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
        progress: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        source_path: {type: 'string', maxlength: 2000, nullable: true},
        preview_url: {type: 'string', maxlength: 2000, nullable: true},
        error: {type: 'string', maxlength: 2000, nullable: true},
        claim_worker_id: {type: 'string', maxlength: 191, nullable: true},
        claim_expires_at: {type: 'dateTime', nullable: true},
        user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true, index: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
        // Generic project container (P1 — plan §0-1/§2-2). Plain indexed, NOT
        // a FK: project deletion cascades explicitly in the endpoint (M7).
        // Null = legacy MVP job (kept compatible, plan §9-3).
        project_id: {type: 'string', maxlength: 24, nullable: true, index: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
        updated_at: {type: 'dateTime', nullable: false},
        updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
        started_at: {type: 'dateTime', nullable: true},
        completed_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['status'],
            ['type', 'status'],
            ['user_id', 'status'],
            ['status', 'claim_expires_at']
        ]
    },

    social_ai_projects: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        name: {type: 'string', maxlength: 191, nullable: false},
        description: {type: 'text', maxlength: 2000, nullable: true},
        // tags: JSON array (series: "01-China" etc. as tags — keeps the table
        // generic, plan §3-1). LIKE-scan searchable; normalized table only if a
        // tag-search requirement appears (review L3).
        tags: {type: 'text', maxlength: 1000000, fieldtype: 'long', nullable: true},
        // User-controlled PUBLICATION state — enum: draft | published, set on
        // the project detail page. NOT derived from the jobs (review M2: the
        // old derived draft/active/completed scheme was removed).
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft', index: true},
        user_id: {type: 'string', maxlength: 24, nullable: true, references: 'users.id', setNullDelete: true, index: true},
        group_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_groups.id', setNullDelete: true},
        created_at: {type: 'dateTime', nullable: false},
        created_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
        updated_at: {type: 'dateTime', nullable: false},
        updated_by: {type: 'string', maxlength: 24, nullable: false, references: 'users.id', cascadeDelete: true},
        '@@INDEXES@@': [
            ['user_id', 'status']
        ]
    },

    social_ai_chart_job_media: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        chart_job_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_ai_chart_jobs.id', cascadeDelete: true},
        media_id: {type: 'string', maxlength: 24, nullable: false, index: true, references: 'social_media_assets.id', cascadeDelete: true},
        role: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'output', index: true},
        source_kind: {type: 'string', maxlength: 20, nullable: true},
        step_id: {type: 'string', maxlength: 64, nullable: true},
        person_name: {type: 'string', maxlength: 191, nullable: true, index: true},
        sort_order: {type: 'integer', nullable: false, unsigned: true, defaultTo: 0},
        caption: {type: 'string', maxlength: 2000, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        '@@INDEXES@@': [
            ['chart_job_id', 'role', 'sort_order'],
            ['chart_job_id', 'person_name'],
            ['media_id']
        ]
    },

    // Denormalized keyword-search index for core posts (mirrors the estate search
    // index pattern). One row per post.
    // - `search_text` = title + excerpt + tags + author + body (the combined blob;
    //   FULLTEXT-searched as "search everything", body included for now — monitor
    //   size in production and cap the body portion later if needed).
    // - per-field columns (title/excerpt/tag/author) support field-restricted search.
    // FULLTEXT(ngram) indexes (combined on `search_text` + one per field) are added
    // by a raw migration (schema.js @@INDEXES@@ cannot express WITH PARSER ngram).
    // Regular index on (status, published_at) for facet/sort. Source of truth is
    // `posts`; rows are upserted on post save.
    post_search_index: {
        post_id: {type: 'string', maxlength: 24, nullable: false, primary: true, references: 'posts.id', cascadeDelete: true},
        search_text: {type: 'text', maxlength: 1000000000, fieldtype: 'long', nullable: true},
        title_text: {type: 'string', maxlength: 2000, nullable: true},
        excerpt_text: {type: 'text', maxlength: 65535, nullable: true},
        tag_text: {type: 'text', maxlength: 65535, nullable: true},
        author_text: {type: 'string', maxlength: 1000, nullable: true},
        status: {type: 'string', maxlength: 50, nullable: false, defaultTo: 'draft'},
        visibility: {type: 'string', maxlength: 50, nullable: true},
        featured: {type: 'bool', nullable: false, defaultTo: false},
        published_at: {type: 'dateTime', nullable: true},
        updated_at: {type: 'dateTime', nullable: true},
        group_id: {type: 'string', maxlength: 24, nullable: true},
        author_ids: {type: 'text', maxlength: 65535, nullable: true},
        '@@INDEXES@@': [
            ['status', 'published_at']
        ]
    },

    post_media: {
        id: {type: 'string', maxlength: 24, nullable: false, primary: true},
        post_id: {type: 'string', maxlength: 24, nullable: false, references: 'posts.id', cascadeDelete: true},
        media_id: {type: 'string', maxlength: 24, nullable: true, references: 'social_media_assets.id', setNullDelete: true},
        media_type: {type: 'string', maxlength: 20, nullable: false, validations: {isIn: [['image', 'video', 'audio']]}},
        source_url: {type: 'string', maxlength: 2000, nullable: false},
        source_url_hash: {type: 'string', maxlength: 64, nullable: false, index: true},
        thumbnail_url: {type: 'string', maxlength: 2000, nullable: true},
        caption: {type: 'string', maxlength: 1000, nullable: true},
        alt: {type: 'string', maxlength: 1000, nullable: true},
        role: {type: 'string', maxlength: 20, nullable: false, defaultTo: 'content', validations: {isIn: [['feature', 'content']]}},
        sort_order: {type: 'integer', nullable: false, defaultTo: 0},
        lexical_node_key: {type: 'string', maxlength: 191, nullable: true},
        created_at: {type: 'dateTime', nullable: false},
        updated_at: {type: 'dateTime', nullable: true},
        '@@INDEXES@@': [
            ['post_id', 'sort_order']
        ],
        '@@UNIQUE_CONSTRAINTS@@': [
            ['post_id', 'source_url_hash', 'role']
        ]
    }

};
