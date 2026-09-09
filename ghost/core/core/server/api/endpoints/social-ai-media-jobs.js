// @ts-ignore
const tpl = require('@tryghost/tpl');
const errors = require('@tryghost/errors');
const models = require('../../models');
// @ts-ignore
//const logging = require('@tryghost/logging');

const ADMIN_ROLES = new Set(['Owner', 'Administrator', 'Admin']);
const ALLOWED_INCLUDES = ['user', 'group'];

const messages = {
    userRequired: 'No login user authentication.',
    notFound: 'AI media job not found.',
    noPermission: 'You are not allowed to access this AI media job.',
    groupNotFound: 'Group not found.',
    invalidJobId: '`id` is required.',
    invalidTransition: 'The requested job transition is not allowed.',
    invalidCorrectedTranscript: '`corrected_transcript_json` must be valid JSON with a segments array.',
    invalidPriority: '`priority` must be a non-negative number.'
};

// @ts-ignore
const getPayload = (frame) => frame.data?.socialaimediajobs?.[0] || {};
// @ts-ignore
const getActionPayload = (frame) => {
    const payload = getPayload(frame);
    return Object.keys(payload).length > 0 ? payload : (frame.data || {});
};

// @ts-ignore
const getCurrentUserId = frame => frame.options?.context?.user || null;
// @ts-ignore
const getCurrentIntegrationId = frame => frame.options?.context?.integration || null;
// @ts-ignore
const getRequestedUserId = (frame) => {
    const payload = getPayload(frame);
    return frame.options?.user_id || payload.user_id || frame.data?.user_id || null;
};
// @ts-ignore
const SocialAiMediaJobModel = models.SocialAiMediaJob;
// @ts-ignore
const TABLE = SocialAiMediaJobModel?.prototype?.tableName || 'social_ai_media_jobs';

// @ts-ignore
const isAdminUser = async (userId) => {
    if (!userId) {
        return false;
    }

    // @ts-ignore
    const user = await models.User.findOne({ id: userId }, { withRelated: ['roles'] });
    if (!user) {
        return false;
    }

    const roles = user.related('roles')?.models || [];
    // @ts-ignore
    return roles.some(role => ADMIN_ROLES.has(role.get('name')));
};

const nowMySql = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// @ts-ignore
const getJobId = (frame) => frame.options?.id || frame.data?.id || null;

// @ts-ignore
const resolveTargetUserId = async (frame) => {
    const currentUserId = getCurrentUserId(frame);
    const currentIntegrationId = getCurrentIntegrationId(frame);
    const requestedUserId = getRequestedUserId(frame);

    if (!currentUserId && !currentIntegrationId) {
        throw new errors.NoPermissionError({
            message: tpl(messages.userRequired)
        });
    }

    if (currentIntegrationId) {
        return requestedUserId || null;
    }

    if (!requestedUserId || requestedUserId === currentUserId) {
        return currentUserId;
    }

    const isAdmin = await isAdminUser(currentUserId);
    if (isAdmin) {
        return requestedUserId;
    }

    throw new errors.NoPermissionError({
        message: tpl(messages.noPermission)
    });
};

// @ts-ignore
const assertGroupAccess = async ({ frame, groupId, targetUserId, permission }) => {
    if (!groupId) {
        return;
    }

    const currentUserId = getCurrentUserId(frame);
    const isAdmin = currentUserId ? await isAdminUser(currentUserId) : false;
    if (isAdmin) {
        return;
    }

    // @ts-ignore
    const group = await models.SocialGroup.findOne({ id: groupId });
    if (!group) {
        throw new errors.NotFoundError({
            message: tpl(messages.groupNotFound)
        });
    }

    // @ts-ignore
    const allowed = await models.SocialGroup.canAccessGroup(group, targetUserId, permission);
    if (!allowed) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }
};

