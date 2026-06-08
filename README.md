<!-- TOC -->

- [Ghost sponsors](#ghost-sponsors)
- [Getting help](#getting-help)
- [Local source build](#local-source-build)
- [Build local custom source to docker image](#build-local-custom-source-to-docker-image)
- [Copyright & license](#copyright--license)
- [How to add custom table and related API to Ghost](#how-to-add-custom-table-and-related-api-to-ghost)

<!-- /TOC -->

If you want to run your own instance of Ghost, in most cases the best way is to use our **CLI tool**

```
npm install ghost-cli -g
```

&nbsp;

Then, if installing locally add the `local` flag to get up and running in under a minute - [Local install docs](https://ghost.org/docs/install/local/)

```
ghost install local
```

&nbsp;

or on a server run the full install, including automatic SSL setup using LetsEncrypt - [Production install docs](https://ghost.org/docs/install/ubuntu/)

```
ghost install
```

&nbsp;

Check out our [official documentation](https://ghost.org/docs/) for more information about our [recommended hosting stack](https://ghost.org/docs/hosting/) & properly [upgrading Ghost](https://ghost.org/docs/update/), plus everything you need to develop your own Ghost [themes](https://ghost.org/docs/themes/) or work with [our API](https://ghost.org/docs/content-api/).

### Contributors & advanced developers

For anyone wishing to contribute to Ghost or to hack/customize core files we recommend following our full development setup guides: [Contributor guide](https://ghost.org/docs/contributing/) • [Developer setup](https://ghost.org/docs/install/source/)

&nbsp;

# Ghost sponsors

A big thanks to our sponsors and partners who make Ghost possible. If you're interested in sponsoring Ghost and supporting the project, please check out our profile on [GitHub sponsors](https://github.com/sponsors/TryGhost) :heart:

**[DigitalOcean](https://m.do.co/c/9ff29836d717)** • **[Fastly](https://www.fastly.com/)**

&nbsp;

# Getting help

Everyone can get help and support from a large community of developers over on the [Ghost forum](https://forum.ghost.org/). **Ghost(Pro)** customers have access to 24/7 email support.

To stay up to date with all the latest news and product updates, make sure you [subscribe to our changelog newsletter](https://ghost.org/changelog/) — or follow us [on Twitter](https://twitter.com/Ghost), if you prefer your updates bite-sized and facetious. :saxophone::turtle:

&nbsp;

# Local source build

- Node version

  Node version is import because some package referened by import package's node version are specified different.

  `v20.19.0`

- Build source 
  
  `yarn` && `yarn build`

  If Nx daemon becomes unstable, rerun with `NX_DAEMON=false yarn build`.

# Build local custom source to docker image

- Create archive

  *Avoid parallel build error, change nx.json's `"parallel": 4` to `"parallel": 1` because some ghost/core/build:assets permission error*

  `yarn archive`

  `npx update-browserslist-db@latest`


# Copyright & license

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE). 
Ghost and the Ghost Logo are trademarks of Ghost Foundation Ltd. Please see our [trademark policy](https://ghost.org/trademark/) for info on acceptable usage.


# How to add custom table and related API to Ghost

[Add custom table and related API API to Ghost](./CUSTOM.md) 
