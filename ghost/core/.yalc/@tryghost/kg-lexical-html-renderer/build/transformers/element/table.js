"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const table_1 = require("@lexical/table");
const lexical_1 = require("lexical");
function renderTableCell(node, options, exportChildren) {
    const tag = node.getTag();
    const attributes = [];
    if (node.getColSpan() > 1) {
        attributes.push(`colspan="${node.getColSpan()}"`);
    }
    if (node.getRowSpan() > 1) {
        attributes.push(`rowspan="${node.getRowSpan()}"`);
    }
    const width = node.getWidth();
    if (width) {
        attributes.push(`style="width:${width}px"`);
    }
    const attributeString = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
    const innerHtml = node.getChildren().map((child) => {
        if ((0, lexical_1.$isParagraphNode)(child)) {
            return `<p>${exportChildren(child, options)}</p>`;
        }
        return exportChildren(child, options);
    }).join('');
    return `<${tag}${attributeString}>${innerHtml}</${tag}>`;
}
function renderTableRow(node, options, exportChildren) {
    if (!(node instanceof table_1.TableRowNode)) {
        return null;
    }
    const cells = node.getChildren().map((child) => {
        if (!(child instanceof table_1.TableCellNode)) {
            return '';
        }
        return renderTableCell(child, options, exportChildren);
    }).join('');
    return `<tr>${cells}</tr>`;
}
function renderTable(node, options, exportChildren) {
    if (!(node instanceof table_1.TableNode)) {
        return null;
    }
    const rows = node.getChildren().map((child) => {
        if (!(child instanceof table_1.TableRowNode)) {
            return '';
        }
        return renderTableRow(child, options, exportChildren) || '';
    }).join('');
    return `<table><tbody>${rows}</tbody></table>`;
}
module.exports = {
    export(node, options, exportChildren) {
        return renderTable(node, options, exportChildren);
    }
};
//# sourceMappingURL=table.js.map