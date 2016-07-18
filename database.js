var PG = require('pg');
var GEOJSON2WKT = require('geojson2wkt');
//var GEOJSON2WKT = require('./node_modules/geojson2wkt/Geojson2Wkt.js');
var SQL = require('squel');

DATABASE = (function() {
	/**
	 * 
	 */
	var the_singleton;

	/**
	 * 
	 */
	var config;

	var REQUEST_TYPE = {
		CELL: 0,
		DATE: 1,
		TIME: 2,
		DIFF: 3
	}

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
				else {
			//	console.log("got attributes");
				    getQuantiles(connection, result, callback);
				   
				}

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

			if (attributeName == 'DateOfLatestEdit') {
				pending--;
				results[attributeName] = {'title': row.title, 'description': row.description, 'table' : table, 'quantiles': [
					"'2014-12-14'"
				]}
			} else {
		//	    console.log("get qunatiles"+ table);
				connection.query(
//					'SELECT quantile(CAST(round(CAST(value AS numeric), 3) AS double precision), ARRAY[0.1]) FROM ' + table,
					'SELECT quantile(CAST(round(CAST(value AS numeric), 3) AS double precision), ARRAY[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) FROM ' + table,

					function(error, result) {
						if (error) throw new Error('Error querying quantile: ' + error);
						else {
							results[attributeName] = {'title': row.title, 'description': row.description, 'table' : table, 'quantiles': result.rows[0].quantile};
							pending--;
							if (pending === 0) {
								connection.end();
							    console.log("got quantiles")
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
	var getMapnikDatasourceConfig = function(table, bbox, type, timestamp) {
	    console.log("getMapnikDatasourceConfig");
		var query;
		switch (type) {
			case REQUEST_TYPE.CELL:
				query = "(SELECT geom from cells) as cells";
//				query = "SELECT geom from cells as cells";

		    console.log("select_0: " + query.toString());
				break;
			case REQUEST_TYPE.DIFF:
				query = [
					"(SELECT '#' || CAST(cells.id AS text) as cell_id, cells.geom, starttable.value AS startVal, endtable.value AS endVal, ",
					"(coalesce((CASE endtable.value WHEN 0 THEN 0.001 ELSE endtable.value END), 0.001)/coalesce((CASE starttable.value WHEN 0 THEN 0.001 ELSE starttable.value END), 0.001)) as value, ",
					"CAST(round(CAST(((coalesce((CASE endtable.value WHEN 0 THEN 0.001 ELSE endtable.value END), 0.001)/coalesce((CASE starttable.value WHEN 0 THEN 0.001 ELSE starttable.value END), 0.001)) * 100 - 100) AS numeric), 1) AS text) || '%' AS label FROM cells ",
					"LEFT JOIN (SELECT cell_id, value FROM " + table + " WHERE valid <= " + timestamp.start + " AND (expired IS NULL OR expired > " + timestamp.start + ")) as starttable ON (cells.id = starttable.cell_id)", 
					"LEFT JOIN (SELECT cell_id, value FROM " + table + " WHERE valid <= " + timestamp.end + " AND (expired IS NULL OR expired > " + timestamp.end + ")) as endtable ON (cells.id = endtable.cell_id) ",
					"WHERE ",
					"(ST_Intersects(cells.geom, ST_geomfromtext(\'POLYGON((" + bbox[0] + " " + bbox[1] + "," + bbox[0] + " " + bbox[3] + "," + bbox[2] + " " + bbox[3] + "," + bbox[2] + " " + bbox[1] + "," + bbox[0] + " " + bbox[1] + "))\', 900913))) AND ",
					"starttable.value IS NOT NULL OR endtable.value IS NOT NULL) as awesometable"
				].join('');
		    console.log("select_1: " + query.toString());
		    console.log("timestamp_start: "+ timestamp.start + " timestamp_end: "+timestamp.end)
				break;
			default:
				var valueRequest = table + ".value AS value, ";
				var labelRequest = "CAST(round(CAST(" + table + ".value AS numeric), 3) AS text) AS label, "
				if (type === REQUEST_TYPE.DATE) {
					valueRequest = "to_char(to_timestamp(" + table + ".value / 1000), 'YYYY-MM-DD') AS value, ";
					labelRequest = "to_char(to_timestamp(" + table + ".value / 1000), 'YYYY-MM-DD') AS label, "
				}

				query = [
					"(SELECT ",
		  			table + ".id, ", 
					"	'#' || CAST(" + table + ".cell_id AS text) AS cell_id, ",
		  			valueRequest,
		  			labelRequest, 
		  			" 	cells.geom ",
		  			"FROM cells",
					" LEFT JOIN " + table + " ON (cells.id = " + table + ".cell_id) ",
					"WHERE ",
					"(ST_Intersects(cells.geom, ST_geomfromtext(\'POLYGON((" + bbox[0] + " " + bbox[1] + "," + bbox[0] + " " + bbox[3] + "," + bbox[2] + " " + bbox[3] + "," + bbox[2] + " " + bbox[1] + "," + bbox[0] + " " + bbox[1] + "))\', 900913))) AND ",
					"(" + table + ".valid <= " + timestamp + " AND ((" + table + ".expired > " + timestamp + ") OR (" + table + ".expired IS NULL)))) as awesometable"
				].join('');
		    console.log("select_2: " + query.toString());
		}

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
			"SELECT id, to_char(time, 'YYYY-MM-DD') AS timestamp FROM times", //mca 
			function (error, result) {
				connection.end();
				if (error) callback({error: error}, request);
				else callback(result, request);
		});
	}

	var getCapabilities = function(callback, request) {
		var connection = connect(),
			pending = 2,
			timeStampSql,
			attributeSql,
			requestResult = {};

		attributeSql = SQL.select()
						.from('attribute_types')
						.field('id')
						.field('attribute', 'name')
						.field('description')
						.field('title')
						.field('validfrom')
						.where('id NOT IN (19)')
						.order('title');

		timeStampSql = SQL.select()
						.from('times')
						.field('id')
						//.field('date(time)', 'timestamp');
						.field("to_char(time, 'YYYY-MM-DD')", 'timestamp');
	    console.log(attributeSql.toString());
		connection.query(attributeSql.toString(), function(error, result) {
			pending--;
			if (error) requestResult.error = "1";//result.error + attributeSql.toString();
			else requestResult.attributes = result.rows;
			
			if (pending === 0) {
				connection.end();
				callback(requestResult, request);
			};
		});
	  
		connection.query(timeStampSql.toString(), function(error, result) {
			pending--;

			if (error) requestResult.error = "2"; //result.error+ timeStampSql.toString();
			else requestResult.timestamps = result.rows;
			
			
			if (pending === 0) {
				connection.end();
				callback(requestResult, request);
			};
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
			filters.push('(ST_Intersects(ST_Buffer(ST_Transform(ST_geomfromtext(\'POINT(' + params.lon + ' ' + params.lat + ')\', 4326), 900913), 4000), cells.geom))');
			filters.push('((ST_Within(ST_Transform(ST_geomfromtext(\'POINT(' + params.lon + ' ' + params.lat + ')\', 4326), 900913), cells.geom)) OR (ST_DWithin((SELECT cells.geom from cells WHERE ST_Within(ST_Transform(ST_geomfromtext(\'POINT(' + params.lon + ' ' + params.lat + ')\', 4326), 900913), cells.geom)), cells.geom, 1)))');
		}
								
		if (params.bbox) {
			var bbox = params.bbox.split(',');
			filters.push('(ST_Within(cells.geom, ST_Transform(ST_geomfromtext(\'POLYGON((' + bbox[0] + ' ' + bbox[1] + ',' + bbox[0] + ' ' + bbox[3] + ',' + bbox[2] + ' ' + bbox[3] + ',' + bbox[2] + ' ' + bbox[1] + ',' + bbox[0] + ' ' + bbox[1] + '))\', 4326), 900913)))');			
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
		var filter, geomReq = "ST_AsGeoJSON(cells.geom)";
		if (queryParams) filter = getFilters(table, queryParams);
console.log(queryParams);
		if (queryParams && queryParams.proj) geomReq = "ST_AsGeoJSON(ST_Transform(cells.geom, " + queryParams.proj + "))";

		var attrQueryString = "SELECT " + table + ".id, " + table + ".cell_id, CAST(round(CAST(value AS numeric), 3) AS double precision) AS value, " + geomReq + " AS geometry, to_char(timesV.time, 'YYYY-MM-DD') AS timeValid, to_char(timesE.time, 'YYYY-MM-DD') AS timeExpired FROM " + table + " LEFT JOIN cells ON (" + table + ".cell_id = cells.id) LEFT JOIN times AS timesV ON (" + table + ".valid = timesV.id) LEFT JOIN times AS timesE ON (" + table + ".expired = timesE.id) " + (filter ? filter : "") + "ORDER BY cell_id, timevalid";

console.log(attrQueryString); //mca

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
		var geomReq = (cut ? 'ST_AsGeoJSON(ST_Intersection(cells.geom, ST_Transform(ST_geomfromtext(\'' + GEOJSON2WKT.convert(geometry) + '\', 4326), 900913)))' : 'ST_AsGeoJSON(cells.geom)');

		var attrQueryString = "SELECT " + table + ".id, " + table + ".cell_id, CAST(round(CAST(value AS numeric), 3) AS double precision) AS value, " + geomReq + " AS geometry, to_char(timesV.time, 'YYYY-MM-DD') AS timeValid, to_char(timesE.time, 'YYYY-MM-DD') AS timeExpired FROM " + table + " LEFT JOIN cells ON (" + table + ".cell_id = cells.id) LEFT JOIN times AS timesV ON (" + table + ".valid = timesV.id) LEFT JOIN times  AS timesE ON (" + table + ".expired = timesE.id) WHERE (ST_Intersects(cells.geom, ST_Transform(ST_geomfromtext('" + GEOJSON2WKT.convert(geometry) + "', 4326), 900913))) ORDER BY cell_id, timevalid";

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

	database.prototype.REQUEST_TYPE = REQUEST_TYPE;
	database.prototype.getCapabilities = getCapabilities;
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