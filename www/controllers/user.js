var db = require('../util/db.js'),
    error = require('../util/error.js'),
    util = require('../util/util.js'),
    cli = require('cli-color');


module.exports = {
    getUser: function (userId, callback) {
        new User(userId, callback);
    },
            
    getUsers: function () {
        return getUsers.apply(this, arguments);
    },
    
    createUser: function () {
        return createUser.apply(this, arguments);
    },
    
    usernameExists: function () {
        return usernameExists.apply(this, arguments);
    },
    
    findByEmail: findByEmail
};

function User (userId, callback) {
    var me = this;
    
    /*
    // Check in the redis store if user is cached
    db.redisConnect(function (err, client) {
        if(err) {
            // Error connecting, falback to mongo
            return getFromMongo();
        }
        
        client.hgetall('auth:user:' + String(userId).toLowerCase(), function (err, user) {
            if(err || !user) {
                return getFromMongo(); // Could not do cache thing, resort to mongo
            }
            
            // User was found
            // Unserialize
            var numberFields = ['userId', 'starId', 'managerId'];
            
            for(var i in user) {
                try {
                    user[i] = JSON.parse(user[i]);
                } catch(e) {
                    // Retain value
                }
                
                if(numberFields.indexOf(i) >= 0) {
                    user[i] = Number(user[i]);
                }
            }
            
            return createUserObject(user);
        });
    });
    */
   
   getFromMongo();

    /**
     * Helper function to create user objects
     * @param {object} user User object returned from DB/cache query
     * @returns {undefined}
     */
    function createUserObject(user) {
        Object.defineProperty(me, "_data", {
            enumerable: false,
            value: user
        });
        
        callback(null, me);
    }
    
    /**
     * Helper function to get user information from mongo (busting any cache)
     * @returns {undefined}
     */
    function getFromMongo () {
        db.mongoConnect({db: 'mail2sms', collection: 'users'}, function (err, collection) {
            if(err) {
                return callback(error(0x4B07, err));
            }

            collection.findOne({$or: [{userId: Number(userId)}, {username: String(userId).toLowerCase()}]}, function (err, user) {
                if(err) {
                    return callback(error(0x4B02, err));
                }

                if(!user) {
                    return callback(error(0x4B01));
                }
                
                createUserObject(user);
                
                /*
                // Cache
                db.redisConnect(function (err, client) {
                    if(err) {
                        // Could not connect. skip caching
                        return;
                    }
                
                    // Delete from cache after 4 hours. This helps avoid users
                    // being forgotten perpetually in the cache.
                    // It also frees up space for other information to be stored in the cache
                    var ttl = 14400;
                    
                    // Serialize
                    var username = user.username.toLowerCase(),
                        userId = user.userId;
                    
                    user = {}.extend(user);
                        
                    for(var i in user) {
                        if(typeof user[i] !== 'string') {
                            user[i] = JSON.stringify(user[i]);
                        }
                    }
                    
                    var emptyFn = function () {
                        console.log(arguments);
                    };
                    
                    client.multi()
                        .hmset('auth:user:' + username, user, emptyFn)
                        .hmset('auth:user:' + userId, user, emptyFn)
                        .expire('auth:user:' + username, ttl)
                        .expire('auth:user:' + userId, ttl)
                        .exec(emptyFn);
                });
                */
            });
        });
    }
}

User.prototype = {
    get id () {
        return this._data.userId;
    },
    
    get userData () {
        return {}.extend(this._data);
    },
    
    updateBilling: _updateBilling,
    
    /**
     * Reset the user's password
     * @param {string} newPass The new password
     * @param {function} callback The callback receives an error object and boolean
     */
    resetPassword: function (newPass, callback) {
        var userInfo = this._data;
        var password = util.hash(newPass, userInfo.username);
        var oldPass = userInfo.password;
        
        // Set the password
        db.mongoConnect({db: 'mail2sms', collection: 'users'}, function (err, collection) {
            if(err) {
                return callback(error(0x4B0E, err));
            }
            
            collection.update({userId: userInfo.userId}, {$set: {password: password}}, function (err) {
                if(err) {
                    return callback(error(0x4B0F, err));
                }
                
                // Update completed... update the cache
                db.redisConnect(function (err, client) {
                    if(err) {
                        // Failed... revert
                        collection.update({userId: userInfo.userId}, {$set: {password: oldPass}}, function () {});
                        return callback(error(0x4B1A, err));
                    }
                    
                    client.multi()
                        .del('auth:user:' + userInfo.username)
                        .del('auth:user:' + userInfo.userId)
                        .exec(function (err) {
                            if(err) {
                                // Failed... revert
                                collection.update({userId: userInfo.userId}, {$set: {password: oldPass}}, function () {});
                                return callback(error(0x4B1A, err));
                            }
                            
                            // Remember to update "this" instance
                            userInfo.password = password;
                            return callback(null, true);
                        });
                });
            });
        });
    },
    
    /**
     * Change the user's password normally
     * @param {string} oldPass The user's old password
     * @param {string} newPass The user's new password
     * @param {function} callback The callback receives an optional error object
     */
    changePassword: function (oldPass, newPass, callback) {
        // Check if the old password matches the new one
        var userInfo = this._data;
        oldPass = util.hash(oldPass, userInfo.username);
        
        if(oldPass !== userInfo.password) {
            // Foul
            return callback(error(0x4B03));
        }
        
        if(newPass.length < 6 || newPass.length > 32) {
            return callback(error(0x4B19));
        }
        
        // Set the user's password
        this.resetPassword(newPass, callback);
    }
};

