var simplesmtp = require("simplesmtp"),
    fs = require("fs"),
    config = require('../config'),
    util = require('../util/util'),
    contacts = require('../controllers/contacts'),
    cli = require('cli-color');

var smtp = simplesmtp.createServer({
    debug: true,
    name: config.host,
    SMTPBanner: 'Server at '+config.host,
    disableDNSValidation: true,
    timeout: 300000 // 5 mins
});

smtp.listen(25, function () {
    console.log('Listening on PORT 25');
});

smtp.on("startData", function(connection){
    console.log("Message from:", connection.from);
    console.log("Message to:", connection.to);
    connection.tmpFile = "/tmp/" + util.generateKey(24);
    connection.saveStream = fs.createWriteStream(connection.tmpFile);
    connection.data = '';
});

smtp.on("data", function(connection, chunk){
    connection.saveStream.write(chunk);
    connection.data += chunk;
});

smtp.on("dataReady", function(connection, callback){
    connection.saveStream.end();
    console.log("Incoming message saved to %s", connection.tmpFile);
    callback(null, "ABC1"); // ABC1 is the queue id to be advertised to the client
    // callback(new Error("Rejected as spam!")); // reported back to the client
    
    // Check if this message is for us
    var to = connection.to[0];
    
    if(!to) {
        console.log('No TO address');
        return;
    }
    
    to = to.split('@');
    
    console.log(cli.red('TO'), to);
    
    if(to[1] === config.host) {
        // Message is for us, check the message content
        var data = connection.data;
        
        if(/(?:STOP|QUIT|UNSUBSCRIBE|CANCEL)/i.test(data.replace(/\r?\n/g, ' '))) {
            // This is an opt-out message
            contacts.blacklist(to[0], function () {
                console.log('BLACKLIST:', arguments);
            });
        } else {
            console.log(cli.yellow('Message does not contain keywords'));
        }
    
        delete connection.data;
    } else {
        console.log(cli.yellow('Host does not match our host'));
        
        // Redirect the message
        forwardMessage(connection);
    }
});

console.log('SMTP server listening on port 25');


function forwardMessage (connection) {
    var to = connection.to;
    
    to.forEach(function (to) {
        var host = to[1];
        to = to.split('@');
        var user = to;
        
        clientConnect(host, function (err, client) {
            if(err) {
                console.log('CONNECTION TO %s FAILED', host);
                return;
            }
            
            console.log('CONNECTED TO %s', host);
            
            client.on("rcptFailed", function(addresses){
                console.log("The following addresses were rejected: ", addresses);
            });
            
            client.on("message", function(){
                console.log('SENDING OUT MESSAGE');
                client.write(connection.data);
                client.end();
            });
            
            client.on("ready", function(success, response){
                if(success){
                    console.log("The message was transmitted successfully with "+response);
                } else {
                    console.log('MESSAGE FAILED', arguments);
                }
            });
            
            client.useEnvelope({
                from: connection.from,
                to: [user]
            });
        });
    });
}

function clientConnect (host, callback) {
    var client = simplesmptp.connect(25, host, {
        name: config.host,
        debug: true
    });
    
    client.once('idle', function () {
        callback(null, client);
    });
    
    client.on('error', function () {
        callback(arguments);
    });
}


var clientConnections = {};

