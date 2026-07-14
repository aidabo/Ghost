import {addCreateDocumentOption} from '../../utils/add-create-document-option';
import {renderEmptyContainer} from '../../utils/render-empty-container';

function isValidSlide(slide) {
    return slide
        && slide.kind
        && slide.src;
}

function escapeText(text) {
    return String(text || '');
}

function renderSlide(document, slide) {
    const slideFigure = document.createElement('figure');
    slideFigure.setAttribute('class', 'kg-slider-slide');
    slideFigure.setAttribute('data-kind', slide.kind || 'image');

    if (slide.id) {
        slideFigure.setAttribute('data-id', slide.id);
    }

    if (slide.fileName) {
        slideFigure.setAttribute('data-file-name', slide.fileName);
    }

    if (slide.mimeType) {
        slideFigure.setAttribute('data-mime-type', slide.mimeType);
    }

    if (slide.duration) {
        slideFigure.setAttribute('data-duration', `${slide.duration}`);
    }

    if (slide.thumbnailSrc) {
        slideFigure.setAttribute('data-thumbnail-src', slide.thumbnailSrc);
    }

    if (slide.kind === 'video') {
        const media = document.createElement('div');
        media.setAttribute('class', 'kg-slider-media');
        const video = document.createElement('video');
        const thumbnailSrc = slide.thumbnailSrc || '';
        video.setAttribute('controls', '');
        video.setAttribute('preload', 'metadata');
        video.setAttribute('playsinline', '');
        video.setAttribute('src', slide.src);
        if (thumbnailSrc) {
            video.setAttribute('poster', thumbnailSrc);
            video.setAttribute('data-thumbnail-src', thumbnailSrc);
            video.style.background = `transparent url('${thumbnailSrc}') 50% 50% / cover no-repeat`;
        }
        if (slide.width) {
            video.setAttribute('width', `${slide.width}`);
        }
        if (slide.height) {
            video.setAttribute('height', `${slide.height}`);
        }
        media.appendChild(video);
        slideFigure.appendChild(media);

    } else if (slide.kind === 'audio') {
        const audio = document.createElement('audio');
        audio.setAttribute('controls', '');
        audio.setAttribute('preload', 'metadata');
        audio.setAttribute('src', slide.src);
        slideFigure.appendChild(audio);
    } else {
        const media = document.createElement('div');
        media.setAttribute('class', 'kg-slider-media');
        const img = document.createElement('img');
        img.setAttribute('src', slide.src);
        img.setAttribute('loading', 'lazy');
        img.setAttribute('alt', slide.alt || '');
        if (slide.width) {
            img.setAttribute('width', `${slide.width}`);
        }
        if (slide.height) {
            img.setAttribute('height', `${slide.height}`);
        }
        media.appendChild(img);
        slideFigure.appendChild(media);
    }

    if (slide.caption) {
        const figcaption = document.createElement('figcaption');
        figcaption.textContent = escapeText(slide.caption);
        slideFigure.appendChild(figcaption);
    }

    return slideFigure;
}

export function renderSliderNode(node, options = {}) {
    addCreateDocumentOption(options);
    const document = options.createDocument();

    const validSlides = Array.isArray(node.slides) ? node.slides.filter(isValidSlide) : [];
    if (!validSlides.length) {
        return renderEmptyContainer(document);
    }

    const figure = document.createElement('figure');
    figure.setAttribute('class', 'kg-card kg-slider-card kg-width-wide');

    const track = document.createElement('div');
    track.setAttribute('class', 'kg-slider-track');
    figure.appendChild(track);

    validSlides.forEach((slide) => {
        track.appendChild(renderSlide(document, slide));
    });

    return {element: figure};
}
