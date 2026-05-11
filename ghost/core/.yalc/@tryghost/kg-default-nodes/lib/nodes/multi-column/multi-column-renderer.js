import {addCreateDocumentOption} from '../../utils/add-create-document-option';
import {renderEmptyContainer} from '../../utils/render-empty-container';

export function renderMultiColumnNode(node, options = {}) {
    addCreateDocumentOption(options);
    const document = options.createDocument();
    const {columns, gap, column1, column2, column3, column4} = node.getDataset();
    const columnCount = columns >= 4 ? 4 : columns === 3 ? 3 : 2;
    const renderedColumns = [column1, column2, column3, column4].slice(0, columnCount);

    if (!renderedColumns.length) {
        return renderEmptyContainer(document);
    }

    const element = document.createElement('div');
    element.className = `kg-card kg-multi-column-card kg-width-wide columns-${columnCount}`;
    element.setAttribute('data-kg-multi-column-columns', `${columnCount}`);
    element.setAttribute('data-kg-multi-column-gap', `${gap}`);
    element.style.display = 'grid';
    element.style.setProperty('--kg-multi-column-gap', `${gap}rem`);

    renderedColumns.forEach((html, index) => {
        const column = document.createElement('div');
        column.className = 'kg-multi-column-card-column';
        column.setAttribute('data-kg-multi-column-column', `${index + 1}`);
        column.innerHTML = html || '';
        element.appendChild(column);
    });

    return {element};
}
