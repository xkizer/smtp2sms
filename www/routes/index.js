var fs = require('fs'),
    auth = require('../controllers/auth'),
    session = require('../controllers/session'),
    users = require('../controllers/user'),
    groups = require('../controllers/groups'),
    contacts = require('../controllers/contacts'),
    path = require('path'),
    excel = require('excel'),
    csv = require('csv'),
    util = require('../util/util'),
    db = require('../util/db'),
    config = require('../config'),
    messages = require('../controllers/messages'),
    mapReduce = require('../mapreduce'),
    activities = require('../util/activities'),
    http = require('http');

var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

module.exports = function (app) {
    app.get('/', homePage);
    
    app.get('/login', loginForm);
    app.post('/login', login);
    
    app.get('/admin/account/create', accountCreateForm);
    app.post('/admin/account/create', accountCreate);
    
    app.get('/admin/clients', listClients);
    app.put('/admin/clients/:clientId/credits/add', addCreditJSON);
    app.get('/admin/login/:userId', adminLoginUser);
    
    app.get('/admin/account/activity/:clientId', clientActivities);
    
    app.post('/groups', addGroupJSON);
    app.put('/groups/:groupId', updateGroupJSON);
    app.delete('/groups/:groupId', deleteGroupJSON);
    
    app.get('/contacts/add', uploadContactsForm);
    app.post('/contacts/upload', uploadContacts);
    app.post('/contacts/add/:uploadId', addContacts);
    app.get('/contacts/add/:uploadId', addContactsForm);
    
    app.get('/contacts', listContacts);
    app.get('/contacts/list', getContacts);
    app.get('/contacts/count', contactsCount);
    
    app.get('/messages/send', sendMessageForm);
    app.post('/messages/send', sendMessage);
    app.post('/batchSend', batchSend);  // This is an internal resource
    
    app.post('/serverConfig', serverConfig);
    
    // API ROUTES
    app.post('/api/messages/send', apiSendMessage);
    app.post('/api/messages/send/group', apiSendGroupMessage);
    app.get('/api/groups', apiGetGroups);
};

function homePage (req, res, next) {
    req.requireLogin(function (user) {
        user = user.userData;
        
        if(user.admin) {
            res.redirect('/admin/clients');
        } else {
            res.redirect('/contacts');
        }
    });
}

function loginForm (req, res, next) {
    if(arguments.length > 3) {
        var err = arguments[3];
    }
    
    res.render('login', {error: err && (err.message || err)});
}

function login (req, res, next) {
    var post = req.body;
    
    auth.login(post.username, post.password, function (err, details) {
        if(err) {
            return loginForm(req, res, next, err);
        }
        
        session.createSession(details, {ip: req.socket.remoteAddress, userAgent: req.headers['user-agent']}, function (err, sessionId) {        
            if(err) {
                return loginForm(req, res, next, err);
            }
            
            // Session created... send session cookies
            res.cookie('sid', sessionId);

            // Check for a redirect URL
            var redirect = req.query.next || '/';
            res.redirect(redirect);
            
            activities.login(details.userId);
        });
    });
}

function accountCreateForm (req, res, next) {
    if(arguments.length > 3) {
        var err = arguments[3];
        
        if(arguments.length > 4) {
            var success = arguments[4];
        }
    }
    
    res.render('admin/create-account', {error: err && (err.message || err), success: success, create: true});
}

function accountCreate (req, res, next) {
    var data = req.body;
    
    if(data.password !== data.password2) {
        return accountCreateForm (req, res, next, 'Passwords did not match');
    }
    
    data.username = data.email;
    delete data.password2;
    
    users.createUser(data, function (err, userId) {
        if(err) {
            return accountCreateForm (req, res, next, err);
        }
        
        activities.accountCreate(userId);
        return accountCreateForm (req, res, next, null, true);
    });
}

