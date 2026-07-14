import {readCaptionFromElement} from '../../utils/read-caption-from-element.js';
import {readImageAttributesFromElement} from '../../utils/read-image-attributes-from-element.js';

function readSliderSlide(element, index) {
    const kind = element.dataset?.kind || element.dataset?.mediaKind || 'image';
    const caption = readCaptionFromElement(element);
    const audio = element.querySelector('audio');

    if (kind === 'audio' || audio) {
        if (!audio?.src && !audio?.getAttribute('src') && !audio?.currentSrc) {
            return null;
        }

        const audioSrc = audio.getAttribute('src') || audio.currentSrc || audio.src;
        return {
            id: element.dataset?.id || `slider-${index + 1}`,
            kind: 'audio',
            src: audioSrc,
            fileName: element.dataset?.fileName || '',
            mimeType: element.dataset?.mimeType || audio.querySelector('source')?.type || audio.type || '',
            duration: Number(element.dataset?.duration || 0) || 0,
            thumbnailSrc: '',
            caption
        };
    }

    if (kind === 'video') {
        const video = element.querySelector('video');
        if (!video?.src && !video?.getAttribute('src') && !video?.currentSrc) {
            return null;
        }

        const videoSrc = video.getAttribute('src') || video.currentSrc || video.src;

        return {
            id: element.dataset?.id || `slider-${index + 1}`,
            kind: 'video',
            src: videoSrc,
            fileName: element.dataset?.fileName || '',
            mimeType: element.dataset?.mimeType || video.querySelector('source')?.type || video.type || '',
            width: Number(video.getAttribute('width') || element.dataset?.width || 0) || null,
            height: Number(video.getAttribute('height') || element.dataset?.height || 0) || null,
            duration: Number(element.dataset?.duration || 0) || 0,
            thumbnailSrc: element.dataset?.thumbnailSrc || video.getAttribute('poster') || '',
            caption
        };
    }

    const img = element.querySelector('img');
    if (!img?.src && !img?.getAttribute('src') && !img?.currentSrc) {
        return null;
    }

    const image = readImageAttributesFromElement(img);
    return {
        id: element.dataset?.id || `slider-${index + 1}`,
        kind: 'image',
        src: image.src || img.getAttribute('src') || img.currentSrc || img.src,
        fileName: element.dataset?.fileName || (img.getAttribute('src') || img.currentSrc || img.src).match(/[^/]*$/)?.[0] || `slide-${index + 1}`,
        width: image.width,
        height: image.height,
        alt: image.alt || '',
        caption
    };
}

export function parseSliderNode(SliderNode) {
    return {
        figure: (nodeElem) => {
            if (!nodeElem.classList?.contains('kg-slider-card')) {
                return null;
            }

            return {
                conversion(domNode) {
                    const slides = Array.from(domNode.querySelectorAll('.kg-slider-slide'))
                        .map((slide, index) => readSliderSlide(slide, index))
                        .filter(Boolean);

                    const node = new SliderNode({slides});
                    return {node};
                },
                priority: 1
            };
        }
    };
}
