/**
 * Activities log
 */
var db = require('./db');
var coll;

db.mongoConnect({db: 'mail2sms', collection: 'activities.log'}, function (err, collection) {
    if(err) {
        throw err;
    }
    
    coll = collection;
});

module.exports = {
    login: function (userId) {
        logActivity (userId, 'Successfully logged in', 'login', Number(userId));
    },
    
    adminLogin: function (userId, adminId) {
        logActivity (userId, 'Passwordless login by {0}'.format(adminId), 'admin-login', {userId: Number(userId), adminId: Number(adminId)});
    },
    
    message: function (userId, results) {
        logActivity (userId, 'Sent messages. Completed: {0} Failed: {1}'.format(results.completed, results.failed), 'message', results);
    },
    
    credits: function (userId, amount) {
        logActivity (userId, '{0} credits remaining'.format(amount), 'credits', Number(amount));
    },
    
    uploadContacts: function (userId, uploadId, count, groups) {
        logActivity (userId, 'Uploaded {0} contacts'.format(count), 'upload-contacts', {uploadId: uploadId, count: count, groups: groups});
    },
    
    addContacts: function (userId, uploadId, count, groups) {
        logActivity (userId, 'Added {0} contacts'.format(count), 'add-contacts', {uploadId: uploadId, count: count, groups: groups});
    },
    
    accountCreate: function (userId) {
        logActivity (userId, 'Account created', 'new-account', Number(userId));
    },
    
    addCredit: function (userId, amount) {
        logActivity (userId, 'Admin changed number of credits to: {0}'.format(amount), 'add-credits', Number(amount));
    },
    
    addGroup: function (userId, id, name) {
        logActivity (userId, 'Created group {0}'.format(name), 'add-group', {groupId: id, name: name});
    },
    
    renameGroup: function (userId, id, name) {
        logActivity (userId, 'Renamed group to {0}'.format(name), 'rename-group', {groupId: id, name: name});
    },
    
    removeGroup: function (userId, id) {
        logActivity (userId, 'Removed group with ID {0}'.format(id), 'remove-group', id);
    },
    
    blacklisted: function (userId, number) {
        logActivity (userId, 'Number {0} was blacklisted'.format(number), 'blacklisted', number);
    }
};


function logActivity (userId, message, activityId, data) {
    var date = new Date();
    
    coll.insert({
        userId: Number(userId),
        message: message,
        activityId: activityId,
        data: data,
        date: date
    }, function () {
        // /dev/null
    });
}

