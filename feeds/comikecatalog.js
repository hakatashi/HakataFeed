const xml2js = require('xml2js');
const request = require('request');
const async = require('async');
const Cookie = require('tough-cookie').Cookie;
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const querystring = require('querystring');
const url = require('url');
const config = require('../config.js');

let session = null;
const globals = {};

const builder = new xml2js.Builder({
	explicitArray: false,
});

const comikecatalog = (req, res, done) => {
	function login(done) {
		session = null;

		request({
			method: 'POST',
			url: 'https://auth.circle.ms/auth/',
			form: {
				Username: config.comikecatalog.user,
				Password: config.comikecatalog.pass
			}
		}, (error, response, body) => {
			if (error) return done(error);

			// serialize cookie
			let setCookie;
			if (response.headers['set-cookie'] instanceof Array) {
				setCookie = response.headers['set-cookie'];
			} else {
				setCookie = [response.headers['set-cookie']];
			}

			const cookie = setCookie.map(cookie => Cookie.parse(cookie)).filter(cookie => cookie.key === '.ASPXAUTH');

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
				Cookie: `.ASPXAUTH=${session}`
			}
		}, (error, response, body) => {
			if (error) return done(error);
			if (response.statusCode !== 200) return done(new Error('login error'));

			done(null, cheerio.load(body));
		});
	}

	function buildAtom($, done) {
		const feed = {
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
				id: 'http://feed.hakatashi.com/comikecatalog.atom',
				entry: []
			}
		};

		let updated = moment(0);

		$('.c-table--list tr:not(.c-table__sep):not(:first-child)').each(function () {
			const $row = $(this);

			const info = {
				thumbnail_url: $row.find('img').first().attr('src'),
				place:         $row.children('td').eq(1).text(),
				url:           $row.children('td').eq(2).children('a').attr('href'),
				circle_name:   $row.children('td').eq(2).children('a').text(),
				content:       $row.children('td').eq(3).html().trim(),
				date:          moment.tz($row.children('td').eq(4).text().trim(), 'YYYY/MM/DD HH:mm', 'Asia/Tokyo'),
			};

			const baseUrl = 'https://webcatalog-free.circle.ms/User';

			info.url = url.resolve(baseUrl, info.url);
			info.thumbnail_url = url.resolve(baseUrl, info.thumbnail_url);

			const content =
				`<p><a href="${info.url}"><img src="${info.thumbnail_url}" /></a></p>${info.content}`;

			const entry = {
				title: {
					$: {
						type: 'text'
					},
					_: `「${info.circle_name}」さんがアクティビティを更新しました。`,
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
					_: content,
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

	let $;

	async.series([
		done => {
			if (!session) {
				login(done);
			} else {
				done();
			}
		},
		done => {
			fetchData((error, data) => {
				if (error) {
					if (error.message === 'login error') {
						login(error => {
							if (error) return done(error);

							fetchData((error, data) => {
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
		done => {
			buildAtom($, (error, atom) => {
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
