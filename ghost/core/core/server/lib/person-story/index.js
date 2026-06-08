const path = require('path');
const {existsSync} = require('fs');
const {readFile} = require('fs/promises');

const normalizeJsonArray = (value, fallback = []) => {
    if (!value) {
        return fallback;
    }

    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
};

const resolveWorkspacePath = (relativePath, galleryPath = '') => {
    const rootCandidates = [];
    let current = process.cwd();
    for (let i = 0; i < 8 && current; i += 1) {
        rootCandidates.push(current);
        const parent = path.resolve(current, '..');
        if (parent === current) {
            break;
        }
        current = parent;
    }

    for (const root of rootCandidates) {
        const candidate = galleryPath
            ? path.resolve(root, '21-episodes-data', galleryPath, relativePath)
            : path.resolve(root, '21-episodes-data', relativePath);
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    return galleryPath
        ? path.resolve(process.cwd(), '21-episodes-data', galleryPath, relativePath)
        : path.resolve(process.cwd(), '21-episodes-data', relativePath);
};

const loadTimelineHtml = async (relativePath, galleryPath = '') => {
    if (!relativePath) {
        return '';
    }

    const candidatePaths = [
        resolveWorkspacePath(relativePath, galleryPath),
        resolveWorkspacePath(relativePath),
        path.resolve(process.cwd(), relativePath),
        path.resolve(process.cwd(), '..', relativePath)
    ];

    for (const candidate of candidatePaths) {
        try {
            return await readFile(candidate, 'utf8');
        } catch {
            // try next candidate
        }
    }

    return '';
};

const loadGalleryManifest = async (galleryPath = '') => {
    if (!galleryPath) {
        return null;
    }

    const candidatePaths = [
        resolveWorkspacePath('gallery.json', galleryPath),
        path.resolve(process.cwd(), '21-episodes-data', galleryPath, 'gallery.json'),
        path.resolve(process.cwd(), '..', '21-episodes-data', galleryPath, 'gallery.json')
    ];

    for (const candidate of candidatePaths) {
        try {
            const raw = await readFile(candidate, 'utf8');
            return JSON.parse(raw);
        } catch {
            // try next candidate
        }
    }

    return null;
};

const serializePersonStory = async (story) => {
    const attrs = typeof story.toJSON === 'function' ? story.toJSON() : story;
    const galleryPath = attrs.gallery_path ?? attrs.galleryPath ?? '';
    const timelineHtmlPath = attrs.timeline_html_path ?? attrs.timelineHtmlPath ?? '';
    const galleryManifest = await loadGalleryManifest(galleryPath);

    return {
        id: attrs.id,
        slug: attrs.slug,
        title: attrs.title,
        subject: attrs.subject,
        galleryPath,
        subjectType: attrs.subject_type || attrs.subjectType || 'person',
        language: attrs.language,
        summary: attrs.summary,
        chapterCount: attrs.chapter_count ?? attrs.chapterCount ?? 0,
        volumeCount: attrs.volume_count ?? attrs.volumeCount ?? 0,
        timeSpan: attrs.time_span ?? attrs.timeSpan ?? '',
        geography: attrs.geography ?? '',
        sourcePath: attrs.source_path ?? attrs.sourcePath ?? '',
        timelineHtmlPath,
        timelineHtml: await loadTimelineHtml(timelineHtmlPath, galleryPath),
        galleryManifest,
        themes: normalizeJsonArray(attrs.themes_json ?? attrs.themes, []),
        structuralNotes: normalizeJsonArray(attrs.structural_notes_json ?? attrs.structuralNotes, []),
        structureOutline: normalizeJsonArray(attrs.structure_outline_json ?? attrs.structureOutline, []),
        readingOrder: normalizeJsonArray(attrs.reading_order_json ?? attrs.readingOrder, []),
        sourceKind: attrs.source_kind ?? attrs.sourceKind ?? 'seed',
        status: attrs.status,
        sortOrder: attrs.sort_order ?? attrs.sortOrder ?? 0,
        registeredAt: attrs.created_at ?? attrs.registeredAt ?? attrs.createdAt,
        updatedAt: attrs.updated_at ?? attrs.updatedAt ?? attrs.created_at ?? attrs.createdAt,
    };
};

const hydratePersonStoryModel = async (model) => {
    const serialized = await serializePersonStory(model);
    model.clear();
    model.set(serialized);
    return model;
};

const hydratePersonStoryCollection = async (collection) => {
    const models = Array.isArray(collection?.models)
        ? collection.models
        : Array.isArray(collection?.models?.models)
            ? collection.models.models
            : Array.isArray(collection?.toJSON?.())
                ? collection.toJSON()
                : [];

    for (const model of models) {
        await hydratePersonStoryModel(model);
    }

    return collection;
};

module.exports = {
    normalizeJsonArray,
    resolveWorkspacePath,
    loadTimelineHtml,
    loadGalleryManifest,
    serializePersonStory,
    hydratePersonStoryModel,
    hydratePersonStoryCollection
};
