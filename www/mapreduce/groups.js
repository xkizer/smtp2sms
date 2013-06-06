/**
 * MongoDB MapReduce for agregating groups contacts count
 */
var db = require('../util/db');
var mongo;
var contacts;

db.mongoConnect({db: 'mail2sms', collection: 'contacts'}, function (err, collection, db) {
    if(err) {
        // Something very bad
        throw err;
    }
    
    mongo = db;
    contacts = collection;
});

module.exports = {
    mapReduce: mapReduce
};

var map = function () {
    for(var i = 0; i < this.groupId.length; i++) {
        var groupId = this.groupId[i];
        emit(groupId, 1);
    }
};

var reduce = function (key, values) {
    var t = 0;
    
    values.forEach(function (count) {
        t += count;
    });
    
    return t;
};

function mapReduce () {
    // Get the date of the last 
    var qry = {};
    db.redisConnect(function (err, client) {
        if(err || !client) {
            return runCommand();
        }
        
        client.get('SMTP2SMS:MR:GROUPS:DATE', function (err, date) {
            var dt = new Date(date);
            
            if(dt.getTime()) {
                qry.date = {$gt: dt};
            }
            
            runCommand();
        });
    });
    
    function runCommand () {
        contacts.mapReduce(map, reduce,
            {
                query: qry,
                out: {reduce: 'groups.stats'},
                sort: {groupId: 1},
                verbose: true
            }, function (err, collection) {
                console.log('RUNNING MR');
                if(err) {
                    console.log('MapReduce failed');
                    return;
                }
                
                console.log('MapReduce complete', collection);
                
                // Save the new date
                if(qry.date) {
                    db.redisConnect(function (err, client) {
                        if(err) {
                            console.log("Can't save date. Please manually store the date", qry.date);
                        }
                        
                        client.set('SMTP2SMS:MR:GROUPS:DATE', qry.date, function () {
                            console.log('MapReduce date saved', 'SMTP2SMS:MR:GROUPS:DATE', qry.date);
                        });
                    });
                }
            }
        );
    }
}


