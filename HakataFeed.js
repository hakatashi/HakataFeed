
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var feeds = require('./feeds');
var http = require('http');
var path = require('path');

var config = require('./config.js');

var app = express();

// all environments
app.set('port', config.port || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(require('less-middleware')(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
	app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/pixiv.atom', feeds.pixiv.illust);
app.get('/pixiv-novels.atom', feeds.pixiv.novel);

http.createServer(app).listen(app.get('port'), function(){
	console.log('Express server listening on port ' + app.get('port'));
});
