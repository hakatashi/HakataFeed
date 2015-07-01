var xml2js = require('xml2js');
var request = require('request');
var async = require('async');
var moment = require('moment-timezone');
var cheerio = require('cheerio');
var config = require('../config.js').qiita;
var phantom = require('phantom');

var jQueryPath = 'bower_components/jquery/dist/jquery.js';

var builder = new xml2js.Builder({
	explicitArray: false,
});

var qiita = function (mode, req, res, done) {
	var page = null;

	function login(done) {
		page.open('https://qiita.com/login', function (status) {
			page.includeJs('http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js', function () {
				page.onUrlChanged = function (url) {
					console.log('URL Changed: ' + url);
					if (url === 'http://qiita.com/') {
						done(null);
					}
				};
				console.log('Logging in... Config: ' + JSON.stringify(config));
				page.evaluate(function (config) {
					$('#identity').val(config.user);
					$('#password').val(config.pass);
					$('form').submit();
				}, config);
			});
		});
	}

	function fetchData(done) {
		page.open('http://qiita.com/', function (status) {
			page.includeJs('http://ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js', function () {
				console.log('Getting activities...');
				var data = page.evaluate(function () {
					// Check if logged in
					if ($('.userInfo').length) {
						return $('.activities').html();
					} else {
						return null;
					}
				});
				done(null, data);
			});
		});
	}

	function buildAtom(data, done) {
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
					_: 'Qiita activities',
				},
				subtitle: {
					$: {
						type: 'text',
					},
					_: 'all',
				},
				link: [
					{
						$: {
							rel: 'alternate',
							href: 'http://qiita.com/',
							type: 'text/html',
						},
					},
					{
						$: {
							rel: 'self',
							href: 'http://feed.hakatashi.com/qiita.atom',
							type: 'application/atom+xml',
						},
					}
				],
				generator: {
					$: {
						uri: 'https://github.com/hakatashi/HakataFeed',
						version: '1.0.0',
					},
					_: 'HakataFeed',
				},
				id: 'http://feed.hakatashi.com/qiita.atom',
				entry: []
			}
		};

		var updated = moment(0);
		var $items = cheerio.load(data);

		$items.each(function () {
			var $item = $(this);

			console.log($item.text());

			if (mode === 'illust') {
				var dateParams = $item.find('._thumbnail').attr('src').split('/').map(function (param) {
					return parseInt(param, 10);
				});

				if (dateParams.length === 12) dataParams.unshift([NaN, NaN]);

				var info = {
					illust_id:    parseInt($item.find('.work').attr('href').match(/illust_id=(\d+)/)[1]),
					user_id:      parseInt($item.find('.user').data('user_id')),
					//extension:    row[2],
					title:        $item.find('.title').text(),
					user_name:    $item.find('.user').data('user_name'),
					illust_url:   $item.find('._thumbnail').attr('src').replace('150x150', '480x960'),
					upload_date:  moment.tz(new Date(
						dateParams[7],
						dateParams[8] - 1,
						dateParams[9],
						dateParams[10],
						dateParams[11],
						dateParams[12]
					), 'Asia/Tokyo'),
					tags:         $item.find('._thumbnail').data('tags'),
					//evaluate_cnt: parseInt(row[15]),
					//evaluate_sum: parseInt(row[16]),
					//view_cnt:     parseInt(row[17]),
					caption:      'Caption unavailable',
					//page_cnt:     parseInt(row[19]),
					//r18:          Boolean(row[26] === '1'),
				};
			} else {
				var info = {
					illust_id:    parseInt($item.find('.title').attr('href').match(/id=(\d+)/)[1]),
					user_id:      parseInt($item.find('.user').data('user_id')),
					//extension:    row[2],
					title:        $item.find('.title').text(),
					user_name:    $item.find('.user').data('user_name'),
					illust_url:   $item.find('._thumbnail').attr('src'),
					upload_date:  moment.tz(new Date(), 'Asia/Tokyo'),
					tags:         '',
					//evaluate_cnt: parseInt(row[15]),
					//evaluate_sum: parseInt(row[16]),
					//view_cnt:     parseInt(row[17]),
					caption:      $item.find('.main > p').text(),
					//page_cnt:     parseInt(row[19]),
					//r18:          Boolean(row[26] === '1'),
				};

				$item.find('.tags > li > a:nth-child(2)').each(function () {
					info.tags += $(this).text() + ' ';
				});
			}

			var illustUrl = 'http://www.pixiv.net/member_illust.php?';
			var memberUrl = 'http://www.pixiv.net/member.php?';
			var novelUrl = 'http://www.pixiv.net/novel/show.php?';

			var user_url = memberUrl + querystring.stringify({id: info.user_id});

			var url, content, category;

			if (mode === 'illust') {
				url = illustUrl + querystring.stringify({mode: 'medium', illust_id: info.illust_id});
				var big_url;
				if ($item.find('.work').hasClass('manga')) {
					big_url = illustUrl + querystring.stringify({mode: 'manga', illust_id: info.illust_id});
				} else {
					big_url = illustUrl + querystring.stringify({mode: 'big', illust_id: info.illust_id});
				}

				category = $item.find('.work').hasClass('manga') ? 'manga' : 'illust';

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

			if (info.upload_date.toDate() > updated.toDate()) {
				updated = info.upload_date;
			}
		});

		feed.feed.updated = updated.toISOString();

		return done(null, builder.buildObject(feed));
	}

	var rows;

	async.waterfall([
		// Initialize PhantomJS
		function (done) {
			phantom.create('--cookies-file=cookies.txt', function (ph) {
				done(null, ph);
			});
		},
		// Create PhantomJS page object
		function (ph, done) {
			ph.createPage(function (gotPage) {
				page = gotPage;
				done(null);
			});
		},
		// Get data from pixiv
		function (done) {
			var data = 0, i = 0;
			async.doUntil(function (done) {
				fetchData(function (error, _data) {
					console.log(arguments);
					if (error) return done(error);
					else {
						if (!data) {
							login(done);
						} else {
							data = _data;
							return done();
						}
					}
				});
			}, function () { i++; return data !== null || i > 3; }, function (error) {
				return done(error, data);
			});
		},
		// build atom data
		function (data, done) {
			buildAtom(data, function (error, atom) {
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

module.exports = qiita;
