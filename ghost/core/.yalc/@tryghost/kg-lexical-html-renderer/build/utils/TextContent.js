"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const link_1 = require("@lexical/link");
const lexical_1 = require("lexical");
const FORMAT_TAG_MAP = {
    bold: 'STRONG',
    italic: 'EM',
    strikethrough: 'S',
    underline: 'U',
    code: 'CODE',
    subscript: 'SUB',
    superscript: 'SUP',
    highlight: 'MARK'
};
const ensureDomProperty = (options) => {
    return !!options.dom;
};
// Builds and renders text content, useful to ensure proper format tag opening/closing
// and html escaping
class TextContent {
    nodes;
    exportChildren;
    options;
    constructor(exportChildren, options) {
        if (ensureDomProperty(options) === false) {
            // eslint-disable-next-line ghost/ghost-custom/no-native-error
            throw new Error('TextContent requires a dom property in the options argument');
        }
        this.exportChildren = exportChildren;
        this.options = options;
        this.nodes = [];
    }
    addNode(node) {
        this.nodes.push(node);
    }
    render() {
        const document = this.options.dom.window.document;
        const root = document.createElement('div');
        let currentNode = root;
        const openFormats = [];
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            if ((0, lexical_1.$isLineBreakNode)(node)) {
                currentNode.append(document.createElement('BR'));
                continue;
            }
            if ((0, link_1.$isLinkNode)(node)) {
                const anchor = document.createElement('A');
                this._buildAnchorElement(anchor, node);
                currentNode.append(anchor);
                continue;
            }
            if ((0, lexical_1.$isTextNode)(node)) {
                // shortcut format code for plain text
                if (node.getFormat() === 0) {
                    currentNode.append(node.getTextContent());
                    continue;
                }
                // open format tags in correct order
                const formatsToOpen = [];
                // get base list of formats that need to open
                Object.entries(FORMAT_TAG_MAP).forEach(([format]) => {
                    if (node.hasFormat(format) && !openFormats.includes(format)) {
                        formatsToOpen.push(format);
                    }
                });
                // re-order formats to open based on next nodes - we want to make
                // sure tags that will be kept open for later nodes are opened first
                const remainingNodes = this.nodes.slice(i + 1);
                // avoid checking any nodes after a link node because those cause all formats to close
                const nextLinkNodeIndex = remainingNodes.findIndex(n => (0, link_1.$isLinkNode)(n));
                const remainingSortNodes = nextLinkNodeIndex === -1 ? remainingNodes : remainingNodes.slice(0, nextLinkNodeIndex);
                // ensure we're only working with text nodes as they're the only ones that can open/close formats
                const remainingSortedTextNodes = remainingSortNodes.filter(n => (0, lexical_1.$isTextNode)(n));
                formatsToOpen.sort((a, b) => {
                    const aIndex = remainingSortedTextNodes.findIndex(n => n.hasFormat(a));
                    const bIndex = remainingSortedTextNodes.findIndex(n => n.hasFormat(b));
                    if (aIndex === -1) {
                        return 1;
                    }
                    if (bIndex === -1) {
                        return -1;
                    }
                    return aIndex - bIndex;
                });
                // open new tags
                formatsToOpen.forEach((format) => {
                    const formatTag = document.createElement(FORMAT_TAG_MAP[format]);
                    currentNode.append(formatTag);
                    currentNode = formatTag;
                    openFormats.push(format);
                });
                // insert text
                currentNode.append(node.getTextContent());
                // close tags in correct order if next node doesn't have the format
                // links are their own formatting islands so all formats need to close before a link
                const nextNode = remainingNodes.find(n => (0, lexical_1.$isTextNode)(n) || (0, link_1.$isLinkNode)(n));
                [...openFormats].forEach((format) => {
                    if (!nextNode || (0, link_1.$isLinkNode)(nextNode) || (nextNode instanceof lexical_1.TextNode && !nextNode.hasFormat(format))) {
                        currentNode = currentNode.parentNode;
                        openFormats.pop();
                    }
                });
                continue;
            }
        }
        return root.innerHTML;
    }
    isEmpty() {
        return this.nodes.length === 0;
    }
    clear() {
        this.nodes = [];
    }
    // PRIVATE -----------------------------------------------------------------
    _buildAnchorElement(anchor, node) {
        // Only set the href if we have a URL, otherwise we get a link to the current page
        if (node.getURL()) {
            anchor.setAttribute('href', node.getURL());
        }
        if (node.getRel()) {
            anchor.setAttribute('rel', node.getRel() || '');
        }
        anchor.innerHTML = this.exportChildren(node, this.options);
    }
}
exports.default = TextContent;
//# sourceMappingURL=TextContent.js.map