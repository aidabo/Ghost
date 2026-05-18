export function multiColumnParser(MultiColumnNode) {
    return {
        div: (nodeElem) => {
            const isMultiColumnNode = nodeElem.classList?.contains('kg-multi-column-card');
            if (nodeElem.tagName === 'DIV' && isMultiColumnNode) {
                return {
                    conversion(domNode) {
                        const columnCount = parseInt(domNode.getAttribute('data-kg-multi-column-columns'), 10) || 2;
                        const parsedGap = parseFloat(domNode.getAttribute('data-kg-multi-column-gap') || domNode.style.getPropertyValue('--kg-multi-column-gap') || domNode.style.gap);
                        const gap = Number.isFinite(parsedGap) ? parsedGap : 1.5;
                        const columnElements = Array.from(domNode.children).filter(child => child.classList?.contains('kg-multi-column-card-column'));

                        const payload = {
                            columns: columnCount,
                            gap,
                            column1: columnElements[0]?.innerHTML || '',
                            column2: columnElements[1]?.innerHTML || '',
                            column3: columnElements[2]?.innerHTML || '',
                            column4: columnElements[3]?.innerHTML || ''
                        };

                        const node = new MultiColumnNode(payload);
                        return {node};
                    },
                    priority: 1
                };
            }
            return null;
        }
    };
}
