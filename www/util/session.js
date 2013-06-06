var session = require('../controllers/session.js'),
    db = require('./db.js'),
    request, response;

/**
 * Save the current session to the database: a helper function
 * This function is called at the end of every request
 */
function saveSession() {
    var req = this;

    if(req.session) {
        // Check necessary to ensure that session had not been ended
        var sessInfo = req.session;

        if(!sessInfo) {
            return;
        }

        db.redisConnect(function (err, client) {
            if(!err) {
                session.updateSession (req.sessionId, sessInfo, function () {/* Nothing */});
            }
        });
    }
}

/**
 * Check if someone is logged in. Currently examines the session to know if it will find a userId
 * @return bool
 */
function isLoggedIn () {
    var req = this;
    return Boolean(req.session && req.session.userId);
}

/**
 * Get the user that is currently logged in. If no user is logged in, returns nothing
 * @param callback Callback receives an error object and a user object, if a user is logged in.
 */
function getUser(callback) {
    var req = this;

    if(!req.isLoggedIn()) {
        // Not logged in...
        return callback(null, null);
    }

    // Check cache
    if(req.currentUser) {
        return callback(null, req.currentUser);
    }

    var user = require('../controllers/user.js');
    user.getUser(req.session.userId, function (err, user) {
        if(err) {
            return callback(err);
        }

        req.currentUser = user; // Cache
        return callback(null, user);
    });
}

/**
 * End the current session
 * @param {function} callback
 */
function endSession(callback) {
    var req = this;

    if(!req.sessionId) {
        // Not really on any session
        return callback(null);
    }

    session.endSession(req.sessionId, callback);
}

/**
 * Check if a user is logged in. If the user is not logged in, redirect to the
 * login page. If error occurs, redirect to a 500 page. If the user is logged in
 * process the callback function.
 * @param {Function} callback Callback receives the User object of the logged in
 *  user.
 * @returns {undefined}
 */
function requireLogin(callback) {
    var req = this;

    this.getUser(function (err, user) {
        if(err) {
            return response.redirect('/server/500?redir=' + encodeURIComponent(req.url));
        }

        if(!user) {
            return response.redirect('/login?next=' + encodeURIComponent(req.url));
        }

        // User found
        return callback(user);
    });
}

function getLanguage () {
    // Meant to get the language from the browser, or from user's preference
    // TODO: Implement
    return request.lang;
}

module.exports = {
    middleware: function (req, res, next) {
        req.isLoggedIn = isLoggedIn;
        req.getUser = getUser;
        req.logout  = req.endSession = endSession;
        req.requireLogin = requireLogin;
        response = res;
        request = req;
        
        req.getLanguage = getLanguage;
        var sessionId = req.cookies && req.cookies.sid;

        if(!sessionId) {
            // No session cookie
            return next();
        }

        session.getSession(sessionId,
            {
                ip: req.socket.remoteAddress,
                renew: true,
                userAgent: req.headers['user-agent']
            },
            function (err, userInfo) {
                if(err) {
                    // No session or session error
                    // Ignore for now
                    // TODO: examine the error and decide whether to ignore or throw an HTTP 500
                    return next();
                }

                // Session found...
                userInfo.active = Boolean(parseInt(userInfo.active));
                userInfo.userId = parseInt(userInfo.userId);
                req.session = userInfo;
                req.sessionId = sessionId;

                res.on("finish", saveSession.callback(req));
                next();
            }
        );
    }
};



