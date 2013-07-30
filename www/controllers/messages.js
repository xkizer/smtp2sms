var carriers = require('./carrier'),
    db = require('../util/db'),
    mailer = require('../util/mailer')(),
    util = require('../util/util'),
    config = require('../config');

require('../util/extend');

module.exports = {
    sendMessage: sendMessage,
    batchSend: batchSend,
    processBatch: processBatch
};

var coll;
var mongo;
var redis;

db.mongoConnect({db: 'mail2sms', collection: 'message.log'}, function (err, collection, db) {
    if(err) {
        throw err;
    }
    
    coll = collection;
    mongo = db;
});

db.redisConnect(function (err, client) {
    if(err) {
        throw err
    }
    
    redis = client;
});

function sendMessage (number, from, message, callback) {
    carriers.getSMSEmail(number, function (err, address) {
        if(!address) {
            return callback(err);
        }
        
        // Check if number is blacklisted
        var blacklistKey = 'SMTP2SMS:BLACKLIST:' + number;
        redis.get(blacklistKey, function (err, date) {
            if(err) {
                return callback('Server error');
            }

            if(date) {
                console.log('Number ' + number + ' was blacklisted on ' + date);
                return callback('Blacklisted');
            }
            
            var msgId = util.generateKey(8).toLowerCase();

            // Not blacklisted
            // Save the message details
            coll.insert({
                number: number,
                message: message,
                from: from,
                date: new Date(),
                messageId: msgId
            }, function (err) {
                if(err) {
                    return callback('Server error');
                }
                
                mailer.send({
                    to: address,
                    subject: '',
                    text: message,
                    from: {
                        email: '{0}@{1}'.format(msgId, config.host),
                        name: msgId
                    }
                }, function (err, status) {
                    if(err) {
                        console.log('ERROR', err);
                        return callback(err);
                    }

                    callback(null, 'Message sent:', status);
                });
            });
        });
    });
}

function batchSend (batchId, numbers, from, message, callback) {
    // Send messages
    var completed = 0;
    var failed = 0;
    
    // How many numbers?
    var numCount = numbers.length;
    var numServers = SERVERS.length;
    var MAX_MESSAGE_PER_BATCH = 200;
    var msgPerServer = Math.min(Math.ceil(numCount / numServers), MAX_MESSAGE_PER_BATCH);
    var http = require('http');
    var completed = 0;
    
    for(var i = 0; i < numServers; i++) {
        var nums = numbers.splice(0, msgPerServer);
        var server = SERVERS[i];
        
        processThisBatch(nums, server);
    }

    function processThisBatch (nums, server) {
        var data = '';

        // Make request
        var options = {
            hostname: server.host,
            port: server.port,
            path: '/batchSend',
            method: 'POST'
        };

        var req = http.request(options, function(res) {
            res.setEncoding('utf8');

            res.on('data', function (chunk) {
                data += chunk;
            });

            res.on('end', function () {
                data = JSON.parse(data);
                completed += data.completed;
                failed += data.failed;
                doCheck(server);
            });
        });

        req.on('error', function(e) {
            console.log('problem with server: ', e);
            failed += nums.length;
            doCheck(server);
        });

        var d = {
            from: from,
            message: message,
            numbers: nums,
            batchId: batchId
        };

        req.setHeader('content-type', 'application/json; charset=UTF-8');
        req.write(JSON.stringify(d));
        req.end();
    }

    function doCheck (server) {
        var nums = numbers.splice(0, msgPerServer);
        
        if(nums && nums.length) {
            return processThisBatch(nums, server);
        }
        
        numServers--;
        
        if(numServers === 0) {
            callback({completed: completed, failed: failed});

            if(from.api) {
                activities.apiMessage(from.userId, {completed: completed, failed: failed}, batchId);
            } else {
                activities.message(from.userId, {completed: completed, failed: failed}, batchId);
            }
        }
    }
}

function processBatch (batchId, numbers, from, message, callback) {
    // Send messages
    var completed = 0;
    var failed = 0;
    
    console.log('Batch sent for parallel processing');
    console.log('FROM', from);
    console.log('MESSAGE', message);
    console.log('NUMBERS', numbers.length);
    console.log('BATCH NUMBER', batchId);
    
    numbers.forEach(function (number) {
        sendMessage (number, from, message, function (err) {
            //console.log(arguments);
            if(err) {
                failed++;
            } else {
                completed++;
            }
            
            if(failed + completed >= numbers.length) {
                return callback({completed: completed, failed: failed});
            }
        });
    });
}

