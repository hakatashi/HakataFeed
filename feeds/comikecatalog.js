var xml2js = require('xml2js');
var request = require('request');
var async = require('async');
var Cookie = require('tough-cookie').Cookie;
var cheerio = require('cheerio');
var moment = require('moment-timezone');
var querystring = require('querystring');
var url = require('url');
var config = require('../config.js');

var session = null;
var globals = {};

var builder = new xml2js.Builder({
	explicitArray: false,
});

var comikecatalog = function (req, res, done) {
	function login(done) {
		session = null;

		request({
			method: 'POST',
			url: 'https://auth.circle.ms/auth/',
			form: {
				Username: config.comikecatalog.user,
				Password: config.comikecatalog.pass
			}
		}, function (error, response, body) {
			if (error) return done(error);

			// serialize cookie
			var setCookie;
			if (response.headers['set-cookie'] instanceof Array) {
				setCookie = response.headers['set-cookie'];
			} else {
				setCookie = [response.headers['set-cookie']];
			}

			var cookie = setCookie.map(function (cookie) {
				return Cookie.parse(cookie);
			}).filter(function (cookie) {
				return cookie.key === '.ASPXAUTH';
			});

			if (!cookie) {
				return done(new Error('cannot get session'));
			} else {
				session = cookie[0].value;
				return done();
			}
		});
	}

	function fetchData(done) {
		request({
			method: 'GET',
			url: 'https://webcatalog-free.circle.ms/User',
			headers: {
				Cookie: '.ASPXAUTH=' + session
			}
		}, function (error, response, body) {
			if (error) return done(error);
			if (response.statusCode !== 200) return done(new Error('login error'));

			done(null, cheerio.load(body));
		});
	}

	function buildAtom($, done) {
		var feed = {
			feed: {
				$: {
					xmlns: 'http://www.w3.org/2005/Atom',
				},
				updated: '',
				title: {
					$: {
						type: 'text',
					},
					_: 'Comike Catalog Recent Updates',
				},
				subtitle: {
					$: {
						type: 'text',
					},
					_: 'all',
				},
				link: {
					$: {
						rel: 'alternate',
						href: 'https://webcatalog-free.circle.ms/User',
						type: 'text/html',
					},
				},
				generator: {
					$: {
						uri: 'https://github.com/hakatashi/HakataFeed',
						version: '1.0.0',
					},
					_: 'HakataFeed',
				},
				id: 'http://feed.hakatashi.com/pixiv-novels.atom',
				entry: []
			}
		};

		var updated = moment(0);

		$('.c-table--list tr:not(.c-table__sep):not(:first-child)').each(function () {
			var $row = $(this);

			var info = {
				thumbnail_url: $row.find('img').first().attr('src'),
				place:         $row.children('td').eq(1).text(),
				url:           $row.children('td').eq(2).children('a').attr('href'),
				circle_name:   $row.children('td').eq(2).children('a').text(),
				content:       $row.children('td').eq(3).html().trim(),
				date:          moment.tz($row.children('td').eq(4).text().trim(), 'YYYY/MM/DD HH:mm', 'Asia/Tokyo'),
			};

			var baseUrl = 'https://webcatalog-free.circle.ms/User';

			info.url = url.resolve(baseUrl, info.url);
			info.thumbnail_url = url.resolve(baseUrl, info.thumbnail_url);

			var content =
				'<p><a href="' + info.url + '">' +
					'<img src="' + info.thumbnail_url + '" />' +
				'</a></p>' +
				info.content;

			var entry = {
				title: {
					$: {
						type: 'text'
					},
					_: '「' + info.title + '」さんがアクティビティを更新しました。',
				},
				link: {
					$: {
						href: info.url,
						rel: 'alternate',
					},
				},
				id: url.resolve(baseUrl, info.url),
				content: {
					$: {
						type: 'html',
					},
					_: info.content,
				},
				category: {
					$: {
						term: 'update',
					},
				},
				author: {
					name: info.circle_name,
					uri: info.url,
				},
				published: info.date.toISOString(),
				updated: info.date.toISOString(),
			};

			feed.feed.entry.push(entry);

			if (info.date.toDate() > updated.toDate()) {
				updated = info.date;
			}
		});

		feed.feed.updated = updated.toISOString();

		return done(null, builder.buildObject(feed));
	}

	var $;

	async.series([
		// Get session
		function (done) {
			if (!session) {
				login(done);
			} else {
				done();
			}
		},
		// Get data
		function (done) {
			fetchData(function (error, data) {
				if (error) {
					if (error.message === 'login error') {
						login(function (error) {
							if (error) return done(error);

							fetchData(function (error, data) {
								if (error) return done(error);

								$ = data;
								done();
							});
						});
					} else {
						return done(error);
					}
				} else {
					$ = data;
					done();
				}
			});
		},
		// build atom data
		function (done) {
			buildAtom($, function (error, atom) {
				if (error) return done(error);

				res.status(200);
				res.set({
					'Content-Type': 'application/atom+xml; charset=utf-8',
				});
				res.send(atom);
				res.end();
			});
		}
	], done);
};

module.exports = comikecatalog;
