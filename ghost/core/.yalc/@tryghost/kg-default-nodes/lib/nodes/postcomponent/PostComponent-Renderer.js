import {addCreateDocumentOption} from '../../utils/add-create-document-option';
import {renderEmptyContainer} from '../../utils/render-empty-container';

export function renderPostComponentNode(node, options = {}) {
    addCreateDocumentOption(options);
    const document = options.createDocument();

    if (!node.id || node.id.trim() === '' || !node.name || node.name.trim() === '') {
        return renderEmptyContainer(document);
    }

    return cardTemplate(node, document);
}

function cardTemplate(node, document) {
    const html = (
        `<div class="kg-card kg-component-card" data-id="${node.id}" data-post-id="${node.post_id}" data-name="${node.name}">
            <div class="kg-component-card-content">
                ${node.image ? `<img src="${node.image}" alt="${node.title}" class="kg-component-card-image" />` : ''}
                <div class="kg-component-card-text">
                    <h3 class="kg-component-card-title">${node.title}</h3>
                    ${node.excerpt ? `<p class="kg-component-card-excerpt">${node.excerpt}</p>` : ''}
                </div>
            </div>
            <!-- Custom component would be rendered here based on options/props -->
            <div class="kg-component-card-rendered">
                ${node.options || ''}
            </div>
        </div>`
    );

    const container = document.createElement('div');
    container.innerHTML = html.trim();

    return {element: container.firstElementChild};
}    
