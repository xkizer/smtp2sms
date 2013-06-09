var defaultMongoOptions = {
    auto_reconnect: true,
    safe: true
};

var mongoCache = {};

/**
 * Connect to a mongodb server and collection
 */
exports.mongoConnect = function(data, callback) {
    var dbname = data.db || 'meeveep',
        collection = data.collection || null,
        options  = data.options || {};
    
    // Check the cache
    // Please note that the order of the arguments is important in caching
    var cacheStr = JSON.stringify(data);
    
    if(mongoCache[cacheStr]) {
        if(data.collection) {
            return callback(null, mongoCache[cacheStr].collection, mongoCache[cacheStr].db);
        } else {
            return callback(null, mongoCache[cacheStr].db);
        }
    }
    
    // Set options
    options = {}.extend(defaultMongoOptions).extend(options);
    
    // Get the database requested
    var dbinfo = require('./dbinfo.js');
    info = dbinfo.mongo[dbname];
    
    if(!info) {
        return callback('Unknown database ' + dbname);
    }
    
    // We check if the collection is in the list of our collections...
    // Prevents accidental discharge
    if(collection && info.collections.indexOf(collection) < 0) {
        return callback('Collection ' + collection + ' not in the list of supported collections for this DB.');
    }
    
    var mongodb = require("mongodb"),
        mongoserver = new mongodb.Server(info.host, info.port, options),
        connector = new mongodb.Db(info.db, mongoserver, options);

    connector.open(function(err, db) {
        if(err) {
            return callback(err);
        }
        
        if(info.auth) {
            db.authenticate(info.auth.username, info.auth.password, function (err) {
                if(err) {
                    return callback(err);
                }
                
                doContinue();
            });
        } else {
            doContinue();
        }
        
        function doContinue() {
            // When the connection closes, remove from cache
            db.on('close', function () {
                delete mongoCache[cacheStr];
            });

            if(!collection) {
                mongoCache[cacheStr] = {db: db};
                return callback(null, db);
            }

            db.collection(collection, function(err, collection) {
                if(err) {
                    return callback(err);
                }

                mongoCache[cacheStr] = {db: db, collection: collection};
                return callback(null, collection, db);
            });
        }
    });
};

var redisQueue = {},
    redisClients = {},
    defaultRedisOptions = {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: 1
    };

/**
 * Helper function to dispatch action to a queue
 */
function redisDispatch(cacheString, err, client) {
    redisQueue[cacheString].forEach(function (callback) {
        return callback(err, client);
    });
    
    redisQueue[cacheString] = [];
    
    if(err) {
        // Something bad happened, delete the cache
        delete redisClients[cacheString];
    }
}

/**
 * Connect to a redis server
 */
exports.redisConnect = function (options, callback) {
    if(arguments.length < 2) {
        callback = options;
        options = {};
    }
    
    var options = {}.extend(defaultRedisOptions).extend(options);
    
    // Check if the connection had been established
    var cacheString = JSON.stringify(options);
    var redisClient = redisClients[cacheString];
    
    if(redisClient && (redisClient.connecting || redisClient.ready)) {
        // Cached connection
        return callback(null, redisClient);
    }
    
    // Queue up the current request
    redisQueue[cacheString] = redisQueue[cacheString] || [];
    redisQueue[cacheString].push(callback);
    
    var redis = require('redis');
    var client = redis.createClient(options.port, options.host, options);
    
    // Cache connection
    client.connecting = true;
    redisClients[cacheString] = client;
    
    client.on('error', function (err) {
        redisDispatch(cacheString, err);
    });
    
    client.on('connect', function () {
        if(options.password) {
            // Authentication required
            client.auth(options.password, function (err) {
                if(err) {
                    // Authentication failed
                    return redisDispatch(cacheString, err);
                }
            });
        }
    });
    
    client.on('ready', function () {
        // Client ready
        client.connecting = false;
        redisDispatch(cacheString, null, client);
    });
};