function listClients (req, res, next) {
    req.requireLogin(function (user) {
        if(!user.userData.admin) {
            return res.send('Access denied', 403);
        }
        
        users.getUsers(function (err, clients) {
            var count = clients.length * 2;
            var today = new Date();
            today.setHours(0);
            today.setMinutes(0);
            today.setSeconds(0);
            today.setMilliseconds(0);

            db.mongoConnect({db: 'mail2sms', collection: 'messages.log'}, function (err, coll, mongo) {
                if(err) {
                    count -= 2;

                    if(!count) {
                        render();
                    }

                    return;
                }

                clients.forEach(function (client) {
                    client.sentTotal = 0;
                    client.sentToday = 0;
                    client.totalContacts = 0;

                    mongo.collection('contacts', function (err, coll) {
                        if(err) {
                            count--;

                            if(!count) {
                                render();
                            }

                            return;
                        }

                        coll.find({userId: client.userId}, {_id: 1}, function (err, contacts) {
                            if(err) {
                                count--;

                                if(!count) {
                                    render();
                                }

                                return;
                            }

                            contacts.count(function (err, total) {
                                count--;

                                if(err) {
                                    if(!count) {
                                        render();
                                    }

                                    return;
                                }

                                client.totalContacts += total;

                                if(!count) {
                                    render();
                                }
                            });
                        });
                    });

                    coll.find({userId: client.userId}, {results: 1, date: 1}, function (err, msgs) {
                        count--;

                        if(err) {
                            if(!count) {
                                render();
                            }

                            return;
                        }

                        msgs.toArray(function (err, msgs) {
                            if(err) {
                                if(!count) {
                                    render();
                                }

                                return;
                            }

                            msgs.forEach(function (msg) {
                                client.sentTotal += msg.results.completed;

                                if(msg.date >= today) {
                                    client.sentToday += msg.results.completed;
                                }
                            });

                            if(!count) {
                                render();
                            }
                        });
                    });
                });
            });

            if(!clients.length) {
                render();
            }

            function render() {
                res.render('admin/clients', {clients: clients, clientsPage: true});
            }
        });
    });
}

function addCreditJSON (req, res, next) {
    req.requireLogin(function (user) {
        if(!user.userData.admin) {
            return res.send('Access denied', 403);
        }
        
        var clientId = req.params.clientId;
        var credits = req.body.amount;
        
        db.mongoConnect({db: 'mail2sms', collection: 'users'}, function (err, users) {
            if(err) {
                return res.json({error: 'Server failure'}, 500);
            }
            
            users.update({userId: Number(clientId)}, {$set: {credits: Number(credits)}}, function (err) {
                if(err) {
                    return res.json({error: 'Server failure'}, 500);
                }
                
                activities.addCredit(clientId, credits);
                res.json({ok: 1});
            });
        });
    });
}

function adminLoginUser (req, res, next) {
    req.requireLogin(function (adminUser) {
        if(!adminUser.userData.admin) {
            return res.send('Access denied', 403);
        }
        
        users.getUser(req.params.userId, function (err, user) {
            if(err) {
                res.send('User not found', 404);
                return;
            }
            
            session.createSession(user.userData, {ip: req.socket.remoteAddress, userAgent: req.headers['user-agent']}, function (err, sessionId) {        
                if(err) {
                    return res.send('Server failure', 500);
                }

                // Session created... send session cookies
                res.cookie('sid', sessionId);

                // Check for a redirect URL
                var redirect = '/contacts';
                res.redirect(redirect);
                activities.adminLogin(user.userData.userId, adminUser.userData.userId);
            });
        });
    });
}

