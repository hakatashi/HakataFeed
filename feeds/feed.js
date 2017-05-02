const request = require('request');
const async = require('async');
const xml2js = require('xml2js');

const jar = require('../cookiejar.js');

const builder = new xml2js.Builder({
	allowSurrogateChars: true,
	explicitArray: false,
});

class Feed {
	constructor() {
		this.jar = jar;
		this.data = null;
		this.request = request.defaults({
			jar,
			headers: {
				'User-Agent': 'HakataFeed (https://github.com/hakatashi/HakataFeed)',
			},
		});
	}

	login() {
		throw new Error('must be implemented');
	}

	checkLogin() {
		throw new Error('must be implemented');
	}

	fetchData() {
		throw new Error('must be implemented');
	}

	buildAtom() {
		throw new Error('must be implemented');
	}

	proceed(req, res, done) {
		async.series([
			// login
			done => {
				const isLoggedIn = this.checkLogin();
				if (!isLoggedIn) {
					this.login(done);
				} else {
					done();
				}
			},

			// Get data
			done => {
				this.fetchData((error, data) => {
					if (error) {
						// if error occured, try to login without checking login status
						this.login(error => {
							if (error) return done(error);

							this.fetchData((error, data) => {
								if (error) return done(error);

								this.data = data;
								done();
							});
						});
					} else {
						this.data = data;
						done();
					}
				});
			},

			// build atom data
			done => {
				this.extractInfo((error, info) => {
					if (error) return done(error);

					const {title, alternateLink, selfLink, entries, updated} = info;

					const feed = {
						feed: {
							$: {
								xmlns: 'http://www.w3.org/2005/Atom',
							},
							updated: updated,
							title: {
								$: {
									type: 'text',
								},
								_: title,
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
										href: alternateLink,
										type: 'text/html',
									},
								},
								{
									$: {
										rel: 'self',
										href: selfLink,
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
							id: selfLink,
							entry: entries,
						},
					};

					const atom = builder.buildObject(feed);

					res.status(200);
					res.set({
						'Content-Type': 'application/atom+xml; charset=utf-8',
					});
					res.end(atom);
				});
			}
		], done);
	}
}

module.exports = Feed;
