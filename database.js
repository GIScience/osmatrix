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

	/**
	 * [getMapnikDatasourceConfig description]
	 * @return {[type]} [description]
	 */
	var getMapnikDatasourceConfig = function(table, bbox, timestamp, isDate) {
		var valueRequest = table + ".value AS value, ";
		var labelRequest = "CAST(round(CAST(" + table + ".value AS numeric), 3) AS text) AS label, "
		if (isDate) {
			valueRequest = "	to_char(to_timestamp(" + table + ".value / 1000), 'YYYY-MM-DD') AS value, ";
			labelRequest = "	to_char(to_timestamp(" + table + ".value / 1000), 'YYYY-MM-DD') AS label, "
		} 

		var query = [
			"(SELECT ",
  			table + ".id, ", 
			"	'#' || CAST(" + table + ".cell_id AS text) AS cell_id, ",
  			valueRequest,
  			labelRequest, 
  			" 	geom ",
  			"FROM " + table,
			" LEFT JOIN cells ON (" + table + ".cell_id = cells.id) ",
			"WHERE ",
			"(ST_Intersects(geom, geomfromtext(\'POLYGON((" + bbox[0] + " " + bbox[1] + "," + bbox[0] + " " + bbox[3] + "," + bbox[2] + " " + bbox[3] + "," + bbox[2] + " " + bbox[1] + "," + bbox[0] + " " + bbox[1] + "))\', 900913))) AND ",
			"(" + table + ".valid <= " + timestamp + " AND ((" + table + ".expired > " + timestamp + ") OR (" + table + ".expired IS NULL)))) as awesometable"
		].join('');

		return {
			'host': config.host,
			'dbname' : config.name,
  			'user' : config.user,
			'password': config.pass,
  			'type' : 'postgis',
 			'geometry_field': 'geom',
 			'table': query,
 			'extent' : bbox.join(',')
		};
	}

	/**
	 * [getAttributes description]
	 * @param  {Function} callback [description]
	 * @param  {[type]}   request  [description]
	 */
	var getAttributes = function(callback, request) {
		var connection = connect();
		connection.query(
			'SELECT id, attribute AS name, description, title FROM attribute_types WHERE id NOT IN (19) ORDER BY title', 
			function (error, result) {
				connection.end();
				if (error) callback({error: error}, request);
				else callback(result, request);
		});
	}

	database.prototype.getAttributeInfo = getAttributeInfo;
	database.prototype.getMapnikDatasourceConfig = getMapnikDatasourceConfig;
	database.prototype.getAttributes = getAttributes;

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