function clientActivities (req, res, next) {
    req.requireLogin(function (user) {
        if(!user.userData.admin) {
            return res.send('Access denied', 403);
        }
        
        var userId = Number(req.params.clientId);
        
        db.mongoConnect({db: 'mail2sms', collection: 'activities.log'}, function (err, collection) {
            if(err) {
                res.send('Server error', 500);
                return;
            }

            collection.find({userId: Number(req.params.clientId)}, function (err, cursor) {
                if(err) {
                    res.send('Server error', 500);
                    return;
                }
                
                cursor.sort({date: -1}).limit(200).toArray(function (err, activities) {
                    if(err) {
                        res.send('Server error', 500);
                        return;
                    }
                    
                    activities.forEach(function (activity) {
                        var date = new Date(activity.date);
                        activity.dateString = '{0} {1} {2} / {3}:{4} {5}'.format(date.getDate(), months[date.getMonth()], date.getFullYear(), date.getHours().toString().pad(2, '0'), date.getMinutes().toString().pad(2, '0'), date.getHours() > 12 ? 'PM':'AM');
                        //22 May 2013 / 02:55 PM
                    });
                    
                    res.render('admin/account-activity', {clientsPage: true, activities: activities, client: user.userData});
                });
            });
        });
    });
}

function addGroupJSON (req, res, next) {
    req.requireLogin(function (user) {
        groups.addGroup(user.userData.userId, req.body.name, function (err, groupId) {
            if(err) {
                return res.json({error: err});
            }
            
            activities.addGroup(user.userData.userId, groupId, req.body.name);
            res.json({groupId: groupId});
        });
    });
}

function updateGroupJSON (req, res, next) {
    req.requireLogin(function (user) {
        groups.renameGroup(user.userData.userId, req.params.groupId, req.body.name, function (err) {
            if(err) {
                return res.json({error: err});
            }
            
            activities.renameGroup(user.userData.userId, req.params.groupId, req.body.name);
            res.json({success: true});
        });
    });
}

function deleteGroupJSON (req, res, next) {
    req.requireLogin(function (user) {
        groups.removeGroup(user.userData.userId, req.params.groupId, function (err) {
            if(err) {
                return res.json({error: err});
            }
            
            activities.removeGroup(user.userData.userId, req.params.groupId);
            res.json({success: true});
        });
    });
}

function uploadContactsForm (req, res, next) {
    if(arguments.length > 3) {
        var err = arguments[3];

        if(arguments.length > 4) {
            var success = arguments[4];
        }
    }

    req.requireLogin(function (user) {
        groups.statGroups(user.userData.userId, function (error, groups) {
            if(error) {
                err = error;
            }
            
            res.render('contacts/upload', {user: user.userData, groups: groups, error: err && (err.message || err)});
        });
    });
}

function uploadContacts (req, res, next) {
    req.requireLogin(function (user) {
        var files = req.files;
        var file = files.file;
        var ext = path.extname(file.name);
        var groups = req.body.groups;

        if(!groups) {
            return uploadContactsForm(req, res, next, 'You need to select at least one group');
        }

        if(!Array.isArray(groups)) {
            groups = [groups];
        }

        console.time('File processing time');

        db.mongoConnect({db: 'mail2sms', collection: 'contacts.tmp'}, function (err, collection) {
            if(err) {
                return uploadContactsForm(req, res, next, 'Database failed');
            }

            var uploadId = util.generateKey(24);

            console.log(ext);
            switch(ext) {
                case '.xlsx':
                    excel(file.path, function (err, data) {
                        console.timeEnd('File processing time');
                        if(err) {
                            return uploadContactsForm(req, res, next, 'Server error');
                        }

                        // Save the temporary file
                        collection.insert({uploadId: uploadId, contacts: data, groups: groups}, function (err) {
                            if(err) {
                                return uploadContactsForm(req, res, next, 'Server error');
                            }

                            activities.uploadContacts(user.userData.userId, uploadId, data.length, groups);
                            res.redirect('/contacts/add/' + uploadId);
                        });
                    });
                    break;
                
                case '.csv':
                    var data = [];
                    csv()
                        .from.stream(fs.createReadStream(file.path))
                        .on('data', function (row) {
                            if(!Array.isArray(row)) {
                                row = row.split(',');
                            }
                            
                            data.push(row);
                        })
                        .on('end', function () {
                            console.timeEnd('File processing time');

                            // Save the temporary file
                            collection.insert({uploadId: uploadId, contacts: data, groups: groups}, function (err) {
                                if(err) {
                                    return uploadContactsForm(req, res, next, 'Server error');
                                }
                                
                                activities.uploadContacts(user.userData.userId, uploadId, data.length, groups);
                                res.redirect('/contacts/add/' + uploadId);
                            });
                        });
                        break;
                default:
                    return uploadContactsForm(req, res, next, 'Unsupported file type');
            }
        });
    });
}

