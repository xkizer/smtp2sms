
var nodemailer = require("nodemailer"),
    senders = require('./senders'),
    util    = require('./util');

/**
 * Creates a new mailer object. A mailer object is simply a nodemailer transport with additional methods.
 * @param {string} senderId The sender ID is used to get the information about the sender of the mail. Please see the file senders.js
 * @returns {nodemailer.Transport} Returns a new nodemailer transport object
 */
module.exports = function () {
    var tp = nodemailer.createTransport("SMTP", {
        host: "localhost", // hostname
        secureConnection: false, // use SSL
        port: 25
    });
    
    var sendMail = tp.sendMail;
    delete tp.sendMail;
    
    tp.send = function (mail, callback) {
        // Look for the sender
        var sender = mail.from,
            options;
        
        // Verify sender is permitted
        if(!sender) {
            return callback(0xB3A0);
        }
        
        // Verify we have all necessary stuff in the mail
        if(!mail.to || ('string' !== typeof mail.subject) || (('string' !== typeof mail.html) && ('string' !== typeof mail.text))) {
            return callback(0xB3A1);
        }
        
        var msgId = '{0}.{1}@email2sms.dev'.format(util.generateKey(14), util.generateKey(8));
        
        options = {
            from: '{0} <{1}>'.format(sender.name, sender.email),
            forceEmbeddedImages: true,
            messageId: msgId
        };
        
        options.extendIfNotExists(mail);
        
        sendMail.call(tp, options, function (err, status) {
            if(err) {
                return callback(0xB3A2, err);
            }
            
            callback(null, status);
        });
    };
    
    return tp;
};

