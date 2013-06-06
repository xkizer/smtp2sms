
var db = require('../util/db'),
    util = require('../util/util');

module.exports = {
    addGroup: function (userId, groupName, callback) {
        if('string' !== typeof groupName || groupName.trim().length < 1) {
            return callback('Invalid group name');
        }
        
        // Create group
        db.mongoConnect({db: 'mail2sms', collection: 'groups'}, function (err, groups) {
            if(err) {
                return callback(err);
            }
            
            var groupId = util.generateKey(12);
            
            groups.insert({
                name: groupName,
                userId: userId,
                groupId: groupId,
                status: 'Active',
                date: new Date()
            }, function (err) {
                if(err) {
                    return callback('Server error');
                }
                
                return callback(null, groupId);
            });
        });
    },
    
    renameGroup: function (userId, groupId, newName, callback) {
        db.mongoConnect({db: 'mail2sms', collection: 'groups'}, function (err, groups) {
            groups.update({
                userId: Number(userId),
                groupId: String(groupId)
            }, {$set: {name: String(newName), updated: new Date()}}, function (err) {
                if(err) {
                    return callback('Server error');
                }
                
                callback(null);
            });
        });
    },
    
    removeGroup: function (userId, groupId, callback) {
        db.mongoConnect({db: 'mail2sms', collection: 'groups'}, function (err, groups) {
            if(err) {
                return callback(err);
            }
            
            groups.update({
                groupId: String(groupId),
                userId: Number(userId)
            }, {
                $set: {
                    status: 'Deleted',
                    deleted: new Date()
                }
            }, function (err) {
                if(err) {
                    return callback('Server error');
                }
                
                return callback(null);
            });
        });
    },
    
    getGroups: function (userId, callback) {
        db.mongoConnect({db: 'mail2sms', collection: 'groups'}, function (err, groups) {
            if(err) {
                return callback(err);
            }
            
            groups.find({userId: Number(userId), status: 'Active'}, function (err, groups) {
                if(err) {
                    return callback('Server error');
                }
                
                groups.toArray(callback);
            });
        });
    },
    
    statGroups: function (userId, callback) {
        module.exports.getGroups(userId, function (err, groups) {
            if(err) {
                return callback(err);
            }
            
            var groupIds = [];
            
            groups.forEach(function (group) {
                groupIds.push({_id: group.groupId});
            });
            
            db.mongoConnect({db: 'mail2sms', collection: 'groups.stats'}, function (err, collection) {
                if(err) {
                    return callback(err);
                }
                
                collection.find({$or: groupIds}, function (err, stats) {
                    if(err) {
                        return callback('Server error');
                    }

                    stats.toArray(function (err, stats) {
                        if(err) {
                            return callback('Server error');
                        }
                        
                        // Merge the stats with the groups
                        var t = {};
                        
                        stats.forEach(function (stat) {
                            t[stat._id] = stat;
                        });
                        
                        groups.forEach(function (group) {
                            var stat = t[group.groupId];
                            
                            if(!stat) {
                                stat = {value: 0};
                            }
                            
                            group.stats = {count: stat.value};
                        });
                        
                        callback(null, groups);
                    });
                });
            });
        });
    }
};


