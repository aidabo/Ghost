import { DecoratorNode, $getRoot, ElementNode, TextNode, $isTextNode, $isParagraphNode, $createLineBreakNode, $applyNodeReplacement } from 'lexical';
import cleanBasicHtml from '@tryghost/kg-clean-basic-html';
import markdownHtmlRenderer from '@tryghost/kg-markdown-html-renderer';
import { DateTime } from 'luxon';
import toArray from 'lodash/toArray';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';

/* eslint-disable ghost/filenames/match-exported-class */
/* c8 ignore start */
class KoenigDecoratorNode extends DecoratorNode {}
function $isKoenigCard(node) {
  return node instanceof KoenigDecoratorNode;
}
/* c8 ignore end */

// when used nodes are used client-side their data attributes may be an editor
// instance rather than a string in the case of nested editors
function readTextContent(node, property) {
  const propertyName = `__${property}`;
  const propertyEditorName = `${propertyName}Editor`;

  // prefer the editor if it exists as the underlying value isn't written until export
  const value = node[propertyEditorName] || node[propertyName];
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value.getEditorState === 'function') {
    let text = '';
    value.getEditorState().read(() => {
      text = $getRoot().getTextContent();
    });
    return text;
  }
  return '';
}

/*
 * Renders an empty container element
 * In the returned object, `type: 'inner'` is picked up by the `@tryghost/kg-lexical-html-renderer` package
 * to render the inner content of the container element (in this case, nothing)
 *
 * @see @tryghost/kg-lexical-html-renderer package
 * @see https://github.com/TryGhost/Koenig/blob/e14c008e176f7a1036fe3f3deb924ed69a69191f/packages/kg-lexical-html-renderer/lib/convert-to-html-string.js#L29
 */
function renderEmptyContainer(document) {
  const emptyContainer = document.createElement('span');
  return {
    element: emptyContainer,
    type: 'inner'
  };
}

const ALL_MEMBERS_SEGMENT = 'status:free,status:-free';
const NO_MEMBERS_SEGMENT = '';
const DEFAULT_VISIBILITY = {
  web: {
    nonMember: true,
    memberSegment: 'status:free,status:-free'
  },
  email: {
    memberSegment: 'status:free,status:-free'
  }
};

// ensure we always work with a deep copy to avoid accidental constant mutations
function buildDefaultVisibility() {
  return JSON.parse(JSON.stringify(DEFAULT_VISIBILITY));
}
function usesOldVisibilityFormat(visibility) {
  return !Object.prototype.hasOwnProperty.call(visibility, 'web') || !Object.prototype.hasOwnProperty.call(visibility, 'email') || !Object.prototype.hasOwnProperty.call(visibility.web, 'nonMember');
}
function migrateOldVisibilityFormat(visibility) {
  visibility.web ??= {};
  visibility.web.nonMember ??= visibility.showOnWeb;
  visibility.web.memberSegment ??= visibility.showOnWeb ? ALL_MEMBERS_SEGMENT : NO_MEMBERS_SEGMENT;
  visibility.email ??= {};
  if (visibility.showOnEmail) {
    visibility.email.memberSegment ??= visibility.segment ? visibility.segment : ALL_MEMBERS_SEGMENT;
  } else {
    visibility.email.memberSegment = NO_MEMBERS_SEGMENT;
  }
}
function renderWithVisibility(originalRenderOutput, visibility, options) {
  const document = originalRenderOutput.element.ownerDocument;
  const content = _getRenderContent(originalRenderOutput);
  if (usesOldVisibilityFormat(visibility)) {
    migrateOldVisibilityFormat(visibility);
  }
  if (options.target === 'email') {
    if (visibility.email.memberSegment === NO_MEMBERS_SEGMENT) {
      return renderEmptyContainer(document);
    }
    if (visibility.email.memberSegment === ALL_MEMBERS_SEGMENT) {
      return originalRenderOutput;
    }
    return _renderWithEmailVisibility(document, content, visibility.email);
  }
  const isNotVisibleOnWeb = visibility.web.nonMember === false && visibility.web.memberSegment === NO_MEMBERS_SEGMENT;
  if (isNotVisibleOnWeb) {
    return renderEmptyContainer(document);
  }
  const hasWebVisibilityRestrictions = visibility.web.nonMember !== true || visibility.web.memberSegment !== ALL_MEMBERS_SEGMENT;
  if (hasWebVisibilityRestrictions) {
    return _renderWithWebVisibility(document, content, visibility.web);
  }
  return originalRenderOutput;
}

/* Private functions -------------------------------------------------------- */

function _getRenderContent({
  element,
  type
}) {
  if (type === 'inner') {
    return element.innerHTML;
  } else if (type === 'value') {
    if ('value' in element) {
      return element.value;
    }
    return '';
  } else {
    return element.outerHTML;
  }
}
function _renderWithEmailVisibility(document, content, emailVisibility) {
  const {
    memberSegment
  } = emailVisibility;
  const container = document.createElement('div');
  container.innerHTML = content;
  container.setAttribute('data-gh-segment', memberSegment);
  return {
    element: container,
    type: 'html'
  };
}
function _renderWithWebVisibility(document, content, webVisibility) {
  const {
    nonMember,
    memberSegment
  } = webVisibility;
  const wrappedContent = `\n<!--kg-gated-block:begin nonMember:${nonMember} memberSegment:"${memberSegment}" -->${content}<!--kg-gated-block:end-->\n`;
  const textarea = document.createElement('textarea');
  textarea.value = wrappedContent;
  return {
    element: textarea,
    type: 'value'
  };
}

var visibilityUtils = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ALL_MEMBERS_SEGMENT: ALL_MEMBERS_SEGMENT,
    NO_MEMBERS_SEGMENT: NO_MEMBERS_SEGMENT,
    buildDefaultVisibility: buildDefaultVisibility,
    migrateOldVisibilityFormat: migrateOldVisibilityFormat,
    renderWithVisibility: renderWithVisibility,
    usesOldVisibilityFormat: usesOldVisibilityFormat
});

/**
 * Validates the required arguments passed to `generateDecoratorNode`
*/
function validateArguments(nodeType, properties) {
  /* eslint-disable ghost/ghost-custom/no-native-error */
  /* c8 ignore start */
  if (!nodeType) {
    throw new Error({
      message: '[generateDecoratorNode] A unique "nodeType" should be provided'
    });
  }
  properties.forEach(prop => {
    if (!('name' in prop) || !('default' in prop)) {
      throw new Error({
        message: '[generateDecoratorNode] Properties should have both "name" and "default" attributes.'
      });
    }
    if (prop.urlType && !['url', 'html', 'markdown'].includes(prop.urlType)) {
      throw new Error({
        message: '[generateDecoratorNode] "urlType" should be either "url", "html" or "markdown"'
      });
    }
    if ('wordCount' in prop && typeof prop.wordCount !== 'boolean') {
      throw new Error({
        message: '[generateDecoratorNode] "wordCount" should be of boolean type.'
      });
    }
  });
  /* c8 ignore stop */
}

/**
 * @typedef {Object} DecoratorNodeProperty
 * @property {string} name - The property's name.
 * @property {*} default - The property's default value
 * @property {('url'|'html'|'markdown'|null)} urlType - If the property contains a URL, the URL's type: 'url', 'html' or 'markdown'. Use 'url' is the property contains only a URL, 'html' or 'markdown' if the property contains HTML or markdown code, that may contain URLs.
 * @property {boolean} wordCount - Whether the property should be counted in the word count
 *
 * @param {string} nodeType – The node's type (must be unique)
 * @param {DecoratorNodeProperty[]} properties - An array of properties for the generated class
 * @param {boolean} hasVisibility - Whether to add a visibility property to the node
 * @returns {Object} - The generated class.
 */
function generateDecoratorNode({
  nodeType,
  properties = [],
  version = 1,
  hasVisibility = false
}) {
  validateArguments(nodeType, properties);

  // Adds a `privateName` field to the properties for convenience (e.g. `__name`):
  // properties: [{name: 'name', privateName: '__name', type: 'string', default: 'hello'}, {...}]
  properties = properties.map(prop => {
    return {
      ...prop,
      privateName: `__${prop.name}`
    };
  });

  // Adds `visibility` property to the properties array if `hasVisibility` is true
  // uses a getter for `default` to avoid problems with mutation of nested objects
  if (hasVisibility) {
    properties.push({
      name: 'visibility',
      get default() {
        return buildDefaultVisibility();
      },
      privateName: '__visibility'
    });
  }
  class GeneratedDecoratorNode extends KoenigDecoratorNode {
    constructor(data = {}, key) {
      super(key);
      properties.forEach(prop => {
        if (typeof prop.default === 'boolean') {
          this[prop.privateName] = data[prop.name] ?? prop.default;
        } else {
          this[prop.privateName] = data[prop.name] || prop.default;
        }
      });
    }

    /**
     * Returns the node's unique type
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/nodes#extending-decoratornode
     * @returns {string}
     */
    static getType() {
      return nodeType;
    }

    /**
     * Creates a copy of an existing node with all its properties
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/nodes#extending-decoratornode
     */
    static clone(node) {
      return new this(node.getDataset(), node.__key);
    }

    /**
     * Returns default values for any properties, allowing our editor code
     * to detect when a property has been changed
     */
    static getPropertyDefaults() {
      return properties.reduce((obj, prop) => {
        obj[prop.name] = prop.default;
        return obj;
      }, {});
    }

    /**
     * Transforms URLs contained in the payload to relative paths (`__GHOST_URL__/relative/path/`),
     * so that URLs to be changed without having to update the database
     * @see https://github.com/TryGhost/SDK/tree/main/packages/url-utils
     */
    static get urlTransformMap() {
      let map = {};
      properties.forEach(prop => {
        if (prop.urlType) {
          if (prop.urlPath) {
            map[prop.urlPath] = prop.urlType;
          } else {
            map[prop.name] = prop.urlType;
          }
        }
      });
      return map;
    }

    /**
     * Convenience method to get all properties of the node
     * @returns {Object} - The node's properties
     */
    getDataset() {
      const self = this.getLatest();
      let dataset = {};
      properties.forEach(prop => {
        dataset[prop.name] = self[prop.privateName];
      });
      return dataset;
    }

    /**
     * Converts JSON to a Lexical node
     * @see https://lexical.dev/docs/concepts/serialization#lexicalnodeimportjson
     * @extends DecoratorNode
     * @param {Object} serializedNode - Lexical's representation of the node, in JSON format
     */
    static importJSON(serializedNode) {
      const data = {};

      // migrate older nodes that were saved with an earlier version of the visibility format
      const visibility = serializedNode.visibility;
      if (visibility && usesOldVisibilityFormat(visibility)) {
        migrateOldVisibilityFormat(visibility);
      }
      properties.forEach(prop => {
        data[prop.name] = serializedNode[prop.name];
      });
      return new this(data);
    }

    /**
     * Serializes a Lexical node to JSON. The JSON content is then saved to the database.
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/serialization#lexicalnodeexportjson
     */
    exportJSON() {
      const dataset = {
        type: nodeType,
        version: version,
        ...properties.reduce((obj, prop) => {
          obj[prop.name] = this[prop.name];
          return obj;
        }, {})
      };
      return dataset;
    }

    /* c8 ignore start */
    /**
     * Inserts node in the DOM. Required when extending the DecoratorNode.
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/nodes#extending-decoratornode
     */
    createDOM() {
      return document.createElement('div');
    }

    /**
     * Required when extending the DecoratorNode
     * @extends DecoratorNode
     * @see https://lexical.dev/docs/concepts/nodes#extending-decoratornode
     */
    updateDOM() {
      return false;
    }

    /**
     * Defines whether a node is a top-level block.
     * @see https://lexical.dev/docs/api/classes/lexical.DecoratorNode#isinline
     */
    isInline() {
      // All our cards are top-level blocks. Override if needed.
      return false;
    }
    /* c8 ignore stop */

    /**
     * Defines whether a node has dynamic data that needs to be fetched from the server when rendering
     */
    hasDynamicData() {
      return false;
    }

    /**
     * Defines whether a node has an edit mode in the editor UI
     */
    hasEditMode() {
      // Most of our cards have an edit mode. Override if needed.
      return true;
    }

    /*
    * Returns the text content of the node, used by the editor to calculate the word count
    * This method filters out properties without `wordCount: true`
    */
    getTextContent() {
      const self = this.getLatest();
      const propertiesWithText = properties.filter(prop => !!prop.wordCount);
      const text = propertiesWithText.map(prop => readTextContent(self, prop.name)).filter(Boolean).join('\n');
      return text ? `${text}\n\n` : '';
    }

    /**
     * Returns true/false for whether the node's visibility property
     * is active or not. Always false if a node has no visibility property
     * @returns {boolean}
     */
    getIsVisibilityActive() {
      if (!properties.some(prop => prop.name === 'visibility')) {
        return false;
      }
      const self = this.getLatest();
      const visibility = self.__visibility;
      if (usesOldVisibilityFormat(visibility)) {
        return visibility.showOnEmail === false || visibility.showOnWeb === false || visibility.segment !== '';
      } else {
        return visibility.web.nonMember === false || visibility.web.memberSegment !== ALL_MEMBERS_SEGMENT || visibility.email.memberSegment !== ALL_MEMBERS_SEGMENT;
      }
    }
  }

  /**
   * Generates getters and setters for each property, following ES6 syntax
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/get
   * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/set
   *
   * Example: for a given property 'content', the generated getter and setter will be:
   * get content() {
   *    const self = this.getLatest();
   *    return self.__content;
   * }
   *
   * set content(newVal) {
   *   const writable = this.getWritable();
   *   writable.__content = newVal;
   * }
   *
   * They can be used as `node.content` (getter) and `node.content = 'new value'` (setter)
   */
  properties.forEach(prop => {
    Object.defineProperty(GeneratedDecoratorNode.prototype, prop.name, {
      get: function () {
        const self = this.getLatest();
        return self[prop.privateName];
      },
      set: function (newVal) {
        const writable = this.getWritable();
        writable[prop.privateName] = newVal;
      }
    });
  });
  return GeneratedDecoratorNode;
}

function buildCleanBasicHtmlForElement(domNode) {
  return function _cleanBasicHtml(html) {
    const cleanedHtml = cleanBasicHtml(html, {
      createDocument: _html => {
        const newDoc = domNode.ownerDocument.implementation.createHTMLDocument();
        newDoc.body.innerHTML = _html;
        return newDoc;
      }
    });
    return cleanedHtml;
  };
}

function readCaptionFromElement(element, {
  selector = 'figcaption'
} = {}) {
  const cleanBasicHtml = buildCleanBasicHtmlForElement(element);
  let caption;
  const figcaptions = Array.from(element.querySelectorAll(selector));
  if (figcaptions.length) {
    figcaptions.forEach(figcaption => {
      const cleanHtml = cleanBasicHtml(figcaption.innerHTML);
      caption = caption ? `${caption} / ${cleanHtml}` : cleanHtml;
    });
  }
  return caption;
}

function readImageAttributesFromElement(element) {
  const attrs = {};
  if (element.src) {
    attrs.src = element.src;
  }
  if (element.width) {
    attrs.width = element.width;
  } else if (element.dataset && element.dataset.width) {
    attrs.width = parseInt(element.dataset.width, 10);
  }
  if (element.height) {
    attrs.height = element.height;
  } else if (element.dataset && element.dataset.height) {
    attrs.height = parseInt(element.dataset.height, 10);
  }
  if (!element.width && !element.height && element.getAttribute('data-image-dimensions')) {
    const [, width, height] = /^(\d*)x(\d*)$/gi.exec(element.getAttribute('data-image-dimensions'));
    attrs.width = parseInt(width, 10);
    attrs.height = parseInt(height, 10);
  }
  if (element.alt) {
    attrs.alt = element.alt;
  }
  if (element.title) {
    attrs.title = element.title;
  }
  if (element.parentNode.tagName === 'A') {
    const href = element.parentNode.href;
    if (href !== attrs.src) {
      attrs.href = href;
    }
  }
  return attrs;
}

function parseImageNode(ImageNode) {
  return {
    img: () => ({
      conversion(domNode) {
        if (domNode.tagName === 'IMG') {
          const {
            src,
            width,
            height,
            alt,
            title,
            href
          } = readImageAttributesFromElement(domNode);
          const node = new ImageNode({
            alt,
            src,
            title,
            width,
            height,
            href
          });
          return {
            node
          };
        }
        return null;
      },
      priority: 1
    }),
    figure: nodeElem => {
      const img = nodeElem.querySelector('img');
      if (img) {
        return {
          conversion(domNode) {
            const kgClass = domNode.className.match(/kg-width-(wide|full)/);
            const grafClass = domNode.className.match(/graf--layout(FillWidth|OutsetCenter)/);
            if (!img) {
              return null;
            }
            const payload = readImageAttributesFromElement(img);
            if (kgClass) {
              payload.cardWidth = kgClass[1];
            } else if (grafClass) {
              payload.cardWidth = grafClass[1] === 'FillWidth' ? 'full' : 'wide';
            }
            payload.caption = readCaptionFromElement(domNode);
            const {
              src,
              width,
              height,
              alt,
              title,
              caption,
              cardWidth,
              href
            } = payload;
            const node = new ImageNode({
              alt,
              src,
              title,
              width,
              height,
              caption,
              cardWidth,
              href
            });
            return {
              node
            };
          },
          priority: 0 // since we are generically parsing figure elements, we want this to run after others (like the gallery)
        };
      }
      return null;
    }
  };
}

const getAvailableImageWidths = function (image, imageSizes) {
  // get a sorted list of the available responsive widths
  const imageWidths = Object.values(imageSizes).map(({
    width
  }) => width).sort((a, b) => a - b);

  // select responsive widths that are usable based on the image width
  const availableImageWidths = imageWidths.filter(width => width <= image.width);

  // add the original image size to the responsive list if it's not captured by largest responsive size
  // - we can't know the width/height of the original `src` image because we don't know if it was resized
  //   or not. Adding the original image to the responsive list ensures we're not showing smaller sized
  //   images than we need to be
  if (image.width > availableImageWidths[availableImageWidths.length - 1] && image.width < imageWidths[imageWidths.length - 1]) {
    availableImageWidths.push(image.width);
  }
  return availableImageWidths;
};

const isLocalContentImage = function (url, siteUrl = '') {
  const normalizedSiteUrl = siteUrl.replace(/\/$/, '');
  const imagePath = url.replace(normalizedSiteUrl, '');
  return /^(\/.*|__GHOST_URL__)\/?content\/images\//.test(imagePath);
};

const isUnsplashImage = function (url) {
  return /images\.unsplash\.com/.test(url);
};

// default content sizes: [600, 1000, 1600, 2400]

const getSrcsetAttribute = function ({
  src,
  width,
  options
}) {
  if (!options.imageOptimization || options.imageOptimization.srcsets === false || !width || !options.imageOptimization.contentImageSizes) {
    return;
  }
  if (isLocalContentImage(src, options.siteUrl) && options.canTransformImage && !options.canTransformImage(src)) {
    return;
  }
  const srcsetWidths = getAvailableImageWidths({
    width
  }, options.imageOptimization.contentImageSizes);

  // apply srcset if this is a relative image that matches Ghost's image url structure
  if (isLocalContentImage(src, options.siteUrl)) {
    const [, imagesPath, filename] = src.match(/(.*\/content\/images)\/(.*)/);
    const srcs = [];
    srcsetWidths.forEach(srcsetWidth => {
      if (srcsetWidth === width) {
        // use original image path if width matches exactly (avoids 302s from size->original)
        srcs.push(`${src} ${srcsetWidth}w`);
      } else if (srcsetWidth <= width) {
        // avoid creating srcset sizes larger than intrinsic image width
        srcs.push(`${imagesPath}/size/w${srcsetWidth}/${filename} ${srcsetWidth}w`);
      }
    });
    if (srcs.length) {
      return srcs.join(', ');
    }
  }

  // apply srcset if this is an Unsplash image
  if (isUnsplashImage(src)) {
    const unsplashUrl = new URL(src);
    const srcs = [];
    srcsetWidths.forEach(srcsetWidth => {
      unsplashUrl.searchParams.set('w', srcsetWidth);
      srcs.push(`${unsplashUrl.href} ${srcsetWidth}w`);
    });
    return srcs.join(', ');
  }
};
const setSrcsetAttribute = function (elem, image, options) {
  if (!elem || !['IMG', 'SOURCE'].includes(elem.tagName) || !elem.getAttribute('src') || !image) {
    return;
  }
  const {
    src,
    width
  } = image;
  const srcset = getSrcsetAttribute({
    src,
    width,
    options
  });
  if (srcset) {
    elem.setAttribute('srcset', srcset);
  }
};

const resizeImage = function (image, {
  width: desiredWidth,
  height: desiredHeight
} = {}) {
  const {
    width,
    height
  } = image;
  const ratio = width / height;
  if (desiredWidth) {
    const resizedHeight = Math.round(desiredWidth / ratio);
    return {
      width: desiredWidth,
      height: resizedHeight
    };
  }
  if (desiredHeight) {
    const resizedWidth = Math.round(desiredHeight * ratio);
    return {
      width: resizedWidth,
      height: desiredHeight
    };
  }
};

// If we're in a browser environment, we can use the global document object,
// but if we're in a non-browser environment, we need to be passed a `createDocument` function
function addCreateDocumentOption(options) {
  if (!options.createDocument && options.dom) {
    options.createDocument = function () {
      return options.dom.window.document;
    };
  }
  if (!options.createDocument) {
    /* c8 ignore start */
    let document = typeof window !== 'undefined' && window.document;
    if (!document) {
      throw new Error('Must be passed a `createDocument` function as an option when used in a non-browser environment'); // eslint-disable-line
    }
    options.createDocument = function () {
      return document;
    };
    /* c8 ignore end */
  }
}

function renderImageNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  if (!node.src || node.src.trim() === '') {
    return renderEmptyContainer(document);
  }
  const figure = document.createElement('figure');
  let figureClasses = 'kg-card kg-image-card';
  if (node.cardWidth !== 'regular') {
    figureClasses += ` kg-width-${node.cardWidth}`;
  }
  //added float layout
  if (node.floatDirection && (node.floatDirection === 'left' || node.floatDirection === 'right')) {
    figureClasses += ` kg-float-image kg-float-${node.floatDirection}`;
  }
  if (node.caption) {
    figureClasses += ' kg-card-hascaption';
  }
  figure.setAttribute('class', figureClasses);
  const img = document.createElement('img');
  img.setAttribute('src', node.src);
  img.setAttribute('class', 'kg-image');
  img.setAttribute('alt', node.alt);
  img.setAttribute('loading', 'lazy');
  if (node.title) {
    img.setAttribute('title', node.title);
  }
  if (node.width && node.height) {
    img.setAttribute('width', node.width);
    img.setAttribute('height', node.height);
  }

  // images can be resized to max width, if that's the case output
  // the resized width/height attrs to ensure 3rd party gallery plugins
  // aren't affected by differing sizes
  const {
    canTransformImage
  } = options;
  const {
    defaultMaxWidth
  } = options.imageOptimization || {};
  if (defaultMaxWidth && node.width > defaultMaxWidth && isLocalContentImage(node.src, options.siteUrl) && canTransformImage && canTransformImage(node.src)) {
    const imageDimensions = {
      width: node.width,
      height: node.height
    };
    const {
      width,
      height
    } = resizeImage(imageDimensions, {
      width: defaultMaxWidth
    });
    img.setAttribute('width', width);
    img.setAttribute('height', height);
  }
  if (options.target !== 'email') {
    const imgAttributes = {
      src: node.src,
      width: node.width,
      height: node.height
    };
    setSrcsetAttribute(img, imgAttributes, options);
    if (img.getAttribute('srcset') && node.width && node.width >= 720) {
      // standard size
      if (!node.cardWidth || node.cardWidth === 'regular') {
        img.setAttribute('sizes', '(min-width: 720px) 720px');
      }
      if (node.cardWidth === 'wide' && node.width >= 1200) {
        img.setAttribute('sizes', '(min-width: 1200px) 1200px');
      }
    }
  }

  // Outlook is unable to properly resize images without a width/height
  // so we add that at the expected size in emails (600px) and use a higher
  // resolution image to keep images looking good on retina screens
  if (options.target === 'email' && node.width && node.height) {
    let imageDimensions = {
      width: node.width,
      height: node.height
    };
    if (node.width >= 600) {
      imageDimensions = resizeImage(imageDimensions, {
        width: 600
      });
    }
    img.setAttribute('width', imageDimensions.width);
    img.setAttribute('height', imageDimensions.height);
    if (isLocalContentImage(node.src, options.siteUrl) && options.canTransformImage?.(node.src)) {
      // find available image size next up from 2x600 so we can use it for the "retina" src
      const availableImageWidths = getAvailableImageWidths(node, options.imageOptimization.contentImageSizes);
      const srcWidth = availableImageWidths.find(width => width >= 1200);
      if (!srcWidth || srcWidth === node.width) ; else {
        const [, imagesPath, filename] = node.src.match(/(.*\/content\/images)\/(.*)/);
        img.setAttribute('src', `${imagesPath}/size/w${srcWidth}/${filename}`);
      }
    }
  }
  if (node.href) {
    const a = document.createElement('a');
    a.setAttribute('href', node.href);
    a.appendChild(img);
    figure.appendChild(a);
  } else {
    figure.appendChild(img);
  }
  if (node.caption) {
    const caption = document.createElement('figcaption');
    caption.innerHTML = node.caption;
    figure.appendChild(caption);
  }
  return {
    element: figure
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class ImageNode extends generateDecoratorNode({
  nodeType: 'image',
  properties: [{
    name: 'src',
    default: '',
    urlType: 'url'
  }, {
    name: 'caption',
    default: '',
    urlType: 'html',
    wordCount: true
  }, {
    name: 'title',
    default: ''
  }, {
    name: 'alt',
    default: ''
  }, {
    name: 'cardWidth',
    default: 'regular'
  }, {
    name: 'width',
    default: null
  }, {
    name: 'height',
    default: null
  }, {
    name: 'href',
    default: '',
    urlType: 'url'
  }, {
    name: 'floatDirection',
    default: 'none'
  }]
}) {
  /* @override */
  exportJSON() {
    // checks if src is a data string
    const {
      src,
      width,
      height,
      title,
      alt,
      caption,
      cardWidth,
      href,
      floatDirection
    } = this;
    const isBlob = src && src.startsWith('data:');
    const dataset = {
      type: 'image',
      version: 1,
      src: isBlob ? '<base64String>' : src,
      width,
      height,
      title,
      alt,
      caption,
      cardWidth,
      href,
      floatDirection
    };
    return dataset;
  }
  static importDOM() {
    return parseImageNode(this);
  }
  exportDOM(options = {}) {
    return renderImageNode(this, options);
  }
  hasEditMode() {
    return false;
  }
}
const $createImageNode = dataset => {
  return new ImageNode(dataset);
};
function $isImageNode(node) {
  return node instanceof ImageNode;
}

function parseCodeBlockNode(CodeBlockNode) {
  return {
    figure: nodeElem => {
      const pre = nodeElem.querySelector('pre');
      if (nodeElem.tagName === 'FIGURE' && pre) {
        return {
          conversion(domNode) {
            let code = pre.querySelector('code');
            let figcaption = domNode.querySelector('figcaption');

            // if there's no caption the pre key should pick it up
            if (!code || !figcaption) {
              return null;
            }
            let payload = {
              code: code.textContent,
              caption: readCaptionFromElement(domNode)
            };
            let preClass = pre.getAttribute('class') || '';
            let codeClass = code.getAttribute('class') || '';
            let langRegex = /lang(?:uage)?-(.*?)(?:\s|$)/i;
            let languageMatches = preClass.match(langRegex) || codeClass.match(langRegex);
            if (languageMatches) {
              payload.language = languageMatches[1].toLowerCase();
            }
            const node = new CodeBlockNode(payload);
            return {
              node
            };
          },
          priority: 2 // falls back to pre if no caption
        };
      }
      return null;
    },
    pre: () => ({
      conversion(domNode) {
        if (domNode.tagName === 'PRE') {
          let [codeElement] = domNode.children;
          if (codeElement && codeElement.tagName === 'CODE') {
            let payload = {
              code: codeElement.textContent
            };
            let preClass = domNode.getAttribute('class') || '';
            let codeClass = codeElement.getAttribute('class') || '';
            let langRegex = /lang(?:uage)?-(.*?)(?:\s|$)/i;
            let languageMatches = preClass.match(langRegex) || codeClass.match(langRegex);
            if (languageMatches) {
              payload.language = languageMatches[1].toLowerCase();
            }
            const node = new CodeBlockNode(payload);
            return {
              node
            };
          }
        }
        return null;
      },
      priority: 1
    })
  };
}

function renderCodeBlockNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  if (!node.code || node.code.trim() === '') {
    return renderEmptyContainer(document);
  }
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  if (node.language) {
    code.setAttribute('class', `language-${node.language}`);
  }
  code.appendChild(document.createTextNode(node.code));
  pre.appendChild(code);
  if (node.caption) {
    let figure = document.createElement('figure');
    figure.setAttribute('class', 'kg-card kg-code-card');
    figure.appendChild(pre);
    let figcaption = document.createElement('figcaption');
    figcaption.innerHTML = node.caption;
    figure.appendChild(figcaption);
    return {
      element: figure
    };
  } else {
    return {
      element: pre
    };
  }
}

/* eslint-disable ghost/filenames/match-exported-class */
class CodeBlockNode extends generateDecoratorNode({
  nodeType: 'codeblock',
  properties: [{
    name: 'code',
    default: '',
    wordCount: true
  }, {
    name: 'language',
    default: ''
  }, {
    name: 'caption',
    default: '',
    urlType: 'html',
    wordCount: true
  }]
}) {
  static importDOM() {
    return parseCodeBlockNode(this);
  }
  exportDOM(options = {}) {
    return renderCodeBlockNode(this, options);
  }
  isEmpty() {
    return !this.__code;
  }
}
function $createCodeBlockNode(dataset) {
  return new CodeBlockNode(dataset);
}
function $isCodeBlockNode(node) {
  return node instanceof CodeBlockNode;
}

function renderMarkdownNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const html = markdownHtmlRenderer.render(node.markdown || '', options);
  const element = document.createElement('div');
  element.innerHTML = html;

  // `type: 'inner'` will render only the innerHTML of the element
  // @see @tryghost/kg-lexical-html-renderer package
  return {
    element,
    type: 'inner'
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class MarkdownNode extends generateDecoratorNode({
  nodeType: 'markdown',
  properties: [{
    name: 'markdown',
    default: '',
    urlType: 'markdown',
    wordCount: true
  }]
}) {
  exportDOM(options = {}) {
    return renderMarkdownNode(this, options);
  }
  isEmpty() {
    return !this.__markdown;
  }
}
function $createMarkdownNode(dataset) {
  return new MarkdownNode(dataset);
}
function $isMarkdownNode(node) {
  return node instanceof MarkdownNode;
}

function parseVideoNode(VideoNode) {
  return {
    figure: nodeElem => {
      const isKgVideoCard = nodeElem.classList?.contains('kg-video-card');
      if (nodeElem.tagName === 'FIGURE' && isKgVideoCard) {
        return {
          conversion(domNode) {
            const videoNode = domNode.querySelector('.kg-video-container video');
            const durationNode = domNode.querySelector('.kg-video-duration');
            const videoSrc = videoNode && videoNode.src;
            const videoWidth = videoNode && videoNode.width;
            const videoHeight = videoNode && videoNode.height;
            const durationText = durationNode && durationNode.innerHTML.trim();
            const captionText = readCaptionFromElement(domNode);
            if (!videoSrc) {
              return null;
            }
            const payload = {
              src: videoSrc,
              loop: !!videoNode.loop,
              cardWidth: getCardWidth(videoNode)
            };
            if (durationText) {
              const [minutes, seconds] = durationText.split(':');
              try {
                payload.duration = parseInt(minutes) * 60 + parseInt(seconds);
              } catch (e) {
                // ignore duration
              }
            }
            if (domNode.dataset.kgThumbnail) {
              payload.thumbnailSrc = domNode.dataset.kgThumbnail;
            }
            if (domNode.dataset.kgCustomThumbnail) {
              payload.customThumbnailSrc = domNode.dataset.kgCustomThumbnail;
            }
            if (captionText) {
              payload.caption = captionText;
            }
            if (videoWidth) {
              payload.width = videoWidth;
            }
            if (videoHeight) {
              payload.height = videoHeight;
            }
            const node = new VideoNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}
function getCardWidth(domNode) {
  if (domNode.classList.contains('kg-width-full')) {
    return 'full';
  } else if (domNode.classList.contains('kg-width-wide')) {
    return 'wide';
  } else {
    return 'regular';
  }
}

function renderVideoNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  if (!node.src || node.src.trim() === '') {
    return renderEmptyContainer(document);
  }
  const cardClasses = getCardClasses$3(node).join(' ');
  const htmlString = options.target === 'email' ? emailCardTemplate$2({
    node,
    options,
    cardClasses
  }) : cardTemplate$6({
    node,
    cardClasses
  });
  const element = document.createElement('div');
  element.innerHTML = htmlString.trim();
  return {
    element: element.firstElementChild
  };
}
function getVideoType(filename) {
  if (!filename) {
    return null;
  }

  // Get file extension
  const extension = filename.split('.').pop().toLowerCase();

  // Map extensions to MIME types
  const typeMap = {
    mp4: 'video/mp4',
    m4v: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    ogv: 'video/ogg',
    //fake as quicktime as mp4 because MOV is not supported universal, chrome not automatically play
    mov: /*'video/quicktime',*/'video/mp4',
    mpeg: 'video/mpeg',
    mpg: 'video/mpeg',
    avi: 'video/x-msvideo',
    wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv',
    '3gp': 'video/3gpp',
    '3g2': 'video/3gpp2'
  };

  //S3 storage extension maybe is mp4-1 etc for the same filename. 
  var keys = Object.keys(typeMap).filter(key => extension.indexOf(key) >= 0);
  if (keys && keys.length > 0) {
    return typeMap[keys[0]];
  } else {
    return null;
  }
  //return typeMap[extension] || null;
}
function cardTemplate$6({
  node,
  cardClasses
}) {
  const width = node.width;
  const height = node.height;
  const autoplayAttr = node.loop ? 'loop autoplay muted' : '';
  const posterSpacerSrc = `https://img.spacergif.org/v1/${width}x${height}/0a/spacer.png`;
  const thumbnailSrc = node.customThumbnailSrc || node.thumbnailSrc;
  const videoType = getVideoType(node.src) || 'video/mp4';
  const maxDimension = Math.max(width, height);
  const aspectRatio = width / height;
  const containerStyle = `width:100%; max-width:${maxDimension}px; aspect-ratio: ${aspectRatio}; margin: '0 auto'`;
  return `
        <figure class="${cardClasses}" data-kg-thumbnail=${node.thumbnailSrc} data-kg-custom-thumbnail=${node.customThumbnailSrc}>
            <div class="kg-video-container data-vjs-player" style="${containerStyle}">
                <video
                    controls
                    responsive
                    controlsList="nodownload" 
                    class="video-js vjs-big-play-centered vjs-paused"
                    poster="${posterSpacerSrc}"
                    width="${width}"
                    height="${height}"
                    ${autoplayAttr}
                    playsinline
                    preload="auto"
                    style="background: transparent url('${thumbnailSrc}') 50% 50% / cover no-repeat; width:100%; height:100%;"
                    data-setup='{"fluid": true}'
                >
                <source src="${node.src}" type="${videoType}"></source>
                <p class="vjs-no-js">
                    To view this video please enable JavaScript, and consider upgrading to a
                    web browser that
                    <a href="https://videojs.com/html5-video-support/" target="_blank">
                        supports HTML5 video
                    </a>
                </p>
                </video>

            </div>
            ${node.caption ? `<figcaption>${node.caption}</figcaption>` : ''}
        </figure>
    `;
}
function emailCardTemplate$2({
  node,
  options,
  cardClasses
}) {
  const thumbnailSrc = node.customThumbnailSrc || node.thumbnailSrc;
  const emailTemplateMaxWidth = 600;
  const aspectRatio = node.width / node.height;
  const emailSpacerWidth = Math.round(emailTemplateMaxWidth / 4);
  const emailSpacerHeight = Math.round(emailTemplateMaxWidth / aspectRatio);
  const posterSpacerSrc = `https://img.spacergif.org/v1/${emailSpacerWidth}x${emailSpacerHeight}/0a/spacer.png`;
  const outlookCircleLeft = Math.round(emailTemplateMaxWidth / 2 - 39);
  const outlookCircleTop = Math.round(emailSpacerHeight / 2 - 39);
  const outlookPlayLeft = Math.round(emailTemplateMaxWidth / 2 - 11);
  const outlookPlayTop = Math.round(emailSpacerHeight / 2 - 17);
  return `
         <figure class="${cardClasses}">
            <!--[if !mso !vml]-->
            <a class="kg-video-preview" href="${options.postUrl}" aria-label="Play video" style="mso-hide: all">
                <table
                    cellpadding="0"
                    cellspacing="0"
                    border="0"
                    width="100%"
                    background="${thumbnailSrc}"
                    role="presentation"
                    style="background: url('${thumbnailSrc}') left top / cover; mso-hide: all"
                >
                    <tr style="mso-hide: all">
                        <td width="25%" style="visibility: hidden; mso-hide: all">
                            <img src="${posterSpacerSrc}" alt="" width="100%" border="0" style="display:block; height: auto; opacity: 0; visibility: hidden; mso-hide: all;">
                        </td>
                        <td width="50%" align="center" valign="middle" style="vertical-align: middle; mso-hide: all;">
                            <div class="kg-video-play-button" style="mso-hide: all"><div style="mso-hide: all"></div></div>
                        </td>
                        <td width="25%" style="mso-hide: all">&nbsp;</td>
                    </tr>
                </table>
            </a>
            <!--[endif]-->

            <!--[if vml]>
            <v:group xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" coordsize="${emailTemplateMaxWidth},${emailSpacerHeight}" coordorigin="0,0" href="${options.postUrl}" style="width:${emailTemplateMaxWidth}px;height:${emailSpacerHeight}px;">
                <v:rect fill="t" stroked="f" style="position:absolute;width:${emailTemplateMaxWidth};height:${emailSpacerHeight};"><v:fill src="${thumbnailSrc}" type="frame"/></v:rect>
                <v:oval fill="t" strokecolor="white" strokeweight="4px" style="position:absolute;left:${outlookCircleLeft};top:${outlookCircleTop};width:78;height:78"><v:fill color="black" opacity="30%" /></v:oval>
                <v:shape coordsize="24,32" path="m,l,32,24,16,xe" fillcolor="white" stroked="f" style="position:absolute;left:${outlookPlayLeft};top:${outlookPlayTop};width:30;height:34;" />
            </v:group>
            <![endif]-->

            ${node.caption ? `<figcaption>${node.caption}</figcaption>` : ''}
        </figure>
        `;
}
function getCardClasses$3(node) {
  let cardClasses = ['kg-card kg-video-card'];
  if (node.cardWidth) {
    cardClasses.push(`kg-width-${node.cardWidth}`);
  }
  if (node.caption) {
    cardClasses.push(`kg-card-hascaption`);
  }
  return cardClasses;
}

/* eslint-disable ghost/filenames/match-exported-class */
class VideoNode extends generateDecoratorNode({
  nodeType: 'video',
  properties: [{
    name: 'src',
    default: '',
    urlType: 'url'
  }, {
    name: 'caption',
    default: '',
    urlType: 'html',
    wordCount: true
  }, {
    name: 'fileName',
    default: ''
  }, {
    name: 'mimeType',
    default: ''
  }, {
    name: 'width',
    default: null
  }, {
    name: 'height',
    default: null
  }, {
    name: 'duration',
    default: 0
  }, {
    name: 'thumbnailSrc',
    default: '',
    urlType: 'url'
  }, {
    name: 'customThumbnailSrc',
    default: '',
    urlType: 'url'
  }, {
    name: 'thumbnailWidth',
    default: null
  }, {
    name: 'thumbnailHeight',
    default: null
  }, {
    name: 'cardWidth',
    default: 'regular'
  }, {
    name: 'loop',
    default: false
  }]
}) {
  /* override */
  exportJSON() {
    const {
      src,
      caption,
      fileName,
      mimeType,
      width,
      height,
      duration,
      thumbnailSrc,
      customThumbnailSrc,
      thumbnailWidth,
      thumbnailHeight,
      cardWidth,
      loop
    } = this;
    // checks if src is a data string
    const isBlob = src && src.startsWith('data:');
    const dataset = {
      type: 'video',
      version: 1,
      src: isBlob ? '<base64String>' : src,
      caption,
      fileName,
      mimeType,
      width,
      height,
      duration,
      thumbnailSrc,
      customThumbnailSrc,
      thumbnailWidth,
      thumbnailHeight,
      cardWidth,
      loop
    };
    return dataset;
  }
  static importDOM() {
    return parseVideoNode(this);
  }
  exportDOM(options = {}) {
    return renderVideoNode(this, options);
  }
  get formattedDuration() {
    const minutes = Math.floor(this.duration / 60);
    const seconds = Math.floor(this.duration - minutes * 60);
    const paddedSeconds = String(seconds).padStart(2, '0');
    const formattedDuration = `${minutes}:${paddedSeconds}`;
    return formattedDuration;
  }
}
const $createVideoNode = dataset => {
  return new VideoNode(dataset);
};
function $isVideoNode(node) {
  return node instanceof VideoNode;
}

function parseAudioNode(AudioNode) {
  return {
    div: nodeElem => {
      const isKgAudioCard = nodeElem.classList?.contains('kg-audio-card');
      if (nodeElem.tagName === 'DIV' && isKgAudioCard) {
        return {
          conversion(domNode) {
            const titleNode = domNode?.querySelector('.kg-audio-title');
            const audioNode = domNode?.querySelector('.kg-audio-player-container audio');
            const durationNode = domNode?.querySelector('.kg-audio-duration');
            const thumbnailNode = domNode?.querySelector('.kg-audio-thumbnail');
            const title = titleNode && titleNode.innerHTML.trim();
            const audioSrc = audioNode && audioNode.src;
            const thumbnailSrc = thumbnailNode && thumbnailNode.src;
            const durationText = durationNode && durationNode.innerHTML.trim();
            const payload = {
              src: audioSrc,
              title: title
            };
            if (thumbnailSrc) {
              payload.thumbnailSrc = thumbnailSrc;
            }
            if (durationText) {
              const [minutes, seconds = 0] = durationText.split(':');
              try {
                payload.duration = parseInt(minutes) * 60 + parseInt(seconds);
              } catch (e) {
                // ignore duration
              }
            }
            const node = new AudioNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

function renderAudioNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  if (!node.src || node.src.trim() === '') {
    return renderEmptyContainer(document);
  }
  const thumbnailCls = getThumbnailCls(node);
  const emptyThumbnailCls = getEmptyThumbnailCls(node);
  if (options.target === 'email') {
    return emailTemplate$4(node, document, options, thumbnailCls, emptyThumbnailCls);
  } else {
    return frontendTemplate$2(node, document, thumbnailCls, emptyThumbnailCls);
  }
}
function frontendTemplate$2(node, document, thumbnailCls, emptyThumbnailCls) {
  const element = document.createElement('div');
  element.setAttribute('class', 'kg-card kg-audio-card');
  const img = document.createElement('img');
  img.src = node.thumbnailSrc;
  img.alt = 'audio-thumbnail';
  img.setAttribute('class', thumbnailCls);
  element.appendChild(img);
  const emptyThumbnailDiv = document.createElement('div');
  emptyThumbnailDiv.setAttribute('class', emptyThumbnailCls);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'none');
  const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path1.setAttribute('fill-rule', 'evenodd');
  path1.setAttribute('clip-rule', 'evenodd');
  path1.setAttribute('d', 'M7.5 15.33a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-2.25.75a2.25 2.25 0 1 1 4.5 0 2.25 2.25 0 0 1-4.5 0ZM15 13.83a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm-2.25.75a2.25 2.25 0 1 1 4.5 0 2.25 2.25 0 0 1-4.5 0Z');
  svg.appendChild(path1);
  const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path2.setAttribute('fill-rule', 'evenodd');
  path2.setAttribute('clip-rule', 'evenodd');
  path2.setAttribute('d', 'M14.486 6.81A2.25 2.25 0 0 1 17.25 9v5.579a.75.75 0 0 1-1.5 0v-5.58a.75.75 0 0 0-.932-.727.755.755 0 0 1-.059.013l-4.465.744a.75.75 0 0 0-.544.72v6.33a.75.75 0 0 1-1.5 0v-6.33a2.25 2.25 0 0 1 1.763-2.194l4.473-.746Z');
  svg.appendChild(path2);
  const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path3.setAttribute('fill-rule', 'evenodd');
  path3.setAttribute('clip-rule', 'evenodd');
  path3.setAttribute('d', 'M3 1.5a.75.75 0 0 0-.75.75v19.5a.75.75 0 0 0 .75.75h18a.75.75 0 0 0 .75-.75V5.133a.75.75 0 0 0-.225-.535l-.002-.002-3-2.883A.75.75 0 0 0 18 1.5H3ZM1.409.659A2.25 2.25 0 0 1 3 0h15a2.25 2.25 0 0 1 1.568.637l.003.002 3 2.883a2.25 2.25 0 0 1 .679 1.61V21.75A2.25 2.25 0 0 1 21 24H3a2.25 2.25 0 0 1-2.25-2.25V2.25c0-.597.237-1.169.659-1.591Z');
  svg.appendChild(path3);
  emptyThumbnailDiv.appendChild(svg);
  element.appendChild(emptyThumbnailDiv);
  const audioPlayerContainer = document.createElement('div');
  audioPlayerContainer.setAttribute('class', 'kg-audio-player-container');
  const audioElement = document.createElement('audio');
  audioElement.setAttribute('src', node.src);
  audioElement.setAttribute('preload', 'metadata');
  audioPlayerContainer.appendChild(audioElement);
  const audioTitle = document.createElement('div');
  audioTitle.setAttribute('class', 'kg-audio-title');
  audioTitle.textContent = node.title;
  audioPlayerContainer.appendChild(audioTitle);
  const audioPlayer = document.createElement('div');
  audioPlayer.setAttribute('class', 'kg-audio-player');
  const audioPlayIcon = document.createElement('button');
  audioPlayIcon.setAttribute('class', 'kg-audio-play-icon');
  audioPlayIcon.setAttribute('aria-label', 'Play audio');
  const audioPlayIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  audioPlayIconSvg.setAttribute('viewBox', '0 0 24 24');
  const playPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  playPath.setAttribute('d', 'M23.14 10.608 2.253.164A1.559 1.559 0 0 0 0 1.557v20.887a1.558 1.558 0 0 0 2.253 1.392L23.14 13.393a1.557 1.557 0 0 0 0-2.785Z');
  audioPlayIconSvg.appendChild(playPath);
  audioPlayIcon.appendChild(audioPlayIconSvg);
  audioPlayer.appendChild(audioPlayIcon);
  const audioPauseIcon = document.createElement('button');
  audioPauseIcon.setAttribute('class', 'kg-audio-pause-icon kg-audio-hide');
  audioPauseIcon.setAttribute('aria-label', 'Pause audio');
  const audioPauseIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  audioPauseIconSvg.setAttribute('viewBox', '0 0 24 24');
  const rectSvg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rectSvg.setAttribute('x', '3');
  rectSvg.setAttribute('y', '1');
  rectSvg.setAttribute('width', '7');
  rectSvg.setAttribute('height', '22');
  rectSvg.setAttribute('rx', '1.5');
  rectSvg.setAttribute('ry', '1.5');
  audioPauseIconSvg.appendChild(rectSvg);
  const rectSvg2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rectSvg2.setAttribute('x', '14');
  rectSvg2.setAttribute('y', '1');
  rectSvg2.setAttribute('width', '7');
  rectSvg2.setAttribute('height', '22');
  rectSvg2.setAttribute('rx', '1.5');
  rectSvg2.setAttribute('ry', '1.5');
  audioPauseIconSvg.appendChild(rectSvg2);
  audioPauseIcon.appendChild(audioPauseIconSvg);
  audioPlayer.appendChild(audioPauseIcon);
  const audioDuration = document.createElement('span');
  audioDuration.setAttribute('class', 'kg-audio-current-time');
  audioDuration.textContent = '0:00';
  audioPlayer.appendChild(audioDuration);
  const audioDurationTotal = document.createElement('div');
  audioDurationTotal.setAttribute('class', 'kg-audio-time');
  audioDurationTotal.textContent = '/';
  const audioDUrationNode = document.createElement('span');
  audioDUrationNode.setAttribute('class', 'kg-audio-duration');
  audioDUrationNode.textContent = node.duration;
  audioDurationTotal.appendChild(audioDUrationNode);
  audioPlayer.appendChild(audioDurationTotal);
  const audioSlider = document.createElement('input');
  audioSlider.setAttribute('type', 'range');
  audioSlider.setAttribute('class', 'kg-audio-seek-slider');
  audioSlider.setAttribute('max', '100');
  audioSlider.setAttribute('value', '0');
  audioPlayer.appendChild(audioSlider);
  const playbackRate = document.createElement('button');
  playbackRate.setAttribute('class', 'kg-audio-playback-rate');
  playbackRate.setAttribute('aria-label', 'Adjust playback speed');
  playbackRate.innerHTML = '1&#215;'; // innerHTML not textContent because we need the HTML entity
  audioPlayer.appendChild(playbackRate);
  const unmuteIcon = document.createElement('button');
  unmuteIcon.setAttribute('class', 'kg-audio-unmute-icon');
  unmuteIcon.setAttribute('aria-label', 'Unmute');
  const unmuteIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  unmuteIconSvg.setAttribute('viewBox', '0 0 24 24');
  const unmutePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  unmutePath.setAttribute('d', 'M15.189 2.021a9.728 9.728 0 0 0-7.924 4.85.249.249 0 0 1-.221.133H5.25a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h1.794a.249.249 0 0 1 .221.133 9.73 9.73 0 0 0 7.924 4.85h.06a1 1 0 0 0 1-1V3.02a1 1 0 0 0-1.06-.998Z');
  unmuteIconSvg.appendChild(unmutePath);
  unmuteIcon.appendChild(unmuteIconSvg);
  audioPlayer.appendChild(unmuteIcon);
  const muteIcon = document.createElement('button');
  muteIcon.setAttribute('class', 'kg-audio-mute-icon kg-audio-hide');
  muteIcon.setAttribute('aria-label', 'Mute');
  const muteIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  muteIconSvg.setAttribute('viewBox', '0 0 24 24');
  const mutePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  mutePath.setAttribute('d', 'M16.177 4.3a.248.248 0 0 0 .073-.176v-1.1a1 1 0 0 0-1.061-1 9.728 9.728 0 0 0-7.924 4.85.249.249 0 0 1-.221.133H5.25a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h.114a.251.251 0 0 0 .177-.073ZM23.707 1.706A1 1 0 0 0 22.293.292l-22 22a1 1 0 0 0 0 1.414l.009.009a1 1 0 0 0 1.405-.009l6.63-6.631A.251.251 0 0 1 8.515 17a.245.245 0 0 1 .177.075 10.081 10.081 0 0 0 6.5 2.92 1 1 0 0 0 1.061-1V9.266a.247.247 0 0 1 .073-.176Z');
  muteIconSvg.appendChild(mutePath);
  muteIcon.appendChild(muteIconSvg);
  audioPlayer.appendChild(muteIcon);
  const volumeSlider = document.createElement('input');
  volumeSlider.setAttribute('type', 'range');
  volumeSlider.setAttribute('class', 'kg-audio-volume-slider');
  volumeSlider.setAttribute('max', '100');
  volumeSlider.setAttribute('value', '100');
  audioPlayer.appendChild(volumeSlider);
  audioPlayerContainer.appendChild(audioPlayer);
  element.appendChild(audioPlayerContainer);
  return {
    element
  };
}
function emailTemplate$4(node, document, options, thumbnailCls, emptyThumbnailCls) {
  const html = `
        <table cellspacing="0" cellpadding="0" border="0" class="kg-audio-card">
                <tr>
                    <td>
                        <table cellspacing="0" cellpadding="0" border="0" width="100%">
                            <tr>
                                <td width="60">
                                    <a href="${options.postUrl}" style="display: block; width: 60px; height: 60px; padding-top: 4px; padding-right: 16px; padding-bottom: 4px; padding-left: 4px; border-radius: 2px;">
                                        ${node.thumbnailSrc ? `
                                        <img src="${node.thumbnailSrc}" class="${thumbnailCls}" style="width: 60px; height: 60px; object-fit: cover; border: 0; border-radius: 2px;">
                                        ` : `
                                        <img src="https://static.ghost.org/v4.0.0/images/audio-file-icon.png" class="${emptyThumbnailCls}" style="width: 24px; height: 24px; padding: 18px; border-radius: 2px;">
                                        `}
                                    </a>
                                </td>
                                <td style="position: relative; vertical-align: center;" valign="middle">
                                    <a href="${options.postUrl}" style="position: absolute; display: block; top: 0; right: 0; bottom: 0; left: 0;"></a>
                                    <table cellspacing="0" cellpadding="0" border="0" width="100%">
                                        <tr>
                                            <td>
                                                <a href="${options.postUrl}" class="kg-audio-title">${node.title}</a>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td>
                                                <table cellspacing="0" cellpadding="0" border="0" width="100%">
                                                    <tr>
                                                        <td width="24" style="vertical-align: middle;" valign="middle">
                                                            <a href="${options.postUrl}" class="kg-audio-play-button"></a>
                                                        </td>
                                                        <td style="vertical-align: middle;" valign="middle">
                                                            <a href="${options.postUrl}" class="kg-audio-duration">${getFormattedDuration(node.duration)}<span class="kg-audio-link"> • Click to play audio</span></a>
                                                        </td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            `;
  const container = document.createElement('div');
  container.innerHTML = html.trim();
  return {
    element: container.firstElementChild
  };
}
function getThumbnailCls(node) {
  let thumbnailCls = 'kg-audio-thumbnail';
  if (!node.thumbnailSrc) {
    thumbnailCls += ' kg-audio-hide';
  }
  return thumbnailCls;
}
function getEmptyThumbnailCls(node) {
  let emptyThumbnailCls = 'kg-audio-thumbnail placeholder';
  if (node.thumbnailSrc) {
    emptyThumbnailCls += ' kg-audio-hide';
  }
  return emptyThumbnailCls;
}
function getFormattedDuration(duration = 200) {
  const minutes = Math.floor(duration / 60);
  const seconds = Math.floor(duration - minutes * 60);
  const paddedSeconds = String(seconds).padStart(2, '0');
  const formattedDuration = `${minutes}:${paddedSeconds}`;
  return formattedDuration;
}

/* eslint-disable ghost/filenames/match-exported-class */
class AudioNode extends generateDecoratorNode({
  nodeType: 'audio',
  properties: [{
    name: 'duration',
    default: 0
  }, {
    name: 'mimeType',
    default: ''
  }, {
    name: 'src',
    default: '',
    urlType: 'url'
  }, {
    name: 'title',
    default: ''
  }, {
    name: 'thumbnailSrc',
    default: ''
  }]
}) {
  static importDOM() {
    return parseAudioNode(this);
  }
  exportDOM(options = {}) {
    return renderAudioNode(this, options);
  }
}
const $createAudioNode = dataset => {
  return new AudioNode(dataset);
};
function $isAudioNode(node) {
  return node instanceof AudioNode;
}

function cleanDOM(node, allowedTags) {
  for (let i = 0; i < node.childNodes.length; i++) {
    let child = node.childNodes[i];
    if (child.nodeType === 1 && !allowedTags.includes(child.tagName)) {
      while (child.firstChild) {
        node.insertBefore(child.firstChild, child);
      }
      node.removeChild(child);
      i -= 1;
    } else if (child.nodeType === 1) {
      cleanDOM(child, allowedTags);
    }
  }
}

function renderCalloutNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const element = document.createElement('div');

  // backgroundColor can end up with `rgba(0, 0, 0, 0)` from old mobiledoc copy/paste
  // that is invalid when used in a class name so fall back to `white` when we don't have
  // something that looks like a valid class
  if (!node.backgroundColor || !node.backgroundColor.match(/^[a-zA-Z\d-]+$/)) {
    node.backgroundColor = 'white';
  }
  element.classList.add('kg-card', 'kg-callout-card', `kg-callout-card-${node.backgroundColor}`);
  if (node.calloutEmoji) {
    const emojiElement = document.createElement('div');
    emojiElement.classList.add('kg-callout-emoji');
    emojiElement.textContent = node.calloutEmoji;
    element.appendChild(emojiElement);
  }
  const textElement = document.createElement('div');
  textElement.classList.add('kg-callout-text');
  const temporaryContainer = document.createElement('div');
  temporaryContainer.innerHTML = node.calloutText;
  const allowedTags = ['A', 'STRONG', 'EM', 'B', 'I', 'BR', 'CODE', 'MARK', 'S', 'DEL', 'U', 'SUP', 'SUB'];
  cleanDOM(temporaryContainer, allowedTags);
  textElement.innerHTML = temporaryContainer.innerHTML;
  element.appendChild(textElement);
  return {
    element
  };
}

const getColorTag = nodeElem => {
  const colorClass = nodeElem.classList?.value?.match(/kg-callout-card-(\w+)/);
  return colorClass && colorClass[1];
};
function parseCalloutNode(CalloutNode) {
  return {
    div: nodeElem => {
      const isKgCalloutCard = nodeElem.classList?.contains('kg-callout-card');
      if (nodeElem.tagName === 'DIV' && isKgCalloutCard) {
        return {
          conversion(domNode) {
            const textNode = domNode?.querySelector('.kg-callout-text');
            const emojiNode = domNode?.querySelector('.kg-callout-emoji');
            const color = getColorTag(domNode);
            const payload = {
              calloutText: textNode && textNode.innerHTML.trim() || '',
              calloutEmoji: emojiNode && emojiNode.innerHTML.trim() || '',
              backgroundColor: color
            };
            const node = new CalloutNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class CalloutNode extends generateDecoratorNode({
  nodeType: 'callout',
  properties: [{
    name: 'calloutText',
    default: '',
    wordCount: true
  }, {
    name: 'calloutEmoji',
    default: '💡'
  }, {
    name: 'backgroundColor',
    default: 'blue'
  }]
}) {
  /* override */
  constructor({
    calloutText,
    calloutEmoji,
    backgroundColor
  } = {}, key) {
    super(key);
    this.__calloutText = calloutText || '';
    this.__calloutEmoji = calloutEmoji !== undefined ? calloutEmoji : '💡';
    this.__backgroundColor = backgroundColor || 'blue';
  }
  static importDOM() {
    return parseCalloutNode(this);
  }
  exportDOM(options = {}) {
    return renderCalloutNode(this, options);
  }
}
function $isCalloutNode(node) {
  return node instanceof CalloutNode;
}
const $createCalloutNode = dataset => {
  return new CalloutNode(dataset);
};

// TODO - this is a placeholder for the cta card web template
function ctaCardTemplate(dataset) {
  const backgroundAccent = dataset.backgroundColor === 'accent' ? 'kg-style-accent' : '';
  const buttonAccent = dataset.buttonColor === 'accent' ? 'kg-style-accent' : '';
  const buttonStyle = dataset.buttonColor !== 'accent' ? `background-color: ${dataset.buttonColor};` : '';
  return `
        <div class="cta-card ${backgroundAccent}" data-layout="${dataset.layout}" style="background-color: ${dataset.backgroundColor};">
            ${dataset.hasImage ? `<img src="${dataset.imageUrl}" alt="CTA Image">` : ''}
            <div>
                ${dataset.textValue}
            </div>
            ${dataset.showButton ? `
                <a href="${dataset.buttonUrl}" class="kg-cta-button ${buttonAccent}"
                   style="${buttonStyle} color: ${dataset.buttonTextColor};">
                    ${dataset.buttonText}
                </a>
            ` : ''}
            ${dataset.hasSponsorLabel ? `
                <div class="kg-sponsor-label">
                    Sponsored
                </div>
            ` : ''}
        </div>
    `;
}

// TODO - this is a placeholder for the email template
function emailCTATemplate(dataset) {
  const buttonStyle = dataset.buttonColor !== 'accent' ? `background-color: ${dataset.buttonColor};` : '';
  const backgroundStyle = `background-color: ${dataset.backgroundColor};`;
  return `
        <div class="cta-card-email" style="${backgroundStyle} padding: 16px; text-align: center; border-radius: 8px;">
            ${dataset.hasImage ? `<img src="${dataset.imageUrl}" alt="CTA Image" style="max-width: 100%; border-radius: 4px;">` : ''}
            <div class="cta-text" style="margin-top: 12px; color: ${dataset.textColor};">
                ${dataset.textValue}
            </div>
            ${dataset.showButton ? `
                <a href="${dataset.buttonUrl}" class="cta-button"
                   style="display: inline-block; margin-top: 12px; padding: 10px 16px;
                          ${buttonStyle} color: ${dataset.buttonTextColor}; text-decoration: none;
                          border-radius: 4px;">
                    ${dataset.buttonText}
                </a>
            ` : ''}
            ${dataset.hasSponsorLabel ? `
                <div class="sponsor-label" style="margin-top: 8px; font-size: 12px; color: #888;">
                    Sponsored
                </div>
            ` : ''}
        </div>
    `;
}
function renderCallToActionNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const dataset = {
    layout: node.layout,
    textValue: node.textValue,
    showButton: node.showButton,
    buttonText: node.buttonText,
    buttonUrl: node.buttonUrl,
    buttonColor: node.buttonColor,
    buttonTextColor: node.buttonTextColor,
    hasSponsorLabel: node.hasSponsorLabel,
    backgroundColor: node.backgroundColor,
    hasImage: node.hasImage,
    imageUrl: node.imageUrl,
    textColor: node.textColor
  };
  if (options.target === 'email') {
    const emailDoc = options.createDocument();
    const emailDiv = emailDoc.createElement('div');
    emailDiv.innerHTML = emailCTATemplate(dataset);
    return renderWithVisibility({
      element: emailDiv.firstElementChild
    }, node.visibility, options);
  }
  const htmlString = ctaCardTemplate(dataset);
  const element = document.createElement('div');
  element.innerHTML = htmlString?.trim();
  return renderWithVisibility({
    element: element.firstElementChild
  }, node.visibility, options);
}

// eslint-disable-next-line ghost/filenames/match-exported-class
class CallToActionNode extends generateDecoratorNode({
  nodeType: 'call-to-action',
  hasVisibility: true,
  properties: [{
    name: 'layout',
    default: 'minimal'
  }, {
    name: 'textValue',
    default: '',
    wordCount: true
  }, {
    name: 'showButton',
    default: false
  }, {
    name: 'buttonText',
    default: ''
  }, {
    name: 'buttonUrl',
    default: ''
  }, {
    name: 'buttonColor',
    default: ''
  }, {
    name: 'buttonTextColor',
    default: ''
  }, {
    name: 'hasSponsorLabel',
    default: true
  }, {
    name: 'backgroundColor',
    default: 'grey'
  }, {
    name: 'hasImage',
    default: false
  }, {
    name: 'imageUrl',
    default: ''
  }]
}) {
  /* overrides */
  exportDOM(options = {}) {
    return renderCallToActionNode(this, options);
  }
}
const $createCallToActionNode = dataset => {
  return new CallToActionNode(dataset);
};
const $isCallToActionNode = node => {
  return node instanceof CallToActionNode;
};

class AsideParser {
  constructor(NodeClass) {
    this.NodeClass = NodeClass;
  }
  get DOMConversionMap() {
    const self = this;
    return {
      blockquote: () => ({
        conversion(domNode) {
          const isBigQuote = domNode.classList?.contains('kg-blockquote-alt');
          if (domNode.tagName === 'BLOCKQUOTE' && isBigQuote) {
            const node = new self.NodeClass();
            return {
              node
            };
          }
          return null;
        },
        priority: 0
      })
    };
  }
}

/* eslint-disable ghost/filenames/match-exported-class */
class AsideNode extends ElementNode {
  static getType() {
    return 'aside';
  }
  static clone(node) {
    return new this(node.__key);
  }
  static get urlTransformMap() {
    return {};
  }
  constructor(key) {
    super(key);
  }
  static importJSON(serializedNode) {
    const node = new this();
    node.setFormat(serializedNode.format);
    node.setIndent(serializedNode.indent);
    node.setDirection(serializedNode.direction);
    return node;
  }
  exportJSON() {
    const dataset = {
      ...super.exportJSON(),
      type: 'aside',
      version: 1
    };
    return dataset;
  }
  static importDOM() {
    const parser = new AsideParser(this);
    return parser.DOMConversionMap;
  }

  /* c8 ignore start */
  createDOM() {
    return document.createElement('div');
  }
  updateDOM() {
    return false;
  }
  isInline() {
    return false;
  }
  extractWithChild() {
    return true;
  }
  /* c8 ignore stop */
}
function $createAsideNode() {
  return new AsideNode();
}
function $isAsideNode(node) {
  return node instanceof AsideNode;
}

function renderHorizontalRuleNode(_, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const element = document.createElement('hr');
  return {
    element
  };
}

function parseHorizontalRuleNode(HorizontalRuleNode) {
  return {
    hr: () => ({
      conversion() {
        const node = new HorizontalRuleNode();
        return {
          node
        };
      },
      priority: 0
    })
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class HorizontalRuleNode extends generateDecoratorNode({
  nodeType: 'horizontalrule'
}) {
  static importDOM() {
    return parseHorizontalRuleNode(this);
  }
  exportDOM(options = {}) {
    return renderHorizontalRuleNode(this, options);
  }
  getTextContent() {
    return '---\n\n';
  }
  hasEditMode() {
    return false;
  }
}
function $createHorizontalRuleNode() {
  return new HorizontalRuleNode();
}
function $isHorizontalRuleNode(node) {
  return node instanceof HorizontalRuleNode;
}

function renderHtmlNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const html = node.html;
  if (!html) {
    return renderEmptyContainer(document);
  }
  const wrappedHtml = `\n<!--kg-card-begin: html-->\n${html}\n<!--kg-card-end: html-->\n`;
  const textarea = document.createElement('textarea');
  textarea.value = wrappedHtml;
  if (options.feature?.contentVisibility || node.visibility) {
    const renderOutput = {
      element: textarea,
      type: 'value'
    };
    return renderWithVisibility(renderOutput, node.visibility, options);
  }

  // `type: 'value'` will render the value of the textarea element
  return {
    element: textarea,
    type: 'value'
  };
}

function parseHtmlNode(HtmlNode) {
  return {
    '#comment': nodeElem => {
      if (nodeElem.nodeType === 8 && nodeElem.nodeValue.trim().match(/^kg-card-begin:\s?html$/)) {
        return {
          conversion(domNode) {
            let html = [];
            let nextNode = domNode.nextSibling;
            while (nextNode && !isHtmlEndComment(nextNode)) {
              let currentNode = nextNode;
              html.push(currentNode.outerHTML);
              nextNode = currentNode.nextSibling;
              // remove nodes as we go so that they don't go through the parser
              currentNode.remove();
            }
            let payload = {
              html: html.join('\n').trim()
            };
            const node = new HtmlNode(payload);
            return {
              node
            };
          },
          priority: 0
        };
      }
      return null;
    },
    table: nodeElem => {
      if (nodeElem.nodeType === 1 && nodeElem.tagName === 'TABLE' && nodeElem.parentNode.tagName !== 'TABLE') {
        return {
          conversion(domNode) {
            const payload = {
              html: domNode.outerHTML
            };
            const node = new HtmlNode(payload);
            return {
              node
            };
          },
          priority: 0
        };
      }
      return null;
    }
  };
}
function isHtmlEndComment(node) {
  return node && node.nodeType === 8 && node.nodeValue.trim().match(/^kg-card-end:\s?html$/);
}

/* eslint-disable ghost/filenames/match-exported-class */
class HtmlNode extends generateDecoratorNode({
  nodeType: 'html',
  hasVisibility: true,
  properties: [{
    name: 'html',
    default: '',
    urlType: 'html',
    wordCount: true
  }]
}) {
  static importDOM() {
    return parseHtmlNode(this);
  }
  exportDOM(options = {}) {
    return renderHtmlNode(this, options);
  }
  isEmpty() {
    return !this.__html;
  }
}
function $createHtmlNode(dataset) {
  return new HtmlNode(dataset);
}
function $isHtmlNode(node) {
  return node instanceof HtmlNode;
}

function parseToggleNode(ToggleNode) {
  return {
    div: nodeElem => {
      const isKgToggleCard = nodeElem.classList?.contains('kg-toggle-card');
      if (nodeElem.tagName === 'DIV' && isKgToggleCard) {
        return {
          conversion(domNode) {
            const headingNode = domNode.querySelector('.kg-toggle-heading-text');
            const heading = headingNode.textContent;
            const contentNode = domNode.querySelector('.kg-toggle-content');
            const content = contentNode.textContent;
            const payload = {
              heading,
              content
            };
            const node = new ToggleNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

function cardTemplate$5({
  node
}) {
  return `
        <div class="kg-card kg-toggle-card" data-kg-toggle-state="close">
            <div class="kg-toggle-heading">
                <h4 class="kg-toggle-heading-text">${node.heading}</h4>
                <button class="kg-toggle-card-icon" aria-label="Expand toggle to read content">
                    <svg id="Regular" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path class="cls-1" d="M23.25,7.311,12.53,18.03a.749.749,0,0,1-1.06,0L.75,7.311"></path>
                    </svg>
                </button>
            </div>
            <div class="kg-toggle-content">${node.content}</div>
        </div>
        `;
}
function emailCardTemplate$1({
  node
}) {
  return `
        <div style="background: transparent;
        border: 1px solid rgba(124, 139, 154, 0.25); border-radius: 4px; padding: 20px; margin-bottom: 1.5em;">
            <h4 style="font-size: 1.375rem; font-weight: 600; margin-bottom: 8px; margin-top:0px">${node.heading}</h4>
            <div style="font-size: 1rem; line-height: 1.5; margin-bottom: -1.5em;">${node.content}</div>
        </div>
        `;
}
function renderToggleNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const htmlString = options.target === 'email' ? emailCardTemplate$1({
    node
  }) : cardTemplate$5({
    node
  });
  const container = document.createElement('div');
  container.innerHTML = htmlString.trim();
  const element = container.firstElementChild;
  return {
    element
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class ToggleNode extends generateDecoratorNode({
  nodeType: 'toggle',
  properties: [{
    name: 'heading',
    default: '',
    urlType: 'html',
    wordCount: true
  }, {
    name: 'content',
    default: '',
    urlType: 'html',
    wordCount: true
  }]
}) {
  static importDOM() {
    return parseToggleNode(this);
  }
  exportDOM(options = {}) {
    return renderToggleNode(this, options);
  }
}
const $createToggleNode = dataset => {
  return new ToggleNode(dataset);
};
function $isToggleNode(node) {
  return node instanceof ToggleNode;
}

function parseButtonNode(ButtonNode) {
  return {
    div: nodeElem => {
      const isButtonCard = nodeElem.classList?.contains('kg-button-card');
      if (nodeElem.tagName === 'DIV' && isButtonCard) {
        return {
          conversion(domNode) {
            const alignmentClass = nodeElem.className.match(/kg-align-(left|center)/);
            let alignment;
            if (alignmentClass) {
              alignment = alignmentClass[1];
            }
            const buttonNode = domNode?.querySelector('.kg-btn');
            const buttonUrl = buttonNode.getAttribute('href');
            const buttonText = buttonNode.textContent;
            const payload = {
              buttonText: buttonText,
              alignment: alignment,
              buttonUrl: buttonUrl
            };
            const node = new ButtonNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

function renderButtonNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  if (!node.buttonUrl || node.buttonUrl.trim() === '') {
    return renderEmptyContainer(document);
  }
  if (options.target === 'email') {
    return emailTemplate$3(node, document);
  } else {
    return frontendTemplate$1(node, document);
  }
}
function frontendTemplate$1(node, document) {
  const cardClasses = getCardClasses$2(node);
  const cardDiv = document.createElement('div');
  cardDiv.setAttribute('class', cardClasses);
  const button = document.createElement('a');
  button.setAttribute('href', node.buttonUrl);
  button.setAttribute('class', 'kg-btn kg-btn-accent');
  button.textContent = node.buttonText || 'Button Title';
  cardDiv.appendChild(button);
  return {
    element: cardDiv
  };
}
function emailTemplate$3(node, document) {
  const parent = document.createElement('p');
  const buttonDiv = document.createElement('div');
  buttonDiv.setAttribute('class', 'btn btn-accent');
  parent.appendChild(buttonDiv);
  const table = document.createElement('table');
  table.setAttribute('border', 0);
  table.setAttribute('cellspacing', 0);
  table.setAttribute('cellpadding', 0);
  table.setAttribute('align', node.alignment);
  buttonDiv.appendChild(table);
  const row = document.createElement('tr');
  table.appendChild(row);
  const cell = document.createElement('td');
  cell.setAttribute('align', 'center');
  row.appendChild(cell);
  const button = document.createElement('a');
  button.setAttribute('href', node.buttonUrl);
  button.textContent = node.buttonText;
  cell.appendChild(button);
  return {
    element: parent
  };
}
function getCardClasses$2(node) {
  let cardClasses = ['kg-card kg-button-card'];
  if (node.alignment) {
    cardClasses.push(`kg-align-${node.alignment}`);
  }
  return cardClasses.join(' ');
}

/* eslint-disable ghost/filenames/match-exported-class */
class ButtonNode extends generateDecoratorNode({
  nodeType: 'button',
  properties: [{
    name: 'buttonText',
    default: ''
  }, {
    name: 'alignment',
    default: 'center'
  }, {
    name: 'buttonUrl',
    default: '',
    urlType: 'url'
  }]
}) {
  static importDOM() {
    return parseButtonNode(this);
  }
  exportDOM(options = {}) {
    return renderButtonNode(this, options);
  }
}
const $createButtonNode = dataset => {
  return new ButtonNode(dataset);
};
function $isButtonNode(node) {
  return node instanceof ButtonNode;
}

function parseBookmarkNode(BookmarkNode) {
  return {
    figure: nodeElem => {
      const isKgBookmarkCard = nodeElem.classList?.contains('kg-bookmark-card');
      if (nodeElem.tagName === 'FIGURE' && isKgBookmarkCard) {
        return {
          conversion(domNode) {
            const url = domNode?.querySelector('.kg-bookmark-container')?.getAttribute('href');
            const icon = domNode?.querySelector('.kg-bookmark-icon')?.src;
            const title = domNode?.querySelector('.kg-bookmark-title')?.textContent;
            const description = domNode?.querySelector('.kg-bookmark-description')?.textContent;
            const author = domNode?.querySelector('.kg-bookmark-publisher')?.textContent; // NOTE: This is NOT in error. The classes are reversed for theme backwards-compatibility.
            const publisher = domNode?.querySelector('.kg-bookmark-author')?.textContent; // NOTE: This is NOT in error. The classes are reversed for theme backwards-compatibility.
            const thumbnail = domNode?.querySelector('.kg-bookmark-thumbnail img')?.src;
            const caption = domNode?.querySelector('figure.kg-bookmark-card figcaption')?.textContent;
            const payload = {
              url: url,
              metadata: {
                icon: icon,
                title: title,
                description: description,
                author: author,
                publisher: publisher,
                thumbnail: thumbnail
              },
              caption: caption
            };
            const node = new BookmarkNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    },
    div: nodeElem => {
      if (nodeElem.nodeType === 1 && nodeElem.tagName === 'DIV' && nodeElem.className.match(/graf--mixtapeEmbed/)) {
        return {
          conversion(domNode) {
            // Grab the relevant elements - Anchor wraps most of the data
            const anchorElement = domNode.querySelector('.markup--mixtapeEmbed-anchor');
            const titleElement = anchorElement.querySelector('.markup--mixtapeEmbed-strong');
            const descElement = anchorElement.querySelector('.markup--mixtapeEmbed-em');
            // Image is a top level field inside it's own a tag
            const imgElement = domNode.querySelector('.mixtapeImage');
            domNode.querySelector('br').remove();

            // Grab individual values from the elements
            const url = anchorElement.getAttribute('href');
            let title = '';
            let description = '';
            let thumbnail = '';
            if (titleElement && titleElement.innerHTML) {
              title = titleElement.innerHTML.trim();
              // Cleanup anchor so we can see what's left now that we've processed title
              anchorElement.removeChild(titleElement);
            }
            if (descElement && descElement.innerHTML) {
              description = descElement.innerHTML.trim();
              // Cleanup anchor so we can see what's left now that we've processed description
              anchorElement.removeChild(descElement);
            }

            // Publisher is the remaining text in the anchor, once title & desc are removed
            let publisher = anchorElement.innerHTML.trim();

            // Image is optional,
            // The element usually still exists with an additional has.mixtapeImage--empty class and has no background image
            if (imgElement && imgElement.style['background-image']) {
              thumbnail = imgElement.style['background-image'].match(/url\(([^)]*?)\)/)[1];
            }
            let payload = {
              url,
              metadata: {
                title,
                description,
                publisher,
                thumbnail
              }
            };
            const node = new BookmarkNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

/**
 * Escape HTML special characters
 * @param {string} unsafe
 * @returns string
 */
function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function truncateHtml(text, maxLength, maxLengthMobile) {

  // Handle text shorter than mobile length
  if (text.length <= maxLengthMobile) {
    return escapeHtml(text);
  }
  if (text && text.length > maxLengthMobile) {
    let ellipsis = '';
    if (text.length > maxLengthMobile && text.length <= maxLength) {
      ellipsis = '<span class="hide-desktop">…</span>';
    } else if (text.length > maxLength) {
      ellipsis = '…';
    }
    return escapeHtml(text.substring(0, maxLengthMobile - 1)) + '<span class="desktop-only">' + escapeHtml(text.substring(maxLengthMobile - 1, maxLength - 1)) + '</span>' + ellipsis;
  } else {
    return escapeHtml(text ?? '');
  }
}

function renderBookmarkNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  if (!node.url || node.url.trim() === '') {
    return renderEmptyContainer(document);
  }
  if (options.target === 'email') {
    return emailTemplate$2(node, document);
  } else {
    return frontendTemplate(node, document);
  }
}
function emailTemplate$2(node, document) {
  const title = escapeHtml(node.title);
  const publisher = escapeHtml(node.publisher);
  const author = escapeHtml(node.author);
  const description = escapeHtml(node.description);
  const icon = node.icon;
  const url = node.url;
  const thumbnail = node.thumbnail;
  const caption = node.caption;
  const element = document.createElement('div');
  const html = `
        <!--[if !mso !vml]-->
            <figure class="kg-card kg-bookmark-card ${caption ? `kg-card-hascaption` : ''}">
                <a class="kg-bookmark-container" href="${url}">
                    <div class="kg-bookmark-content">
                        <div class="kg-bookmark-title">${title}</div>
                        <div class="kg-bookmark-description">${truncateHtml(description, 120, 90)}</div>
                        <div class="kg-bookmark-metadata">
                            ${icon ? `<img class="kg-bookmark-icon" src="${icon}" alt="">` : ''}
                            ${publisher ? `<span class="kg-bookmark-author" src="${publisher}">${publisher}</span>` : ''}
                            ${author ? `<span class="kg-bookmark-publisher" src="${author}">${author}</span>` : ''}
                        </div>
                    </div>
                    ${thumbnail ? `<div class="kg-bookmark-thumbnail" style="background-image: url('${thumbnail}')">
                        <img src="${thumbnail}" alt="" onerror="this.style.display='none'"></div>` : ''}
                </a>
                ${caption ? `<figcaption>${caption}</figcaption>` : ''}
            </figure>
        <!--[endif]-->
        <!--[if vml]>
            <table class="kg-card kg-bookmark-card--outlook" style="margin: 0; padding: 0; width: 100%; border: 1px solid #e5eff5; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; border-collapse: collapse; border-spacing: 0;" width="100%">
                <tr>
                    <td width="100%" style="padding: 20px;">
                        <table style="margin: 0; padding: 0; border-collapse: collapse; border-spacing: 0;">
                            <tr>
                                <td class="kg-bookmark-title--outlook">
                                    <a href="${url}" style="text-decoration: none; color: #15212A; font-size: 15px; line-height: 1.5em; font-weight: 600;">
                                        ${title}
                                    </a>
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <div class="kg-bookmark-description--outlook">
                                        <a href="${url}" style="text-decoration: none; margin-top: 12px; color: #738a94; font-size: 13px; line-height: 1.5em; font-weight: 400;">
                                            ${truncateHtml(description, 120, 90)}
                                        </a>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <td class="kg-bookmark-metadata--outlook" style="padding-top: 14px; color: #15212A; font-size: 13px; font-weight: 400; line-height: 1.5em;">
                                    <table style="margin: 0; padding: 0; border-collapse: collapse; border-spacing: 0;">
                                        <tr>
                                            ${icon ? `
                                                <td valign="middle" class="kg-bookmark-icon--outlook" style="padding-right: 8px; font-size: 0; line-height: 1.5em;">
                                                    <a href="${url}" style="text-decoration: none; color: #15212A;">
                                                        <img src="${icon}" width="22" height="22" alt=" ">
                                                    </a>
                                                </td>
                                            ` : ''}
                                            <td valign="middle" class="kg-bookmark-byline--outlook">
                                                <a href="${url}" style="text-decoration: none; color: #15212A;">
                                                    ${publisher}
                                                    ${author ? `&nbsp;&#x2022;&nbsp;` : ''}
                                                    ${author}
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            <div class="kg-bookmark-spacer--outlook" style="height: 1.5em;">&nbsp;</div>
        <![endif]-->`;
  element.innerHTML = html;
  return {
    element
  };
}
function frontendTemplate(node, document) {
  const element = document.createElement('figure');
  const caption = node.caption;
  let cardClass = 'kg-card kg-bookmark-card';
  if (caption) {
    cardClass += ' kg-card-hascaption';
  }
  element.setAttribute('class', cardClass);
  const container = document.createElement('a');
  container.setAttribute('class', 'kg-bookmark-container');
  container.href = node.url;
  element.appendChild(container);
  const content = document.createElement('div');
  content.setAttribute('class', 'kg-bookmark-content');
  container.appendChild(content);
  const title = document.createElement('div');
  title.setAttribute('class', 'kg-bookmark-title');
  title.textContent = node.title;
  content.appendChild(title);
  const description = document.createElement('div');
  description.setAttribute('class', 'kg-bookmark-description');
  description.textContent = node.description;
  content.appendChild(description);
  const metadata = document.createElement('div');
  metadata.setAttribute('class', 'kg-bookmark-metadata');
  content.appendChild(metadata);
  metadata.icon = node.icon;
  if (metadata.icon) {
    const icon = document.createElement('img');
    icon.setAttribute('class', 'kg-bookmark-icon');
    icon.src = metadata.icon;
    icon.alt = '';
    metadata.appendChild(icon);
  }
  metadata.publisher = node.publisher;
  if (metadata.publisher) {
    const publisher = document.createElement('span');
    publisher.setAttribute('class', 'kg-bookmark-author'); // NOTE: This is NOT in error. The classes are reversed for theme backwards-compatibility.
    publisher.textContent = metadata.publisher;
    metadata.appendChild(publisher);
  }
  metadata.author = node.author;
  if (metadata.author) {
    const author = document.createElement('span');
    author.setAttribute('class', 'kg-bookmark-publisher'); // NOTE: This is NOT in error. The classes are reversed for theme backwards-compatibility.
    author.textContent = metadata.author;
    metadata.appendChild(author);
  }
  metadata.thumbnail = node.thumbnail;
  if (metadata.thumbnail) {
    const thumbnailDiv = document.createElement('div');
    thumbnailDiv.setAttribute('class', 'kg-bookmark-thumbnail');
    container.appendChild(thumbnailDiv);
    const thumbnail = document.createElement('img');
    thumbnail.src = metadata.thumbnail;
    thumbnail.alt = '';
    thumbnail.setAttribute('onerror', `this.style.display = 'none'`); // Hide thumbnail div if image fails to load
    thumbnailDiv.appendChild(thumbnail);
  }
  if (caption) {
    const figCaption = document.createElement('figcaption');
    figCaption.innerHTML = caption;
    element.appendChild(figCaption);
  }
  return {
    element
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class BookmarkNode extends generateDecoratorNode({
  nodeType: 'bookmark',
  properties: [{
    name: 'title',
    default: '',
    wordCount: true
  }, {
    name: 'description',
    default: '',
    wordCount: true
  }, {
    name: 'url',
    default: '',
    urlType: 'url',
    wordCount: true
  }, {
    name: 'caption',
    default: '',
    wordCount: true
  }, {
    name: 'author',
    default: ''
  }, {
    name: 'publisher',
    default: ''
  }, {
    name: 'icon',
    urlPath: 'metadata.icon',
    default: '',
    urlType: 'url'
  }, {
    name: 'thumbnail',
    urlPath: 'metadata.thumbnail',
    default: '',
    urlType: 'url'
  }]
}) {
  static importDOM() {
    return parseBookmarkNode(this);
  }
  exportDOM(options = {}) {
    return renderBookmarkNode(this, options);
  }

  /* override */
  constructor({
    url,
    metadata,
    caption
  } = {}, key) {
    super(key);
    this.__url = url || '';
    this.__icon = metadata?.icon || '';
    this.__title = metadata?.title || '';
    this.__description = metadata?.description || '';
    this.__author = metadata?.author || '';
    this.__publisher = metadata?.publisher || '';
    this.__thumbnail = metadata?.thumbnail || '';
    this.__caption = caption || '';
  }

  /* @override */
  getDataset() {
    const self = this.getLatest();
    return {
      url: self.__url,
      metadata: {
        icon: self.__icon,
        title: self.__title,
        description: self.__description,
        author: self.__author,
        publisher: self.__publisher,
        thumbnail: self.__thumbnail
      },
      caption: self.__caption
    };
  }

  /* @override */
  static importJSON(serializedNode) {
    const {
      url,
      metadata,
      caption
    } = serializedNode;
    const node = new this({
      url,
      metadata,
      caption
    });
    return node;
  }

  /* @override */
  exportJSON() {
    const dataset = {
      type: 'bookmark',
      version: 1,
      url: this.url,
      metadata: {
        icon: this.icon,
        title: this.title,
        description: this.description,
        author: this.author,
        publisher: this.publisher,
        thumbnail: this.thumbnail
      },
      caption: this.caption
    };
    return dataset;
  }
  isEmpty() {
    return !this.url;
  }
}
const $createBookmarkNode = dataset => {
  return new BookmarkNode(dataset);
};
function $isBookmarkNode(node) {
  return node instanceof BookmarkNode;
}

function sizeToBytes(size) {
  if (!size) {
    return 0;
  }
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const sizeParts = size.split(' ');
  const sizeNumber = parseFloat(sizeParts[0]);
  const sizeUnit = sizeParts[1];
  const sizeUnitIndex = sizes.indexOf(sizeUnit);
  if (sizeUnitIndex === -1) {
    return 0;
  }
  return Math.round(sizeNumber * Math.pow(1024, sizeUnitIndex));
}
function bytesToSize(bytes) {
  if (!bytes) {
    return '0 Byte';
  }
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) {
    return '0 Byte';
  }
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return Math.round(bytes / Math.pow(1024, i)) + ' ' + sizes[i];
}

function renderFileNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  if (!node.src || node.src.trim() === '') {
    return renderEmptyContainer(document);
  }
  if (options.target === 'email') {
    return emailTemplate$1(node, document, options);
  } else {
    return cardTemplate$4(node, document);
  }
}
function emailTemplate$1(node, document, options) {
  let iconCls;
  if (!node.fileTitle && !node.fileCaption) {
    iconCls = 'margin-top: 6px; height: 20px; width: 20px; max-width: 20px; padding-top: 4px; padding-bottom: 4px;';
  } else {
    iconCls = 'margin-top: 6px; height: 24px; width: 24px; max-width: 24px;';
  }
  const html = `
        <table cellspacing="0" cellpadding="4" border="0" class="kg-file-card" width="100%">
            <tr>
                <td>
                    <table cellspacing="0" cellpadding="0" border="0" width="100%">
                        <tr>
                            <td valign="middle" style="vertical-align: middle;">
                                ${node.fileTitle ? `
                                <table cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td>
                                    <a href="${escapeHtml(options.postUrl)}" class="kg-file-title">${escapeHtml(node.fileTitle)}</a>
                                </td></tr></table>
                                ` : ``}
                                ${node.fileCaption ? `
                                <table cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td>
                                    <a href="${escapeHtml(options.postUrl)}" class="kg-file-description">${escapeHtml(node.fileCaption)}</a>
                                </td></tr></table>
                                ` : ``}
                                <table cellspacing="0" cellpadding="0" border="0" width="100%"><tr><td>
                                    <a href="${escapeHtml(options.postUrl)}" class="kg-file-meta"><span class="kg-file-name">${escapeHtml(node.fileName)}</span> &bull; ${bytesToSize(node.fileSize)}</a>
                                </td></tr></table>
                            </td>
                            <td width="80" valign="middle" class="kg-file-thumbnail">
                                <a href="${escapeHtml(options.postUrl)}" style="display: block; top: 0; right: 0; bottom: 0; left: 0;">
                                    <img src="https://static.ghost.org/v4.0.0/images/download-icon-darkmode.png" style="${escapeHtml(iconCls)}">
                                </a>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    `;
  const container = document.createElement('div');
  container.innerHTML = html.trim();
  return {
    element: container.firstElementChild
  };
}
function cardTemplate$4(node, document) {
  const card = document.createElement('div');
  card.setAttribute('class', 'kg-card kg-file-card');
  const container = document.createElement('a');
  container.setAttribute('class', 'kg-file-card-container');
  container.setAttribute('href', node.src);
  container.setAttribute('title', 'Download');
  container.setAttribute('download', '');
  const contents = document.createElement('div');
  contents.setAttribute('class', 'kg-file-card-contents');
  const title = document.createElement('div');
  title.setAttribute('class', 'kg-file-card-title');
  title.textContent = node.fileTitle || '';
  const caption = document.createElement('div');
  caption.setAttribute('class', 'kg-file-card-caption');
  caption.textContent = node.fileCaption || '';
  const metadata = document.createElement('div');
  metadata.setAttribute('class', 'kg-file-card-metadata');
  const filename = document.createElement('div');
  filename.setAttribute('class', 'kg-file-card-filename');
  filename.textContent = node.fileName || '';
  const filesize = document.createElement('div');
  filesize.setAttribute('class', 'kg-file-card-filesize');
  filesize.textContent = node.formattedFileSize || '';
  metadata.appendChild(filename);
  metadata.appendChild(filesize);
  contents.appendChild(title);
  contents.appendChild(caption);
  contents.appendChild(metadata);
  container.appendChild(contents);
  const icon = document.createElement('div');
  icon.setAttribute('class', 'kg-file-card-icon');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = '.a{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.5px;}';
  defs.appendChild(style);
  const titleElement = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  titleElement.textContent = 'download-circle';
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('class', 'a');
  polyline.setAttribute('points', '8.25 14.25 12 18 15.75 14.25');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('class', 'a');
  line.setAttribute('x1', '12');
  line.setAttribute('y1', '6.75');
  line.setAttribute('x2', '12');
  line.setAttribute('y2', '18');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('class', 'a');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '11.25');
  svg.appendChild(defs);
  svg.appendChild(titleElement);
  svg.appendChild(polyline);
  svg.appendChild(line);
  svg.appendChild(circle);
  icon.appendChild(svg);
  container.appendChild(icon);
  card.appendChild(container);
  return {
    element: card
  };
}

function parseFileNode(FileNode) {
  return {
    div: nodeElem => {
      const isKgFileCard = nodeElem.classList?.contains('kg-file-card');
      if (nodeElem.tagName === 'DIV' && isKgFileCard) {
        return {
          conversion(domNode) {
            const link = domNode.querySelector('a');
            const src = link.getAttribute('href');
            const fileTitle = domNode.querySelector('.kg-file-card-title')?.textContent || '';
            const fileCaption = domNode.querySelector('.kg-file-card-caption')?.textContent || '';
            const fileName = domNode.querySelector('.kg-file-card-filename')?.textContent || '';
            let fileSize = sizeToBytes(domNode.querySelector('.kg-file-card-filesize')?.textContent || '');
            const payload = {
              src,
              fileTitle,
              fileCaption,
              fileName,
              fileSize
            };
            const node = new FileNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class FileNode extends generateDecoratorNode({
  nodeType: 'file',
  properties: [{
    name: 'src',
    default: '',
    urlType: 'url'
  }, {
    name: 'fileTitle',
    default: '',
    wordCount: true
  }, {
    name: 'fileCaption',
    default: '',
    wordCount: true
  }, {
    name: 'fileName',
    default: ''
  }, {
    name: 'fileSize',
    default: ''
  }]
}) {
  /* @override */
  exportJSON() {
    const {
      src,
      fileTitle,
      fileCaption,
      fileName,
      fileSize
    } = this;
    const isBlob = src && src.startsWith('data:');
    return {
      type: 'file',
      src: isBlob ? '<base64String>' : src,
      fileTitle,
      fileCaption,
      fileName,
      fileSize
    };
  }
  static importDOM() {
    return parseFileNode(this);
  }
  exportDOM(options = {}) {
    return renderFileNode(this, options);
  }
  get formattedFileSize() {
    return bytesToSize(this.fileSize);
  }
}
function $isFileNode(node) {
  return node instanceof FileNode;
}
const $createFileNode = dataset => {
  return new FileNode(dataset);
};

function slugify(str) {
  // Remove HTML tags
  str = str.replace(/<[^>]*>?/gm, '');

  // Remove any non-word character with whitespace
  str = str.replace(/[^\w\s]/gi, '');

  // Replace any whitespace character with a dash
  str = str.replace(/\s+/g, '-');

  // Convert to lowercase
  str = str.toLowerCase();
  return str;
}

function renderHeaderNodeV1(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  if (!node.header && !node.subheader && (!node.buttonEnabled || !node.buttonUrl || !node.buttonText)) {
    return renderEmptyContainer(document);
  }
  const templateData = {
    size: node.size,
    style: node.style,
    buttonEnabled: node.buttonEnabled && Boolean(node.buttonUrl) && Boolean(node.buttonText),
    buttonUrl: node.buttonUrl,
    buttonText: node.buttonText,
    header: node.header,
    headerSlug: slugify(node.header),
    subheader: node.subheader,
    subheaderSlug: slugify(node.subheader),
    hasHeader: !!node.header,
    hasSubheader: !!node.subheader && !!node.subheader.replace(/(<br>)+$/g).trim(),
    backgroundImageStyle: node.style === 'image' ? `background-image: url(${node.backgroundImageSrc})` : '',
    backgroundImageSrc: node.backgroundImageSrc
  };
  const div = document.createElement('div');
  div.classList.add('kg-card', 'kg-header-card', 'kg-width-full', `kg-size-${templateData.size}`, `kg-style-${templateData.style}`);
  div.setAttribute('data-kg-background-image', templateData.backgroundImageSrc);
  div.setAttribute('style', templateData.backgroundImageStyle);
  if (templateData.hasHeader) {
    const headerElement = document.createElement('h2');
    headerElement.classList.add('kg-header-card-header');
    headerElement.setAttribute('id', templateData.headerSlug);
    headerElement.innerHTML = templateData.header;
    div.appendChild(headerElement);
  }
  if (templateData.hasSubheader) {
    const subheaderElement = document.createElement('h3');
    subheaderElement.classList.add('kg-header-card-subheader');
    subheaderElement.setAttribute('id', templateData.subheaderSlug);
    subheaderElement.innerHTML = templateData.subheader;
    div.appendChild(subheaderElement);
  }
  if (templateData.buttonEnabled) {
    const buttonElement = document.createElement('a');
    buttonElement.classList.add('kg-header-card-button');
    buttonElement.setAttribute('href', templateData.buttonUrl);
    buttonElement.textContent = templateData.buttonText;
    div.appendChild(buttonElement);
  }
  return {
    element: div
  };
}

function parseHeaderNode(HeaderNode) {
  return {
    div: nodeElem => {
      const isHeaderCardv1 = nodeElem.classList?.contains('kg-header-card') && !nodeElem.classList?.contains('kg-v2');
      const isHeaderCardv2 = nodeElem.classList?.contains('kg-header-card') && nodeElem.classList?.contains('kg-v2');
      // v1 parser
      if (nodeElem.tagName === 'DIV' && isHeaderCardv1) {
        return {
          conversion(domNode) {
            const div = domNode;
            const headerElement = domNode.querySelector('.kg-header-card-header');
            const subheaderElement = domNode.querySelector('.kg-header-card-subheader');
            const buttonElement = domNode.querySelector('.kg-header-card-button');
            const size = div.classList.contains('kg-size-large') ? 'large' : 'small';
            const style = div.classList.contains('kg-style-image') ? 'image' : 'text';
            const backgroundImageSrc = div.getAttribute('data-kg-background-image');
            const hasHeader = !!headerElement;
            const header = hasHeader ? headerElement.textContent : '';
            const hasSubheader = !!subheaderElement;
            const subheader = hasSubheader ? subheaderElement.textContent : '';
            const buttonEnabled = !!buttonElement;
            const buttonUrl = buttonEnabled ? buttonElement.getAttribute('href') : '';
            const buttonText = buttonEnabled ? buttonElement.textContent : '';
            const payload = {
              size,
              style,
              backgroundImageSrc,
              header,
              subheader,
              buttonEnabled,
              buttonUrl,
              buttonText,
              version: 1
            };
            const node = new HeaderNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }

      // V2 parser
      if (nodeElem.tagName === 'DIV' && isHeaderCardv2) {
        return {
          conversion(domNode) {
            const div = domNode;
            const headerElement = div.querySelector('.kg-header-card-heading');
            const subheaderElement = div.querySelector('.kg-header-card-subheading');
            const buttonElement = div.querySelector('.kg-header-card-button');
            const alignment = div.classList.contains('kg-align-center') ? 'center' : '';
            const backgroundImageSrc = div.querySelector('.kg-header-card-image')?.getAttribute('src');
            const layout = backgroundImageSrc ? 'split' : '';
            const backgroundColor = div.classList.contains('kg-style-accent') ? 'accent' : div.getAttribute('data-background-color');
            const buttonColor = buttonElement?.getAttribute('data-button-color') || '';
            const textColor = headerElement?.getAttribute('data-text-color') || '';
            const buttonTextColor = buttonElement?.getAttribute('data-button-text-color') || '';
            const header = headerElement?.textContent || '';
            const subheader = subheaderElement?.textContent || '';
            const buttonEnabled = !!buttonElement;
            const buttonUrl = buttonEnabled ? buttonElement.getAttribute('href') : '';
            const buttonText = buttonEnabled ? buttonElement.textContent : '';
            const payload = {
              backgroundColor,
              buttonColor,
              alignment,
              backgroundImageSrc,
              layout,
              textColor,
              header,
              subheader,
              buttonEnabled,
              buttonUrl,
              buttonText,
              buttonTextColor,
              version: 2
            };
            const node = new HeaderNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

function cardTemplate$3(nodeData, options = {}) {
  const cardClasses = getCardClasses$1(nodeData).join(' ');
  const backgroundAccent = nodeData.backgroundColor === 'accent' ? 'kg-style-accent' : '';
  const buttonAccent = nodeData.buttonColor === 'accent' ? 'kg-style-accent' : '';
  const buttonStyle = nodeData.buttonColor !== 'accent' ? `background-color: ${nodeData.buttonColor};` : ``;
  const alignment = nodeData.alignment === 'center' ? 'kg-align-center' : '';
  const backgroundImageStyle = nodeData.backgroundColor !== 'accent' && (!nodeData.backgroundImageSrc || nodeData.layout === 'split') ? `background-color: ${nodeData.backgroundColor}` : '';
  let imgTemplate = '';
  if (nodeData.backgroundImageSrc) {
    const bgImage = {
      src: nodeData.backgroundImageSrc,
      width: nodeData.backgroundImageWidth,
      height: nodeData.backgroundImageHeight
    };
    const srcsetValue = getSrcsetAttribute({
      ...bgImage,
      options
    });
    const srcset = srcsetValue ? `srcset="${srcsetValue}"` : '';
    imgTemplate = `
            <picture><img class="kg-header-card-image" src="${bgImage.src}" ${srcset} loading="lazy" alt="" /></picture>
        `;
  }
  const header = () => {
    if (nodeData.header) {
      return `<h2 id="${slugify(nodeData.header)}" class="kg-header-card-heading" style="color: ${nodeData.textColor};" data-text-color="${nodeData.textColor}">${nodeData.header}</h2>`;
    }
    return '';
  };
  const subheader = () => {
    if (nodeData.subheader) {
      return `<p id="${slugify(nodeData.subheader)}" class="kg-header-card-subheading" style="color: ${nodeData.textColor};" data-text-color="${nodeData.textColor}">${nodeData.subheader}</p>`;
    }
    return '';
  };
  const button = () => {
    if (nodeData.buttonEnabled && nodeData.buttonUrl && nodeData.buttonUrl.trim() !== '') {
      return `<a href="${nodeData.buttonUrl}" class="kg-header-card-button ${buttonAccent}" style="${buttonStyle}color: ${nodeData.buttonTextColor};" data-button-color="${nodeData.buttonColor}" data-button-text-color="${nodeData.buttonTextColor}">${nodeData.buttonText}</a>`;
    }
    return '';
  };
  const wrapperStyle = backgroundImageStyle ? `style="${backgroundImageStyle};"` : '';
  return `
        <div class="${cardClasses} ${backgroundAccent}" ${wrapperStyle} data-background-color="${nodeData.backgroundColor}">
            ${nodeData.layout !== 'split' ? imgTemplate : ''}
            <div class="kg-header-card-content">
                ${nodeData.layout === 'split' ? imgTemplate : ''}
                <div class="kg-header-card-text ${alignment}">
                    ${header()}
                    ${subheader()}
                    ${button()}
                </div>
            </div>
        </div>
        `;
}
function emailTemplate(nodeData) {
  const backgroundAccent = nodeData.backgroundColor === 'accent' ? `background-color: ${nodeData.accentColor};` : '';
  const buttonAccent = nodeData.buttonColor === 'accent' ? `background-color: ${nodeData.accentColor};` : nodeData.buttonColor;
  const buttonStyle = nodeData.buttonColor !== 'accent' ? `background-color: ${nodeData.buttonColor};` : '';
  const alignment = nodeData.alignment === 'center' ? 'text-align: center;' : '';
  const backgroundImageStyle = nodeData.backgroundImageSrc ? nodeData.layout !== 'split' ? `background-image: url(${nodeData.backgroundImageSrc}); background-size: cover; background-position: center center;` : `background-color: ${nodeData.backgroundColor};` : `background-color: ${nodeData.backgroundColor};`;
  const splitImageStyle = `background-image: url(${nodeData.backgroundImageSrc}); background-size: ${nodeData.backgroundSize !== 'contain' ? 'cover' : '40%'}; background-position: center`;
  return `
        <div class="kg-header-card kg-v2" style="color:${nodeData.textColor}; ${alignment} ${backgroundImageStyle} ${backgroundAccent}">
            ${nodeData.layout === 'split' && nodeData.backgroundImageSrc ? `
                <div class="kg-header-card-image" background="${nodeData.backgroundImageSrc}" style="${splitImageStyle}"></div>
            ` : ''}
            <div class="kg-header-card-content" style="${nodeData.layout === 'split' && nodeData.backgroundSize === 'contain' ? 'padding-top: 0;' : ''}">
                <h2 class="kg-header-card-heading" style="color:${nodeData.textColor};">${nodeData.header}</h2>
                <p class="kg-header-card-subheading" style="color:${nodeData.textColor};">${nodeData.subheader}</p>
                ${nodeData.buttonEnabled && nodeData.buttonUrl && nodeData.buttonUrl.trim() !== '' ? `
                    <a class="kg-header-card-button" href="${nodeData.buttonUrl}" style="color: ${nodeData.buttonTextColor}; ${buttonStyle} ${buttonAccent}">${nodeData.buttonText}</a>
                ` : ''}
            </div>
        </div>
    `;
}
function renderHeaderNodeV2(dataset, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const node = {
    alignment: dataset.__alignment,
    buttonText: dataset.__buttonText,
    buttonEnabled: dataset.__buttonEnabled,
    buttonUrl: dataset.__buttonUrl,
    header: dataset.__header,
    subheader: dataset.__subheader,
    backgroundImageSrc: dataset.__backgroundImageSrc,
    backgroundImageWidth: dataset.__backgroundImageWidth,
    backgroundImageHeight: dataset.__backgroundImageHeight,
    backgroundSize: dataset.__backgroundSize,
    backgroundColor: dataset.__backgroundColor,
    buttonColor: dataset.__buttonColor,
    layout: dataset.__layout,
    textColor: dataset.__textColor,
    buttonTextColor: dataset.__buttonTextColor,
    swapped: dataset.__swapped,
    accentColor: dataset.__accentColor
  };
  if (options.target === 'email') {
    const emailDoc = options.createDocument();
    const emailDiv = emailDoc.createElement('div');
    emailDiv.innerHTML = emailTemplate(node)?.trim();
    return {
      element: emailDiv.firstElementChild
    };
    // return {element: document.createElement('div')}; // TODO
  }
  const htmlString = cardTemplate$3(node, options);
  const element = document.createElement('div');
  element.innerHTML = htmlString?.trim();
  if (node.header === '') {
    const h2Element = element.querySelector('.kg-header-card-heading');
    if (h2Element) {
      h2Element.remove();
    }
  }
  if (node.subheader === '') {
    const pElement = element.querySelector('.kg-header-card-subheading');
    if (pElement) {
      pElement.remove();
    }
  }
  return {
    element: element.firstElementChild
  };
}
function getCardClasses$1(nodeData) {
  let cardClasses = ['kg-card kg-header-card kg-v2'];
  if (nodeData.layout && nodeData.layout !== 'split') {
    cardClasses.push(`kg-width-${nodeData.layout}`);
  }
  if (nodeData.layout === 'split') {
    cardClasses.push('kg-layout-split kg-width-full');
  }
  if (nodeData.swapped && nodeData.layout === 'split') {
    cardClasses.push('kg-swapped');
  }
  if (nodeData.layout && nodeData.layout === 'full') {
    cardClasses.push(`kg-content-wide`);
  }
  if (nodeData.layout === 'split') {
    if (nodeData.backgroundSize === 'contain') {
      cardClasses.push('kg-content-wide');
    }
  }
  return cardClasses;
}

/* eslint-disable ghost/filenames/match-exported-class */

// This is our first node that has a custom version property
class HeaderNode extends generateDecoratorNode({
  nodeType: 'header',
  properties: [{
    name: 'size',
    default: 'small'
  }, {
    name: 'style',
    default: 'dark'
  }, {
    name: 'buttonEnabled',
    default: false
  }, {
    name: 'buttonUrl',
    default: '',
    urlType: 'url'
  }, {
    name: 'buttonText',
    default: ''
  }, {
    name: 'header',
    default: '',
    urlType: 'html',
    wordCount: true
  }, {
    name: 'subheader',
    default: '',
    urlType: 'html',
    wordCount: true
  }, {
    name: 'backgroundImageSrc',
    default: '',
    urlType: 'url'
  },
  // we need to initialize a new version property here so that we can separate v1 and v2
  // we should never remove old properties, only add new ones, as this could break & corrupt existing content
  // ref https://lexical.dev/docs/concepts/serialization#versioning--breaking-changes
  {
    name: 'version',
    default: 1
  }, {
    name: 'accentColor',
    default: '#FF1A75'
  },
  // this is used to have the accent color hex for email
  // v2 properties
  {
    name: 'alignment',
    default: 'center'
  }, {
    name: 'backgroundColor',
    default: '#000000'
  }, {
    name: 'backgroundImageWidth',
    default: null
  }, {
    name: 'backgroundImageHeight',
    default: null
  }, {
    name: 'backgroundSize',
    default: 'cover'
  }, {
    name: 'textColor',
    default: '#FFFFFF'
  }, {
    name: 'buttonColor',
    default: '#ffffff'
  }, {
    name: 'buttonTextColor',
    default: '#000000'
  }, {
    name: 'layout',
    default: 'full'
  },
  // replaces size
  {
    name: 'swapped',
    default: false
  }]
}) {
  static importDOM() {
    return parseHeaderNode(this);
  }
  exportDOM(options = {}) {
    if (this.version === 1) {
      return renderHeaderNodeV1(this, options);
    }
    if (this.version === 2) {
      return renderHeaderNodeV2(this, options);
    }
  }
}
const $createHeaderNode = dataset => {
  return new HeaderNode(dataset);
};
function $isHeaderNode(node) {
  return node instanceof HeaderNode;
}

function parsePaywallNode(PaywallNode) {
  return {
    '#comment': nodeElem => {
      if (nodeElem.nodeType === 8 && nodeElem.nodeValue.trim() === 'members-only') {
        return {
          conversion() {
            const node = new PaywallNode();
            return {
              node
            };
          },
          priority: 0
        };
      }
      return null;
    }
  };
}

function renderPaywallNode(_, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const element = document.createElement('div');
  element.innerHTML = '<!--members-only-->';

  // `type: 'inner'` will render only the innerHTML of the element
  // @see @tryghost/kg-lexical-html-renderer package
  return {
    element,
    type: 'inner'
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class PaywallNode extends generateDecoratorNode({
  nodeType: 'paywall'
}) {
  static importDOM() {
    return parsePaywallNode(this);
  }
  exportDOM(options = {}) {
    return renderPaywallNode(this, options);
  }
}
const $createPaywallNode = dataset => {
  return new PaywallNode(dataset);
};
function $isPaywallNode(node) {
  return node instanceof PaywallNode;
}

function parseProductNode(ProductNode) {
  return {
    div: nodeElem => {
      const isKgProductCard = nodeElem.classList?.contains('kg-product-card');
      if (nodeElem.tagName === 'DIV' && isKgProductCard) {
        return {
          conversion(domNode) {
            const title = readCaptionFromElement(domNode, {
              selector: '.kg-product-card-title'
            });
            const description = readCaptionFromElement(domNode, {
              selector: '.kg-product-card-description'
            });
            const payload = {
              productButtonEnabled: false,
              productRatingEnabled: false,
              productTitle: title,
              productDescription: description
            };
            const img = domNode.querySelector('.kg-product-card-image');
            if (img && img.getAttribute('src')) {
              payload.productImageSrc = img.getAttribute('src');
              if (img.getAttribute('width')) {
                payload.productImageWidth = img.getAttribute('width');
              }
              if (img.getAttribute('height')) {
                payload.productImageHeight = img.getAttribute('height');
              }
            }
            const stars = [...domNode.querySelectorAll('.kg-product-card-rating-active')].length;
            if (stars) {
              payload.productRatingEnabled = true;
              payload.productStarRating = stars;
            }
            const button = domNode.querySelector('a');
            if (button) {
              const buttonUrl = button.getAttribute('href');
              const buttonText = getButtonText(button);
              if (buttonUrl && buttonText) {
                payload.productButtonEnabled = true;
                payload.productButton = buttonText;
                payload.productUrl = buttonUrl;
              }
            }
            if (!title && !description && !img && !button) {
              return null;
            }
            const node = new ProductNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}
function getButtonText(node) {
  let buttonText = node.textContent;
  if (buttonText) {
    buttonText = buttonText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return buttonText;
}

function renderProductNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  if (node.isEmpty()) {
    return renderEmptyContainer(document);
  }
  const templateData = {
    ...node.getDataset(),
    starIcon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12.729,1.2l3.346,6.629,6.44.638a.805.805,0,0,1,.5,1.374l-5.3,5.253,1.965,7.138a.813.813,0,0,1-1.151.935L12,19.934,5.48,23.163a.813.813,0,0,1-1.151-.935L6.294,15.09.99,9.837a.805.805,0,0,1,.5-1.374l6.44-.638L11.271,1.2A.819.819,0,0,1,12.729,1.2Z"/></svg>`
  };
  const starActiveClasses = 'kg-product-card-rating-active';
  for (let i = 1; i <= 5; i++) {
    templateData['star' + i] = '';
    if (node.productStarRating >= i) {
      templateData['star' + i] = starActiveClasses;
    }
  }
  const htmlString = options.target === 'email' ? emailCardTemplate({
    data: templateData
  }) : cardTemplate$2({
    data: templateData
  });
  const element = document.createElement('div');
  element.innerHTML = htmlString.trim();
  return {
    element: element.firstElementChild
  };
}
function cardTemplate$2({
  data
}) {
  return `
        <div class="kg-card kg-product-card">
            <div class="kg-product-card-container">
                ${data.productImageSrc ? `<img src="${data.productImageSrc}" ${data.productImageWidth ? `width="${data.productImageWidth}"` : ''} ${data.productImageHeight ? `height="${data.productImageHeight}"` : ''} class="kg-product-card-image" loading="lazy" />` : ''}
                <div class="kg-product-card-title-container">
                    <h4 class="kg-product-card-title">${data.productTitle}</h4>
                </div>
                ${data.productRatingEnabled ? `
                    <div class="kg-product-card-rating">
                        <span class="${data.star1} kg-product-card-rating-star">${data.starIcon}</span>
                        <span class="${data.star2} kg-product-card-rating-star">${data.starIcon}</span>
                        <span class="${data.star3} kg-product-card-rating-star">${data.starIcon}</span>
                        <span class="${data.star4} kg-product-card-rating-star">${data.starIcon}</span>
                        <span class="${data.star5} kg-product-card-rating-star">${data.starIcon}</span>
                    </div>
                ` : ''}

                <div class="kg-product-card-description">${data.productDescription}</div>
                ${data.productButtonEnabled ? `
                    <a href="${data.productUrl}" class="kg-product-card-button kg-product-card-btn-accent" target="_blank" rel="noopener noreferrer"><span>${data.productButton}</span></a>
                ` : ''}
            </div>
        </div>
    `;
}
function emailCardTemplate({
  data
}) {
  let imageDimensions;
  if (data.productImageWidth && data.productImageHeight) {
    imageDimensions = {
      width: data.productImageWidth,
      height: data.productImageHeight
    };
    if (data.productImageWidth >= 560) {
      imageDimensions = resizeImage(imageDimensions, {
        width: 560
      });
    }
  }
  return `
         <table cellspacing="0" cellpadding="0" border="0" style="width:100%; padding:20px; border:1px solid #E9E9E9; border-radius: 5px; margin: 0 0 1.5em; width: 100%;">
            ${data.productImageSrc ? `
                <tr>
                    <td align="center" style="padding-top:0; padding-bottom:0; margin-bottom:0; padding-bottom:0;">
                        <img src="${data.productImageSrc}" ${imageDimensions ? `width="${imageDimensions.width}"` : ''} ${imageDimensions ? `height="${imageDimensions.height}"` : ''} style="display: block; width: 100%; height: auto; max-width: 100%; border: none; padding-bottom: 16px;" border="0"/>
                    </td>
                </tr>
            ` : ''}
            <tr>
                <td valign="top">
                    <h4 style="font-size: 22px !important; margin-top: 0 !important; margin-bottom: 0 !important; font-weight: 700;">${data.productTitle}</h4>
                </td>
            </tr>
            ${data.productRatingEnabled ? `
                <tr style="padding-top:0; padding-bottom:0; margin-bottom:0; padding-bottom:0;">
                    <td valign="top">
                        <img src="${`https://static.ghost.org/v4.0.0/images/star-rating-${data.productStarRating}.png`}" style="border: none; width: 96px;" border="0" />
                    </td>
                </tr>
            ` : ''}
            <tr>
                <td style="padding-top:0; padding-bottom:0; margin-bottom:0; padding-bottom:0;">
                    <div style="padding-top: 8px; opacity: 0.7; font-size: 17px; line-height: 1.4; margin-bottom: -24px;">${data.productDescription}</div>
                </td>
            </tr>
            ${data.productButtonEnabled ? `
                <tr>
                    <td style="padding-top:0; padding-bottom:0; margin-bottom:0; padding-bottom:0;">
                        <div class="btn btn-accent" style="box-sizing: border-box;display: table;width: 100%;padding-top: 16px;">
                            <a href="${data.productUrl}" style="overflow-wrap: anywhere;border: solid 1px;border-radius: 5px;box-sizing: border-box;cursor: pointer;display: inline-block;font-size: 14px;font-weight: bold;margin: 0;padding: 0;text-decoration: none;color: #FFFFFF; width: 100%; text-align: center;"><span style="display: block;padding: 12px 25px;">${data.productButton}</span></a>
                        </div>
                    </td>
                </tr>
            ` : ''}
        </table>
        `;
}

/* eslint-disable ghost/filenames/match-exported-class */
class ProductNode extends generateDecoratorNode({
  nodeType: 'product',
  properties: [{
    name: 'productImageSrc',
    default: '',
    urlType: 'url'
  }, {
    name: 'productImageWidth',
    default: null
  }, {
    name: 'productImageHeight',
    default: null
  }, {
    name: 'productTitle',
    default: '',
    urlType: 'html',
    wordCount: true
  }, {
    name: 'productDescription',
    default: '',
    urlType: 'html',
    wordCount: true
  }, {
    name: 'productRatingEnabled',
    default: false
  }, {
    name: 'productStarRating',
    default: 5
  }, {
    name: 'productButtonEnabled',
    default: false
  }, {
    name: 'productButton',
    default: ''
  }, {
    name: 'productUrl',
    default: ''
  }]
}) {
  /* override */
  exportJSON() {
    // checks if src is a data string
    const {
      productImageSrc,
      productImageWidth,
      productImageHeight,
      productTitle,
      productDescription,
      productRatingEnabled,
      productStarRating,
      productButtonEnabled,
      productButton,
      productUrl
    } = this;
    const isBlob = productImageSrc && productImageSrc.startsWith('data:');
    const dataset = {
      type: 'product',
      version: 1,
      productImageSrc: isBlob ? '<base64String>' : productImageSrc,
      productImageWidth,
      productImageHeight,
      productTitle,
      productDescription,
      productRatingEnabled,
      productStarRating,
      productButtonEnabled,
      productButton,
      productUrl
    };
    return dataset;
  }
  static importDOM() {
    return parseProductNode(this);
  }
  exportDOM(options = {}) {
    return renderProductNode(this, options);
  }
  isEmpty() {
    const isButtonFilled = this.__productButtonEnabled && this.__productUrl && this.__productButton;
    return !this.__productTitle && !this.__productDescription && !isButtonFilled && !this.__productImageSrc && !this.__productRatingEnabled;
  }
}
const $createProductNode = dataset => {
  return new ProductNode(dataset);
};
function $isProductNode(node) {
  return node instanceof ProductNode;
}

// TODO: add NFT card parser
function parseEmbedNode(EmbedNode) {
  return {
    figure: nodeElem => {
      if (nodeElem.nodeType === 1 && nodeElem.tagName === 'FIGURE') {
        const iframe = nodeElem.querySelector('iframe');
        if (iframe) {
          return {
            conversion(domNode) {
              const payload = _createPayloadForIframe(iframe);
              if (!payload) {
                return null;
              }
              payload.caption = readCaptionFromElement(domNode);
              const node = new EmbedNode(payload);
              return {
                node
              };
            },
            priority: 1
          };
        }
        const blockquote = nodeElem.querySelector('blockquote');
        if (blockquote) {
          return {
            conversion(domNode) {
              const link = domNode.querySelector('a');
              if (!link) {
                return null;
              }
              let url = link.getAttribute('href');

              // If we don't have a url, or it's not an absolute URL, we can't handle this
              if (!url || !url.match(/^https?:\/\//i)) {
                return null;
              }
              let payload = {
                url: url
              };

              // append caption, remove element from blockquote
              payload.caption = readCaptionFromElement(domNode);
              let figcaption = domNode.querySelector('figcaption');
              figcaption?.remove();
              payload.html = domNode.innerHTML;
              const node = new EmbedNode(payload);
              return {
                node
              };
            },
            priority: 1
          };
        }
      }
      return null;
    },
    iframe: nodeElem => {
      if (nodeElem.nodeType === 1 && nodeElem.tagName === 'IFRAME') {
        return {
          conversion(domNode) {
            const payload = _createPayloadForIframe(domNode);
            if (!payload) {
              return null;
            }
            const node = new EmbedNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}
function _createPayloadForIframe(iframe) {
  // If we don't have a src Or it's not an absolute URL, we can't handle this
  // This regex handles http://, https:// or //
  if (!iframe.src || !iframe.src.match(/^(https?:)?\/\//i)) {
    return;
  }

  // if it's a schemaless URL, convert to https
  if (iframe.src.match(/^\/\//)) {
    iframe.src = `https:${iframe.src}`;
  }
  let payload = {
    url: iframe.src
  };
  payload.html = iframe.outerHTML;
  return payload;
}

function render(node, document, options) {
  const metadata = node.metadata;
  const figure = document.createElement('figure');
  figure.setAttribute('class', 'kg-card kg-embed-card');
  let html = node.html;
  const tweetData = metadata && metadata.tweet_data;
  const isEmail = options.target === 'email';
  if (tweetData && isEmail) {
    const tweetId = tweetData.id;
    const numberFormatter = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      notation: 'compact',
      unitDisplay: 'narrow',
      maximumFractionDigits: 1
    });
    const retweetCount = numberFormatter.format(tweetData.public_metrics.retweet_count);
    const likeCount = numberFormatter.format(tweetData.public_metrics.like_count);
    const authorUser = tweetData.users && tweetData.users.find(user => user.id === tweetData.author_id);
    const tweetTime = DateTime.fromISO(tweetData.created_at).toLocaleString(DateTime.TIME_SIMPLE);
    const tweetDate = DateTime.fromISO(tweetData.created_at).toLocaleString(DateTime.DATE_MED);
    const mentions = tweetData.entities && tweetData.entities.mentions || [];
    const urls = tweetData.entities && tweetData.entities.urls || [];
    const hashtags = tweetData.entities && tweetData.entities.hashtags || [];
    const entities = mentions.concat(urls).concat(hashtags).sort((a, b) => a.start - b.start);
    let tweetContent = tweetData.text;
    let tweetImageUrl = null;
    const hasImageOrVideo = tweetData.attachments && tweetData.attachments && tweetData.attachments.media_keys;
    if (hasImageOrVideo) {
      tweetImageUrl = tweetData.includes.media[0].preview_image_url || tweetData.includes.media[0].url;
    }
    const hasPoll = tweetData.attachments && tweetData.attachments && tweetData.attachments.poll_ids;
    if (mentions) {
      let last = 0;
      let parts = [];
      let content = toArray(tweetContent);
      for (const entity of entities) {
        let type = 'text';
        let data = content.slice(entity.start, entity.end + 1).join('').replace(/\n/g, '<br>');
        if (entity.url) {
          if (!entity.display_url || entity.display_url.startsWith('pic.twitter.com')) {
            type = 'img_url';
          } else {
            type = 'url';
            data = data.replace(entity.url, entity.display_url);
          }
        }
        if (entity.username) {
          type = 'mention';
        }
        if (entity.tag) {
          type = 'hashtag';
        }
        parts.push({
          type: 'text',
          data: content.slice(last, entity.start).join('').replace(/\n/g, '<br>')
        });
        parts.push({
          type: type,
          data: data
        });
        last = entity.end + 1;
      }
      parts.push({
        type: 'text',
        data: content.slice(last, content.length).join('').replace(/\n/g, '<br>')
      });
      tweetContent = parts.reduce((partContent, part) => {
        if (part.type === 'text') {
          return partContent + part.data;
        }
        if (part.type === 'mention') {
          return partContent + `<span style="color: #1DA1F2;">${part.data}</span>`;
        }
        if (part.type === 'hashtag') {
          return partContent + `<span style="color: #1DA1F2;">${part.data}</span>`;
        }
        if (part.type === 'url') {
          return partContent + `<span style="color: #1DA1F2; word-break: break-all;">${part.data}</span>`;
        }
        return partContent;
      }, '');
    }
    html = `
        <table cellspacing="0" cellpadding="0" border="0" class="kg-twitter-card">
            <tr>
                <td>
                    <table cellspacing="0" cellpadding="0" border="0" width="100%">
                        ${authorUser ? `
                            <tr>
                                ${authorUser.profile_image_url ? `<td width="48" style="width: 48px;">
                                    <a href="https://twitter.com/twitter/status/${tweetId}" class="kg-twitter-link" style="padding-left: 16px; padding-top: 16px;"><img src="${authorUser.profile_image_url}" style="max-width: 512px; border: none; width: 48px; height: 48px; border-radius: 999px;" border="0"></a>
                                </td>` : ''}
                                ${authorUser.name ? `
                                <td style="line-height: 1.3em; width: 100%;">
                                    <a href="https://twitter.com/twitter/status/${tweetId}" class="kg-twitter-link" style="font-size: 15px !important; font-weight: 600; width: 100%; padding-top: 20px; padding-bottom: 18px;">${authorUser.name} <br> <span style="color: #ABB4BE; font-size: 14px; font-weight: 500;">@${authorUser.username}</span></a>
                                </td>` : ''}
                                <td align="right" width="24" style="width: 24px;">
                                    <a href="https://twitter.com/twitter/status/${tweetId}" class="kg-twitter-link" style="padding-right: 16px; padding-top: 20px; width: 24px; height: 38px;"><img src="https://static.ghost.org/v4.0.0/images/twitter-logo-small.png" width="24" border="0"></a>
                                </td>
                            </tr>
                        ` : ''}
                        <tr>
                            <td colspan="3">
                                <a href="https://twitter.com/twitter/status/${tweetId}" class="kg-twitter-link" style="font-size: 15px; line-height: 1.4em; padding-top: 8px; padding-left: 16px; padding-right: 16px; padding-bottom: 16px;">${tweetContent}
                                ${hasPoll ? `<br><span style="color: #1DA1F2;">View poll &rarr;</span>` : ''}
                                </a>
                            </td>
                        </tr>
                        ${hasImageOrVideo ? `<tr>
                            <td colspan="3" align="center" style="width: 100%;">
                                <a href="https://twitter.com/twitter/status/${tweetId}" style="display: block; padding-top: 0; padding-left: 16px; padding-right: 16px; padding-bottom: 0;"><img src="${tweetImageUrl}" style="width: 100%; border: 1px solid #E9E9E9; max-width: 528px; border-radius: 10px;" border="0"></a>
                            </td>
                        </tr>` : ''}
                        <tr>
                            <td colspan="3" style="width: 100%;">
                                <table cellspacing="0" cellpadding="0" border="0" width="100%">
                                    <tr>
                                        <td>
                                        <a href="https://twitter.com/twitter/status/${tweetId}" class="kg-twitter-link" style="padding-top: 4px; padding-right: 16px; padding-bottom: 12px; padding-left: 16px;"><span style="color: #838383;">${tweetTime} &bull; ${tweetDate}</span></a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td colspan="3" style="width: 100%;">
                                <table cellspacing="0" cellpadding="0" border="0" width="100%" style="border-top: 1px solid #E9E9E9;">
                                    <tr>
                                        <td>
                                            <a href="https://twitter.com/twitter/status/${tweetId}" class="kg-twitter-link" style="padding-top: 12px; padding-right: 16px; padding-bottom: 12px; padding-left: 16px;">
                                                <span style="font-weight: 600;">${likeCount}</span> <span style="color: #838383;">likes &bull;</span>
                                                <span style="font-weight: 600;">${retweetCount}</span> <span style="color: #838383;">retweets</span>
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
        `;
  }
  figure.innerHTML = html.trim();
  const caption = node.caption;
  if (caption) {
    const figcaption = document.createElement('figcaption');
    figcaption.innerHTML = caption;
    figure.appendChild(figcaption);
    figure.setAttribute('class', `${figure.getAttribute('class')} kg-card-hascaption`);
  }
  return {
    element: figure
  };
}

function renderEmbedNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const embedType = node.embedType;
  if (embedType === 'twitter') {
    return render(node, document, options);
  }
  return renderTemplate(node, document, options);
}
function renderTemplate(node, document, options) {
  if (node.isEmpty()) {
    return renderEmptyContainer(document);
  }
  const isEmail = options.target === 'email';
  const metadata = node.metadata;
  const url = node.url;
  const isVideoWithThumbnail = node.embedType === 'video' && metadata && metadata.thumbnail_url;
  const figure = document.createElement('figure');
  figure.setAttribute('class', 'kg-card kg-embed-card');
  if (isEmail && isVideoWithThumbnail) {
    const emailTemplateMaxWidth = 600;
    const thumbnailAspectRatio = metadata.thumbnail_width / metadata.thumbnail_height;
    const spacerWidth = Math.round(emailTemplateMaxWidth / 4);
    const spacerHeight = Math.round(emailTemplateMaxWidth / thumbnailAspectRatio);
    const html = `
            <!--[if !mso !vml]-->
            <a class="kg-video-preview" href="${url}" aria-label="Play video" style="mso-hide: all">
                <table cellpadding="0" cellspacing="0" border="0" width="100%" background="${metadata.thumbnail_url}" role="presentation" style="background: url('${metadata.thumbnail_url}') left top / cover; mso-hide: all">
                    <tr style="mso-hide: all">
                        <td width="25%" style="visibility: hidden; mso-hide: all">
                            <img src="https://img.spacergif.org/v1/${spacerWidth}x${spacerHeight}/0a/spacer.png" alt="" width="100%" border="0" style="display:block; height: auto; opacity: 0; visibility: hidden; mso-hide: all;">
                        </td>
                        <td width="50%" align="center" valign="middle" style="vertical-align: middle; mso-hide: all;">
                            <div class="kg-video-play-button" style="mso-hide: all"><div style="mso-hide: all"></div></div>
                        </td>
                        <td width="25%" style="mso-hide: all">&nbsp;</td>
                    </tr>
                </table>
            </a>
            <!--[endif]-->

            <!--[if vml]>
            <v:group xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" coordsize="${emailTemplateMaxWidth},${spacerHeight}" coordorigin="0,0" href="${url}" style="width:${emailTemplateMaxWidth}px;height:${spacerHeight}px;">
                <v:rect fill="t" stroked="f" style="position:absolute;width:${emailTemplateMaxWidth};height:${spacerHeight};"><v:fill src="${metadata.thumbnail_url}" type="frame"/></v:rect>
                <v:oval fill="t" strokecolor="white" strokeweight="4px" style="position:absolute;left:${Math.round(emailTemplateMaxWidth / 2 - 39)};top:${Math.round(spacerHeight / 2 - 39)};width:78;height:78"><v:fill color="black" opacity="30%" /></v:oval>
                <v:shape coordsize="24,32" path="m,l,32,24,16,xe" fillcolor="white" stroked="f" style="position:absolute;left:${Math.round(emailTemplateMaxWidth / 2 - 11)};top:${Math.round(spacerHeight / 2 - 17)};width:30;height:34;" />
            </v:group>
            <![endif]-->
        `;
    figure.innerHTML = html.trim();
  } else {
    figure.innerHTML = node.html;
  }
  const caption = node.caption;
  if (caption) {
    const figcaption = document.createElement('figcaption');
    figcaption.innerHTML = caption;
    figure.appendChild(figcaption);
    figure.setAttribute('class', `${figure.getAttribute('class')} kg-card-hascaption`);
  }
  return {
    element: figure
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class EmbedNode extends generateDecoratorNode({
  nodeType: 'embed',
  properties: [{
    name: 'url',
    default: '',
    urlType: 'url'
  }, {
    name: 'embedType',
    default: ''
  }, {
    name: 'html',
    default: ''
  }, {
    name: 'metadata',
    default: {}
  }, {
    name: 'caption',
    default: '',
    wordCount: true
  }]
}) {
  static importDOM() {
    return parseEmbedNode(this);
  }
  exportDOM(options = {}) {
    return renderEmbedNode(this, options);
  }
  isEmpty() {
    return !this.__url && !this.__html;
  }
}
const $createEmbedNode = dataset => {
  return new EmbedNode(dataset);
};
function $isEmbedNode(node) {
  return node instanceof EmbedNode;
}

/**
 * Removes consecutive whitespaces and newlines
 * @param {string} html
 * @returns {string}
 */
function removeSpaces(html) {
  return html.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Wraps replacement strings with %%
 * This helps to prevent conflicts between code samples and our replacement strings
 * Example: {foo} -> %%{foo}%%
 * @param {string} html
 * @returns {string}
 */
function wrapReplacementStrings(html) {
  return html.replace(/\{(\w*?)(?:,? *"(.*?)")?\}/g, '%%$&%%');
}

/**
 * Removes any <code> wrappers around replacement strings {foo}
 * Example input:  <code><span>{foo}</span></code>
 * Example output:       <span>{foo}</span>
 * @param {string} html
 * @returns {string}
 */
function removeCodeWrappersFromHelpers(html, document) {
  // parse html to make patterns easier to match
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  const codeElements = tempDiv.querySelectorAll('code');
  codeElements.forEach(codeElement => {
    const codeTextContent = codeElement.textContent;
    // extract the content of the code element if it follows the helper pattern (e.g. {foo})
    if (codeTextContent.match(/((.*?){.*?}(.*?))/gi)) {
      const codeContent = codeElement.innerHTML;
      codeElement.parentNode.replaceChild(document.createRange().createContextualFragment(codeContent), codeElement);
    }
  });
  const cleanedHtml = tempDiv.innerHTML;
  return cleanedHtml;
}

function renderEmailNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const html = node.html;
  if (!html || options.target !== 'email') {
    return renderEmptyContainer(document);
  }
  const cleanedHtml = wrapReplacementStrings(removeCodeWrappersFromHelpers(removeSpaces(html), document));
  const element = document.createElement('div');
  element.innerHTML = cleanedHtml;

  // `type: 'inner'` will render only the innerHTML of the element
  // @see @tryghost/kg-lexical-html-renderer package
  return {
    element,
    type: 'inner'
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class EmailNode extends generateDecoratorNode({
  nodeType: 'email',
  properties: [{
    name: 'html',
    default: '',
    urlType: 'html'
  }]
}) {
  exportDOM(options = {}) {
    return renderEmailNode(this, options);
  }
}
const $createEmailNode = dataset => {
  return new EmailNode(dataset);
};
function $isEmailNode(node) {
  return node instanceof EmailNode;
}

function readGalleryImageAttributesFromElement(element, imgNum) {
  const image = readImageAttributesFromElement(element);
  image.fileName = element.src.match(/[^/]*$/)[0];
  image.row = Math.floor(imgNum / 3);
  return image;
}
function parseGalleryNode(GalleryNode) {
  return {
    figure: nodeElem => {
      // Koenig gallery card
      if (nodeElem.classList?.contains('kg-gallery-card')) {
        return {
          conversion(domNode) {
            const payload = {};
            const imgs = Array.from(domNode.querySelectorAll('img'));
            payload.images = imgs.map(readGalleryImageAttributesFromElement);
            payload.caption = readCaptionFromElement(domNode);
            const node = new GalleryNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    },
    div: nodeElem => {
      // Medium "graf" galleries
      function isGrafGallery(node) {
        return node.tagName === 'DIV' && node.dataset?.paragraphCount && node.querySelectorAll('img').length > 0;
      }
      if (isGrafGallery(nodeElem)) {
        return {
          conversion(domNode) {
            const payload = {
              caption: readCaptionFromElement(domNode)
            };

            // These galleries exist as a series of divs containing multiple figure+img.
            // Grab the first set of imgs...
            let imgs = Array.from(domNode.querySelectorAll('img'));

            // ...and then iterate over any remaining divs until we run out of matches
            let nextNode = domNode.nextElementSibling;
            while (nextNode && isGrafGallery(nextNode)) {
              let currentNode = nextNode;
              imgs = imgs.concat(Array.from(currentNode.querySelectorAll('img')));
              const currentNodeCaption = readCaptionFromElement(currentNode);
              if (currentNodeCaption) {
                payload.caption = `${payload.caption} / ${currentNodeCaption}`;
              }
              nextNode = currentNode.nextElementSibling;

              // remove nodes as we go so that they don't go through the parser
              currentNode.remove();
            }
            payload.images = imgs.map(readGalleryImageAttributesFromElement);
            const node = new GalleryNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }

      // Squarespace SQS galleries
      function isSqsGallery(node) {
        return node.tagName === 'DIV' && node.className.match(/sqs-gallery-container/) && !node.className.match(/summary-/);
      }
      if (isSqsGallery(nodeElem)) {
        return {
          conversion(domNode) {
            const payload = {};

            // Each image exists twice...
            // The first image is wrapped in `<noscript>`
            // The second image contains image dimensions but the src property needs to be taken from `data-src`.
            let imgs = Array.from(domNode.querySelectorAll('img.thumb-image'));
            imgs = imgs.map(img => {
              if (!img.getAttribute('src')) {
                if (img.previousElementSibling.tagName === 'NOSCRIPT' && img.previousElementSibling.getElementsByTagName('img').length) {
                  const prevNode = img.previousElementSibling;
                  img.setAttribute('src', img.getAttribute('data-src'));
                  prevNode.remove();
                } else {
                  return undefined;
                }
              }
              return img;
            }).filter(img => img !== undefined);

            // Process nodes into the payload
            payload.images = imgs.map(readGalleryImageAttributesFromElement);
            payload.caption = readCaptionFromElement(domNode, {
              selector: '.meta-title'
            });
            const node = new GalleryNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

const MAX_IMG_PER_ROW = 3;
function isValidImage(image) {
  return image.fileName && image.src && image.width && image.height;
}
function buildStructure(images) {
  const rows = [];
  const noOfImages = images.length;
  images.forEach((image, idx) => {
    let row = image.row;
    if (noOfImages > 1 && noOfImages % MAX_IMG_PER_ROW === 1 && idx === noOfImages - 2) {
      row = row + 1;
    }
    if (!rows[row]) {
      rows[row] = [];
    }
    rows[row].push(image);
  });
  return rows;
}
function renderGalleryNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const validImages = node.images.filter(isValidImage);
  if (!validImages.length) {
    return renderEmptyContainer(document);
  }
  const figure = document.createElement('figure');
  figure.setAttribute('class', 'kg-card kg-gallery-card kg-width-wide');
  const container = document.createElement('div');
  container.setAttribute('class', 'kg-gallery-container');
  figure.appendChild(container);
  const rows = buildStructure(validImages);
  rows.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.setAttribute('class', 'kg-gallery-row');
    row.forEach(image => {
      const imgDiv = document.createElement('div');
      imgDiv.setAttribute('class', 'kg-gallery-image');
      const img = document.createElement('img');
      img.setAttribute('src', image.src);
      img.setAttribute('width', image.width);
      img.setAttribute('height', image.height);
      img.setAttribute('loading', 'lazy');
      img.setAttribute('alt', image.alt || '');
      if (image.title) {
        img.setAttribute('title', image.title);
      }

      // images can be resized to max width, if that's the case output
      // the resized width/height attrs to ensure 3rd party gallery plugins
      // aren't affected by differing sizes
      const {
        canTransformImage
      } = options;
      const {
        defaultMaxWidth
      } = options.imageOptimization || {};
      if (defaultMaxWidth && image.width > defaultMaxWidth && isLocalContentImage(image.src, options.siteUrl) && canTransformImage && canTransformImage(image.src)) {
        const {
          width,
          height
        } = resizeImage(image, {
          width: defaultMaxWidth
        });
        img.setAttribute('width', width);
        img.setAttribute('height', height);
      }

      // add srcset+sizes except for email clients which do not have good support for either
      if (options.target !== 'email') {
        setSrcsetAttribute(img, image, options);
        if (img.getAttribute('srcset') && image.width >= 720) {
          if (rows.length === 1 && row.length === 1 && image.width >= 1200) {
            img.setAttribute('sizes', '(min-width: 1200px) 1200px');
          } else {
            img.setAttribute('sizes', '(min-width: 720px) 720px');
          }
        }
      }

      // Outlook is unable to properly resize images without a width/height
      // so we modify those to fit max width (600px) and use appropriately
      // resized images if available
      if (options.target === 'email') {
        // only resize if needed, width/height always exists for gallery image unline image cards
        if (image.width > 600) {
          const newImageDimensions = resizeImage(image, {
            width: 600
          });
          img.setAttribute('width', newImageDimensions.width);
          img.setAttribute('height', newImageDimensions.height);
        }
        if (isLocalContentImage(image.src, options.siteUrl) && options.canTransformImage && options.canTransformImage(image.src)) {
          // find available image size next up from 2x600 so we can use it for the "retina" src
          const availableImageWidths = getAvailableImageWidths(image, options.imageOptimization.contentImageSizes);
          const srcWidth = availableImageWidths.find(width => width >= 1200);
          if (!srcWidth || srcWidth === image.width) ; else {
            const [, imagesPath, filename] = image.src.match(/(.*\/content\/images)\/(.*)/);
            img.setAttribute('src', `${imagesPath}/size/w${srcWidth}/${filename}`);
          }
        }
        if (isUnsplashImage(image.src)) {
          const unsplashUrl = new URL(image.src);
          unsplashUrl.searchParams.set('w', 1200);
          img.setAttribute('src', unsplashUrl.href);
        }
      }
      if (image.href) {
        const a = document.createElement('a');
        a.setAttribute('href', image.href);
        a.appendChild(img);
        imgDiv.appendChild(a);
      } else {
        imgDiv.appendChild(img);
      }
      rowDiv.appendChild(imgDiv);
    });
    container.appendChild(rowDiv);
  });
  if (node.caption) {
    let figcaption = document.createElement('figcaption');
    figcaption.innerHTML = node.caption;
    figure.appendChild(figcaption);
    figure.setAttribute('class', `${figure.getAttribute('class')} kg-card-hascaption`);
  }
  return {
    element: figure
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class GalleryNode extends generateDecoratorNode({
  nodeType: 'gallery',
  properties: [{
    name: 'images',
    default: []
  }, {
    name: 'caption',
    default: '',
    wordCount: true
  }]
}) {
  /* override */
  static get urlTransformMap() {
    return {
      caption: 'html',
      images: {
        src: 'url',
        caption: 'html'
      }
    };
  }
  static importDOM() {
    return parseGalleryNode(this);
  }
  exportDOM(options = {}) {
    return renderGalleryNode(this, options);
  }
  hasEditMode() {
    return false;
  }
}
const $createGalleryNode = dataset => {
  return new GalleryNode(dataset);
};
function $isGalleryNode(node) {
  return node instanceof GalleryNode;
}

function renderEmailCtaNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const {
    html,
    buttonText,
    buttonUrl,
    showButton,
    alignment,
    segment,
    showDividers
  } = node;
  const hasButton = showButton && !!buttonText && !!buttonUrl;
  if (!html && !hasButton || options.target !== 'email') {
    return renderEmptyContainer(document);
  }
  const element = document.createElement('div');
  if (segment) {
    element.setAttribute('data-gh-segment', segment);
  }
  if (alignment === 'center') {
    element.setAttribute('class', 'align-center');
  }
  if (showDividers) {
    element.appendChild(document.createElement('hr'));
  }
  const cleanedHtml = wrapReplacementStrings(removeCodeWrappersFromHelpers(removeSpaces(html), document));
  element.innerHTML = element.innerHTML + cleanedHtml;
  if (hasButton) {
    const buttonTemplate = `
            <div class="btn btn-accent">
                <table border="0" cellspacing="0" cellpadding="0" align="${escapeHtml(alignment)}">
                    <tbody>
                        <tr>
                            <td align="center">
                                <a href="${escapeHtml(buttonUrl)}">${escapeHtml(buttonText)}</a>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p></p>
        `; // the inline <p> element is so we get a line break if there's no separators/hr used

    const cleanedButton = wrapReplacementStrings(removeCodeWrappersFromHelpers(removeSpaces(buttonTemplate), document));
    element.innerHTML = element.innerHTML + cleanedButton;
  }
  if (showDividers) {
    element.appendChild(document.createElement('hr'));
  }
  return {
    element
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class EmailCtaNode extends generateDecoratorNode({
  nodeType: 'email-cta',
  properties: [{
    name: 'alignment',
    default: 'left'
  }, {
    name: 'buttonText',
    default: ''
  }, {
    name: 'buttonUrl',
    default: '',
    urlType: 'url'
  }, {
    name: 'html',
    default: '',
    urlType: 'html'
  }, {
    name: 'segment',
    default: 'status:free'
  }, {
    name: 'showButton',
    default: false
  }, {
    name: 'showDividers',
    default: true
  }]
}) {
  exportDOM(options = {}) {
    return renderEmailCtaNode(this, options);
  }
}
const $createEmailCtaNode = dataset => {
  return new EmailCtaNode(dataset);
};
function $isEmailCtaNode(node) {
  return node instanceof EmailCtaNode;
}

function rgbToHex(rgb) {
  if (rgb === 'transparent') {
    return rgb;
  }
  try {
    // Extract the red, green, and blue values from the RGB string
    const [r, g, b] = rgb.match(/\d+/g);
    // Convert each component to hexadecimal
    const red = parseInt(r, 10).toString(16).padStart(2, '0');
    const green = parseInt(g, 10).toString(16).padStart(2, '0');
    const blue = parseInt(b, 10).toString(16).padStart(2, '0');
    // Concatenate the hexadecimal values
    const hex = `#${red}${green}${blue}`;
    return hex;
  } catch (e) {
    return null;
  }
}
function getLayout$1(domNode) {
  if (domNode.classList.contains('kg-layout-split')) {
    return 'split';
  } else if (domNode.classList.contains('kg-layout-full')) {
    return 'full';
  } else if (domNode.classList.contains('kg-layout-wide')) {
    return 'wide';
  } else {
    return 'regular';
  }
}
function signupParser(SignupNode) {
  return {
    div: nodeElem => {
      const isSignupNode = nodeElem.dataset?.lexicalSignupForm === '';
      if (nodeElem.tagName === 'DIV' && isSignupNode) {
        return {
          conversion(domNode) {
            const layout = getLayout$1(domNode);
            const header = domNode.querySelector('h2')?.textContent || '';
            const subheader = domNode.querySelector('h3')?.textContent || '';
            const disclaimer = domNode.querySelector('p')?.textContent || '';
            const backgroundImageSrc = domNode.querySelector('.kg-signup-card-image')?.getAttribute('src');
            const backgroundColor = domNode.style.backgroundColor || '';
            const buttonColor = domNode.querySelector('.kg-signup-card-button')?.style.backgroundColor || '';
            const buttonText = domNode.querySelector('.kg-signup-card-button-default')?.textContent?.trim() || 'Subscribe';
            const buttonTextColor = domNode.querySelector('.kg-signup-card-button')?.style.color || '';
            const textColor = domNode.querySelector('.kg-signup-card-success')?.style.color || '';
            const alignment = domNode.querySelector('.kg-signup-card-text')?.classList.contains('kg-align-center') ? 'center' : 'left';
            const successMessage = domNode.querySelector('.kg-signup-card-success')?.textContent?.trim() || '';
            const labels = [...domNode.querySelectorAll('input[data-members-label]')].map(input => input.value);
            const isAccentBackground = domNode.classList?.contains('kg-style-accent') ?? false;
            const isAccentButton = domNode.querySelector('.kg-signup-card-button')?.classList?.contains('kg-style-accent') ?? false;
            const isSwapped = domNode.classList.contains('kg-swapped');
            const backgroundSize = domNode.classList.contains('kg-content-wide') ? 'contain' : 'cover';
            const payload = {
              layout,
              buttonText,
              header,
              subheader,
              disclaimer,
              backgroundImageSrc,
              backgroundSize,
              backgroundColor: isAccentBackground ? 'accent' : rgbToHex(backgroundColor) || '#ffffff',
              buttonColor: isAccentButton ? 'accent' : rgbToHex(buttonColor) || '#ffffff',
              textColor: rgbToHex(textColor) || '#ffffff',
              buttonTextColor: rgbToHex(buttonTextColor) || '#000000',
              alignment,
              successMessage,
              labels,
              swapped: isSwapped
            };
            const node = new SignupNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

// ref https://ghost.org/docs/themes/members#signup-forms

function cardTemplate$1(nodeData) {
  const cardClasses = getCardClasses(nodeData).join(' ');
  const backgroundAccent = getAccentClass(nodeData); // don't apply accent style if there's a background image
  const buttonAccent = nodeData.buttonColor === 'accent' ? 'kg-style-accent' : '';
  const buttonStyle = nodeData.buttonColor !== 'accent' ? `background-color: ${nodeData.buttonColor};` : ``;
  const alignment = nodeData.alignment === 'center' ? 'kg-align-center' : '';
  const backgroundImageStyle = nodeData.backgroundColor !== 'accent' && (!nodeData.backgroundImageSrc || nodeData.layout === 'split') ? `background-color: ${nodeData.backgroundColor}` : '';
  const imgTemplate = nodeData.backgroundImageSrc ? `
        <picture><img class="kg-signup-card-image" src="${nodeData.backgroundImageSrc}" alt="" /></picture>
    ` : ``;
  const formTemplate = `
        <form class="kg-signup-card-form" data-members-form="signup">
            ${nodeData.labels.map(label => `<input data-members-label type="hidden" value="${label}" />`).join('\n')}
            <div class="kg-signup-card-fields">
                <input class="kg-signup-card-input" id="email" data-members-email="" type="email" required="true" placeholder="Your email" />
                <button class="kg-signup-card-button ${buttonAccent}" style="${buttonStyle}color: ${nodeData.buttonTextColor};" type="submit">
                    <span class="kg-signup-card-button-default">${nodeData.buttonText || 'Subscribe'}</span>
                    <span class="kg-signup-card-button-loading">${loadingIcon()}</span>
                </button>
            </div>
            <div class="kg-signup-card-success" ${nodeData.textColor ? `style="color: ${nodeData.textColor};"` : ''}>
                ${nodeData.successMessage || 'Thanks! Now check your email to confirm.'}
            </div>
            <div class="kg-signup-card-error" ${nodeData.textColor ? `style="color: ${nodeData.textColor};"` : ''} data-members-error></div>
        </form>
        `;
  return `
        <div class="${cardClasses} ${backgroundAccent}" data-lexical-signup-form style="${backgroundImageStyle}; display: none;">
            ${nodeData.layout !== 'split' ? imgTemplate : ''}
            <div class="kg-signup-card-content">
                ${nodeData.layout === 'split' ? imgTemplate : ''}
                <div class="kg-signup-card-text ${alignment}">
                    <h2 class="kg-signup-card-heading" ${nodeData.textColor ? `style="color: ${nodeData.textColor};"` : ''}>${nodeData.header}</h2>
                    <p class="kg-signup-card-subheading" ${nodeData.textColor ? `style="color: ${nodeData.textColor};"` : ''}>${nodeData.subheader}</p>
                    ${formTemplate}
                    <p class="kg-signup-card-disclaimer" ${nodeData.textColor ? `style="color: ${nodeData.textColor};"` : ''}>${nodeData.disclaimer}</p>
                </div>
            </div>
        </div>
        `;
}
function loadingIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" viewBox="0 0 24 24">
        <g stroke-linecap="round" stroke-width="2" fill="currentColor" stroke="none" stroke-linejoin="round" class="nc-icon-wrapper">
            <g class="nc-loop-dots-4-24-icon-o">
                <circle cx="4" cy="12" r="3"></circle>
                <circle cx="12" cy="12" r="3"></circle>
                <circle cx="20" cy="12" r="3"></circle>
            </g>
            <style data-cap="butt">
                .nc-loop-dots-4-24-icon-o{--animation-duration:0.8s}
                .nc-loop-dots-4-24-icon-o *{opacity:.4;transform:scale(.75);animation:nc-loop-dots-4-anim var(--animation-duration) infinite}
                .nc-loop-dots-4-24-icon-o :nth-child(1){transform-origin:4px 12px;animation-delay:-.3s;animation-delay:calc(var(--animation-duration)/-2.666)}
                .nc-loop-dots-4-24-icon-o :nth-child(2){transform-origin:12px 12px;animation-delay:-.15s;animation-delay:calc(var(--animation-duration)/-5.333)}
                .nc-loop-dots-4-24-icon-o :nth-child(3){transform-origin:20px 12px}
                @keyframes nc-loop-dots-4-anim{0%,100%{opacity:.4;transform:scale(.75)}50%{opacity:1;transform:scale(1)}}
            </style>
        </g>
    </svg>`;
}
function renderSignupCardToDOM(dataset, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();
  const node = {
    alignment: dataset.__alignment,
    buttonText: dataset.__buttonText,
    header: dataset.__header,
    subheader: dataset.__subheader,
    disclaimer: dataset.__disclaimer,
    backgroundImageSrc: dataset.__backgroundImageSrc,
    backgroundSize: dataset.__backgroundSize,
    backgroundColor: dataset.__backgroundColor,
    buttonColor: dataset.__buttonColor,
    labels: dataset.__labels,
    layout: dataset.__layout,
    textColor: dataset.__textColor,
    buttonTextColor: dataset.__buttonTextColor,
    successMessage: dataset.__successMessage,
    swapped: dataset.__swapped
  };
  if (options.target === 'email') {
    return {
      element: document.createElement('div')
    }; // Return an empty element since we don't want to render the card in email
  }
  const htmlString = cardTemplate$1(node);
  const element = document.createElement('div');
  element.innerHTML = htmlString?.trim();
  if (node.header === '') {
    const h2Element = element.querySelector('.kg-signup-card-heading');
    if (h2Element) {
      h2Element.remove();
    }
  }
  if (node.subheader === '') {
    const h3Element = element.querySelector('.kg-signup-card-subheading');
    if (h3Element) {
      h3Element.remove();
    }
  }
  if (node.disclaimer === '') {
    const pElement = element.querySelector('.kg-signup-card-disclaimer');
    if (pElement) {
      pElement.remove();
    }
  }
  return {
    element: element.firstElementChild
  };
}
function getCardClasses(nodeData) {
  let cardClasses = ['kg-card kg-signup-card'];
  if (nodeData.layout && nodeData.layout !== 'split') {
    cardClasses.push(`kg-width-${nodeData.layout}`);
  }
  if (nodeData.layout === 'split') {
    cardClasses.push('kg-layout-split kg-width-full');
  }
  if (nodeData.swapped && nodeData.layout === 'split') {
    cardClasses.push('kg-swapped');
  }
  if (nodeData.layout && nodeData.layout === 'full') {
    cardClasses.push(`kg-content-wide`);
  }
  if (nodeData.layout === 'split') {
    if (nodeData.backgroundSize === 'contain') {
      cardClasses.push('kg-content-wide');
    }
  }
  return cardClasses;
}

// In general, we don't want to apply the accent style if there's a background image
//  but with the split format we display both an image and a background color
const getAccentClass = nodeData => {
  if (nodeData.layout === 'split' && nodeData.backgroundColor === 'accent') {
    return 'kg-style-accent';
  } else if (nodeData.layout !== 'split' && !nodeData.backgroundImageSrc && nodeData.backgroundColor === 'accent') {
    return 'kg-style-accent';
  } else {
    return '';
  }
};

/* eslint-disable ghost/filenames/match-exported-class */
class SignupNode extends generateDecoratorNode({
  nodeType: 'signup',
  properties: [{
    name: 'alignment',
    default: 'left'
  }, {
    name: 'backgroundColor',
    default: '#F0F0F0'
  }, {
    name: 'backgroundImageSrc',
    default: ''
  }, {
    name: 'backgroundSize',
    default: 'cover'
  }, {
    name: 'textColor',
    default: ''
  }, {
    name: 'buttonColor',
    default: 'accent'
  }, {
    name: 'buttonTextColor',
    default: '#FFFFFF'
  }, {
    name: 'buttonText',
    default: 'Subscribe'
  }, {
    name: 'disclaimer',
    default: '',
    wordCount: true
  }, {
    name: 'header',
    default: '',
    wordCount: true
  }, {
    name: 'labels',
    default: []
  }, {
    name: 'layout',
    default: 'wide'
  }, {
    name: 'subheader',
    default: '',
    wordCount: true
  }, {
    name: 'successMessage',
    default: 'Email sent! Check your inbox to complete your signup.'
  }, {
    name: 'swapped',
    default: false
  }]
}) {
  /* override */
  constructor({
    alignment,
    backgroundColor,
    backgroundImageSrc,
    backgroundSize,
    textColor,
    buttonColor,
    buttonTextColor,
    buttonText,
    disclaimer,
    header,
    labels,
    layout,
    subheader,
    successMessage,
    swapped
  } = {}, key) {
    super(key);
    this.__alignment = alignment || 'left';
    this.__backgroundColor = backgroundColor || '#F0F0F0';
    this.__backgroundImageSrc = backgroundImageSrc || '';
    this.__backgroundSize = backgroundSize || 'cover';
    this.__textColor = backgroundColor === 'transparent' && (layout === 'split' || !backgroundImageSrc) ? '' : textColor || '#000000'; // text color should inherit with a transparent bg color unless we're using an image for the background (which supercedes the bg color)
    this.__buttonColor = buttonColor || 'accent';
    this.__buttonTextColor = buttonTextColor || '#FFFFFF';
    this.__buttonText = buttonText || 'Subscribe';
    this.__disclaimer = disclaimer || '';
    this.__header = header || '';
    this.__labels = labels || [];
    this.__layout = layout || 'wide';
    this.__subheader = subheader || '';
    this.__successMessage = successMessage || 'Email sent! Check your inbox to complete your signup.';
    this.__swapped = swapped || false;
  }
  static importDOM() {
    return signupParser(this);
  }
  exportDOM(options = {}) {
    return renderSignupCardToDOM(this, options);
  }

  // keeping some custom methods for labels as it requires some special handling

  setLabels(labels) {
    if (!Array.isArray(labels) || !labels.every(item => typeof item === 'string')) {
      throw new Error('Invalid argument: Expected an array of strings.'); // eslint-disable-line
    }
    const writable = this.getWritable();
    writable.__labels = labels;
  }
  addLabel(label) {
    const writable = this.getWritable();
    writable.__labels.push(label);
  }
  removeLabel(label) {
    const writable = this.getWritable();
    writable.__labels = writable.__labels.filter(l => l !== label);
  }
}
const $createSignupNode = dataset => {
  return new SignupNode(dataset);
};
function $isSignupNode(node) {
  return node instanceof SignupNode;
}

function renderCollectionNode(node, options = {}) {
  addCreateDocumentOption(options);
  const document = options.createDocument();

  // if we have no way to fetch post data, we cannot populate the card
  const renderData = options.renderData.get(node.getKey());
  if (!renderData) {
    return renderEmptyContainer(document);
  }
  const htmlString = cardTemplate(node, renderData);
  const element = document.createElement('div');
  element.innerHTML = htmlString?.trim();
  return {
    element: element.firstElementChild
  };
}
function cardTemplate(node, posts) {
  const {
    collection,
    postCount,
    layout,
    columns,
    header
  } = node.getDataset();
  const cardClass = 'kg-card kg-collection-card kg-width-wide';
  const headerClass = 'kg-collection-card-title';
  const collectionClass = 'kg-collection-card-feed' + (layout === 'list' ? ' kg-collection-card-list' : ' kg-collection-card-grid') + (layout === 'grid' && columns === 1 ? ' columns-1' : '') + (layout === 'grid' && columns === 2 ? ' columns-2' : '') + (layout === 'grid' && columns === 3 ? ' columns-3' : '') + (layout === 'grid' && columns === 4 ? ' columns-4' : '');
  return `<div class="${cardClass}" data-kg-collection-slug="${collection}" data-kg-collection-limit="${postCount}">
            ${header ? `<h4 class="${headerClass}">${header}</h4>` : ''}
            <div class="${collectionClass}">
                ${posts.map(post => postTemplate(post, layout, columns)).join('')}
            </div>
        </div>`;
}
function postTemplate(post, layout, columns) {
  const {
    title,
    published_at: publishDate,
    excerpt,
    feature_image: image,
    reading_time: readTime,
    url
  } = post;
  const imageWrapperClass = 'kg-collection-card-img';
  const imageClass = '' + (layout === 'grid' && (columns === 1 || columns === 2) ? ' aspect-video' : ' aspect-[3/2]') + (image === null ? ' invisible' : '');
  const titleClass = 'kg-collection-card-post-title';
  const excerptClass = 'kg-collection-card-post-excerpt';
  const metaClass = 'kg-collection-card-post-meta';
  const postWrapperClass = 'kg-collection-card-post-wrapper';
  return `<a href=${url} class=${postWrapperClass}>
            <div class="kg-collection-card-post">
                ${image ? `<div class=${imageWrapperClass}>
                        <img class=${imageClass} src="${image}" alt="${title}" />
                    </div>` : ''}
                <div class="kg-collection-card-content">
                    ${title ? `<h2 class=${titleClass}>${title}</h2>` : ''}
                    ${excerpt ? `<p class=${excerptClass}>${excerpt}</p>` : ''}
                    <div class=${metaClass}>
                        ${publishDate ? `<p>${DateTime.fromISO(publishDate).toFormat('d LLL yyyy')}</p>` : ''}
                        ${readTime > 0 ? `<p>&nbsp;&middot; ${readTime} min</p>` : ''}
                    </div>
                </div>
            </div>
        </a>`;
}

function getLayout(domNode) {
  if (domNode.classList.contains('kg-collection-card-list')) {
    return 'list';
  } else {
    // should have kg-collection-card-grid
    return 'grid';
  }
}
function getColumns(domNode) {
  if (domNode.classList.contains('columns-1')) {
    return 1;
  }
  if (domNode.classList.contains('columns-2')) {
    return 2;
  }
  if (domNode.classList.contains('columns-3')) {
    return 3;
  }
  if (domNode.classList.contains('columns-4')) {
    return 4;
  }
}
function collectionParser(CollectionNode) {
  return {
    div: nodeElem => {
      const isCollectionNode = nodeElem.classList?.contains('kg-collection-card');
      if (nodeElem.tagName === 'DIV' && isCollectionNode) {
        return {
          conversion(domNode) {
            const postCount = parseInt(domNode.getAttribute('data-kg-collection-limit'));
            const collection = domNode.getAttribute('data-kg-collection-slug');
            const layout = getLayout(domNode);
            const header = domNode.querySelector('.kg-collection-card-title')?.textContent || '';
            const columns = layout === 'list' ? 3 : getColumns(domNode); // default to 3 if switched to grid

            const payload = {
              collection,
              postCount,
              layout,
              columns,
              header
            };
            const node = new CollectionNode(payload);
            return {
              node
            };
          },
          priority: 1
        };
      }
      return null;
    }
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class CollectionNode extends generateDecoratorNode({
  nodeType: 'collection',
  properties: [{
    name: 'collection',
    default: 'latest'
  },
  // start with empty object; might want to just store the slug
  {
    name: 'postCount',
    default: 3
  }, {
    name: 'layout',
    default: 'grid'
  }, {
    name: 'columns',
    default: 3
  }, {
    name: 'header',
    default: '',
    wordCount: true
  }]
}) {
  static importDOM() {
    return collectionParser(this);
  }
  exportDOM(options = {}) {
    return renderCollectionNode(this, options);
  }
  hasDynamicData() {
    return true;
  }
  async getDynamicData(options = {}) {
    const key = this.getKey();
    const collection = this.__collection;
    const postCount = this.__postCount;
    if (!options?.getCollectionPosts) {
      return;
    }
    const posts = await options.getCollectionPosts(collection, postCount);
    return {
      key,
      data: posts
    };
  }
}
const $createCollectionNode = dataset => {
  return new CollectionNode(dataset);
};
function $isCollectionNode(node) {
  return node instanceof CollectionNode;
}

/* eslint-disable ghost/filenames/match-exported-class */

// Since the TextNode is foundational to all Lexical packages, including the
// plain text use case. Handling any rich text logic is undesirable. This creates
// the need to override the TextNode to handle serialization and deserialization
// of HTML/CSS styling properties to achieve full fidelity between JSON <-> HTML.
//
// https://lexical.dev/docs/concepts/serialization#handling-extended-html-styling

const extendedTextNodeReplacement = {
  replace: TextNode,
  with: node => new ExtendedTextNode(node.__text)
};
class ExtendedTextNode extends TextNode {
  constructor(text, key) {
    super(text, key);
  }
  static getType() {
    return 'extended-text';
  }
  static clone(node) {
    return new ExtendedTextNode(node.__text, node.__key);
  }
  static importDOM() {
    const importers = TextNode.importDOM();
    return {
      ...importers,
      span: () => ({
        conversion: patchConversion(importers?.span, convertSpanElement),
        priority: 1
      })
    };
  }
  static importJSON(serializedNode) {
    return TextNode.importJSON(serializedNode);
  }
  exportJSON() {
    const json = super.exportJSON();
    json.type = 'extended-text';
    return json;
  }
  isSimpleText() {
    return (this.__type === 'text' || this.__type === 'extended-text') && this.__mode === 0;
  }
  isInline() {
    return true;
  }
}
function patchConversion(originalDOMConverter, convertFn) {
  return node => {
    const original = originalDOMConverter?.(node);
    if (!original) {
      return null;
    }
    const originalOutput = original.conversion(node);
    if (!originalOutput) {
      return originalOutput;
    }
    return {
      ...originalOutput,
      forChild: (lexicalNode, parent) => {
        const originalForChild = originalOutput?.forChild ?? (x => x);
        const result = originalForChild(lexicalNode, parent);
        if ($isTextNode(result)) {
          return convertFn(result, node);
        }
        return result;
      }
    };
  };
}
function convertSpanElement(lexicalNode, domNode) {
  const span = domNode;

  // Word uses span tags + font-weight for bold text
  const hasBoldFontWeight = span.style.fontWeight === 'bold' || span.parentElement?.style.fontWeight === 'bold';
  // Word uses span tags + font-style for italic text
  const hasItalicFontStyle = span.style.fontStyle === 'italic' || span.parentElement?.style.fontStyle === 'italic';
  // Word uses span tags + text-decoration for underline text
  const hasUnderlineTextDecoration = span.style.textDecoration === 'underline' || span.parentElement?.style.textDecoration === 'underline';
  // Word uses span tags + "Strikethrough" class for strikethrough text
  const hasStrikethroughClass = span.classList.contains('Strikethrough') || span.parentElement?.classList.contains('Strikethrough');
  // Word uses span tags + "Highlight" class for highlighted text
  const hasHighlightClass = span.classList.contains('Highlight') || span.parentElement?.classList.contains('Highlight');
  if (hasBoldFontWeight && !lexicalNode.hasFormat('bold')) {
    lexicalNode = lexicalNode.toggleFormat('bold');
  }
  if (hasItalicFontStyle && !lexicalNode.hasFormat('italic')) {
    lexicalNode = lexicalNode.toggleFormat('italic');
  }
  if (hasUnderlineTextDecoration && !lexicalNode.hasFormat('underline')) {
    lexicalNode = lexicalNode.toggleFormat('underline');
  }
  if (hasStrikethroughClass && !lexicalNode.hasFormat('strikethrough')) {
    lexicalNode = lexicalNode.toggleFormat('strikethrough');
  }
  if (hasHighlightClass && !lexicalNode.hasFormat('highlight')) {
    lexicalNode = lexicalNode.toggleFormat('highlight');
  }
  return lexicalNode;
}

/* eslint-disable ghost/filenames/match-exported-class */

// Since the HeadingNode is foundational to Lexical rich-text, only using a
// custom HeadingNode is undesirable as it means every package would need to
// be updated to work with the custom node. Instead we can use Lexical's node
// override/replacement mechanism to extend the default with our custom parsing
// logic.
//
// https://lexical.dev/docs/concepts/serialization#handling-extended-html-styling

const extendedHeadingNodeReplacement = {
  replace: HeadingNode,
  with: node => new ExtendedHeadingNode(node.__tag)
};
class ExtendedHeadingNode extends HeadingNode {
  constructor(tag, key) {
    super(tag, key);
  }
  static getType() {
    return 'extended-heading';
  }
  static clone(node) {
    return new ExtendedHeadingNode(node.__tag, node.__key);
  }
  static importDOM() {
    const importers = HeadingNode.importDOM();
    return {
      ...importers,
      p: patchParagraphConversion(importers?.p)
    };
  }
  static importJSON(serializedNode) {
    return HeadingNode.importJSON(serializedNode);
  }
  exportJSON() {
    const json = super.exportJSON();
    json.type = 'extended-heading';
    return json;
  }
}
function patchParagraphConversion(originalDOMConverter) {
  return node => {
    // Original matches Google Docs p node to a null conversion so it's
    // child span is parsed as a heading. Don't prevent that here
    const original = originalDOMConverter?.(node);
    if (original) {
      return original;
    }
    const p = node;

    // Word uses paragraphs with role="heading" to represent headings
    // and an aria-level="x" to represent the heading level
    const hasAriaHeadingRole = p.getAttribute('role') === 'heading';
    const hasAriaLevel = p.getAttribute('aria-level');
    if (hasAriaHeadingRole && hasAriaLevel) {
      const level = parseInt(hasAriaLevel, 10);
      if (level > 0 && level < 7) {
        return {
          conversion: () => {
            return {
              node: new ExtendedHeadingNode(`h${level}`)
            };
          },
          priority: 1
        };
      }
    }
    return null;
  };
}

/* eslint-disable ghost/filenames/match-exported-class */

// Since the QuoteNode is foundational to Lexical rich-text, only using a
// custom QuoteNode is undesirable as it means every package would need to
// be updated to work with the custom node. Instead we can use Lexical's node
// override/replacement mechanism to extend the default with our custom parsing
// logic.
//
// https://lexical.dev/docs/concepts/serialization#handling-extended-html-styling

const extendedQuoteNodeReplacement = {
  replace: QuoteNode,
  with: () => new ExtendedQuoteNode()
};
class ExtendedQuoteNode extends QuoteNode {
  constructor(key) {
    super(key);
  }
  static getType() {
    return 'extended-quote';
  }
  static clone(node) {
    return new ExtendedQuoteNode(node.__key);
  }
  static importDOM() {
    const importers = QuoteNode.importDOM();
    return {
      ...importers,
      blockquote: convertBlockquoteElement
    };
  }
  static importJSON(serializedNode) {
    return QuoteNode.importJSON(serializedNode);
  }
  exportJSON() {
    const json = super.exportJSON();
    json.type = 'extended-quote';
    return json;
  }

  /* c8 ignore start */
  extractWithChild() {
    return true;
  }
  /* c8 ignore end */
}
function convertBlockquoteElement() {
  return {
    conversion: () => {
      const node = new ExtendedQuoteNode();
      return {
        node,
        after: childNodes => {
          // Blockquotes can have nested paragraphs. In our original mobiledoc
          // editor we parsed all of the nested paragraphs into a single blockquote
          // separating each paragraph with two line breaks. We replicate that
          // here so we don't have a breaking change in conversion behaviour.
          const newChildNodes = [];
          childNodes.forEach(child => {
            if ($isParagraphNode(child)) {
              if (newChildNodes.length > 0) {
                newChildNodes.push($createLineBreakNode());
                newChildNodes.push($createLineBreakNode());
              }
              newChildNodes.push(...child.getChildren());
            } else {
              newChildNodes.push(child);
            }
          });
          return newChildNodes;
        }
      };
    },
    priority: 1
  };
}

/* eslint-disable ghost/filenames/match-exported-class */
class TKNode extends TextNode {
  static getType() {
    return 'tk';
  }
  static clone(node) {
    return new TKNode(node.__text, node.__key);
  }
  constructor(text, key) {
    super(text, key);
  }
  createDOM(config) {
    const element = super.createDOM(config);
    const classes = config.theme.tk?.split(' ') || [];
    element.classList.add(...classes);
    element.dataset.kgTk = true;
    return element;
  }
  static importJSON(serializedNode) {
    const node = $createTKNode(serializedNode.text);
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);
    return node;
  }
  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'tk'
    };
  }
  canInsertTextBefore() {
    return false;
  }
  isTextEntity() {
    return true;
  }
}

/**
 * Generates a TKNode, which is a string following the format of a # followed by some text, eg. #lexical.
 * @param text - The text used inside the TKNode.
 * @returns - The TKNode with the embedded text.
 */
function $createTKNode(text) {
  return $applyNodeReplacement(new TKNode(text));
}

/**
 * Determines if node is a TKNode.
 * @param node - The node to be checked.
 * @returns true if node is a TKNode, false otherwise.
 */
function $isTKNode(node) {
  return node instanceof TKNode;
}

var linkSVG = "<svg xmlns=\"http://www.w3.org/2000/svg\" fill=\"none\" viewBox=\"0 0 24 24\">\n    <path stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M13.54 10.46c2.2 2.2 2.2 5.61 0 7.81l-3.08 3.08c-2.2 2.2-5.61 2.2-7.81 0-2.2-2.2-2.2-5.61 0-7.81L5.4 10.9\"/>\n    <path stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M10.46 13.54c-2.2-2.2-2.2-5.61 0-7.81l3.08-3.08c2.2-2.2 5.61-2.2 7.81 0 2.2 2.2 2.2 5.61 0 7.81L18.6 13.1\"/>\n</svg>";

/* eslint-disable ghost/filenames/match-exported-class */
// Container element for a link search query. Temporary node used only inside
// the editor that will be replaced with a LinkNode when the search is complete.
class AtLinkNode extends ElementNode {
  // We keep track of the format that was applied to the original '@' character
  // so we can re-apply that when converting to a LinkNode
  __linkFormat = null;
  static getType() {
    return 'at-link';
  }
  constructor(linkFormat, key) {
    super(key);
    this.__linkFormat = linkFormat;
  }
  static clone(node) {
    return new AtLinkNode(node.__linkFormat, node.__key);
  }

  // This is a temporary node, it should never be serialized but we need
  // to implement just in case and to match expected types. The AtLinkPlugin
  // should take care of replacing this node with it's children when needed.
  static importJSON({
    linkFormat
  }) {
    return $createAtLinkNode(linkFormat);
  }
  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'at-link',
      version: 1,
      linkFormat: this.__linkFormat
    };
  }
  createDOM(config) {
    const span = document.createElement('span');
    const atLinkClasses = (config.theme.atLink || '').split(' ').filter(Boolean);
    const atLinkIconClasses = (config.theme.atLinkIcon || '').split(' ').filter(Boolean);
    span.classList.add(...atLinkClasses);
    const svgElement = new DOMParser().parseFromString(linkSVG, 'image/svg+xml').documentElement;
    svgElement.classList.add(...atLinkIconClasses);
    span.appendChild(svgElement);
    return span;
  }
  updateDOM() {
    return false;
  }

  // should not render anything - this is a placeholder node
  exportDOM() {
    return null;
  }

  /* c8 ignore next 3 */
  static importDOM() {
    return null;
  }
  getTextContent() {
    return '';
  }
  isInline() {
    return true;
  }
  canBeEmpty() {
    return false;
  }
  setLinkFormat(linkFormat) {
    const self = this.getWritable();
    self.__linkFormat = linkFormat;
  }
  getLinkFormat() {
    const self = this.getLatest();
    return self.__linkFormat;
  }
}
function $createAtLinkNode(linkFormat) {
  return $applyNodeReplacement(new AtLinkNode(linkFormat));
}
function $isAtLinkNode(node) {
  return node instanceof AtLinkNode;
}

/* eslint-disable ghost/filenames/match-exported-class */

// Represents the search query string inside an AtLinkNode. Used in place of a
// regular TextNode to allow for :after styling to be applied to work as a placeholder
class AtLinkSearchNode extends TextNode {
  __placeholder = null;
  defaultPlaceholder = 'Find a post, tag or author';
  static getType() {
    return 'at-link-search';
  }
  constructor(text, placeholder, key) {
    super(text, key);
    this.__placeholder = placeholder;
  }
  static clone(node) {
    return new AtLinkSearchNode(node.__text, node.__placeholder, node.__key);
  }

  // This is a temporary node, it should never be serialized but we need
  // to implement just in case and to match expected types. The AtLinkPlugin
  // should take care of replacing this node when needed.
  static importJSON({
    text,
    placeholder
  }) {
    return $createAtLinkSearchNode(text, placeholder);
  }
  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'at-link-search',
      version: 1,
      placeholder: this.__placeholder
    };
  }
  createDOM(config) {
    const span = super.createDOM(config);
    span.dataset.placeholder = '';
    if (!this.__text) {
      span.dataset.placeholder = this.__placeholder ?? this.defaultPlaceholder;
    } else {
      span.dataset.placeholder = this.__placeholder || '';
    }
    span.classList.add(...config.theme.atLinkSearch.split(' '));
    return span;
  }
  updateDOM(prevNode, dom) {
    if (this.__text) {
      dom.dataset.placeholder = this.__placeholder ?? '';
    }
    return super.updateDOM(...arguments);
  }

  // should not render anything - this is a placeholder node
  exportDOM() {
    return null;
  }

  /* c8 ignore next 3 */
  static importDOM() {
    return null;
  }
  canHaveFormat() {
    return false;
  }
  setPlaceholder(text) {
    const self = this.getWritable();
    self.__placeholder = text;
  }
  getPlaceholder() {
    const self = this.getLatest();
    return self.__placeholder;
  }

  // Lexical will incorrectly pick up this node as an element node when the
  // cursor is placed by the SVG icon element in the parent AtLinkNode. We
  // need these methods to avoid throwing errors in that case but otherwise
  // behaviour is unaffected.
  getChildrenSize() {
    return 0;
  }
  getChildAtIndex() {
    return null;
  }
}
function $createAtLinkSearchNode(text = '', placeholder = null) {
  return $applyNodeReplacement(new AtLinkSearchNode(text, placeholder));
}
function $isAtLinkSearchNode(node) {
  return node instanceof AtLinkSearchNode;
}

/* eslint-disable ghost/filenames/match-exported-class */

// This is used in places where we need an extra cursor position at the
// beginning of an element node as it prevents Lexical normalizing the
// cursor position to the end of the previous node.
class ZWNJNode extends TextNode {
  static getType() {
    return 'zwnj';
  }
  static clone(node) {
    return new ZWNJNode('', node.__key);
  }
  createDOM(config) {
    const span = super.createDOM(config);
    span.innerHTML = '&zwnj;';
    return span;
  }
  updateDOM() {
    return false;
  }
  exportJSON() {
    return {
      ...super.exportJSON(),
      type: 'zwnj',
      version: 1
    };
  }
  getTextContent() {
    return '';
  }
  isToken() {
    return true;
  }
}
function $createZWNJNode() {
  return new ZWNJNode('');
}
function $isZWNJNode(node) {
  return node instanceof ZWNJNode;
}

var linebreakSerializers = {
  import: {
    br: node => {
      const isGoogleDocs = !!node.closest('[id^="docs-internal-guid-"]');
      const previousNodeName = node.previousElementSibling?.nodeName;
      const nextNodeName = node.nextElementSibling?.nodeName;
      const headings = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
      const lists = ['UL', 'OL', 'DL'];

      // Remove empty paragraphs when copy/pasting from Google docs:
      // - Between two paragraphs (P and P)
      // - Between multiple linebreaks (BR and BR)
      // - Between a list and a paragraph (UL/OL/DL and P), and vice versa
      // - Between a heading and a paragraph (H1-H6 and P), and vice versa
      if (isGoogleDocs) {
        if (previousNodeName === 'P' && nextNodeName === 'P' || previousNodeName === 'BR' || nextNodeName === 'BR' || [...headings, ...lists].includes(previousNodeName) && nextNodeName === 'P' || previousNodeName === 'P' && [...headings, ...lists].includes(nextNodeName)) {
          return {
            conversion: () => null,
            priority: 1
          };
        }
      }

      // allow lower priority converter to handle (i.e. default LineBreakNode.importDOM)
      return null;
    }
  }
};

var paragraphSerializers = {
  import: {
    p: node => {
      const isGoogleDocs = !!node.closest('[id^="docs-internal-guid-"]');

      // Google docs wraps dividers in paragraphs, without text content
      // Remove them to avoid creating empty paragraphs in the editor
      if (isGoogleDocs && node.textContent === '') {
        return {
          conversion: () => null,
          priority: 1
        };
      }
      return null;
    }
  }
};

const utils = {
  generateDecoratorNode,
  visibility: visibilityUtils
};
const serializers = {
  linebreak: linebreakSerializers,
  paragraph: paragraphSerializers
};
const DEFAULT_CONFIG = {
  html: {
    import: {
      ...serializers.linebreak.import,
      ...serializers.paragraph.import
    }
  }
};

// export convenience objects for use elsewhere
const DEFAULT_NODES = [ExtendedTextNode, extendedTextNodeReplacement, ExtendedHeadingNode, extendedHeadingNodeReplacement, ExtendedQuoteNode, extendedQuoteNodeReplacement, CodeBlockNode, ImageNode, MarkdownNode, VideoNode, AudioNode, CalloutNode, CallToActionNode, AsideNode, HorizontalRuleNode, HtmlNode, FileNode, ToggleNode, ButtonNode, HeaderNode, BookmarkNode, PaywallNode, ProductNode, EmbedNode, EmailNode, GalleryNode, EmailCtaNode, SignupNode, CollectionNode, TKNode, AtLinkNode, AtLinkSearchNode, ZWNJNode];

export { $createAsideNode, $createAtLinkNode, $createAtLinkSearchNode, $createAudioNode, $createBookmarkNode, $createButtonNode, $createCallToActionNode, $createCalloutNode, $createCodeBlockNode, $createCollectionNode, $createEmailCtaNode, $createEmailNode, $createEmbedNode, $createFileNode, $createGalleryNode, $createHeaderNode, $createHorizontalRuleNode, $createHtmlNode, $createImageNode, $createMarkdownNode, $createPaywallNode, $createProductNode, $createSignupNode, $createTKNode, $createToggleNode, $createVideoNode, $createZWNJNode, $isAsideNode, $isAtLinkNode, $isAtLinkSearchNode, $isAudioNode, $isBookmarkNode, $isButtonNode, $isCallToActionNode, $isCalloutNode, $isCodeBlockNode, $isCollectionNode, $isEmailCtaNode, $isEmailNode, $isEmbedNode, $isFileNode, $isGalleryNode, $isHeaderNode, $isHorizontalRuleNode, $isHtmlNode, $isImageNode, $isKoenigCard, $isMarkdownNode, $isPaywallNode, $isProductNode, $isSignupNode, $isTKNode, $isToggleNode, $isVideoNode, $isZWNJNode, AsideNode, AtLinkNode, AtLinkSearchNode, AudioNode, BookmarkNode, ButtonNode, CallToActionNode, CalloutNode, CodeBlockNode, CollectionNode, DEFAULT_CONFIG, DEFAULT_NODES, EmailCtaNode, EmailNode, EmbedNode, ExtendedHeadingNode, ExtendedQuoteNode, ExtendedTextNode, FileNode, GalleryNode, HeaderNode, HorizontalRuleNode, HtmlNode, ImageNode, KoenigDecoratorNode, MarkdownNode, PaywallNode, ProductNode, SignupNode, TKNode, ToggleNode, VideoNode, ZWNJNode, extendedHeadingNodeReplacement, extendedQuoteNodeReplacement, extendedTextNodeReplacement, serializers, utils };
//# sourceMappingURL=kg-default-nodes.js.map