function addContactsForm(req, res, next) {
    if(arguments.length > 3) {
        var error = arguments[3];
    }
    
    req.requireLogin(function (user) {
        // Get a few lines of the contacts
        var uploadId = req.params.uploadId;

        db.mongoConnect({db: 'mail2sms', collection: 'contacts.tmp'}, function (err, collection) {
            collection.findOne({uploadId: uploadId}, function (err, file) {
                if(err) {
                    // Error
                    res.render('contacts/add', {error: 'Server error'});
                    return;
                }

                if(!file) {
                    // Error
                    res.redirect('contacts/add');
                    return;
                }

                var samples = file.contacts.slice(0, 15);

                samples.forEach(function (sample, i) {
                    samples[i] = {
                        col1: sample[0] || '',
                        col2: sample[1] || '',
                        col3: sample[2] || ''
                    };
                });

                groups.statGroups(user.userData.userId, function (err, groups) {
                    if(err) {
                        error = err;
                    }
                    
                    var grps = req.body.groups || file.groups;
                    
                    if(!grps) {
                        res.render('contacts/add', {error: 'You need to select at least one group'});
                        return;
                    }
                    
                    if(!Array.isArray(grps)) {
                        grps = [grps];
                    }
                    
                    groups.forEach(function (group) {
                        if(grps.indexOf(group.groupId) >= 0) {
                            group.selected = true;
                        }
                    });
                    
                    res.render('contacts/add', {user: user.userData, error: error, groups: groups, uploadId: uploadId, samples: samples});
                });
            });
        });
    });
}

function addContacts (req, res, next) {
    req.requireLogin(function (user) {
        var post = req.body,
            col1 = post.col1,
            col2 = post.col2,
            col3 = post.col3,
            groups = post.groups,
            uploadId = req.params.uploadId;
        
        if(col1 === col2 || col2 === col3 || col1 === col3) {
            return addContactsForm(req, res, next, 'The three columns need to be different');
        }
        
        if(!groups) {
            return addContactsForm(req, res, next, 'You need to select at least one group');
        }
        
        if(!Array.isArray(groups)) {
            groups = [groups];
        }
        
        console.log('Adding contacts...');
        db.mongoConnect({db: 'mail2sms', collection: 'contacts.tmp'}, function (err, collection) {
            console.log('Connected to DB');
            if(err) {
                // Error
                return addContactsForm(req, res, next, 'Server error');
            }

            collection.findOne({uploadId: uploadId}, function (err, file) {
                console.log('Retrieved upload info...');
                
                if(err || !file) {
                    // Error
                    return addContactsForm(req, res, next, 'Server error');
                }
                
                var contcts = file.contacts,
                    len = contcts.length,
                    cnts = [],
                    fl, cnt;
                
                for(var i = 0; i < len; i++) {
                    fl = contcts[i];
                    cnt = {};
                    cnt[col1] = String(fl[0]).trim() || '';
                    cnt[col2] = String(fl[1]).trim() || '';
                    cnt[col3] = String(fl[2]).trim() || '';
                    cnts.push(cnt);
                }
                
                // Sit back and relax, this is gonna take a while
                console.log('Running batch upload...');
                contacts.batchUpload(user.userData.userId, cnts, groups, function (err, results) {
                    console.log('Batch upload complete...', results);
                    if(err || !file) {
                        // Error
                        return addContactsForm(req, res, next, 'Server error');
                    }
                    
                    activities.addContacts(user.userData.userId, uploadId, contcts.length, groups);
                    
                    // Delete the temorary contact
                    //collection.remove({uploadId: uploadId}, console.log);
                });
                
                // Return before upload is complete
                res.redirect('/contacts/add?success=true');
            });
        });
    });
}

