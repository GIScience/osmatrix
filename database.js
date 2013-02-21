var PG = require('pg');
var GEOJSON2WKT = require('../Geojson2Wkt/Geojson2Wkt');

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

	/**
	 * [getTimeStamps description]
	 * @param  {Function} callback [description]
	 * @param  {[type]}   request  [description]
	 */
	var getTimestamps = function(callback, request) {
		var connection = connect();
		connection.query(
			'SELECT id, date(time) AS timestamp FROM times', 
			function (error, result) {
				connection.end();
				if (error) callback({error: error}, request);
				else callback(result, request);
		});
	}

	/**
	 * [getFilters description]
	 * @param  {[type]} params [description]
	 * @return {[type]}        [description]
	 */
	var getFilters = function(table, params) {
		var filters = [];

		if (params.cells) {
			filters.push('(' + table + '.cell_id IN (' + params.cells + '))');
		}
				
		if (params.lat && params.lon) {
			filters.push('(ST_Intersects(ST_Buffer(ST_Transform(geomfromtext(\'POINT(' + params.lon + ' ' + params.lat + ')\', 4326), 900913), 4000), geom))');
			filters.push('((ST_Within(ST_Transform(geomfromtext(\'POINT(' + params.lon + ' ' + params.lat + ')\', 4326), 900913), geom)) OR (ST_DWithin((SELECT geom from cells WHERE ST_Within(ST_Transform(geomfromtext(\'POINT(' + params.lon + ' ' + params.lat + ')\', 4326), 900913), geom)), geom, 1)))');
		}
								
		if (params.bbox) {
			var bbox = params.bbox.split(',');
			filters.push('(ST_Within(cells.geom, ST_Transform(geomfromtext(\'POLYGON((' + bbox[0] + ' ' + bbox[1] + ',' + bbox[0] + ' ' + bbox[3] + ',' + bbox[2] + ' ' + bbox[3] + ',' + bbox[2] + ' ' + bbox[1] + ',' + bbox[0] + ' ' + bbox[1] + '))\', 4326), 900913)))');			
		}
		
		if (params.timestamps) {
			var timestamps = params.timestamps.split(',');
			var timeFilter = [];
			for (var i = 0; i < timestamps.length; i++) {
				timeFilter.push('(timesV.time <= to_timestamp(\'' + timestamps[i] + '\', \'YYYY-MM-DD\') AND ((timesE.time > to_timestamp(\'' + timestamps[i] + '\', \'YYYY-MM-DD\')) OR (timesE.time IS NULL)))');
			}
			filters.push(timeFilter.join(' OR '));
		}

		return (filters.length > 0) ? ' WHERE ' + filters.join(' AND ') : '';
	}

	/**
	 * [getAttributeValues description]
	 * @param  {[type]}   table       [description]
	 * @param  {[type]}   queryParams [description]
	 * @param  {Function} callback    [description]
	 * @param  {[type]}   request     [description]
	 */
	var getAttributeValues = function(table, queryParams, callback, request) {
		var filter;
		if (queryParams) filter = getFilters(table, queryParams);

		var attrQueryString = "SELECT " + table + ".id, " + table + ".cell_id, CAST(round(CAST(value AS numeric), 3) AS double precision) AS value, ST_AsGeoJSON(cells.geom) AS geometry, to_char(timesV.time, 'YYYY-MM-DD') AS timeValid, to_char(timesE.time, 'YYYY-MM-DD') AS timeExpired FROM " + table + " LEFT JOIN cells ON (" + table + ".cell_id = cells.id) LEFT JOIN times AS timesV ON (" + table + ".valid = timesV.id) LEFT JOIN times  AS timesE ON (" + table + ".expired = timesE.id) " + (filter ? filter : "") + "ORDER BY cell_id, timevalid";

		var connection = connect();
		connection.query(
			attrQueryString,
			function (error, result) {
				connection.end();
				if (error) callback({error: error}, request);
				else callback(result, request);
			}
		);
	}

	/**
	 * [getIntersection description]
	 * @param  {[type]}   table    [description]
	 * @param  {[type]}   geometry [description]
	 * @param  {[type]}   cut      [description]
	 * @param  {Function} callback [description]
	 * @param  {[type]}   request  [description]
	 */
	var getIntersection = function(table, geometry, cut, callback, request) {
		var geomReq = (cut ? 'ST_AsGeoJSON(ST_Intersection(cells.geom, ST_Transform(geomfromtext(\'' + GEOJSON2WKT.convert(geometry) + '\', 4326), 900913)))' : 'ST_AsGeoJSON(cells.geom)');

		var attrQueryString = "SELECT " + table + ".id, " + table + ".cell_id, CAST(round(CAST(value AS numeric), 3) AS double precision) AS value, " + geomReq + " AS geometry, to_char(timesV.time, 'YYYY-MM-DD') AS timeValid, to_char(timesE.time, 'YYYY-MM-DD') AS timeExpired FROM " + table + " LEFT JOIN cells ON (" + table + ".cell_id = cells.id) LEFT JOIN times AS timesV ON (" + table + ".valid = timesV.id) LEFT JOIN times  AS timesE ON (" + table + ".expired = timesE.id) WHERE (ST_Intersects(cells.geom, ST_Transform(geomfromtext('" + GEOJSON2WKT.convert(geometry) + "', 4326), 900913))) ORDER BY cell_id, timevalid";

		var connection = connect();
		connection.query(
			attrQueryString,
			function (error, result) {
				connection.end();
				if (error) callback({error: error}, request);
				else callback(result, request);
			}
		);
	}

	database.prototype.getAttributeInfo = getAttributeInfo;
	database.prototype.getMapnikDatasourceConfig = getMapnikDatasourceConfig;
	database.prototype.getAttributes = getAttributes;
	database.prototype.getTimestamps = getTimestamps;
	database.prototype.getAttributeValues = getAttributeValues;
	database.prototype.getIntersection = getIntersection;

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