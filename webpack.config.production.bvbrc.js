const { createBVBRC } = require('./webpack.config.common.js');

const bvbrc = ['mol-bvbrc'];

module.exports = [
    ...bvbrc.map(createBVBRC)
];
