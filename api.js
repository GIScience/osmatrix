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
	 * Constructor
	 */
	var api = function(dbConnector, attributes) {
		DB_CONNECTOR = dbConnector;
		ATTRIBUTES = attributes;
	};

	/* **********************************************************************************
	 * EVENT HANDLER
	 * *********************************************************************************/

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

	}


	/* **********************************************************************************
	 * CONTROL FUNCTIONS
	 * *********************************************************************************/

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

	/**
	 * [getAttributeValues description]
	 * @param  {[type]}   req  [description]
	 * @param  {[type]}   res  [description]
	 * @param  {Function} next [description]
	 */
	var getAttributeValues = function(req, res, next) {
		var queryParams;
		
		if (req.query) queryParams = QUERYSTRING.parse(req.query);
		DB_CONNECTOR.getAttributeValues(ATTRIBUTES[req.params.name].table, queryParams, sendAttributesResponse, {
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

	}

	api.prototype.getAttributes = getAttributes;
	api.prototype.getTimestamps = getTimestamps;
	api.prototype.getAttributeValues = getAttributeValues;

	return api;
}());

module.exports = API;