function listContacts (req, res, next) {
    if(arguments.length > 3) {
        var err = arguments[3];
    }

    req.requireLogin(function (user) {
        groups.statGroups(user.userData.userId, function (error, groups) {
            if(error) {
                err = error;
            }
            
            console.log('Counting contacts');
            contacts.countContacts(user.userData.userId, function (error, count) {
                console.log(count);
                if(error) {
                    err = error;
                }
                
                res.render('contacts/contacts', {user: user.userData, totalContacts: count, groups: groups, error: err && (err.message || err)});
            });
        });
    });
}

function apiGetGroups (req, res, next) {
    // Manually login user
    var qry = req.query,
        username = String(qry.username),
        password = String(qry.password);
    
    auth.login(username, password, function (err, details) {
        if(err) {
            res.json({error: err}, 401);
            return;
        }
        
        var userId = details.userId;
        
        groups.statGroups(userId, function (error, groups) {
            if(error) {
                return res.json({error: error}, 401);
            }
            
            if(groups) {
                groups.forEach(function (group) {
                    delete group._id;
                    delete group.userId;
                });
            }
            
            res.json({success: true, groups: groups});
        });
    });
}

function getContacts (req, res, next) {
    req.requireLogin(function (user) {
        contacts.getContacts (user.userData.userId, req.query.groups, {limit: req.query.limit || 2000}, function (error, contacts) {
            if(error) {
                console.log(error);
                return res.json({error: error});
            }
            
            res.json(contacts);
        });
    });
}

function contactsCount (req, res, next) {
    var groups = req.query.groups;
    
    if(!Array.isArray(groups) || !groups.length) {
        res.json({count: 0});
    }
    
    req.requireLogin(function (user) {
        contacts.countContacts(user.userData.userId, groups, function (err, contacts) {
            if(err) {
                return res.json({error: 1}, 500);
            }
            
            res.json({count: contacts});
        });
    });
}

function sendMessageForm (req, res, next) {
    if(arguments.length > 3) {
        var err = arguments[3];

        if(arguments.length > 4) {
            var success = arguments[4];
        }
    }

    req.requireLogin(function (user) {
        groups.statGroups(user.userData.userId, function (error, groups) {
            if(error) {
                err = error;
            }
            
            res.render('messages/send', {user: user.userData, data: req.body, groups: groups, maxLength: config.maxMessageLength, error: err && (err.message || err), success: success});
        });
    });
}

function sendMessage (req, res, next) {
    req.requireLogin(function (user) {
        var post = req.body,
            groups = post.groups,
            userId = user.userData.userId,
            message = post.message;
        
        // Check if any group was selected
        if(!groups || !groups.length) {
            return sendMessageForm (req, res, next, 'Please select at least one group');
        }
        
        // Check if message was entered
        if('string' !== typeof message) {
            return sendMessageForm (req, res, next, 'Invalid parameters');
        }
        
        message = message.trim();
        
        if(!message) {
            return sendMessageForm (req, res, next, 'You have to enter a message');
        }
        
        if(message.length > config.maxMessageLength) {
            return sendMessageForm (req, res, next, 'Your message must be at most ' + config.maxMessageLength + ' characters long');
        }
        
        // Get the contacts
        contacts.getContacts(userId, groups, {/*TODO: Remove limit: 12*/}, function (err, contacts) {
            var numbers = [],
                len = contacts.length,
                contact, number, i = 0;
            
            for(; i < len; i++) {
                contact = contacts[i];
                number = contact.phone;
                
                if(numbers.indexOf(number) < 0) {
                    numbers.push(number);
                }
            }
            
            // Get the user's account balance
            if(user.userData.credits < numbers.length) {
                return sendMessageForm (req, res, next, 'You do not have enough credits');
            }
            
            // Send messages
            var from = user.userData;
            
            db.mongoConnect({db: 'mail2sms', collection: 'messages.log'}, function (err, log) {
                if(err) {
                    // Can't log
                    return sendMessageForm (req, res, next, 'Server failure');
                }
                
                var batchId = util.generateKey(40);

                messages.batchSend(batchId, numbers, from, message, function (results) {
                    // Log the transaction
                    log.insert({
                        batch: batchId,
                        userId: userId,
                        message: message,
                        numbers: numbers,
                        groups: groups,
                        results: results,
                        date: new Date(),
                        from: from
                    }, function () {console.log(results);});
                });

                return sendMessageForm (req, res, next, null, 'Your messages are being sent in the background');
            });
        });
    });
}

