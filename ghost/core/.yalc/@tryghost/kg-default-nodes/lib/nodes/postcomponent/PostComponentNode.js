/* eslint-disable ghost/filenames/match-exported-class */
import {generateDecoratorNode} from '../../generate-decorator-node';
import {renderPostComponentNode} from './PostComponent-Renderer';
import {parsePostComponentNode} from './PostComponent-Parser';

const COMPONENT_NODE_TYPE = 'post-component';

export class PostComponentNode extends generateDecoratorNode({nodeType: COMPONENT_NODE_TYPE,
    properties: [
        {name: 'id', default: ''},
        {name: 'post_id', default: ''},
        {name: 'name', default: ''},
        {name: 'title', default: ''},
        {name: 'excerpt', default: ''},
        {name: 'image', default: '', urlType: 'url'},
        {name: 'props', default: '{}'},
        {name: 'options', default: '{}'},
    ]}
) {
    /* @override */
    exportJSON() {
        const {id, post_id, name, title, excerpt, image, options, props} = this;
        return {
            type: COMPONENT_NODE_TYPE,
            id,
            post_id,
            name,
            title,
            excerpt,
            image,
            options,
            props
        };
    }

    static importDOM() {
        return parsePostComponentNode(this);
    }

    exportDOM(options = {}) {
        return renderPostComponentNode(this, options);
    }
}

export function $isPostComponentNode(node) {
    return node instanceof PostComponentNode;
}

export const $createPostComponentNode = (dataset) => {
    return new PostComponentNode(dataset);
};
