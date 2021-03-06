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
    var now = new Date();
    
    db.redisConnect(function (err, client) {
        if(err || !client) {
            return runCommand();
        }
        
        client.get('SMTP2SMS:MR:GROUPS:DATE', function (err, date) {
            var dt = new Date(date);
            
            if(dt.getTime()) {
                //qry.date = {$gt: dt, $lte: now};
            }
            
            runCommand();
        });
    });
    
    function runCommand () {
        contacts.mapReduce(map, reduce,
            {
                query: qry,
                out: 'groups.stats',
                sort: {groupId: 1},
                verbose: true
            }, function (err, collection) {
                if(err) {
                    console.log('MapReduce failed');
                    return;
                }
                
                console.log('MAPREDUCE COMPLETED');
                
                // Save the new date
                db.redisConnect(function (err, client) {
                    if(err) {
                        console.log("Can't save date. Please manually store the date", now);
                    }

                    client.set('SMTP2SMS:MR:GROUPS:DATE', now, function () {
                        console.log(arguments);
                        console.log('MapReduce date saved', 'SMTP2SMS:MR:GROUPS:DATE', now);
                    });
                });
            }
        );
    }
}


