// FIXME: Ignore all cert errors
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const qs = require('querystring');
const moment = require('moment-timezone');
const cheerio = require('cheerio');
const async = require('async');
const html = require('html-template-tag');
const nodemw = require('nodemw');
const Promise = require('bluebird');

const wiki = new nodemw({
	protocol: 'https',
	server: 'wiki.eeic.jp',
	path: '',
	debug: true,
});

Promise.promisifyAll(wiki);

const config = require('../config.js');

const Feed = require('./feed.js')

let isLoggedIn = false;

const genUserLink = (name) => `https://wiki.eeic.jp/index.php/${encodeURIComponent(`利用者:${name}`)}`;
const genItemLink = (name) => `https://wiki.eeic.jp/index.php/${encodeURIComponent(name)}`;

class EeicWikiFeed extends Feed {
	constructor() {
		super()
		this.name = 'eeicwiki'
	}

	checkLogin() {
		return isLoggedIn;
	}

	login(done) {
		console.log('eeicwiki: Logging in...');

		wiki.logInAsync(config.eeicwiki.user, config.eeicwiki.pass).then(() => {
			isLoggedIn = true;
			done();
		});
	}

	fetchData(done) {
		console.log('eeicwiki: Feching data...');

		wiki.getRecentChangesAsync(false, (error, data) => {
			done(null, data);
		});
	}

	extractInfo(done) {
		let updated = 0;

		const entries = [];

		this.data.map((item) => {
			let content, title;

			if (item.type === 'new') {
				content = html`
					<p>
						<a href="${genUserLink(item.user)}">${item.user}</a>
						が
						<a href="${genItemLink(item.title)}">“${item.title}”</a>
						を作成しました
					</p>
					<p>
						[NEW] → ${item.newlen} bytes (+${item.newlen})
					</p>
				`;
				title = `${item.user} が “${item.title}” を作成しました`;
			} else if (item.type === 'edit') {
				content = html`
					<p>
						<a href="${genUserLink(item.user)}">${item.user}</a>
						が
						<a href="${genItemLink(item.title)}">“${item.title}”</a>
						を編集しました
					</p>
					<p>
						${item.oldlen} bytes → ${item.newlen} bytes (${item.newlen > item.oldlen ? '+' : ''}${item.newlen - item.oldlen})
					</p>
				`;
				title = `${item.user} が “${item.title}” を編集しました`;
			} else {
				content = 'Unknown action';
				title = `Unknown action: ${item.title}`;
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
						href: genItemLink(item.title),
						rel: 'alternate',
					},
				},
				id: item.timestamp,
				content: {
					$: {
						type: 'html',
					},
					_: content,
				},
				category: {
					$: {
						term: item.type,
					},
				},
				author: {
					name: item.user,
					uri: genUserLink(item.user),
				},
				published: item.timestamp,
				updated: item.timestamp,
			};

			entries.push(entry);

			if (Date.parse(item.timestamp) > updated) {
				updated = Date.parse(item.timestamp);
			}
		});

		return done(null, {
			title: 'EeicWiki Feed',
			alternateLink: 'https://wiki.eeic.jp/index.php/%E7%89%B9%E5%88%A5:%E6%9C%80%E8%BF%91%E3%81%AE%E6%9B%B4%E6%96%B0',
			selfLink: 'https://feed.hakatashi.com/eeicwiki.atom',
			entries: entries,
			updated: new Date(updated).toISOString(),
		});
	}
}

module.exports = (req, res, done) => {
	const feed = new EeicWikiFeed();

	if (req.query.token !== config.eeicwiki.token) {
		return res.status(403).end('403 Forbidden');
	}

	feed.proceed(req, res, done);
};