// @ts-ignore
const formatJsonField = (value, fallback) => {
    if (!value) {
        return fallback;
    }

    if (typeof value === 'object') {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch (err) {
        return fallback;
    }
};

// @ts-ignore
const toNullableString = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

// @ts-ignore
const findArtifactByType = (artifacts, type) => {
    if (!Array.isArray(artifacts)) {
        return null;
    }
    return artifacts.find(artifact => String(artifact?.type || '').trim() === type) || null;
};

// @ts-ignore
const findManifestItem = (artifactManifest, type, fileName) => {
    const items = Array.isArray(artifactManifest?.items) ? artifactManifest.items : [];
    if (type) {
        // @ts-ignore
        const byType = items.find(item => String(item?.type || '').trim() === type);
        if (byType) {
            return byType;
        }
    }
    if (fileName) {
        // @ts-ignore
        return items.find(item => String(item?.fileName || '').trim() === fileName) || null;
    }
    return null;
};

// @ts-ignore
const mergeSettingsJson = (existingValue, patchValue) => {
    const existing = formatJsonField(existingValue, {});
    const patch = patchValue && typeof patchValue === 'object' ? patchValue : {};
    return JSON.stringify({
        ...existing,
        ...patch
    });
};

// @ts-ignore
const normalizeWritePayload = (payloadInput) => {
    const payload = { ...(payloadInput || {}) };
    if (payload.file_url && !payload.input_asset_url) {
        payload.input_asset_url = payload.file_url;
    }
    delete payload.file_url;
    return payload;
};

// @ts-ignore
const serializeRow = (row) => {
    const settings = formatJsonField(row.settings_json, {});
    const artifacts = formatJsonField(row.artifacts_json, []);
    const artifactManifest = formatJsonField(row.artifact_manifest_json, null);
    const transcriptArtifact = findArtifactByType(artifacts, 'transcript_json');
    const translatedTranscriptArtifact = findArtifactByType(artifacts, 'translated_transcript_json');
    const subtitleSrtArtifact = findArtifactByType(artifacts, 'subtitle_srt');
    const subtitleVttArtifact = findArtifactByType(artifacts, 'subtitle_vtt');
    const extractedAudioArtifact = findArtifactByType(artifacts, 'extracted_audio');
    const dubbedAudioArtifact = findArtifactByType(artifacts, 'dubbed_audio');
    const outputVideoArtifact = findArtifactByType(artifacts, 'output_video');
    const inputArtifact = findArtifactByType(artifacts, 'input');

    return {
        id: row.id,
        job_id: row.id,
        job_type: row.job_type,
        project_id: row.project_id || null,
        user_id: row.user_id,
        group_id: row.group_id,
        visibility: row.visibility,
        scope_type: row.scope_type,
        status: row.status,
        progress: row.progress,
        priority: row.priority,
        mode: row.mode,
        source_lang: row.source_lang,
        target_lang: row.target_lang,
        subtitle_lang: toNullableString(settings.subtitle_lang),
        stt_model: row.stt_model,
        translation_model: row.translation_model,
        tts_model: row.tts_model,
        tts_voice: row.tts_voice,
        tts_tone: row.tts_tone,
        subtitle_render: row.subtitle_render,
        output_playback_speed: row.output_playback_speed,
        dubbing_style: toNullableString(settings.dubbing_style),
        custom_translation_instruction: toNullableString(settings.custom_translation_instruction),
        reuse_previous_transcript: settings.reuse_previous_transcript === true,
        corrected_transcript_json: toNullableString(settings.corrected_transcript_json),
        corrected_transcript_updated_at: toNullableString(settings.corrected_transcript_updated_at),
        reused_transcript_from_job_id: toNullableString(settings.reused_transcript_from_job_id),
        original_audio_volume:
            typeof settings.original_audio_volume === 'number' ? settings.original_audio_volume : null,
        dubbed_audio_volume:
            typeof settings.dubbed_audio_volume === 'number' ? settings.dubbed_audio_volume : null,
        input_asset_url: row.input_asset_url,
        input_file_name: row.input_file_name,
        input_duration_ms: findManifestItem(artifactManifest, 'input', row.input_file_name || 'input')?.durationMs || null,
        extracted_audio_duration_ms: extractedAudioArtifact?.durationMs || findManifestItem(artifactManifest, 'extracted_audio', 'audio.wav')?.durationMs || null,
        dubbed_audio_duration_ms: dubbedAudioArtifact?.durationMs || findManifestItem(artifactManifest, 'dubbed_audio', 'dubbed-audio.mp3')?.durationMs || null,
        output_video_duration_ms: outputVideoArtifact?.durationMs || findManifestItem(artifactManifest, 'output_video', 'output-video.mp4')?.durationMs || null,
        transcript_url: toNullableString(transcriptArtifact?.url),
        translated_transcript_url: toNullableString(translatedTranscriptArtifact?.url),
        subtitle_srt_url: toNullableString(subtitleSrtArtifact?.url),
        subtitle_vtt_url: toNullableString(subtitleVttArtifact?.url),
        extracted_audio_url: toNullableString(extractedAudioArtifact?.url),
        dubbed_audio_url: toNullableString(dubbedAudioArtifact?.url),
        output_video_url: toNullableString(outputVideoArtifact?.url),
        input_url: toNullableString(inputArtifact?.url || row.input_asset_url),
        settings,
        artifacts,
        artifact_manifest: artifactManifest,
        error_code: row.error_code,
        error_message: row.error_message,
        claim_worker_id: row.claim_worker_id,
        claim_expires_at: row.claim_expires_at,
        retry_count: row.retry_count,
        started_at: row.started_at,
        completed_at: row.completed_at,
        canceled_at: row.canceled_at,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
};

// @ts-ignore
const assertCanReadRow = async ({ frame, row }) => {
    const currentUserId = getCurrentUserId(frame);
    const integrationId = getCurrentIntegrationId(frame);
    const isAdmin = currentUserId ? await isAdminUser(currentUserId) : false;

    if (integrationId || isAdmin) {
        return;
    }

    const targetUserId = await resolveTargetUserId(frame);
    await assertGroupAccess({
        frame,
        groupId: row.group_id,
        targetUserId: targetUserId || currentUserId,
        permission: 'read'
    });

    if (row.user_id !== targetUserId && row.group_id === null) {
        throw new errors.NoPermissionError({
            message: tpl(messages.noPermission)
        });
    }
};

// @ts-ignore
const assertCanWriteGroup = async ({ frame, groupId, targetUserId }) => {
    await assertGroupAccess({
        frame,
        groupId,
        targetUserId,
        permission: 'write'
    });
};

// @ts-ignore
const loadModelForUpdateOrThrow = async (frame) => loadModelOrThrow(getJobId(frame));

// @ts-ignore
const loadRowForActionOrThrow = async (knex, frame) => loadRowOrThrow(knex, getJobId(frame));

// @ts-ignore
const loadModelOrThrow = async (id) => {
    if (!id) {
        throw new errors.ValidationError({
            message: tpl(messages.invalidJobId)
        });
    }

    // @ts-ignore
    const model = await SocialAiMediaJobModel.findOne({ id });
    if (!model) {
        throw new errors.NotFoundError({
            message: tpl(messages.notFound)
        });
    }

    return model;
};

// @ts-ignore
const loadRowOrThrow = async (knex, id) => {
    if (!id) {
        throw new errors.ValidationError({
            message: tpl(messages.invalidJobId)
        });
    }

    const row = await knex(TABLE).where({ id }).first();
    if (!row) {
        throw new errors.NotFoundError({
            message: tpl(messages.notFound)
        });
    }

    return row;
};

/** @type {import('@tryghost/api-framework').Controller} */
const controller = {
    docName: 'socialaimediajobs',

    browse: {
        headers: {
            cacheInvalidate: false
        },
        options: [
            'group_id',
            'user_id',
            'status',
            'include',
            'filter',
            'fields',
            'collection',
            'formats',
            'limit',
            'order',
            'page',
            'debug'
        ],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            //logging.info('[social-ai-media-jobs] read: input frame snapshot', JSON.stringify(frame));
            const targetUserId = await resolveTargetUserId(frame);
            // @ts-ignore
            const groupId = frame.options?.group_id || null;
            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'read'
            });
            // @ts-ignore
            return await models.SocialAiMediaJob.findPage({ ...frame.options, withRelated: ALLOWED_INCLUDES });
        }
    },

    read: {
        headers: {
            cacheInvalidate: false
        },
        options: ['id'],
        validation: {
            options: {
                include: ALLOWED_INCLUDES
            }
        },
        permissions: true,
        async query(frame) {
            //logging.info('[social-ai-media-jobs] read: input frame snapshot', JSON.stringify(frame));
            const targetUserId = await resolveTargetUserId(frame);
            // @ts-ignore
            const groupId = frame.options?.group_id || null;
            await assertGroupAccess({
                frame,
                groupId,
                targetUserId,
                permission: 'read'
            });
            // @ts-ignore
            return await loadModelOrThrow(frame.options.id);
        }
    },

    edit: {
        statusCode: 200,
        headers: { cacheInvalidate: false },
        options: ['id', 'include', 'transacting'],
        data: [
            'id',
            'priority',
            'corrected_transcript_json'
        ],
        permissions: true,
        // @ts-ignore
        async query(frame) {
            const payloadInput = getPayload(frame);
            const id = getJobId(frame);
            const model = await loadModelForUpdateOrThrow(frame);
            const row = model.toJSON();
            await assertCanReadRow({ frame, row });

            const currentUserId = getCurrentUserId(frame);
            const targetUserId = await resolveTargetUserId(frame);
            const payload = {};

            if (Object.prototype.hasOwnProperty.call(payloadInput, 'priority')) {
                const nextPriority = Number(payloadInput.priority);
                if (!Number.isFinite(nextPriority) || nextPriority < 0) {
                    throw new errors.ValidationError({
                        message: tpl(messages.invalidPriority)
                    });
                }
                const isAdmin = currentUserId ? await isAdminUser(currentUserId) : false;
                if (!isAdmin) {
                    throw new errors.NoPermissionError({
                        message: tpl(messages.noPermission)
                    });
                }
                if (row.status !== 'queued') {
                    throw new errors.ValidationError({
                        message: tpl(messages.invalidTransition)
                    });
                }
                payload.priority = Math.round(nextPriority);
            }

            if (Object.prototype.hasOwnProperty.call(payloadInput, 'corrected_transcript_json')) {
                const correctedTranscriptJson = String(payloadInput.corrected_transcript_json || '').trim();
                if (!correctedTranscriptJson) {
                    throw new errors.ValidationError({
                        message: tpl(messages.invalidCorrectedTranscript)
                    });
                }
                let parsedCorrectedTranscript;
                try {
                    parsedCorrectedTranscript = JSON.parse(correctedTranscriptJson);
                } catch (err) {
                    throw new errors.ValidationError({
                        message: tpl(messages.invalidCorrectedTranscript)
                    });
                }
                if (!Array.isArray(parsedCorrectedTranscript?.segments)) {
                    throw new errors.ValidationError({
                        message: tpl(messages.invalidCorrectedTranscript)
                    });
                }

                await assertCanWriteGroup({
                    frame,
                    groupId: row.group_id,
                    targetUserId: targetUserId || row.user_id
                });
                payload.settings_json = JSON.stringify({
                    ...formatJsonField(row.settings_json, {}),
                    corrected_transcript_json: correctedTranscriptJson,
                    corrected_transcript_updated_at: new Date().toISOString()
                });
            }

            if (Object.keys(payload).length === 0) {
                return serializeRow(row);
            }

            // @ts-ignore
            return await models.SocialAiMediaJob.edit({
                ...payload,
                id
            }, frame.options);
        }
    },

    // @ts-ignore
    add: {
        statusCode: 201,
        headers: { cacheInvalidate: false },
        options: ['include', 'transacting'],
        data: [
            'user_id',
            'group_id',
            'project_id',
            'visibility',
            'scope_type',
            'priority',
            'mode',
            'source_lang',
            'target_lang',
            'subtitle_lang',
            'stt_model',
            'translation_model',
            'tts_model',
            'tts_voice',
            'tts_tone',
            'original_audio_volume',
            'dubbed_audio_volume',
            'dubbing_style',
            'subtitle_render',
            'output_playback_speed',
            'custom_translation_instruction',
            'reuse_previous_transcript',
            'corrected_transcript_json',
            'file_url',
            'input_file_name'
        ],
        permissions: true,
        async query(frame) {
            const payloadInput = getPayload(frame);
            const payload = normalizeWritePayload(payloadInput);
            const currentUserId = getCurrentUserId(frame);
            const integrationId = getCurrentIntegrationId(frame);
            // logging.info('[social-ai-media-jobs] add: input frame snapshot', {
            //     // @ts-ignore
            //     has_root_doc: Array.isArray(frame.data?.socialaimediajobs),
            //     frame_data: frame.data || null,
            //     payload,
            //     context_user: currentUserId,
            //     context_integration: integrationId,
            //     // @ts-ignore
            //     options_user_id: frame.options?.user_id || null
            // });
            const targetUserId = await resolveTargetUserId({
                ...frame,
                data: {
                    ...frame.data,
                    // @ts-ignore
                    user_id: payload.user_id || frame.data?.user_id || null
                }
            });
            const actorUserId = currentUserId || targetUserId;
            const groupId = payload.group_id || null;
            // logging.info('[social-ai-media-jobs] add: resolved identities', {
            //     target_user_id: targetUserId,
            //     actor_user_id: actorUserId,
            //     group_id: groupId
            // });

            if (groupId) {
                await assertCanWriteGroup({
                    frame,
                    groupId,
                    targetUserId: targetUserId || actorUserId
                });
            }

            if (!actorUserId && !integrationId) {
                throw new errors.NoPermissionError({
                    message: tpl(messages.userRequired)
                });
            }

            const projectId = String(payload.project_id || '').trim() || null;
            // @ts-ignore
            return await models.SocialAiMediaJob.add({
                ...payload,
                user_id: targetUserId || actorUserId,
                group_id: groupId,
                project_id: projectId,
                visibility: payload.visibility || 'private',
                scope_type: payload.scope_type || (groupId ? 'group' : 'user'),
                settings_json: JSON.stringify(payloadInput || {})
            }, frame.options);
        }
    },

    // @ts-ignore
    cancel: {
        options: ['id'],
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const currentUserId = getCurrentUserId(frame);
            // @ts-ignore
            const row = (await loadModelForUpdateOrThrow(frame)).toJSON();
            await assertCanReadRow({ frame, row });

            if (!['queued', 'running'].includes(row.status)) {
                throw new errors.ValidationError({
                    message: tpl(messages.invalidTransition)
                });
            }

            const now = nowMySql();
            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'canceled',
                    canceled_at: now,
                    updated_at: now,
                    updated_by: currentUserId || row.user_id
                });

            return {
                ...serializeRow({
                    ...row,
                    status: 'canceled',
                    canceled_at: now
                })
            };
        }
    },

    // @ts-ignore
    retry: {
        options: ['id'],
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const currentUserId = getCurrentUserId(frame);
            // @ts-ignore
            const row = (await loadModelForUpdateOrThrow(frame)).toJSON();
            await assertCanReadRow({ frame, row });

            if (!['failed', 'canceled', 'completed'].includes(row.status)) {
                throw new errors.ValidationError({
                    message: tpl(messages.invalidTransition)
                });
            }

            const now = nowMySql();
            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'queued',
                    progress: 0,
                    error_code: null,
                    error_message: null,
                    claim_worker_id: null,
                    claim_expires_at: null,
                    started_at: null,
                    completed_at: null,
                    canceled_at: null,
                    retry_count: Number(row.retry_count || 0) + 1,
                    updated_at: now,
                    updated_by: currentUserId || row.user_id
                });

            return {
                ...serializeRow({
                    ...row,
                    status: 'queued',
                    progress: 0,
                    error_code: null,
                    error_message: null,
                    claim_worker_id: null,
                    claim_expires_at: null,
                    started_at: null,
                    completed_at: null,
                    canceled_at: null,
                    retry_count: Number(row.retry_count || 0) + 1
                })
            };
        }
    },

    // @ts-ignore
    claim: {
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const workerId = payloadInput.worker_id || frame.options?.worker_id || 'runner';
            const claimTtlSeconds = Number(payloadInput.claim_ttl_seconds || 300);
            const nowDate = new Date();
            const expiresAt = new Date(nowDate.getTime() + claimTtlSeconds * 1000);
            const now = nowMySql();
            const claimExpiresAt = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

            const row = await knex(TABLE)
                .where(function () {
                    this.where('status', 'queued').orWhere(function () {
                        this.where('status', 'running').andWhere('claim_expires_at', '<', now);
                    });
                })
                .andWhere(function () {
                    this.whereNull('claim_expires_at').orWhere('claim_expires_at', '<', now);
                })
                .orderBy('priority', 'desc')
                .orderBy('updated_at', 'asc')
                .first();

            if (!row) {
                return [];
            }

            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'running',
                    claim_worker_id: workerId,
                    claim_expires_at: claimExpiresAt,
                    started_at: row.started_at || now,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            const claimed = await loadRowOrThrow(knex, row.id);
            return serializeRow(claimed);
        }
    },

    // @ts-ignore
    progress: {
        options: ['id'],
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const row = await loadRowForActionOrThrow(knex, frame);
            const now = nowMySql();
            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    progress: Number(payloadInput.progress ?? row.progress),
                    status: payloadInput.status || row.status,
                    error_code: payloadInput.error_code ?? row.error_code,
                    error_message: payloadInput.error_message ?? row.error_message,
                    claim_worker_id: payloadInput.claim_worker_id ?? row.claim_worker_id,
                    claim_expires_at: payloadInput.claim_expires_at ?? row.claim_expires_at,
                    settings_json: payloadInput.settings_patch
                        ? mergeSettingsJson(row.settings_json, payloadInput.settings_patch)
                        : row.settings_json,
                    artifacts_json: payloadInput.artifacts_json
                        ? JSON.stringify(payloadInput.artifacts_json)
                        : row.artifacts_json,
                    artifact_manifest_json: payloadInput.artifact_manifest_json
                        ? JSON.stringify(payloadInput.artifact_manifest_json)
                        : row.artifact_manifest_json,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            const next = await loadRowOrThrow(knex, row.id);
            return serializeRow(next);
        }
    },

    // @ts-ignore
    complete: {
        options: ['id'],
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const row = await loadRowForActionOrThrow(knex, frame);
            const now = nowMySql();
            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'completed',
                    progress: 100,
                    completed_at: now,
                    claim_worker_id: null,
                    claim_expires_at: null,
                    settings_json: payloadInput.settings_patch
                        ? mergeSettingsJson(row.settings_json, payloadInput.settings_patch)
                        : row.settings_json,
                    artifacts_json: payloadInput.artifacts_json
                        ? JSON.stringify(payloadInput.artifacts_json)
                        : row.artifacts_json,
                    artifact_manifest_json: payloadInput.artifact_manifest_json
                        ? JSON.stringify(payloadInput.artifact_manifest_json)
                        : row.artifact_manifest_json,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            const next = await loadRowOrThrow(knex, row.id);
            return serializeRow(next);
        }
    },

    // @ts-ignore
    fail: {
        options: ['id'],
        permissions: true,
        async query(frame) {
            const knex = models.Base.knex;
            const payloadInput = getActionPayload(frame);
            // @ts-ignore
            const row = await loadRowForActionOrThrow(knex, frame);
            const now = nowMySql();
            await knex(TABLE)
                .where({ id: row.id })
                .update({
                    status: 'failed',
                    progress: Number(payloadInput.progress ?? row.progress),
                    error_code: payloadInput.error_code || row.error_code,
                    error_message: payloadInput.error_message || row.error_message,
                    claim_worker_id: null,
                    claim_expires_at: null,
                    settings_json: payloadInput.settings_patch
                        ? mergeSettingsJson(row.settings_json, payloadInput.settings_patch)
                        : row.settings_json,
                    updated_at: now,
                    updated_by: row.updated_by || row.user_id
                });

            const next = await loadRowOrThrow(knex, row.id);
            return serializeRow(next);
        }
    }
};

module.exports = controller;
