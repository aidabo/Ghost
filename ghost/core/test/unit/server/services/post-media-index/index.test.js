const assert = require('assert/strict');
const sinon = require('sinon');
const jobs = require('../../../../../core/server/services/jobs');
const postMediaIndex = require('../../../../../core/server/services/post-media-index');
const {extractMediaFromPost, isIndexablePost, onDraftChanged, DRAFT_SYNC_DELAY_MS} = postMediaIndex;

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

    it('indexes every newsroom Post (any status / visibility), never private-group Posts or pages', function () {
        const publicPost = {type: 'post', status: 'published', visibility: 'public', public_post: true};

        assert.equal(isIndexablePost(publicPost), true);
        // The media's published state follows its post; the public read narrows itself.
        assert.equal(isIndexablePost({...publicPost, status: 'draft'}), true);
        assert.equal(isIndexablePost({...publicPost, status: 'scheduled'}), true);
        assert.equal(isIndexablePost({...publicPost, visibility: 'members'}), true);
        assert.equal(isIndexablePost({...publicPost, public_post: false}), false);
        assert.equal(isIndexablePost({...publicPost, type: 'page'}), false);
    });

    describe('draft sync (debounced, never once per autosave)', function () {
        let clock;
        let addJob;

        beforeEach(function () {
            clock = sinon.useFakeTimers();
            addJob = sinon.stub(jobs, 'addJob');
        });

        afterEach(function () {
            clock.restore();
            sinon.restore();
        });

        const draft = id => ({id, get: key => ({id, status: 'draft'})[key]});

        it('queues one sync after the editor has been quiet, however many autosaves came first', function () {
            for (let i = 0; i < 10; i++) {
                onDraftChanged(draft('p1'));
                clock.tick(DRAFT_SYNC_DELAY_MS - 1);
            }
            sinon.assert.notCalled(addJob);
            clock.tick(1);
            sinon.assert.calledOnce(addJob);
            assert.equal(addJob.firstCall.args[0].data.postId, 'p1');
        });

        it('leaves published Posts to post.published / post.published.edited', function () {
            onDraftChanged({id: 'p2', get: key => ({id: 'p2', status: 'published'})[key]});
            clock.tick(DRAFT_SYNC_DELAY_MS * 2);
            sinon.assert.notCalled(addJob);
        });
    });
});
