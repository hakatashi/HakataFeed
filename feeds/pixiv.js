var xml2js = require('xml2js');
var request = require('request');
var csvParse = require('csv-parse');
var async = require('async');
var Cookie = require('tough-cookie').Cookie;
var querystring = require('querystring');
var config = require('../config.js');

var PHPSESSID = null;
var globals = {};

var builder = new xml2js.Builder({
	explicitArray: false,
});

var pixiv = function (mode, req, res, done) {

	function getPHPSESSID(done) {
		PHPSESSID = null;

		request({
			method: 'POST',
			url: 'https://www.secure.pixiv.net/login.php',
			form: {
				mode: 'login',
				pixiv_id: config.pixiv.user,
				pass: config.pixiv.pass,
				skip: 0
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
				return cookie.key === 'PHPSESSID';
			});

			if (!cookie) {
				return done(new Error('cannot get PHPSESSID'));
			} else {
				PHPSESSID = cookie[0].value;
				return done();
			}
		});
	}

	function fetchData(done) {
		request({
			method: 'GET',
			url: mode === 'illust'
			     ? 'http://spapi.pixiv.net/iphone/bookmark_user_new_illust.php'
			     : 'http://spapi.pixiv.net/iphone/bookmark_user_new_novel.php',
			qs: {
				dummy: 0,
				PHPSESSID: PHPSESSID
			}
		}, function (error, response, body) {
			if (error) return done(error);
			if (body.length === 0) return done(new Error('zero-length content'));

			csvParse(body.toString('utf8'), function (error, data) {
				if (error) return done(error);

				done(null, data);
			});
		});
	}

	function buildAtom(rows, done) {
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
					_: mode === 'illust'
					   ? 'Recent Illusts from Pixiv Followers'
					   : 'Recent Novels from Pixiv Followers',
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
						href: mode === 'illust'
						      ? 'http://www.pixiv.net/bookmark_new_illust.php'
						      : 'http://www.pixiv.net/novel/bookmark_new.php',
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
				id: mode === 'illust'
				    ? 'http://www.tsg.ne.jp/hakatashi/feed/pixiv.atom'
				    : 'http://www.tsg.ne.jp/hakatashi/feed/pixiv-novels.atom',
				entry: []
			}
		};

		var updated = new Date(0);

		rows.forEach(function (row) {
			var info = {
				illust_id:    parseInt(row[0]),
				user_id:      parseInt(row[1]),
				extension:    row[2],
				title:        row[3],
				user_name:    row[5],
				illust_url:   row[9],
				upload_date:  new Date(row[12]),
				tags:         row[13],
				evaluate_cnt: parseInt(row[15]),
				evaluate_sum: parseInt(row[16]),
				view_cnt:     parseInt(row[17]),
				caption:      row[18],
				page_cnt:     parseInt(row[19]),
				r18:          Boolean(row[26] === '1'),
			};

			var illustUrl = 'http://www.pixiv.net/member_illust.php?';
			var memberUrl = 'http://www.pixiv.net/member.php?';
			var novelUrl = 'http://www.pixiv.net/novel/show.php?';

			var user_url = memberUrl + querystring.stringify({id: info.user_id});

			var url, content, category;

			if (mode === 'illust') {
				url = illustUrl + querystring.stringify({mode: 'medium', illust_id: info.illust_id});
				var big_url;
				if (info.page_cnt) {
					big_url = illustUrl + querystring.stringify({mode: 'manga', illust_id: info.illust_id});
				} else {
					big_url = illustUrl + querystring.stringify({mode: 'big', illust_id: info.illust_id});
				}

				category = info.page_cnt ? 'manga' : 'illust';

				content =
					'<p>' + info.caption + '</p>' +
					'<p>タグ: ' + info.tags + '</p>' +
					'<p><a href="' + big_url + '">' +
						'<img src="' + info.illust_url + '" />' +
					'</a></p>';
			} else {
				url = novelUrl + querystring.stringify({id: info.illust_id});

				category = 'novel';

				content =
					'<p>' + info.caption + '</p>' +
					'<p>タグ: ' + info.tags + '</p>';
			}

			var entry = {
				title: {
					$: {
						type: 'text'
					},
					_: info.title,
				},
				link: {
					$: {
						href: url,
						rel: 'alternate',
					},
				},
				id: url,
				content: {
					$: {
						type: 'html',
					},
					_: content,
				},
				category: {
					$: {
						term: category,
					},
				},
				author: {
					name: info.user_name,
					uri: user_url,
				},
				published: info.upload_date.toISOString(),
				updated: info.upload_date.toISOString(),
			};

			feed.feed.entry.push(entry);

			if (info.upload_date > updated) {
				updated = info.upload_date;
			}
		});

		feed.feed.updated = updated.toISOString();

		return done(null, builder.buildObject(feed));
	}

	var rows;

	async.series([
		// Get PHPSESSID
		function (done) {
			if (!PHPSESSID) {
				getPHPSESSID(done);
			} else {
				done();
			}
		},
		// Get data from pixiv
		function (done) {
			fetchData(function (error, data) {
				if (error) {
					// if nothing returned, try to login to pixiv again
					if (error.message === 'zero-length content') {
						getPHPSESSID(function (error) {
							if (error) return done(error);

							fetchData(function (error, data) {
								if (error) return done(error);

								rows = data;
								done();
							});
						});
					} else {
						return done(error);
					}
				} else {
					rows = data;
					done();
				}
			});
		},
		// build atom data
		function (done) {
			buildAtom(rows, function (error, atom) {
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

module.exports = {
	illust: pixiv.bind(this, 'illust'),
	novel: pixiv.bind(this, 'novel'),
};
