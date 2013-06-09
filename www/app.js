
// Extend objects
require('./util/extend.js');

var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , session = require('./util/session.js');

var app = express();

// assign the swig engine to .mustache files
//app.engine('html', cons.mustache);
app.set('layout', 'layout');
app.set('partials', {
    sidebar: 'sidebar/index',
    adminSidebar: 'sidebar/admin',
    groups: 'contacts/groups-list',
    contacts: 'sidebar/contacts'
});
app.engine('html', require('hogan-express'));
//app.engine('txt', require('hogan-express'));
app.set('json spaces', null);

var logger = 'dev';

app.configure('staging', function(){
    logger = 'short';
});

app.configure(function(){
  app.set('port', parseInt(process.env.PORT) || 3200);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'html');
  app.use(express.cookieParser({secret: '(-m$ZNpa+[5V#)n6T!T7jh2_4w39i&h5k0Tl=ESmSbc[Q[Ee'}));
  app.use(express.logger(logger));
  app.use(express.bodyParser());
  app.use(session.middleware);
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

// Init routes
routes(app);

var server = http.createServer(app);

server.listen(app.get('port'), function(){
    console.log("Express server listening on port " + app.get('port'));
});


function registerServer () {
    // Register this server
    var host = process.env.HOST;
    var port = app.get('port');
    var configServer = process.env.CONFIG_SERVER;
    var configServerPort = process.env.CONFIG_SERVER_PORT;

    // Make request
    var options = {
        hostname: configServer,
        port: configServerPort,
        path: '/serverConfig',
        method: 'POST'
    };

    var req = http.request(options, function(res) {
        res.setEncoding('utf8');
        var data = '';

        res.on('data', function (chunk) {
            data += chunk;
        });

        res.on('end', function () {
            try {
                data = JSON.parse(data);
                global.SERVERS = data;
                console.log('Server registered');
                console.log('SERVERS:', SERVERS);
            } catch (e) {
                req.emit('error', e);
            }
        });
    });

    req.on('error', function(e) {
        // Failed, try again
        console.log('Server registration failed, trying again');
        console.log(e);
        setTimeout(registerServer, 5000);
    });

    req.setHeader('content-type', 'application/json; charset=UTF-8');

    req.write(JSON.stringify({
        host: host,
        port: port,
        propagate: true
    }));

    req.end();
}

setTimeout(registerServer, 5000);

// Start the SMTP server
require('./smtp/server');

