/**
 * Error codes and associated messages
 */
module.exports = function (code, original) {
    if(errorCodes[code]) {
        // Code exists
        var error = {
            message: errorCodes[code],
            codeStr: '0x' + code.toString(16).toUpperCase(),
            code: code
        };

        if(original) {
            error.originalError = original;
            console.error(original);
        }

        return error;
    }

    // Code does not exist... probably not an error code. Transmit.
    return code;
};

var errorCodes = {
    0x1810: 'System error: please contact admin',                               // Generic system error for unexpected system failure
    0x1811: 'Login required. Please login.',
    0x1919: 'Cannot connect: unknown database name',                            // Some weird database name was provided to mongo connector
    0x1923: 'Cannot connect: unknown collection name',                          // Probably some typo or an unregistered collection was used for mongo connector
    0x2308: 'Unable to log in due to server failure',                           // Loign hiccup
    0x2314: 'Login failed: username/password not correct',                      // Login failed
    0x2328: 'Invalid username provided',
    0x2329: 'Invalid password provided',
    0x2330: 'Invalid email provided',
    0x2331: 'Please provide a name',
    0x2332: 'Username already exists. Please choose another.',
    0x2333: 'Email is already registered. Please login with your username and password.',


    0x2900: 'Server error while logging in',                                    // Redis server fail during login
    0x2901: 'Username and password did not match',
    0x2902: 'Account is inactive. Please make sure you have verified account and that account is not blocked.',
    0x2903: 'Server error while loging in',                                     // MongoDB connection error
    0x2904: 'Serever error while login in',                                     // MongoDB query failure
    0x290C: 'No session data provided',                                         // Attempt to create session with bad session details

    0x2A00: 'Server error while retrieving session information',                // Redis pooped on the pants
    0x2A01: 'Session information not found',                                    // Occurs when we cannot find the session identified by the given key
    0x2A02: 'Saved session signature does not match current client signature',  // Occurs when the IP address on file or the user agent does not match the one saved on the server when the session was created
    0x2A04: 'Cannot update inexistent session',



    0x3401: 'No such language pack',                                            // Language pack we are looking for was not found
    0x3405: 'Text not found in language file',                                  // Text translation could not find the specified text in language file

    0x4B01: 'User not found',                                                   // User with ID {userId} not found
    0x4B02: 'Server error: could not get user information',                     // Database error trying to get user's information
    0x4B03: 'Incorrect password',                                               // Redis failed us while checking if username is free
    0x4B04: 'Email is already registered',                                        // Please choose another username!
    0x4B05: 'Error retrieving user information',                                // Redis during findByUsername or findByEmail
    0x4B06: 'User not found',                                                   // Maybe not really, but user was not found in the cache
    0x4B07: 'Internal error',                                                   // Mongo failed during getFromMongo
    0x4B08: 'Database connection error while creating account',                 // MongoDB!!!
    0x4B09: 'Unexpected DB error while creating account',                       // MongoDB fail while executing insert
    0x4B0A: 'Unexpected DB error while creating account',                       // Redis connect error
    0x4B0B: 'Unexpected DB error while creating account',                       // Redis error while saving to cache
    0x4B0C: 'Internal error',                                                   // Mongo failed during findByEmail
    0x4B0D: 'Email not found',                                                  // No user with that email!!!
    0x4B0E: 'Error resetting the user\'s password',                             // MongoDB connection during PW reset
    0x4B0F: 'Error resetting user\'s password',                                 // Mongo update failed while resetting password
    //
    0x4B19: 'Password need to be between 6 and 32 characters',                  
    0x4B1A: 'Error resetting user\'s password',                                 // redis failed while resetting password
    //
    0x4B1E: 'Error changing password',                                          // MongoDB connection during PW change
    0x4B1F: 'Error changing password',                                          // Mongo update failed while resetting password
    
    0x9000: 'Database error while retrieving list of stars',
    0x9001: 'Database error while retrieving star info',
    0x9002: 'Star not found',                                                   // Self explanatory

    0x9010: 'Connection error while retrieving list',                           // Database!!!
    0x9011: 'Database error while retrieving list',                             // Could not retrieve unsigned autographs
    0x9012: 'Database error while retrieving list',                             // Could not convert cursor to array (unsigned autographs)

    0x9104: 'Card not found',
    0x9105: 'Error retieving card',                                             // Error querying
    0x9106: 'Error connecting to card store',                                   // Error connecting to Mongo


    0x9343: 'You need to be a star to access this page',                        // User is not a star

    0x9A01: 'Server error while retrieving order',                              // Database error while getting order information
    0x9A02: 'Order not found',
    0x9A16: 'Server error while placing order',

    0x9A03: 'Server error while retrieving order',                              // Query failed
    0x9013: 'Connection error while updating card',                             // Database connect, while trying to update orders
    0x9014: 'Database error while updating card',                               // Database query, while trying to update orders
    0x9015: 'Could not place order: server failure',                            // Database conn fail
    0x1916: 'Could not place order: server failure',                            // Database query fail

    0xAF01: 'Error creating recording session',                                 // Redis did not agree we should continue creating media session.
    0xAF02: 'Something weird',                                                  // Something really weird. Redis connection failed while creating media session
    0xAF03: 'Server error',                                                     // Redis connection error while retrieving media session
    0xAF04: 'Server error',                                                     // Redis query error while doing above
    
    0xB3A0: 'Unknown sender',                                                   // An unknown sender was trying to send a mail
    0xB3A1: 'Incomplete mail',                                                  // Trying to send an incomplete mail
    
};
