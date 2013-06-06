/**
 * MapReduce functions
 */
var clients = require('./clients');
var groups = require('./groups');

module.exports = {
    clients: clients.mapReduce,
    groups: groups.mapReduce
};
