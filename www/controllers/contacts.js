var db = require('../util/db'),
    util = require('../util/util'),
    mapReduce = require('../mapreduce'),
    activities = require('../util/activities'),
    contactsCollection, mongo;

db.mongoConnect({db: 'mail2sms', collection: 'contacts'}, function (err, cnt, db) {
    if(err) {
        throw err;
    }
    
    contactsCollection = cnt;
    mongo = db;
});

module.exports = {
    addContact: function (userId, contact, mapreduce, callback) {
        var uniq = Math.random();
        console.time(uniq);
        var groups = contact.groups;
        contact = contact.phone;
        
        if(arguments.length < 4) {
            callback = arguments[2];
            mapreduce = true;
        }
        
        if(!Array.isArray(groups) && Boolean(groups)) {
            groups = [groups];
        }
        
        if(!groups || groups.length === 0) {
            // No groups selected
            return callback('You have to select at least one group');
        }
        
        var phone = String(contact.phone).replace(/[^0-9]/, '');
        
        if(phone.length !== 10) {
            var ph = /^(?:\+?1)?([0-9]{10})$/.exec(phone);
            
            if(ph) {
                phone = ph[1];
            } else {
                return callback('Phone number has to be exactly 10 digits');
            }
        }
        
        var contactId = util.generateKey(12);

        // Add contact
        contactsCollection.findOne({
            phone: phone
        }, function (err, cnt) {
            if(err) {
                return callback('Server failure');
            }
            
            var date = (cnt && cnt.date) || new Date();

            contactsCollection.update({
                phone: phone
            },{
                $set: {
                    firstName: contact.firstName,
                    lastName: contact.lastName,
                    userId: Number(userId),
                    contactId: contactId,
                    date: date
                },
                $addToSet: {
                    groupId: {$each: groups}
                }
            }, {
                upsert: true,
                safe: false
            }, function (err) {
                if(err) {
                    return callback('Server error');
                }
                
                console.timeEnd(uniq);
                callback(null, contactId);

                if(mapreduce) {
                    // MapReduce should be triggered
                    mapReduce.groups();
                }
            });
        });
    },
    
    countContacts: function (userId, groupIds, callback) {
        if(arguments.length < 3) {
            callback = arguments[1];
            groupIds = false;
        }
        
        var qry = {userId: Number(userId)};
        
        if(Array.isArray(groupIds) && groupIds.length) {
            var grps = [];
            
            groupIds.forEach(function (g) {
                grps.push({
                    groupId: String(g)
                });
            });
            
            qry['$or'] = grps;
        }
        
        contactsCollection.find(qry, function (err, cursor) {
            if(err) {
                return callback('Server error');
            }

            cursor.count(function (err, count) {
                if(err) {
                    return callback('Server error');
                }

                callback(null, count);
            });
        });
    },
    
    removeContact: function (contactId, userId, callback) {
        contactsCollection.remove({userId: Number(userId), contactId: String(contactId)}, function (err) {
            if(err) {
                return callback('Server error');
            }

            callback(null);
        });
    },
    
    getContacts: function (userId, groupId, options, callback) {
        if(arguments.length < 4) {
            callback = options;
            options = {};
        }
        
        if('function' === typeof groupId) {
            callback = groupId;
            groupId = null;
        }
        
        var qry = {
            userId: Number(userId)
        };
        
        if(groupId) {
            if(!Array.isArray(groupId)) {
                groupId = [groupId];
            }
            
            var grp = [];
            
            groupId.forEach(function (id) {
                grp.push({groupId: String(id)});
            });
            
            qry.$or = grp;
        }
        
        contactsCollection.find(qry, function (err, cursor) {
            if(err) {
                return callback('Server error');
            }
            
            if(options.limit) {
                cursor.limit(options.limit);
            }
            
            cursor.toArray(callback);
        });
    },
    
    batchUpload: function (userId, contacts, groups, callback) {
        // Contacts is expected to be an array of phone numbers
        var count = contacts.length,
            success = 0,
            failure = 0;
        
        console.log('Initiated batch upload', count);
        contacts.forEach(function (person) {
            module.exports.addContact(userId, {groups: groups, phone: person}, false, function (err) {
                if(err) {
                    failure++;
                } else {
                    success++;
                }
                
                if(success + failure === count) {
                    // Done
                    callback(null, {succeeded: success, failed: failure});
                    
                    // TODO: Execute MR
                    mapReduce.groups();
                }
            });
        });
    },
    
    blacklist: function (messageId, callback) {
        // Get the info
        db.mongoConnect({db: 'mail2sms', collection: 'message.log'}, function (err, log) {
            if(err) {
                return callback('Server error');
            }
            
            log.findOne({messageId: String(messageId).toLowerCase()}, function (err, msg) {
                if(err) {
                    return callback('Server error');
                }
                
                if(!msg) {
                    return callback('Not found');
                }
                
                db.redisConnect(function (err, redis) {
                    if(err) {
                        return callback('Server error');
                    }
                    
                    var blacklistKey = 'SMTP2SMS:BLACKLIST:' + msg.number;
                    var date = new Date();
                    redis.set(blacklistKey, date, function (err) {
                        if(err) {
                            return callback('Server error');
                        }
                        
                        callback(null);
                        
                        // Activity log
                        activities.blacklisted(msg.from.userId, msg.number);
                    });
                });
            });
        });
    }
};



