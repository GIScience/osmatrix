API = (function() {

	/**
	 *
	 * @type {Object}
	 */
	var DB_CONNECTOR;

	/**
	 * Constructor
	 */
	var api = function(dbConnector) {
		DB_CONNECTOR = dbConnector;
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
	 * [getCells description]
	 * @param  {[type]}   req  [description]
	 * @param  {[type]}   res  [description]
	 * @param  {Function} next [description]
	 */
	var getCells = function(req, res, next) {

	}

	/**
	 * [getAttributeValues description]
	 * @return {[type]} [description]
	 */
	var getAttributeValues = function() {

	}

	api.prototype.getAttributes = getAttributes;
	api.prototype.getTimestamps = getTimestamps;

	return api;
}());

module.exports = API;