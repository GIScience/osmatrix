var DB = require('./database');

MAP = (function() {
	/**
	 * [COLORS description]
	 * @type {Array}
	 */
	var COLORS = ["FFFFFF", "FFF7FB", "ECE7F2", "D0D1E6", "A6BDDB", "74A9CF", "3690C0", "0570B0", "045A8D", "023858"]

	/**
	 * [ELSE_COLOR description]
	 * @type {String}
	 */
	var ELSE_COLOR = "ae3825"; 

	/**
	 * [OPACITY description]
	 * @type {Number}
	 */
	var OPACITY = 0.5;

	/**
	 * [ATTRIBUTES description]
	 * @type {Object}
	 */
	var ATTRIBUTES;

	/**
	 * 
	 */
	var DB_CONNECTOR;

	/* **********************************************************************************
	 * EVENT HANDLER
	 * *********************************************************************************/

	/**
	 * [handleAttributeInfo description]
	 * @param  {[type]} result [description]
	 */
	var handleAttributeInfo = function(result) {
		ATTRIBUTES = result;
	}

	/* **********************************************************************************
	 * CONTROL FUNCTIONS
	 * *********************************************************************************/

	/**
	 * Constructor
	 * @param  {[type]} dbConfig [description]
	 */
	var map = function (dbConfig) {
		DB_CONNECTOR = new DB(dbConfig);
		getAttributeInfo();
	}

	/**
	 * [getAttributeInfo description]
	 * @return {[type]} [description]
	 */
	var getAttributeInfo = function () {
		DB_CONNECTOR.getAttributeInfo(handleAttributeInfo);
	}

	/**
	 * [getTile description]
	 * @param  {[type]}   req  [description]
	 * @param  {[type]}   res  [description]
	 * @param  {Function} next [description]
	 * @return {[type]}        [description]
	 */
	var getTile = function (req, res, next) {
		
	}

	/**
	 * [getLegend description]
	 * @param  {[type]}   req  [description]
	 * @param  {[type]}   res  [description]
	 * @param  {Function} next [description]
	 * @return {[type]}        [description]
	 */
	var getLegend = function (req, res, next) {
		
	}

	map.prototype.getTile = getTile;
	map.prototype.getLegend = getLegend;
	return map;
}());

module.exports = MAP;