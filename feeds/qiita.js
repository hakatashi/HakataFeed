const moment = require('moment-timezone');
const cheerio = require('cheerio');
const async = require('async');
const html = require('html-template-tag');

const config = require('../config.js');

const Feed = require('./feed.js')

class QiitaFeed extends Feed {
	constructor() {
		super()
		this.name = 'qiita'
	}

	checkLogin() {
		const session =
			this.jar.getCookies('http://qiita.com/')
			.find(cookie => cookie.key === '_qiita_login_session');

		return session !== undefined;
	}

	login(done) {
		console.log('qiita: Logging in...');

		async.waterfall([
			(done) => {
				this.request('https://qiita.com/login', done);
			},
			(response, body, done) => {
				const $ = cheerio.load(body);
				const token = $('meta[name="csrf-token"]').attr('content');

				this.request({
					method: 'POST',
					url: 'https://qiita.com/login',
					form: {
						authenticity_token: token,
						identity: config.qiita.user,
						password: config.qiita.pass,
					},
				}, (error, response, body) => {
					if (error) {
						return done(error);
					}

					if (response.statusCode !== 200 && response.statusCode !== 302) {
						return done(new Error(`Status code ${response.statusCode} from login`));
					}

					return done();
				});
			},
		], done)
	}

	fetchData(done) {
		console.log('qiita: Feching data...');
		this.request({
			method: 'GET',
			url: 'http://qiita.com/api/tracks',
			followRedirect: false,
			json: true,
		}, (error, response, data) => {
			if (error) return done(error);
			if (response.statusCode !== 200) return done(new Error('Status not OK'));
			if (!data) return done(new Error('Empty data'));

			done(null, data);
		});
	}

	extractInfo(done) {
		let updated = 0;

		const entries = [];

		this.data.map((item) => {
			let content, title;

			if (item.trackable_type === 'StockItem') {
				content = html`
					<p>
						<a href="${item.followable_url}">
							${item.followable_name}
						</a>
						stocked item
						<a href="${item.mentioned_object_url}">
							“${item.mentioned_object_name}”
						</a>
						(${item.mentioned_object_stocks_count} stocks).
					</p>
					<p>
						Tags:
						${item.mentioned_object_tags.map(tag => html`
							<a href="http://qiita.com/tags/${tag.url_name}">
								${tag.name}
							</a>
						`)}
					</p>
				`;
				title = `${item.followable_name} stocked item ${item.mentioned_object_name}`;
			} else if (item.trackable_type === 'Comment') {
				content = html`
					<p>
						<a href="${item.followable_url}">
							${item.followable_name}
						</a>
						commented on item
						<a href="${item.mentioned_object_url}">
							“${item.mentioned_object_name}”
						</a>
						(${item.mentioned_object_stocks_count} stocks).
					</p>
				`;
				title = `${item.followable_name} commented on item ${item.mentioned_object_name}`;
			} else if (item.trackable_type === 'TagFollowlist') {
				content = html`
					<p>
						<a href="${item.followable_url}">
							${item.followable_name}
						</a>
						started following tag
						<a href="${item.mentioned_object_url}">
							“${item.mentioned_object_name}”
						</a>.
					</p>
				`;
				title = `${item.followable_name} started following tag ${item.mentioned_object_name}`;
			} else if (item.trackable_type === 'FollowingUser') {
				content = html`
					<p>
						<a href="${item.followable_url}">
							${item.followable_name}
						</a>
						followed
						<a href="${item.mentioned_object_url}">
							${item.mentioned_object_name}
						</a>.
					</p>
				`;
				title = `${item.followable_name} followed ${item.mentioned_object_name}`;
			} else {
				content = 'Unknown type';
				title = 'Unknown type';
			}

			const entry = {
				title: {
					$: {
						type: 'text'
					},
					_: title,
				},
				link: {
					$: {
						href: item.mentioned_object_url,
						rel: 'alternate',
					},
				},
				id: item.created_at_in_unixtime + '-' + item.mentioned_object_url,
				content: {
					$: {
						type: 'html',
					},
					_: content,
				},
				category: {
					$: {
						term: item.trackable_type,
					},
				},
				author: {
					name: item.followable_name,
					uri: item.followable_url,
				},
				icon: item.mentioned_object_image_url,
				published: new Date(item.created_at_in_unixtime * 1000).toISOString(),
				updated: new Date(item.created_at_in_unixtime * 1000).toISOString(),
			};

			entries.push(entry);

			if (item.created_at_in_unixtime > updated) {
				updated = item.created_at_in_unixtime;
			}
		});

		return done(null, {
			title: 'Qiita Feed',
			alternateLink: 'http://qiita.com/',
			selfLink: 'http://feed.hakatashi.com/qiita.atom',
			entries: entries,
			updated: new Date(updated * 1000).toISOString(),
		});
	}
}

module.exports = (req, res, done) => {
	const feed = new QiitaFeed();
	feed.proceed(req, res, done);
};
