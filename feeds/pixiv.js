const xml2js = require('xml2js');
const request = require('request');
const moment = require('moment-timezone');
const cheerio = require('cheerio');
const config = require('../config.js');

const Feed = require('./feed.js')

const builder = new xml2js.Builder({
	explicitArray: false,
});

class PixivFeed extends Feed {
	constructor(mode, jar) {
		super(jar)
		this.mode = mode;
		this.name = 'pixiv'
	}

	checkLogin() {
		// Check if already logged in
		const PHPSESSID =
			this.jar.getCookies('http://www.pixiv.net/')
			.find(cookie => cookie.key === 'PHPSESSID');

		return PHPSESSID !== undefined;
	}

	login() {
		console.log('pixiv: Logging in...');
		request({
			method: 'POST',
			url: 'https://www.pixiv.net/login.php',
			form: {
				mode: 'login',
				pixiv_id: config.pixiv.user,
				pass: config.pixiv.pass,
				skip: 1
			},
			jar: this.jar,
		}, (error, response, body) => {
			if (error) {
				return done(error);
			}

			if (response.statusCode !== 200) {
				return done(new Error(`Status code ${response.statusCode} from login.php`));
			}

			return done();
		});
	}

	fetchData(done) {
		console.log('pixiv: Feching data...');
		request({
			method: 'GET',
			url: this.mode === 'illust'
			     ? 'http://www.pixiv.net/bookmark_new_illust.php'
			     : 'http://www.pixiv.net/novel/bookmark_new.php',
			followRedirect: false,
			jar: this.jar,
		}, (error, response, body) => {
			if (error) return done(error);
			if (response.statusCode !== 200) return done(new Error('Status not OK'));
			if (body.length === 0) return done(new Error('zero-length content'));

			done(null, body);
		});
	}

	buildAtom(done) {
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
					_: this.mode === 'illust'
					   ? 'Recent Illusts from Pixiv Followers'
					   : 'Recent Novels from Pixiv Followers',
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
							href: this.mode === 'illust'
							      ? 'http://www.pixiv.net/bookmark_new_illust.php'
							      : 'http://www.pixiv.net/novel/bookmark_new.php',
							type: 'text/html',
						},
					},
					{
						$: {
							rel: 'self',
							href: this.mode === 'illust'
							      ? 'http://feed.hakatashi.com/pixiv.atom'
							      : 'http://feed.hakatashi.com/pixiv-novels.atom',
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
				id: this.mode === 'illust'
				    ? 'http://feed.hakatashi.com/pixiv.atom'
				    : 'http://feed.hakatashi.com/pixiv-novels.atom',
				entry: []
			}
		};

		let updated = moment(0);

		// load HTML into DOM
		const $ = cheerio.load(this.data);
		let $items;
		if (this.mode === 'illust') $items = $('.image-item');
		else $items = $('.novel-items').children('li');

		$items.each((index, item) => {
			const $item = $(item);

			if (this.mode === 'illust') {
				const dateParams = $item.find('._thumbnail').attr('src').split('/').map(param => parseInt(param, 10));

				if (dateParams.length === 12) dateParams.unshift(NaN, NaN);

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
					illust_id:    parseInt($item.find('.title').children('a').attr('href').match(/id=(\d+)/)[1]),
					user_id:      parseInt($item.find('.author').children('a').data('user_id')),
					//extension:    row[2],
					title:        $item.find('.title').children('a').text(),
					user_name:    $item.find('.author').children('a').data('user_name'),
					illust_url:   $item.find('.cover').attr('src'),
					upload_date:  moment.tz(new Date(), 'Asia/Tokyo'),
					tags:         $item.find('.tags > li > a:nth-child(2)').map(function(){return $(this).text()}).toArray().join(' '),
					//evaluate_cnt: parseInt(row[15]),
					//evaluate_sum: parseInt(row[16]),
					//view_cnt:     parseInt(row[17]),
					caption:      $item.find('.novel-caption').text(),
					//page_cnt:     parseInt(row[19]),
					//r18:          Boolean(row[26] === '1'),
				};
			}

			const user_url = `http://www.pixiv.net/whitecube/user/${info.user_id}`;

			let url, content, category;

			if (this.mode === 'illust') {
				url = `http://www.pixiv.net/whitecube/illust/${info.illust_id}`;

				category = $item.find('.work').hasClass('manga') ? 'manga' : 'illust';

				content =
					`<p>${info.caption}</p><p>タグ: ${info.tags}</p><p><a href="${url}"><img src="${info.illust_url}" /></a></p>`;
			} else {
				url = `http://www.pixiv.net/whitecube/novel/${info.illust_id}`;

				category = 'novel';

				content =
					`<p>${info.caption}</p><p>タグ: ${info.tags}</p>`;
			}

			const entry = {
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
}

module.exports = {
	illust: (req, res, done, jar) => {
		const feed = new PixivFeed('illust', jar);
		feed.proceed(req, res, done);
	},
	novel: (req, res, done, jar) => {
		const feed = new PixivFeed('novel', jar);
		feed.proceed(req, res, done);
	},
};
