/**
 * Utility functions
 */

// Error codes and messages
var getError = require('./error.js'),
    db = require('../util/db.js'),
    cli = require('cli-color');

module.exports = {
    hash: function (password, salt) {
        var crypto  = require('crypto'),
            sha1    = crypto.createHash('sha256'),
            sha2    = crypto.createHash('sha256');
        
        sha1.update(password);
        sha2.update(sha1.digest('hex'));
        sha2.update(String(salt).toLowerCase());
        return sha2.digest('hex');
    },
    
    generateKey: function (keyLength) {
        var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ01234567890',
            key = '',
            index,
            i = 0;
            
        keyLength = keyLength || 16;
        
        for(; i < keyLength; i++) {
            index = Math.floor(Math.random() * chars.length);
            key += chars[index];
        }
        
        return key;
    },
    
    commonCallback: function (req, res, next) {
        return function (err, data) {
            if(err) {
                res.json({
                    success: false,
                    error: {
                        message: getError(err),
                        code: err
                    }
                });
                
                return;
            }
            
            res.json({
                success: true,
                response: data
            });
        }
    },
    
    requireLogin: function (req, res, next, callback) {
        var session = req.session,
            userInfo = session.userInfo;
        
        if(!session.loggedIn || !userInfo) {
            // Please go log in
            var error = {
                success: false,
                error: {
                    message: getError(0x1811),
                    code: 0x1811
                }
            };
            
            res.json(error);
            return;
        }
        
        callback(userInfo);
    },
    
    /**
     * Store some data and return nonce data that can be used to retrieve it
     * @param data The stuff to be stored
     * @param lifespan The number of seconds that the key is valid
     * @param {function} callback The callback receives an error object and the nonce object
     */
    createNonce: function (data, lifespan, callback) {
        if(arguments.length === 2) {
            callback = arguments[1];
            lifespan = 0;
        }
        
        // Generate nonce key and serialize data
        var nonceKey = this.generateKey(36),
            verifier = this.generateKey(24),
            key = 'nonce:key:' + nonceKey;
        
        data = JSON.stringify({data: data, verifier: verifier});
        lifespan = Number(lifespan) || 60*60*24; // Default lifespan is 24 hours
        
        // Create record
        // TODO: Standardise errors
        db.redisConnect(function (err, client) {
            if(err) {
                return callback(err);
            }
            
            client.multi()
                .set(key, data)
                .expire(key, lifespan)
                .exec(function (err) {
                    if(err) {
                        return callback(err);
                    }
                    
                    callback(null, {
                        key: nonceKey,
                        verifier: verifier
                    });
                });
        });
    },
    
    resolveNonce: function (nonceKey, verifier, destroy, callback) {
        if(arguments.length === 2) {
            callback = arguments[1];
            verifier = false;
        } else if (arguments.length === 3) {
            callback = arguments[2];
            
            if('boolean' === typeof verifier) {
                destroy = arguments[1];
                verifier = null;
            } else {
                destroy = true;
            }
        }
        
        if(false !== destroy) {
            // Not set explicitly to false, always destroy
            destroy = true;
        }
        
        db.redisConnect(function (err, client) {
            if(err) {
                return callback('Redis failed');
            }
            
            var key ='nonce:key:' + nonceKey;
            
            client.get(key, function (err, data) {
                if(err) {
                    return callback(err);
                }
                
                if(!data) {
                    // Not found
                    return callback('Not found');
                }
                
                data = JSON.parse(data);
                
                if(verifier && verifier !== data.verifier) {
                    return callback('Verification failed');
                }
                
                if(destroy) {
                    // Destroy
                    client.del(key, function () {});
                }
                
                callback(null, data.data);
            });
        });
    },
    
    deleteNonce: function (key, callback) {
        db.redisConnect(function (err, client) {
            if(err) {
                return callback('Redis failed');
            }
            
            var key ='nonce:key:' + nonceKey;
            client.del(key, function (err) {
                if(err) {
                    return callback('Redis error');
                }
                
                callback();
            });
        });
    },
    
    destroyNonce: module.exports.deleteNonce
};



