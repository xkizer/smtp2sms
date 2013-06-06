/**
 * Default session options
 */
var defaultOptions = {
    ttl: 60 * 60 * 24 * 7, // By default, log out user after 7 days of inactivity
};

var error = require('../util/error.js');
var db = require('../util/db.js');
var cli = require('cli-color');

module.exports = {
    /**
     * Create a new session. Please note that this method does not set the session cookies, but
     * simply returns a token. It is the responsibility of the calling function to do with the
     * token what it will.
     *
     * Please note that session is not signed, and there is no reason to do this, as everything is saved server-side
     *
     * @param details The details that will be used to create the session. This is arbitrary.
     * @param options (options) This optional parameter is an object containing options for the session
     * @param callback The callback receives an optional error object and a token
     */
    createSession: function (details, options, callback) {
        if(!details) {
            // No details provided
            return callback(error(0x290C));
        }
        
        if(arguments.length < 3) {
            callback = options;
            options = {};
        }
        
        options = {}.extend(defaultOptions).extend(options);
        
        // Authentication successful... set up login
        var util    = require('../util/util.js');
        var token   = util.generateKey(48);
        var key     = 'session:login:' + token;
        
        // Session information that will be saved
        var sessionObject = {
            details: details,
            ip: options.ip || null,
            userAgent: options.userAgent || null,
            ttl: options.ttl || 0 // Saved for reference
        };
        
        // save data
        db.redisConnect(function (err, client) {
            if(err) {
                return callback(err);
            }
            
            client.set(key, JSON.stringify(sessionObject), function (err) {
                if(err) {
                    return callback(error(0x2900));
                }
                
                // Login successful... set TTL
                client.expire(key, options.ttl, function (){});
                callback(null, token);
            });
        });
    },
    
    /**
     * Updates the session information
     * @param token The session ID
     * @param data The data to save to the session
     * @param options (optional) The only option is <code>touch</code>, used to instruct the engine
     *      to update the TTL
     * @param callback Callback receives an error object
     */
    updateSession: function (token, data, options, callback) {
        if(arguments.length < 4) {
            callback = options;
            options = {touch: true};
        }
        
        var me = this;
        
        db.redisConnect(function (err, client) {
            if(err) {
                return callback(err);
            }
            
            var key = 'session:login:' + token;
            
            // Check that session exists
            client.get(key, function (err, ss) {
                if(err) {
                    return callback(err);
                }
                
                if(!ss) {
                    return callback(error(0x2A04));
                }
                
                var sess = JSON.parse(ss);
                sess.details = data;
                
                client.set(key, JSON.stringify(sess), function (err) {
                    if(err) {
                        return callback(error(0x2900));
                    }
                    
                    // Are we required to update the TTL?
                    if(options.touch) {
                        client.expire(key, sess.ttl, function (){});
                    }
                    
                    // Saved successfully
                    callback(null);
                });
            });
        });
    },
    
    /**
     * Get the information stored in a session
     * @param token The ID of the session
     * @param options A hash of options
     * @param callback Callback receieves an error object and the session information
     */
    getSession: function (token, options, callback) {
        if(arguments.length < 3) {
            callback = options;
            options = {};
        }
        
        options = {}.extend(defaultOptions).extend(options);
        
        // Fetch session information
        db.redisConnect(function (err, client) {
            if(err) {
                return callback(err);
            }
            
            var key = 'session:login:' + String(token);
            
            client.get(key, function (err, data) {
                if(err) {
                    return callback(error(0x2A00));
                }
                
                if(!data) {
                    return callback(error(0x2901));
                }
                
                data = JSON.parse(data);
                
                if(data.userAgent) {
                    if(data.userAgent !== options.userAgent) {
                        // User agent does not match
                        return callback(error(0x2902));
                    }
                }
                
                if(data.ip) {
                    if(data.ip !== options.ip) {
                        // IP address does not match
                        return callback(error(0x2902));
                    }
                }
                
                // Everything is okay now...
                callback(null, data.details);
            });
        });
    },
    
    endSession: function (token, callback) {
        db.redisConnect(function (err, client) {
            if(err) {
                return callback(err);
            }
            
            var key = 'session:login:' + String(token);
            client.del(key, callback);
        });
    }
};
