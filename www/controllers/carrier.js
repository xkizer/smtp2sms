var crypto = require('crypto'),
    http = require('http'),
    db = require('../util/db');

require('../util/extend');

var service1Regexp = /<h2 class="searchTitle">Carrier: <\/h2>(.*?)<br/i;
var numBreak = /([0-9]{3})([0-9]{3})([0-9]{4})$/;
var service2Regexp = /(?:<A HREF='http:\/\/fonefinder\.net\/(.+?)\.php'>)?([^<>]+?)(?:<\/A>)?<TD>([^<]+?)<TD><A HREF='findcity\.php/i;
var apiRegexp  = /<carrier id="([0-9]+)">(.+?)<\/carrier>/;

var carrierExpire = 60 * 24 * 60 * 365 * 2; // Cache numbers for two years. This number needs to be balanced between saving cost and having fairly accurate lookups

var api = {
    host: 'api.4info.net',
    path: '/GatewayService/v2/lookup',
    secret: 'p3OU7jFw86J7j5Ra/iPIvWC1SJRzw2EsIQU4B5Diknw=',
    key: 'a66ed43e27dd43d1'
};

var service1Map = {
    'NEXTEL COMMUNICATIONS, INC.': 'nextel',
    'NEW CINGULAR WIRELESS PCS, LLC': 'cingular',
    'AMERITECH ILLINOIS': 'ameritech',
    'UNITED STATES CELLULAR CORP.': 'us_cellular',
    'SPRINT SPECTRUM L.P.': 'sprint',
    'CELLCO PARTNERSHIP DBA VERIZON WIRELESS': 'verizon',
    'MCIMETRO, ATS, INC.': 'mcimetro',
    'BROADWING COMMUNICATIONS, LLC': 'broadwing',
    'AMERITECH WISCONSIN': 'ameritech',
    'T': 'tmobile'
    
};

var apiMap = {
    1: 'att',
    2: 't_mobile',
    3: 'cingular',
    4: 'verizon_wireless',
    5: 'sprint',
    6: 'nextel',
    36: 'us_cellular',
    125: 'cincinnati_bell',
    128: 'boostmobile',
    129: 'boostmobile',
    140: 'pioneer',
    203: 'cricket',
    205: 'virgin_mobile',
    210: 'cellularsouth',
    214: 'iwireless_sprint',
    216: 'metro_pcs',
    232: 'west_central',
    233: 'cellcom',
    249: 'bluegrass',
    264: 'golden_state',
    274: 'alaska_communications',
    281: 'viaero',
    324: 'nextech',
    358: 'element',
    359: 'alltel_allied'
};



module.exports = {
    lookup: doLookup,
    getSMSEmail: getSMSEmail
};


function getSMSEmail (number, callback) {
    // Find the carrier
    doLookup(number, function (err, carrier) {
        if(!carrier) {
            return callback('CARRIER NOT FOUND');
        }
        
        // Look in the DB
        db.redisConnect(function (err, redis) {
            if(err) {
                return callback('DB FAIL');
            }
            
            redis.hgetall('SMTPSMS:EMAILSERVER:' + carrier, function (err, carrier) {
                if(err) {
                    return callback('DB FAIL');
                }
                
                if(!carrier) {
                    return callback('NOT FOUND: ' + carrier);
                }
                
                return callback(null, '{0}@{1}'.format(number, carrier.suffix));
            });
        });
    });
}


function doLookup(number, callback) {
    // Try different methods. Start with the cache
    localLookup(number, function (err, carrier, name) {
        if(carrier) {
            log('FOUND IN CACHE');
            return callback(null, carrier, name);
        }
        
        // Not cached
        freeService1(number, function (err, carrier, name) {
            if(carrier) {
                log('FOUND IN SERVICE 1');
                callback(null, carrier, name);
                return storeCarrier (number, carrier, name,  log);
            }

            // Keep trying
            freeService2(number, function (err, carrier, name) {
                if(carrier) {
                    log('FOUND IN SERVICE 2');
                    callback(null, carrier, name);
                    return storeCarrier (number, carrier, name,  log);
                }

                // Keep trying
                apiRequest (number, function (err, carrier, name) {
                    if(carrier) {
                        log('FOUND IN API');
                        callback(null, carrier, name);
                        return storeCarrier (number, carrier, name,  log);
                    }
                    
                    // Not found
                    log('NOT FOUND ANYWHERE');
                    return callback('NOT FOUND');
                });
            });
        });
    });
}

