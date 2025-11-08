export function parsePostComponentNode(PostComponentNode) {
    return {
        div: (nodeElem) => {
            const isKgChartCard = nodeElem.classList?.contains('kg-component-card');
            if (nodeElem.tagName === 'DIV' && isKgChartCard) {
                return {
                    conversion(domNode) {
                        const id = domNode.dataset.id;
                        const name = domNode.dataset.name;
                        const post_id = domNode.dataset.postId;
                        const title = domNode.querySelector('.kg-component-card-title')?.textContent || '';
                        const excerpt = domNode.querySelector('.kg-component-card-excerpt')?.textContent || '';
                        const image = domNode.querySelector('.kg-component-card-image')?.src || '';
                        const payload = {
                            id,
                            post_id,
                            name,
                            title,
                            excerpt,
                            image,
                        };

                        const node = new PostComponentNode(payload);
                        return {node};
                    },
                    priority: 1
                };
            }
            return null;
        }
    };
}
