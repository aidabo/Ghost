/* eslint-disable ghost/filenames/match-exported-class */
import {generateDecoratorNode} from '../../generate-decorator-node';
import {parseSliderNode} from './slider-parser';
import {renderSliderNode} from './slider-renderer';

function normalizeSlides(slides = []) {
    if (!Array.isArray(slides)) {
        return [];
    }

    return slides
        .map((slide) => {
            if (!slide || !slide.kind || !slide.src) {
                return null;
            }

            return {
                id: slide.id || '',
                kind: slide.kind,
                src: slide.src,
                fileName: slide.fileName || '',
                mimeType: slide.mimeType || '',
                width: slide.width ?? null,
                height: slide.height ?? null,
                duration: slide.duration || 0,
                thumbnailSrc: slide.thumbnailSrc || '',
                alt: slide.alt || '',
                caption: slide.caption || ''
            };
        })
        .filter(Boolean);
}

export class SliderNode extends generateDecoratorNode({
    nodeType: 'slider',
    properties: [
        {name: 'slides', default: []}
    ]
}) {
    static get urlTransformMap() {
        return {};
    }

    constructor(dataset = {}, key) {
        super({...dataset, slides: normalizeSlides(dataset.slides)}, key);
    }

    static importDOM() {
        return parseSliderNode(this);
    }

    exportJSON() {
        return {
            type: 'slider',
            version: 1,
            slides: normalizeSlides(this.slides)
        };
    }

    exportDOM(options = {}) {
        return renderSliderNode(this, options);
    }

    hasEditMode() {
        return false;
    }
}

export const $createSliderNode = (dataset) => {
    return new SliderNode(dataset);
};

export function $isSliderNode(node) {
    return node instanceof SliderNode;
}
