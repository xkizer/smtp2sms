var simplesmtp = require("simplesmtp"),
    fs = require("fs"),
    config = require('../config'),
    util = require('../util/util'),
    contacts = require('../controllers/contacts'),
    cli = require('cli-color'),
    dns = require('dns');

var MailParser = require("mailparser").MailParser;
var optoutRegexp = /\b(?:STOP|QUIT|UNSUBSCRIBE|CANCEL)\b/i;

var smtp = simplesmtp.createServer({
    debug: false, /** ******************* **/
    name: config.host,
    SMTPBanner: 'Server at '+config.host,
    disableDNSValidation: true,
    timeout: 300000 // 5 mins
});

smtp.listen(25, function () {
    console.log('Listening on PORT 25');
});

smtp.on("startData", function(connection){
//    console.log("Message from:", connection.from);
//    console.log("Message to:", connection.to);
//    connection.tmpFile = "/tmp/" + util.generateKey(24);
//    connection.saveStream = fs.createWriteStream(connection.tmpFile);
    connection.data = '';
});

smtp.on("data", function(connection, chunk){
    //connection.saveStream.write(chunk);
    connection.data += chunk;
});

smtp.on("dataReady", function(connection, callback){
    //connection.saveStream.end();
//    console.log("Incoming message saved to %s", connection.tmpFile);
    callback(null, "{0}-{1}-{2}-{3}".format(util.generateKey(8), util.generateKey(4), util.generateKey(4), util.generateKey(6))); // ABC1 is the queue id to be advertised to the client
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
        var mailparser = new MailParser();

        mailparser.on("end", function(mail){
            var text = mail.text;
            var html = mail.html;
            delete mail.attachments;
//            console.log(mail);

            if(optoutRegexp.test(String(text).replace(/\r?\n/g, ' ')) || optoutRegexp.test(String(html).replace(/\r?\n/g, ' '))) {
                // This is an opt-out message
                contacts.blacklist(to[0], function () {
                    console.log('BLACKLIST:', arguments);
                });
                
                return;
            }
            
            console.log(cli.yellow('Message does not contain keywords'));
        });
        
        mailparser.write(data);
        mailparser.end();
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
    var from = connection.from;
    console.log(cli.red('CONNECTION FROM'), connection.from);
    
    to.forEach(function (to) {
        var user = to;
        to = to.split('@');
        var host = to[1];
        
        dns.resolveMx(host, function (err, mx) {
            if(err || !mx || !mx.length) {
                console.log('Unable to find MX record for %s', host);
                return;
            }
            
            mx.sort(function (a, b) {
                return a.priority - b.priority;
            });
            
            host = mx[0].exchange;

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
//                    console.log('SENDING OUT MESSAGE');
                    client.write(connection.data);
                    client.end();
                });

                client.on("ready", function(success, response){
                    if(success){
//                        console.log("The message was transmitted successfully with "+response);
                    } else {
//                        console.log('MESSAGE FAILED', arguments);
                    }
                    
                    client.end();
                });
                
                client.useEnvelope({
                    from: from,
                    to: [user]
                });
            });
        });
    });
}

function clientConnect (host, callback) {
    var client = simplesmtp.connect(25, host, {
        name: config.host,
        debug: false
    });
    
    client.once('idle', function () {
        callback(null, client);
    });
    
    client.on('error', function () {
        callback(arguments);
    });
}


var clientConnections = {};

