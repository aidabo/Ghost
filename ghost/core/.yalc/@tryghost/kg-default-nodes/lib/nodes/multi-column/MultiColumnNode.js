/* eslint-disable ghost/filenames/match-exported-class */
import {generateDecoratorNode} from '../../generate-decorator-node';
import {renderMultiColumnNode} from './multi-column-renderer';
import {multiColumnParser} from './multi-column-parser';

export class MultiColumnNode extends generateDecoratorNode({
    nodeType: 'multi-column',
    properties: [
        {name: 'columns', default: 2},
        {name: 'gap', default: 1.5},
        {name: 'column1', default: '', urlType: 'html', wordCount: true},
        {name: 'column2', default: '', urlType: 'html', wordCount: true},
        {name: 'column3', default: '', urlType: 'html', wordCount: true},
        {name: 'column4', default: '', urlType: 'html', wordCount: true}
    ]
}) {
    static importDOM() {
        return multiColumnParser(this);
    }

    exportDOM(options = {}) {
        return renderMultiColumnNode(this, options);
    }
}

export const $createMultiColumnNode = (dataset) => {
    return new MultiColumnNode(dataset);
};

export function $isMultiColumnNode(node) {
    return node instanceof MultiColumnNode;
}
