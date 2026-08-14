const assert = require('assert/strict');
const {extractMediaFromPost, isIndexablePost} = require('../../../../../core/server/services/post-media-index');

describe('post-media-index', function () {
    it('extracts feature, image, video, and audio while excluding files', function () {
        const media = extractMediaFromPost({
            feature_image: 'https://cdn.example/feature.jpg',
            lexical: JSON.stringify({root: {children: [
                {type: 'image', src: 'https://cdn.example/image.jpg', alt: 'Image'},
                {type: 'video', src: 'https://cdn.example/video.mp4', thumbnailUrl: 'https://cdn.example/poster.jpg'},
                {type: 'audio', src: 'https://cdn.example/audio.mp3'},
                {type: 'file', src: 'https://cdn.example/report.pdf'}
            ]}})
        });

        assert.deepEqual(media.map(item => item.media_type), ['image', 'image', 'video', 'audio']);
        assert.equal(media[0].role, 'feature');
        assert.equal(media[2].thumbnail_url, 'https://cdn.example/poster.jpg');
    });

    it('deduplicates a feature image repeated in lexical content', function () {
        const media = extractMediaFromPost({
            feature_image: 'https://cdn.example/same.jpg',
            lexical: JSON.stringify({root: {children: [{type: 'image', src: 'https://cdn.example/same.jpg'}]}})
        });

        assert.equal(media.length, 1);
        assert.equal(media[0].role, 'feature');
    });

    it('tolerates invalid lexical JSON', function () {
        const media = extractMediaFromPost({feature_image: 'https://cdn.example/feature.jpg', lexical: '{bad'});
        assert.equal(media.length, 1);
    });

    it('indexes only currently published public Posts outside private groups', function () {
        const publicPost = {type: 'post', status: 'published', visibility: 'public', public_post: true};

        assert.equal(isIndexablePost(publicPost), true);
        assert.equal(isIndexablePost({...publicPost, status: 'draft'}), false);
        assert.equal(isIndexablePost({...publicPost, visibility: 'members'}), false);
        assert.equal(isIndexablePost({...publicPost, public_post: false}), false);
        assert.equal(isIndexablePost({...publicPost, type: 'page'}), false);
    });
});
