var QUERYSTRING = require('querystring');
var GAUSS_STATS = require('gauss');

API = (function() {

	/**
	 *
	 * @type {Object}
	 */
	var DB_CONNECTOR;

	/**
	 *
	 * @type {Object}
	 */
	var ATTRIBUTES;

	/**
	 *
	 * @type {Object}
	 */
	var TIMESTAMPS;

	/**
	 * Constructor
	 */
	var api = function(dbConnector, attributes, timestamps) {
		DB_CONNECTOR = dbConnector;
		ATTRIBUTES = attributes;
		TIMESTAMPS = timestamps;
	};

	/* **********************************************************************************
	 * EVENT HANDLER
	 * *********************************************************************************/

	var sendCapabilitiesResponse = function(result, request) {
		request.res.header("Content-Type", "appplication/json");

		if (result.error) request.res.send(500, new Error('An error occured while getting capabilities from database.'));
		else request.res.send(JSON.stringify(result));

		return request.next();
	}

	/**
	 * [sendTimestampResponse description]
	 * @param  {[type]} result  [description]
	 * @param  {[type]} request [description]
	 */
	var sendTimestampResponse = function(result, request) {
		if (result.error) request.res.send(500, new Error('An error occured while getting timestamps from database.'));
		else request.res.send('{"timestamps": ' + JSON.stringify(result.rows) + '}');

		return request.next();
	}

	/**
	 * [sendAttributesResponse description]
	 * @param  {[type]} result  [description]
	 * @param  {[type]} request [description]
	 */
	var sendAttributesResponse = function(result, request) {
		request.res.header("Content-Type", "appplication/json");
		
		if (result.error) request.res.send(500, new Error('An error occured while getting attributes from database.'));
		else request.res.send('{"attributes": ' + JSON.stringify(result.rows) + '}');
		
		return request.next();
	}

	/**
	 * [sendAttributeValuesResponse description]
	 * @param  {[type]} result  [description]
	 * @param  {[type]} request [description]
	 */
	var sendAttributeValuesResponse = function(result, request) {
		request.res.header("Content-Type", "appplication/json");

		if (result.error) request.res.send(500, new Error('An error occured while getting attribute values from database.'));
		else {
			var responseResults = [];
			var readItems = [];

			result.rows.forEach(function(row) {
				var timeSet = false;
				var index = readItems.indexOf(row.cell_id);

				if (index != -1) { // Cell has been read before, all timestamps are available and have to be set accrodingly
					if (responseResults[index].cell_id == row.cell_id) {
						for (var key in responseResults[index].values) {
							if (row.timevalid == key || timeSet) {
								responseResults[index].values[key] = row.value;
								timeSet = true;	
							}
						}
					}
				} else {
					var cell = {
						"cell_id": row.cell_id, 
						"geometry": JSON.parse(row.geometry),
						"attribute": request.req.params.name,
						"values": {}
					};

					for (var i = 0; i < TIMESTAMPS.length; i++) {
						if (row.timevalid == TIMESTAMPS[i].timestamp || timeSet) {
							cell.values[TIMESTAMPS[i].timestamp] = row.value;
							timeSet = true;
						} else {
							cell.values[TIMESTAMPS[i].timestamp] = 0;
						}
					}

					responseResults.push(cell);
					readItems.push(row.cell_id);
				}
			});

			var stats = getTimestampStats(responseResults);
			
			request.res.send('{"result": ' + JSON.stringify(responseResults) + ', "stats": ' + JSON.stringify(stats) + '}');
		}

		return request.next();
	}


	/* **********************************************************************************
	 * CONTROL FUNCTIONS
	 * *********************************************************************************/

	/**
	 * [getTimestampStats description]
	 * @param  {[type]} cells [description]
	 * @return {[type]}       [description]
	 */
	var getTimestampStats = function(cells) {
		var stats = {};
		TIMESTAMPS.forEach(function(time) {
			var vals = [];
			cells.forEach(function(cell) {
				vals.push(cell.values[time.timestamp]);
			});
			
			vals = vals.toVector();

			stats[time.timestamp] = {};
			stats[time.timestamp].min = vals.min();
			stats[time.timestamp].max = vals.max();
			stats[time.timestamp].avg = vals.mean();
			stats[time.timestamp].var = vals.variance();
			stats[time.timestamp].std = vals.stdev();
		});

		return stats;
	}

	/**
	 * [getTimestamps description]
	 * @param  {[type]}   req  [description]
	 * @param  {[type]}   res  [description]
	 * @param  {Function} next [description]
	 */
	var getTimestamps = function(req, res, next) {
		DB_CONNECTOR.getTimestamps(sendTimestampResponse, {
			req: req,
			res: res,
			next: next
		});
	}

	/**
	 * [getAttributes description]
	 * @param  {[type]}   req  [description]
	 * @param  {[type]}   res  [description]
	 * @param  {Function} next [description]
	 */
	var getAttributes = function(req, res, next) {
		DB_CONNECTOR.getAttributes(sendAttributesResponse, {
			req: req,
			res: res,
			next: next
		});
	}

	var getCapabilities = function (req, res, next) {
		DB_CONNECTOR.getCapabilities(sendCapabilitiesResponse, {
			req: req,
			res: res,
			next: next
		});	
	}

	/**
	 * [getAttributeValues description]
	 * @param  {[type]}   req  [description]
	 * @param  {[type]}   res  [description]
	 * @param  {Function} next [description]
	 */
	var getAttributeValues = function(req, res, next) {
		var queryParams;
		
		if (req.query) queryParams = QUERYSTRING.parse(req.query);
		DB_CONNECTOR.getAttributeValues(ATTRIBUTES[req.params.name].table, queryParams, sendAttributeValuesResponse, {
			req: req,
			res: res,
			next: next
		});
	}

	/**
	 * [geometryIntersection description]
	 * @param  {[type]}   req  [description]
	 * @param  {[type]}   res  [description]
	 * @param  {Function} next [description]
	 */
	var geometryIntersection = function(req, res, next) {
		DB_CONNECTOR.getIntersection(ATTRIBUTES[req.params.name].table, req.body.geometry, req.body.cutGeometry, sendAttributeValuesResponse, {
			req: req,
			res: res,
			next: next
		})
	}

	api.prototype.getCapabilities = getCapabilities;
	api.prototype.getAttributes = getAttributes;
	api.prototype.getTimestamps = getTimestamps;
	api.prototype.getAttributeValues = getAttributeValues;
	api.prototype.geometryIntersection = geometryIntersection;

	return api;
}());

module.exports = API;