function apiSendGroupMessage (req, res, next) {
    // Manually login user
    var qry = req.query,
        username = String(qry.username),
        password = String(qry.password),
        data = req.body,
        groups = data.groups || data.group,
        message = data.message;
    
    if('object' !== typeof data) {
        res.json({error: {code: 1023, message: 'No suitable data found.'}}, 401);
        return;
    }
    
    if('string' === typeof groups && groups) {
        groups = [groups];
    }
    
    if(!Array.isArray(groups) || !groups.length) {
        res.json({error: {code: 1028, message: 'Please provide valid groups to send message to.'}}, 401);
        return;
    }
        
    if('string' !== typeof message || !message.length) {
        res.json({error: {code: 1013, message: 'Message can\'t be empty.'}}, 401);
        return;
    }

    if(message.length > config.maxMessageLength) {
        res.json({error: {code: 1032, message: 'Your message must be at most ' + config.maxMessageLength + ' characters long'}}, 401);
        return;
    }
    
    auth.login(username, password, function (err, details) {
        if(err) {
            res.json({error: err}, 401);
            return;
        }
        
        var userId = details.userId;
        
        // Get the contacts
        contacts.getContacts(userId, groups, {/*TODO: Remove limit: 12*/}, function (err, contacts) {
            if(err) {
                res.json({error: {code: 0x34E, message: 'Server error'}}, 401);
                return;
            }
            
            var numbers = [],
                len = contacts.length,
                contact, number;
            
            for(var i = 0; i < len; i++) {
                contact = contacts[i];
                number = contact.phone;
                
                if(numbers.indexOf(number) < 0) {
                    numbers.push(number);
                }
            }
            
            // Get the user's account balance
            if(details.credits < numbers.length) {
                return res.json({error: {code: 0x34A, message: 'You do not have enough credits'}}, 401);
            }
            
            // Send messages
            var from = details;
            
            db.mongoConnect({db: 'mail2sms', collection: 'messages.log'}, function (err, log, mongo) {
                if(err) {
                    // Can't log
                    return res.json({error: {code: 0x34E, message: 'Server error'}}, 401);
                }
                    
                var batchId = util.generateKey(40);
                from.api = true;
                
                messages.batchSend(batchId, numbers, from, message, function (results) {
                    // Log the transaction
                    log.insert({
                        batch: batchId,
                        userId: userId,
                        message: message,
                        numbers: numbers,
                        groups: groups,
                        results: results,
                        date: new Date(),
                        from: from,
                        api: true
                    }, function () {console.log(results);});
                });

                return res.json({success: true, message: 'Messages have been queued up'});
            });
        });
    });
}

