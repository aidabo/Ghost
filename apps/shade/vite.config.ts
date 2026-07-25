import path from 'path';
import react from '@vitejs/plugin-react';
import glob from 'glob';
import {resolve} from 'path';
import svgr from 'vite-plugin-svgr';
import {defineConfig} from 'vitest/config';

// https://vitejs.dev/config/
export default (function viteConfig() {
    return defineConfig({
        logLevel: process.env.CI ? 'info' : 'warn',
        plugins: [
            svgr(),
            react()
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src')
            }
        },
        define: {
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
            'process.env.VITEST_SEGFAULT_RETRY': 3
        },
        preview: {
            port: 4174
        },
        build: {
            reportCompressedSize: false,
            minify: false,
            sourcemap: true,
            outDir: 'es',
            lib: {
                formats: ['es'],
                entry: glob.sync(resolve(__dirname, 'src/**/*.{ts,tsx}')).reduce((entries, libpath) => {
                    if (libpath.includes('.stories.') || libpath.endsWith('.d.ts')) {
                        return entries;
                    }

                    const outPath = libpath.replace(resolve(__dirname, 'src') + '/', '').replace(/\.(ts|tsx)$/, '');
                    entries[outPath] = libpath;
                    return entries;
                }, {} as Record<string, string>)
            },
            commonjsOptions: {
                include: [/packages/, /node_modules/]
            },
            rollupOptions: {
                external: (source, _importer, isResolved) => {
                    // Bundle validator into shade's output — adminX-settings pins validator@7
                    // (no es/ path) which conflicts with shade's validator@13, so hoisting
                    // fails and adminX's Vite can't resolve the external import at runtime.
                    // The check must cover both the bare specifier (isResolved=false) and
                    // the absolute resolved path (isResolved=true) since Rollup calls this
                    // function at both stages.
                    if (isResolved) {
                        if (source.includes('/node_modules/validator/')) {
                            return false;
                        }
                        return source.includes('node_modules');
                    }

                    if (source.startsWith('@/')) {
                        return false;
                    }

                    if (source.startsWith('.')) {
                        return false;
                    }

                    if (source === 'validator' || source.startsWith('validator/')) {
                        return false;
                    }

                    if (source.includes('node_modules')) {
                        return true;
                    }

                    return !source.includes(__dirname);
                }
            }
        },
        test: {
            globals: true, // required for @testing-library/jest-dom extensions
            environment: 'jsdom',
            include: ['./test/unit/**/*'],
            testTimeout: process.env.TIMEOUT ? parseInt(process.env.TIMEOUT) : 10000,
            ...(process.env.CI && { // https://github.com/vitest-dev/vitest/issues/1674
                minThreads: 1,
                maxThreads: 2
            })
        }
    });
});
