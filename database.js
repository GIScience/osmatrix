var PG = require('pg');

DATABASE = (function() {
	/**
	 * 
	 */
	var the_singleton;

	/**
	 * 
	 */
	var config;

	/**
	 * [database description]
	 * @param  {[type]} config [description]
	 */
	var database = function(c) {
		config = c;
	}

	/**
	 * [connect description]
	 */
	var connect = function() {
		var client = new PG.Client("postgres://" + config.user + ":" + config.pass + "@" + config.host + ":5432/" + config.name);
		client.connect();
		
		return client;
	}

	/**
	 * [getAttributeInfo description]
	 * @param  {Function} callback [description]
	 */
	var getAttributeInfo = function(callback) {
		var connection = connect();
		connection.query(
			'SELECT * FROM attribute_types;',
			function (error, result) {
				if (error) throw new Error('Error querying attribute types: ' + error);
				else getQuantiles(connection, result, callback);
			}
		);
	}

	/**
	 * [getQuantiles description]
	 * @param  {[type]}   attributes [description]
	 * @param  {Function} callback   [description]
	 */
	var getQuantiles = function(connection, attributes, callback) {
		var results = {};
		var pending = attributes.rows.length;

		attributes.rows.forEach(function(row) {
			var table = 'attribute_' + ((row.id < 10) ? '00' : '0') + row.id;
			var attributeName = row.attribute;

			if (attributeName == 'dateOfEldestEdit' || attributeName == 'DateOfLatestEdit') {
				pending--;
				results[attributeName] = {'table' : table, 'quantiles': [
					"'2008-01-01'", "'2008-07-01'","'2009-01-01'", "'2009-07-01'","'2010-01-01'", "'2010-07-01'", "'2011-01-01'", "'2011-07-01'", "'2012-01-01'"
				]}
			} else {
				connection.query(
					'SELECT quantile(CAST(round(CAST(value AS numeric), 3) AS double precision), ARRAY[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) FROM ' + table,
					function(error, result) {
						if (error) throw new Error('Error querying quantile: ' + error);
						else {
							results[attributeName] = {'table' : table, 'quantiles': result.rows[0].quantile};
							pending--;
							console.log(pending);
							if (pending === 0) {
								connection.end();
								callback(results);
							}
						}
					}
				);
			}
		});
	}

	database.prototype.getAttributeInfo = getAttributeInfo;

	/**
	 * [createDbConnector description]
	 * @param  {[type]} config [description]
	 * @return {[type]}        [description]
	 */
	var createDbConnector = function(config) {
		if (!the_singleton) the_singleton = new database(config);
		return the_singleton;
	}

	return createDbConnector;
}());

module.exports = DATABASE;