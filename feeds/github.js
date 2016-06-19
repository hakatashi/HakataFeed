const async = require('async');
const html = require('html-template-tag');
const url = require('url');

const Feed = require('./feed.js')

class GitHubFeed extends Feed {
	constructor({endpoint}) {
		super();
		this.endpoint = endpoint;
		this.name = 'github';
	}

	checkLogin() {
		return true;
	}

	login(done) {
		console.log('github: Logging in...');
		// No need to log in. Immediately calls back.
		return done();
	}

	fetchData(done) {
		console.log('github: Feching data...');
		const apiURL = url.resolve('https://api.github.com/', this.endpoint);
		if (url.parse(apiURL).host !== 'api.github.com') {
			return done(new Error('URI malformed'));
		}

		this.request({
			method: 'GET',
			url: apiURL,
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
		let updated = new Date(0);

		const entries = [];

		this.data.map(commit => {
			const content = html`
				<p>
					<a href="${commit.author.html_url}">${commit.author.login}</a>
					committed
					<a href="${commit.html_url}">“${commit.commit.message}”</a>
				</p>
			`;

			const entry = {
				title: {
					$: {
						type: 'text'
					},
					_: commit.commit.message,
				},
				link: {
					$: {
						href: commit.html_url,
						rel: 'alternate',
					},
				},
				id: commit.commit.tree.sha,
				content: {
					$: {
						type: 'html',
					},
					_: content,
				},
				author: {
					name: commit.commit.author.name,
					uri: commit.author.html_url,
				},
				icon: commit.author.avatar_url,
				published: commit.commit.author.date,
				updated: commit.commit.author.date,
			};

			entries.push(entry);

			if (new Date(commit.commit.author.date) > updated) {
				updated = new Date(commit.commit.author.date);
			}
		});

		return done(null, {
			title: `GitHub Feed for ${this.endpoint}`,
			alternateLink: 'http://github.com/',
			selfLink: 'http://feed.hakatashi.com/github.atom',
			entries: entries,
			updated: updated.toISOString(),
		});
	}
}

module.exports = (req, res, done) => {
	if (req.query.endpoint === undefined) {
		res.status(400).end();
		return done();
	}

	const feed = new GitHubFeed({endpoint: req.query.endpoint});
	feed.proceed(req, res, done);
};
