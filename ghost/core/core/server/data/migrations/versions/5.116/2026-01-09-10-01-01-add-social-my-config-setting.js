const { addSetting } = require('../../utils');

module.exports = addSetting({
    key: 'my_config',
    value: null,
    type: 'string',
    group: 'theme'
});