function freeService1 (number, callback) {
    var options = {
      hostname: 'retrosleuth.com',
      port: 80,
      path: '/free-phone-carrier-search?phone_number=' + number,
      method: 'GET'
    };

    var req = http.request(options, function(res) {
        if(res.headers.location && res.headers.location.match(/not_found/)) {
            return callback('Not found');
        }
        
        res.setEncoding('utf8');
        var data = '';

        res.on('data', function (chunk) {
            data += chunk;
        });
        
        res.on('end', function () {
            // Process the returned data using regular expression
            var y = data.replace(/\r?\n/g, ' ').replace(/&nbsp;/g, ' ');
            var r = service1Regexp.exec(y);
            
            if(r) {
                var res = service1Map[t];
                
                if(!res) {
                    return callback('Not found in map');
                }
                
                var t = r[1].split('-')[0].trim();
                return callback(null, service1Map[t] || t, r[1].trim());
            }
            
            return callback('Unexpected');
        });
    });

    req.on('error', function(e) {
        log('problem with request: ' + e.message);
        return callback('Error');
    });

    req.end();
}

function freeService2 (number, callback) {
    number = String(number);
    number = numBreak.exec(number);
    
    if(!number) {
        console.log('INVALID NUMBER FROMAT', number);
        return callback('Wrong number format' + number);
    }
    
    var options = {
      hostname: 'www.fonefinder.net',
      port: 80,
      path: '/findome.php?npa=' + number[1] + '&nxx=' + number[2] + '&thoublock=' + number[3] + '&usaquerytype=Search+by+Number',
      method: 'GET'
    };

    var req = http.request(options, function(res) {
        if(res.headers.location && res.headers.location.match(/not_found/)) {
            return callback('Not found');
        }
        
        res.setEncoding('utf8');
        var data = '';

        res.on('data', function (chunk) {
            data += chunk;
        });
        
        res.on('end', function () {
            // Process the returned data using regular expression
            var y = data.replace(/\r?\n/g, ' ').replace(/&nbsp;/g, ' ');
            var r = service2Regexp.exec(y);
            
            if(r && r[1]) {
                return callback(null, r[1], r[2]);
            }
            
            if(r && r[2]) {
                var res = service1Map[t];
                
                if(!res) {
                    return callback('Not found in map');
                }
                
                var t = r[2].split('-')[0].trim();
                return callback(null, service1Map[t] || t, r[2].trim());
            }
            
            return callback('Unexpected');
        });
    });

    req.on('error', function(e) {
        log('problem with request: ' + e.message);
        return callback('Error');
    });

    req.end();
}

function apiRequest (number, callback) {
    var params = 'api_key={0}date={1}min={2}'.format(api.key, (new Date).toUTCString(), number);
    var hmac = crypto.createHmac('SHA1', api.secret);
    hmac.update(api.path);
    hmac.update(params);
    var signature = hmac.digest('base64');
    params = 'api_key={0}&date={1}&min={2}&signature={3}'.format(encodeURIComponent(api.key), encodeURIComponent((new Date).toUTCString()), number, encodeURIComponent(signature));
    
    var options = {
      hostname: api.host,
      port: 80,
      path: api.path + '?' + params,
      method: 'GET'
    };

    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        var data = '';

        res.on('data', function (chunk) {
            data += chunk;
        });
        
        res.on('end', function () {
            // Process the returned data using regular expression
            var y = data.replace(/\r?\n/g, ' ').replace(/&nbsp;/g, ' ');
            var r = apiRegexp.exec(y);
            
            if(r && apiMap[r[1]]) {
                return callback(null, apiMap[r[1]], r[2]);
            }
            
            return callback('Not found');
        });
    });

    req.on('error', function(e) {
        log('problem with request: ' + e.message);
        return callback('Error');
    });

    req.end();
}

function localLookup (number, callback) {
    db.redisConnect(function (err, client) {
        if(err) {
            return callback('DB FAIL');
        }
        
        client.hgetall('SMTPSMS:CARRIERS:'+number, function (err, carrier) {
            if(err) {
                return callback('LOOKUP ERROR');
            }
            
            if(!carrier) {
                return callback('NOT FOUND');
            }
            
            return callback(null, carrier.id, carrier.name);
        });
    });
}

function storeCarrier (number, carrier, name, callback) {
    db.redisConnect(function (err, client) {
        if(err) {
            return callback('DB FAIL');
        }
        
        client.hmset('SMTPSMS:CARRIERS:'+number, {name: name, id: carrier}, function (err) {
            if(err) {
                return callback('LOOKUP ERROR');
            }
            
            callback(null, number, carrier, name);
            
            // Expire the record after some time
            if(carrierExpire) {
                client.expire('SMTPSMS:CARRIERS:'+number, carrierExpire, log);
            }
        });
    });
}

function log () {
    // Logs messages for development and debugging
    console.log.apply(console, arguments);
}


