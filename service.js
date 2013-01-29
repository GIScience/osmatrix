/***********************************************************************
 * LOAD DEPENDENCIES
 ***********************************************************************/
var RESTIFY = require('restify');
var DB = require('./database');
// var MAP = require('./map');
var API = require('./api');


SERVICE = (function() {
	var service = {};
	var attributes;
	var DB_CONNECTOR;
	var SERVER_CONFIG;

	/**
	 * Handles results of getAttribute Info
	 * @param  {Object} result Attrbute information as returned from getAttributeInfo
	 */
	var handleAttributeInfo = function(result) {
		attributes = result;
		serviceStartUp();
		console.log('Attribute information successfully loaded. Starting service...');
	}

	/* **********************************************************************************
	 * CONTROL FUNCTIONS
	 * *********************************************************************************/

	/**
	 * [initialize description]
	 * @param  {[type]} dbConfig     [description]
	 * @param  {[type]} serverConfig [description]
	 */
	var initialize = function(dbConfig, serverConfig) {
		DB_CONNECTOR = new DB(dbConfig);
		SERVER_CONFIG = serverConfig;
		getAttributeInfo();
	}

	/**
	 * [serviceStartUp description]
	 */
	var serviceStartUp = function() {
		// var map = new MAP(DB_CONNECTOR, attributes);
		var api = new API(DB_CONNECTOR, attributes);

		var server = RESTIFY.createServer({
			name: 'OSMatrix'
		});

		server.use(RESTIFY.bodyParser({ mapParams: false }));

		server.get(SERVER_CONFIG.baseUrl + '/api/attributes/', api.getAttributes);
		server.get(SERVER_CONFIG.baseUrl + '/api/attributes/:name', api.getAttributeValues);
		// server.post(SERVER_CONFIG.baseUrl + '/api/attributes/:name/geometryIntersect', OSMatrixApi.getSingleAttribute);
		server.get(SERVER_CONFIG.baseUrl + '/api/timestamps/', api.getTimestamps);
		// server.get(SERVER_CONFIG.baseUrl + '/api/cells/', OSMatrixApi.getCells);
		// server.get(SERVER_CONFIG.baseUrl + '/map/:layer', map.getTile);
		// server.get(SERVER_CONFIG.baseUrl + '/map/:layer/legend', map.getLegend);

		server.listen(SERVER_CONFIG.port, function() {
			console.log('Service ready: %s listening at %s', server.name, server.url);
		});
	}

	/**
	 * Gets information on tables and quantil threshold from database.
	 */
	var getAttributeInfo = function() {
		DB_CONNECTOR.getAttributeInfo(handleAttributeInfo);
		console.log('Getting attribute information on tables and quantiles. This may take a while, please be patient.')
	}

	service.initialize = initialize;
	return service;
}());

module.exports = SERVICE;