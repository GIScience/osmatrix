/***********************************************************************
 * LOAD DEPENDENCIES
 ***********************************************************************/
var RESTIFY = require('restify');
var DB = require('./database');
// var MAP = require('./map');
var API = require('./api');


SERVICE = (function() {
	var service = {};

	/**
	 * [initialize description]
	 * @param  {[type]} dbConfig     [description]
	 * @param  {[type]} serverConfig [description]
	 */
	var initialize = function(dbConfig, serverConfig) {
		var dbConnector = new DB(dbConfig);
		// var map = new MAP(dbConnector);
		var api = new API(dbConnector);

		var server = RESTIFY.createServer({
			name: 'OSMatrix'
		});

		server.use(RESTIFY.bodyParser({ mapParams: false }));

		server.get(serverConfig.baseUrl + '/api/attributes/', api.getAttributes);
		// server.get(serverConfig.baseUrl + '/api/attributes/:name', OSMatrixApi.getSingleAttribute);
		// server.post(serverConfig.baseUrl + '/api/attributes/:name/geometryIntersect', OSMatrixApi.getSingleAttribute);
		// server.get(serverConfig.baseUrl + '/api/timestamps/', OSMatrixApi.getTimestamps);
		// server.get(serverConfig.baseUrl + '/api/cells/', OSMatrixApi.getCells);
		// server.get(serverConfig.baseUrl + '/map/:layer', map.getTile);
		// server.get(serverConfig.baseUrl + '/map/:layer/legend', map.getLegend);

		server.listen(serverConfig.port, function() {
			console.log('%s listening at %s', server.name, server.url);
		});
	}

	service.initialize = initialize;
	return service;
}());

module.exports = SERVICE;