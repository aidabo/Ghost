if (process.env.FRONT_END_URL) {
    process.env.FRONT_END_URL = process.env.FRONT_END_URL.replace(/\/+$/, '');
}

require('./ghost');
