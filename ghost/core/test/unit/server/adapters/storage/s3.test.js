const assert = require('assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {pathToFileURL} = require('url');

describe('S3 Storage Adapter', function () {
    it('normalizes duplicate filename suffixes before unique key generation', async function () {
        const adapterPath = path.resolve(
            __dirname,
            '../../../../../content/adapters/storage/s3/src/index.js'
        );
        const {default: Store} = await import(pathToFileURL(adapterPath).href);

        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-s3-storage-test-'));
        const inputPath = path.join(tempDir, 'input.bin');
        await fs.writeFile(inputPath, Buffer.from('hello world'));

        const store = new Store({
            bucket: 'bucket',
            region: 'us-east-1',
            assetHost: 'https://cdn.example.com',
            pathPrefix: 'prefix'
        });

        let sawExists = 0;
        store.exists = async (filename) => {
            sawExists += 1;
            return sawExists === 1 && filename === 'kktest197234312232343.mp4';
        };

        let capturedKey = '';
        store.s3 = () => ({
            putObject(config, callback) {
                capturedKey = config.Key;
                callback(null, {});
            }
        });

        await store.save(
            {
                name: 'kktest197234312232343.mp4-1',
                path: inputPath,
                type: 'video/mp4'
            },
            'gallery/users/u_1/2026/04'
        );

        assert.equal(capturedKey, 'gallery/users/u_1/2026/04/kktest197234312232343-1.mp4');
    });

    it('strips the configured host prefix from stored URLs', async function () {
        const adapterPath = path.resolve(
            __dirname,
            '../../../../../content/adapters/storage/s3/src/index.js'
        );
        const {default: Store} = await import(pathToFileURL(adapterPath).href);

        const store = new Store({
            bucket: 'bucket',
            region: 'us-east-1',
            assetHost: 'https://cdn.example.com',
            pathPrefix: 'prefix'
        });

        assert.equal(
            store.urlToPath('https://cdn.example.com/gallery/users/u_1/2026/04/file.mp4'),
            'gallery/users/u_1/2026/04/file.mp4'
        );
    });
});
