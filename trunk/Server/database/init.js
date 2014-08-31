var crypto = require('crypto');
var fs = require('fs');

// Current schema version
var CURRENT_VERSION = 2;

exports.init = function(pg, url, callback) {
	// connect to database the first time
	pg.connect(url, function(err, client, done){
		if(err) {
			callback(err);
			return;
		}
		
		// check if table 'dbinfo' exists
		client.query("SELECT EXISTS( SELECT 1 FROM information_schema.tables WHERE table_name = 'dbinfo' LIMIT 1) as check",
			function(err, result){
				done();
				
				if(err) {
					callback(err);
					return;
				}
				
				if(result.rows.length !== 1) {
					callback('dbinfo must have exactly one row');
					return;
				}
				
				var tableExists = result.rows[0].check;
				
				if(tableExists) { // if table exists ...
					checkVersion(pg, url, callback);
				} else {
					createTables(pg, url, callback);
				}
			}
		);
	});
};

function checkVersion(pg, url, callback) {
	pg.connect(url, function(err, client, done){
		if(err) {
			callback(err);
			return;
		}
		
		client.query('SELECT version, sessionsecret, cookiesecret FROM dbinfo', function(err, result) {
			done();
		
			if(err) {
				callback(err);
				return;
			}
			
			var version = result.rows[0].version;
			
			function successCallback() {
				callback(null, {
					cookieSecret : result.rows[0].cookiesecret,
					sessionSecret : result.rows[0].sessionsecret
				});
			}
			
			if(version === CURRENT_VERSION) {
				console.info('database schema is up to date');
				successCallback();
			} else {
				console.info('database schema must be upgraded from ' + version + ' to ' + CURRENT_VERSION);
				upgradeTables(version, pg, url, function(err) {
					if(err) {
						callback(err);
					} else {
						successCallback();
					}
				});
			}
		});
	});
}

function upgradeTables(version, pg, url, callback) {
	// read upgrade file and execute it
	fs.readFile('./database/upgrade/upgrade_' + version + '_' + CURRENT_VERSION + '.sql', 'utf-8', function(err, sql) {
		if(err) {
			callback(err);
			return;
		}
		
		// get client
		pg.connect(url, function(err, client, done) {
			if(err) {
				callback(err);
				return;
			}
			
			// execute upgrade script
			client.query(sql, function(err) {
				if(err) {
					done();
					callback(err);
					return;
				}
				
				// upgrade version info in dbinfo table
				client.query('UPDATE dbinfo SET version = $1', [CURRENT_VERSION], function(err) {
					done();
					callback(err);
				});
			});
		});
	});
}

function createTables(pg, url, callback) {
	pg.connect(url, function(err, client, done){
		if(err) {
			callback(err);
			return;
		}
		
		// Read the initial SQL script
		fs.readFile('./database/init.sql', 'utf-8', function(err, sql){
			if(err) {
				callback(err);
				return;
			}
		
			// Create all the tables
			client.query(sql, function(err, result){
				if(err) {
					done();
					callback(err);
					return;
				}
				
				console.info('created database schema');
				
				//Generate some secret keys used by cookieParser and session
				var cookieSecret = crypto.randomBytes(16).toString('hex');
				var sessionSecret = crypto.randomBytes(16).toString('hex');
				
				// insert current schema version into table dbinfo
				client.query('INSERT INTO dbinfo (version,cookiesecret,sessionsecret) VALUES ($1,$2,$3)',
					[CURRENT_VERSION, cookieSecret, sessionSecret], function(err, result) {
					
					done();
					
					if(err) {
						callback(err);
						return;
					}
					
					callback(null, {
						cookieSecret: cookieSecret,
						sessionSecret: sessionSecret
					});
				});
			});
		});
	});
}