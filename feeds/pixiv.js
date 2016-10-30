const moment = require('moment-timezone');
const cheerio = require('cheerio');
const querystring = require('querystring');
const config = require('../config.js');

const Feed = require('./feed.js')

class PixivFeed extends Feed {
	constructor(mode) {
		super()
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

	login(done) {
		console.log('pixiv: Logging in...');
		this.request({
			method: 'POST',
			url: 'https://www.pixiv.net/login.php',
			form: {
				mode: 'login',
				pixiv_id: config.pixiv.user,
				pass: config.pixiv.pass,
				skip: 1
			},
		}, (error, response, body) => {
			if (error) {
				return done(error);
			}

			if (response.statusCode !== 200 && response.statusCode !== 302) {
				return done(new Error(`Status code ${response.statusCode} from login.php`));
			}

			return done();
		});
	}

	fetchData(done) {
		console.log('pixiv: Feching data...');
		this.request({
			method: 'GET',
			url: this.mode === 'illust'
			     ? `https://www.pixiv.net/rpc/whitecube/index.php?${
			           querystring.encode({
			               mode: 'latest_follow',
			               filter: 'all',
			               limit: 50,
			               adult_mode: 'include',
			               last_illust_id: 0,
			               last_novel_id: 0,
			               is_first_page: 1,
			           })
			       }`
			     : `https://www.pixiv.net/rpc/whitecube/index.php?${
			           querystring.encode({
			               mode: 'latest_follow',
			               filter: 'novels',
			               limit: 50,
			               adult_mode: 'include',
			               last_illust_id: 0,
			               last_novel_id: 0,
			               is_first_page: 1,
			           })
			       }`,
			followRedirect: false,
			json: true,
		}, (error, response, data) => {
			if (error) return done(error);
			if (response.statusCode !== 200) return done(new Error('Status not OK'));
			if (data.error !== false) return done(new Error('Status not OK'));
			if (!data.body || !data.body.html) return done(new Error('content not found'))
			if (data.body.html.length === 0) return done(new Error('zero-length content'));

			done(null, data.body.html);
		});
	}

	extractInfo(done) {
		let updated = moment(0);
		// load HTML into DOM
		const $ = cheerio.load(this.data);

		const {$items, title, alternateLink, selfLink} = (() => {
			if (this.mode === 'illust') {
				return {
					title: 'Recent Items from pixiv Followers',
					alternateLink: 'http://www.pixiv.net/whitecube/all/latest/follow',
					selfLink: 'http://feed.hakatashi.com/pixiv.atom',
				};
			} else {
				return {
					title: 'Recent Novels from pixiv Followers',
					alternateLink: 'http://www.pixiv.net/whitecube/all/latest/follow/novels',
					selfLink: 'http://feed.hakatashi.com/pixiv-novels.atom',
				};
			}
		})();

		const entries = [];

		$('.item-container').each((index, item) => {
			const $item = $(item);

			const dateParams = $item.find('.image > img').data('src').split('/').map(param => parseInt(param, 10));
			if (dateParams.length === 12) dateParams.unshift(NaN, NaN);

			const $caption = $item.find('.caption');

			var info = {
				illust_id:    parseInt($item.find('.title').data('work-id')),
				user_id:      parseInt($item.find('.user-view-popup').data('user_id')),
				//extension:    row[2],
				title:        $item.find('.title').text(),
				user_name:    $item.find('.user-name').text(),
				illust_url:   $item.find('.image > img').data('src').replace(/^.+?\/img/, 'http://i1.pixiv.net/c/480x960/img'),
				upload_date:  moment.tz(new Date(
					dateParams[7],
					dateParams[8] - 1,
					dateParams[9],
					dateParams[10],
					dateParams[11],
					dateParams[12]
				), 'Asia/Tokyo'),
				//tags:         $item.find('._thumbnail').data('tags'),
				//evaluate_cnt: parseInt(row[15]),
				//evaluate_sum: parseInt(row[16]),
				//view_cnt:     parseInt(row[17]),
				caption:      $caption.length > 0 ? $caption.text() : 'Caption Unavailable',
				//page_cnt:     parseInt(row[19]),
				//r18:          Boolean(row[26] === '1'),
				mode:         $item.find('.title').data('activity-work_type'),
			};

			const user_url = `http://www.pixiv.net/whitecube/user/${info.user_id}`;

			let url, content, category;

			if (info.mode === 'illust') {
				url = `http://www.pixiv.net/whitecube/illust/${info.illust_id}`;

				category = $item.find('.work').hasClass('manga') ? 'manga' : 'illust';

				content =
					`<p>${info.caption}</p><p><a href="${url}"><img src="${info.illust_url}" /></a></p>`;
			} else {
				url = `http://www.pixiv.net/whitecube/novel/${info.illust_id}`;

				category = 'novel';

				content =
					`<p>${info.caption}</p>`;
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

			entries.push(entry);

			if (info.upload_date.toDate() > updated.toDate()) {
				updated = info.upload_date;
			}
		});

		updated = updated.toISOString();

		return done(null, {title, alternateLink, selfLink, entries, updated});
	}
}

module.exports = {
	illust: (req, res, done) => {
		const feed = new PixivFeed('illust');
		feed.proceed(req, res, done);
	},
	novel: (req, res, done) => {
		const feed = new PixivFeed('novel');
		feed.proceed(req, res, done);
	},
};
