
/**
 * Module dependencies.
 */

const express = require('express');
const routes = require('./routes');
const http = require('http');
const path = require('path');
const fs = require('fs');

const pixiv = require('./feeds/pixiv.js');
const qiita = require('./feeds/qiita.js');
const config = require('./config.js');

const app = express();

// all environments
app.set('port', config.port || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('default'));
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
app.get('/pixiv.atom', pixiv.illust);
app.get('/pixiv-novels.atom', pixiv.novel);
app.get('/qiita.atom', qiita);

http.createServer(app).listen(app.get('port'), () => {
	console.log(`Express server listening on port ${app.get('port')}`);
});
