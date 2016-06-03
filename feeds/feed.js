const async = require('async');

class Feed {
	constructor(jar) {
		this.jar = jar;
		this.data = null;
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
				this.buildAtom((error, atom) => {
					if (error) return done(error);

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