function apiSendMessage (req, res, next) {
    // Manually login user
    var qry = req.query,
        username = String(qry.username),
        password = String(qry.password);
    
    var data = req.body;
    var numbers = data.number || data.numbers;
    var message = data.message;
    
    if('object' !== typeof data) {
        res.json({error: {code: 1023, message: 'No suitable data found.'}}, 401);
        return;
    }
    
    if(!numbers) {
        res.json({error: {code: 1128, message: 'Missing receipients.'}}, 401);
        return;
    }
    
    if('string' === typeof numbers) {
        numbers = [numbers];
    }
        
    if('string' !== typeof message || !message.length) {
        res.json({error: {code: 1013, message: 'Message can\'t be empty.'}}, 401);
        return;
    }

    if(message.length > config.maxMessageLength) {
        res.json({error: {code: 1032, message: 'Your message must be at most ' + config.maxMessageLength + ' characters long'}}, 401);
        return;
    }
    
    auth.login(username, password, function (err, details) {
        if(err) {
            res.json({error: err}, 401);
            return;
        }
        
        var userId = details.userId;
        
        // Get the user's account balance
        if(details.credits < numbers.length) {
            return res.json({error: {code: 0x34A, message: 'You do not have enough credits'}}, 401);
        }

        // Send messages
        var from = details;

        db.mongoConnect({db: 'mail2sms', collection: 'messages.log'}, function (err, log, mongo) {
            if(err) {
                // Can't log
                return res.json({error: {code: 0x34E, message: 'Server error'}}, 401);
            }

            var batchId = util.generateKey(40);

            from.api = true;

            messages.batchSend(batchId, numbers, from, message, function (results) {
                // Log the transaction
                log.insert({
                    batch: batchId,
                    userId: userId,
                    message: message,
                    numbers: numbers,
                    groups: null,
                    results: results,
                    date: new Date(),
                    from: from,
                    api: true
                }, function () {console.log(results);});
            });

            return res.json({success: true, message: 'Messages have been queued up'});
        });
    });
}

function batchSend (req, res, next) {
    var data = req.body,
        count = data.numbers.length,
        userId = data.from.userId;
    
    db.mongoConnect({db: 'mail2sms', collection: 'users'}, function (err, users, mongo) {
        if(err) {
            // Can't log
            return res.json({completed: 0, failed: count}, 401);
        }
                    
        // Deduct the user's credits first
        users.update({userId: userId}, {$inc: {credits: -1 * data.numbers.length}}, function (err) {
            if(err) {
                // Couldn't deduct
                return res.json({completed: 0, failed: count}, 401);
            }

            messages.processBatch (data.batchId, data.numbers, data.from, data.message, function (results) {
                // Replenish the user's credits for the failed messages
                if(results.failed) {
                    users.update({userId: userId}, {$inc: {credits: results.failed}}, function () {
                        console.log('Replenished user\'s credits for %d failed messages', results.failed);
                    });
                }

                if(data.from.api) {
                    activities.apiMessage(userId, results, data.batchId);
                } else {
                    activities.message(userId, results, data.batchId);
                }

                res.json(results);
            });
        });
    });
}


function serverConfig (req, res, next) {
    var server = req.body;
    
    if(!global.SERVERS) {
        global.SERVERS = [];
    }
    
    // Do we already have this server registered?
    for(var i = 0; i < global.SERVERS.length; i++) {
        var svr = global.SERVERS[i];
        
        if(svr.port === server.port && svr.host === server.host) {
            // Don't propagate, just return the current config
            console.log('SERVERS:', SERVERS);
            return res.json(global.SERVERS);
        }
    }
    
    // Add to the servers list
    global.SERVERS.push(server);
    
    // Tell the new server who and who is online
    res.json(global.SERVERS);
    
    // Propagate
    console.log('SERVERS:', SERVERS);
    
    if(server.propagate) {
        server.propagate = false;
    } else {
        return;
    }
    
    global.SERVERS.forEach(function (svr) {
        (function registerServer () {
            if(svr.host === server.host && svr.port === server.port) {
                // The server that was just added
                return;
            }

            // Make request
            var options = {
                hostname: svr.host,
                port: svr.port,
                path: '/serverConfig',
                method: 'POST'
            };
            
            console.log(options);

            var req = http.request(options, function(res) {
                res.setEncoding('utf8');
                var data = '';

                res.on('data', function (chunk) {
                    data += chunk;
                });

                res.on('end', function () {
                    try {
                        data = JSON.parse(data);
                        console.log('Propagated to server', svr);
                    } catch (e) {
                        req.emit('error', e);
                    }
                });
            });

            req.on('error', function(e) {
                // Failed, try again
                console.log('Server propagation failed, trying again');
                console.log(e);
                setTimeout(registerServer, 5000);
            });

            req.setHeader('content-type', 'application/json; charset=UTF-8');
            req.write(JSON.stringify(server));
            req.end();
        })();
    });
}

