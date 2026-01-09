const {addSetting} = require('../../utils');

module.exports = addSetting({
    key: 'my_config',
    value: '{"foo":1,"bar":"baz"}',
    type: 'json',
    group: 'theme'
});
