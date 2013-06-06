var simplesmtp = require("simplesmtp"),
    fs = require("fs"),
    config = require('../config'),
    util = require('../util/util'),
    contacts = require('../controllers/contacts');

var smtp = simplesmtp.createServer({
    debug: true,
    name: 'smtp.' + config.host,
    SMTPBanner: 'Server at smtp.'+config.host,
    disableDNSValidation: true,
    secureConnection: true
});

smtp.listen(25, function () {
    console.log('Listening on PORT 25 and 465');
});

smtp.listen(465);

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
    var to = connection.to.split('@');
    
    if(to[1] === config.host) {
        // Message is for us, check the message content
        var data = connection.data;
        
        if(/(?:STOP|QUIT|UNSUBSCRIBE|CANCEL)/i.test(data.replace(/\r?\n/, ' '))) {
            // This is an opt-out message
            contacts.blacklist(to[0], function () {
                console.log('BLACKLIST:', arguments);
            });
        }
    }
    
    delete connection.data;
});

console.log('SMTP server listening on port 25');