/**
 * Creates a new user
 * @param userInfo An hash of the user information
 *      This information is not pre-verified. It is the responsibility of the calling function to verify user-supplied information.
 * @param callback The callback receives the ID of the newly created user
 */
function createUser (userInfo, callback) {
    // For some reason, we have to generate some random user ID, instead of relying on MongoDB's ObjectID (obvious privacy reasons)
    var userId = Math.round(Math.random() * 10000000000000000);
    var username = String(userInfo.username).toLowerCase();
    var password = util.hash(userInfo.password, username);
    
    var info = {
        userId: userId,
        username: username,
        password: password,
        created: new Date(),
        status: 'active',
        emailVerified: false,
        credits: 0
    };
    
    if(userInfo.email) {
        info.email = String(userInfo.email).toLowerCase();
    }
    
    var fn = function (){};
    
    info.extendIfNotExists(userInfo);
    
    // Check if user exists...
    usernameExists(username, function (err, exists) {
        if(err) {
            return callback(err);
        }
        
        if(exists) {
            return callback(error(0x4B04));
        }
        
        // Create user
        db.mongoConnect({db: 'mail2sms', collection: 'users'}, function (err, collection) {
            if(err) {
                console.error(err);
                return callback(error(0x4B07, err));
            }
            
            collection.insert(info, function (err) {
                if(err) {
                    console.error(err);
                    return callback(error(0x4B09, err));
                }
                
                // Create user on redis
                db.redisConnect(function (err, client) {
                    if(err) {
                        // Error occured... delete information from mongo
                        console.error(err);
                        collection.remove(info, fn);
                        return callback(error(0x4B0A, err));
                    }
                    
                    var dt = {
                        username: username,
                        password: password,
                        status: 'active',
                        userId: userId.toString()
                    };
                    
                    client.hmset('auth:user:' + username, dt, function (err) {
                        if(err) {
                            // Could not cache login information
                            console.error(err);
                            collection.remove(info, fn);
                            return callback(error(0x4B0B, err));
                        }
                        
                        // Everything went fine...
                        callback(null, userId);                        
                    });
                });
            });
        });
    });
}

/**
 * Checks if username exists.
 * Usernames are checked by examining the redis cache for login information.
 * @param username The username to check for
 * @param callback The callback receives an error object and boolean
 */
function usernameExists(username, callback) {
    username = String(username);
    
    new User(username, function (err) {
        if(err) {
            if(err.code === 0x4B01) {
                // User not found
                return callback(null, false);
            }
            
            // Could not check if user exists... let's be pessimistic
            return callback(err);
        }
        
        return callback(null, true);
   });
}

/**
 * Get information about a user, based on the email
 * @param {string} email The email to search for
 * @param {function} callback Callback receives error object and user object
 */
function findByEmail(email, callback) {
    db.mongoConnect({db: 'mail2sms', collection: 'users'}, function (err, collection) {
        if(err) {
            return callback(error(0x4B0C, err));
        }

        collection.findOne({email: String(email).toLowerCase()}, function (err, user) {
            if(err) {
                return callback(error(0x4B02, err));
            }

            if(!user) {
                return callback(error(0x4B0D));
            }

            new User(user.userId, callback);
        });
    });
}

function _updateBilling (info, callback) {
    var me = this;
    
    db.mongoConnect({db: 'mail2sms', collection: 'users'}, function (err, collection) {
        if(err) {
            return callback(err);
        }

        collection.update({userId: me._data.userId}, {$set: {billing: info}}, function (err) {
            if(err) {
                return callback(err);
            }

            // Delete cache
            db.redisConnect(function (err, client) {
                if(!err) {
                    client
                      .multi()
                        .del('auth:user:' + me._data.userId)
                        .del('auth:user:' + me._data.username)
                      .exec();
                } // Else, the user will have to wait till the cache expires
            });
            
            return callback(null);
        });
    });
}

function getUsers (callback) {
    db.mongoConnect({db: 'mail2sms', collection: 'users'}, function (err, collection) {
        collection.find({status: 'active'}, function (err, cursor) {
            if(err) {
                return callback('Server error');
            }
            
            cursor.toArray(callback);
        });
    });
}

