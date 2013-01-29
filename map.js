var PATH = require('path');
var QUERYSTRING = require('querystring');
var MAPNIK = require('mapnik');

MAP = (function() {
	/**
	 * Defines the color scheme of the map.
	 * @type {Array}
	 */
	var COLORS = ["FFFFFF", "FFF7FB", "ECE7F2", "D0D1E6", "A6BDDB", "74A9CF", "3690C0", "0570B0", "045A8D", "023858"]

	/**
	 * Defines the color of features not covered by the color scheme.
	 * @type {String}
	 */
	var ELSE_COLOR = "ae3825"; 

	/**
	 * The opacity of the OSMatrix layer.
	 * @type {Number}
	 */
	var OPACITY = 0.5;

	/**
	 * Map projection object. Used to render map.
	 * @type {Object}
	 */
	var MERCATOR = require(PATH.resolve(__dirname, '../node_modules/mapnik/examples/utils/sphericalmercator.js'));

	/**
	 * Parses the XYZ scheme into bounding box.
	 * @type {Function}
	 */
	var PARSE_XYZ = require(PATH.resolve(__dirname, '../node_modules/mapnik/examples/utils/tile.js')).parseXYZ;

	/**
	 * Indicates if the request follows TMS scheme.
	 * @type {Boolean}
	 */
	var TMS_SCHEME = false;

	/**
	 * Contains table names and quantile thresholds for attributes.
	 * @type {Object}
	 */
	var ATTRIBUTES;

	/**
	 * 
	 */
	var DB_CONNECTOR;

	/**
	 * Constructor
	 * @param  {Object} dbConfig Database configuration info including user name, password, host and table.
	 */
	var map = function (dbConnector, attributes) {
		DB_CONNECTOR = dbConnector;
		ATTRIBUTES = attributes;
	}

	/* **********************************************************************************
	 * EVENT HANDLER
	 * *********************************************************************************/

	/**
	 * Returns filter definition for given bounds
	 * @param  {Number} lowerBound The lower bound of the filter.
	 * @param  {Number} upperBound The upper bound of the filter.
	 * @return {String}            The filter definition encoded in Mapnik XML.
	 */
	var getFilter = function(lowerBound, upperBound) {
		var filter = [];

		filter.push('<Filter>');

		if (lowerBound) filter.push('[value] &gt; ' + lowerBound);
		if (lowerBound && upperBound) filter.push(' and ');
		if (upperBound) filter.push('[value] &lt;= ' + upperBound);

		filter.push('</Filter>');
		return filter.join('');
	}

	/**
	 * Returns defintion of the symbolizer
	 * @param  {String} color         The fill color hexcode.
	 * @param  {String} renderOutline The feature outline definition.
	 * @param  {String} renderLabel   The feature label definition.
	 * @return {String}               The symbolizer encoded in Mapnik XML.
	 */
	var getSymolizer = function(color, renderOutline, renderLabel) {
		var symbolizer = ['<PolygonSymbolizer gamma=".65" fill-opacity="' + OPACITY + '" fill="#' + color +'"/>'];

		if (renderOutline) symbolizer.push(renderOutline);
		if (renderLabel) symbolizer.push(renderLabel);

		return symbolizer;
	}

	/**
	 * Returns the style XML for the layer and zoom level
	 * @param  {String} layer The layer for which the style is created.
	 * @param  {Number} zoom  The zoom for which the style is created.
	 * @return {String}       The style definition encoded in Mapnik XML.
	 */
	var getStyleXML = function(layer, zoom) {
		var renderLabel, 
			renderOutline, 
			strokeWidth = 1,
			quantiles = ATTRIBUTES[layer].quantiles;

			if (zoom > 11) strokeWidth = 2;
			if (zoom > 12) {
				renderLabel = '<TextSymbolizer face-name="DejaVu Sans Book" size="16" dy="-10" fill="black" halo-fill= "white" halo-radius="2" character-spacing="1">[cell_id]</TextSymbolizer><TextSymbolizer face-name="DejaVu Sans Book" size="16" dy="10" fill="black" halo-fill= "white" halo-radius="2" character-spacing="1">[label]</TextSymbolizer>';
				renderOutline = '<LineSymbolizer stroke="#000000" stroke-width="2"/>';
			}

		var style = [
			'<?xml version="1.0" encoding="utf-8"?>',
			'<Map minimum-version="2.0.0" buffer-size="128">',
			'<Style name="' + layer + '" filter-mode="first">'
		];

		quantiles.forEach(function(quantil, i) {
			style.push('<Rule>');

			if (i === 0) style.push(getFilter(undefined, quantil));
			else style.push(getFilter(quantiles[i-1], quantil));

			style.push(getSymolizer(COLORS[i], renderOutline, renderLabel));

			if (i === quantiles.length-1) {
				style.push('</Rule>');
				style.push('<Rule>');
				style.push(getFilter(quantil, undefined));
				style.push(getSymolizer(COLORS[i+1], renderOutline, renderLabel));				
			}

			style.push('</Rule>');
		});

		style.push('<Rule><ElseFilter/>');
		style.push(getSymolizer(ELSE_COLOR, renderOutline, renderLabel));
		style.push('</Rule>');
		style.push('</Style>');
			
		style.push('<Style name="cells"><Rule><LineSymbolizer stroke="#ccc" stroke-width="' + strokeWidth + '"/></Rule></Style>');
		style.push('</Map>');
		return style.join('');

	}

	/**
	 * Responds tohe getTile request by sending the image of the tile. See http://mcavage.github.com/node-restify/#Routing for parameter description.
	 */
	var getTile = function (req, res, next) {
		var table = ATTRIBUTES[req.params.layer].table,
			queryParams = QUERYSTRING.parse(req.query),
			bbox = MERCATOR.xyz_to_envelope(parseInt(queryParams.x), parseInt(queryParams.y), parseInt(queryParams.z), false);
			map = new MAPNIK.Map(256, 256, MERCATOR.proj4);

		PARSE_XYZ(req, TMS_SCHEME, function(error,params) {
			if (!error) {
				map.bufferSize = 64;
        		map.fromStringSync(getStyleXML(req.params.layer, queryParams.z), {strict: true});

        		if (queryParams.z > 8) {
					var cellsLayer = new MAPNIK.Layer('tile', MERCATOR.proj4);
   		     		cellsLayer.datasource = new MAPNIK.Datasource(DB_CONNECTOR.getMapnikDatasourceConfig(table, bbox, queryParams.timestamp, req.params.layer.toLowerCase().indexOf('date') == 0));
	        		cellsLayer.styles = ['cells'];
	        		map.add_layer(cellsLayer);
        		}

        		var attributesLayer = new MAPNIK.Layer('tile', MERCATOR.proj4);
        		attributesLayer.datasource = new MAPNIK.Datasource(DB_CONNECTOR.getMapnikDatasourceConfig(table, bbox, queryParams.timestamp, req.params.layer.toLowerCase().indexOf('date') == 0));
        		attributesLayer.styles = [req.params.layer];
        		map.add_layer(attributesLayer);

        		map.extent = bbox;
            	var im = new MAPNIK.Image(map.width, map.height);
			    map.render(im, function(err, im) {
              		if (err) {
                		throw err;
              		} else {
                		res.writeHead(200, {'Content-Type': 'image/png'});
                		res.end(im.encodeSync('png'));
              		}
           		});
			} else {
				res.writeHead(500, {'Content-Type': 'text/plain'});
				res.end(error.message);
			}
		});
		return next();
	}

	/**
	 * Responds tohe getLegend request by sending the image of the tile. See http://mcavage.github.com/node-restify/#Routing for parameter description.
	 */
	var getLegend = function (req, res, next) {
		var quantiles = ATTRIBUTES[req.params.layer].quantiles;
	
		var entries = [];
		quantiles.forEach(function(quantil, i) {
			entries.push({
				'color': '#' + COLORS[i],
				'label': ((i === 0) ? ('[value] &lt;=' + quantil) : (quantiles[i-1] + ' &lt; [value] &lt;= ' + quantil))
			});
		});

		entries.push({'color': '#' + COLORS[quantiles.length], 'label': quantiles[quantiles.length - 1] + ' &lt; [value]'});
		entries.push({'color': '#' + ELSE_COLOR, 'label': 'Other values'});

		res.send('{"attributeName": "' + req.params.layer + '", "labels": ' + JSON.stringify(entries) + '}');
		return next();
	}

	map.prototype.getTile = getTile;
	map.prototype.getLegend = getLegend;
	return map;
}());

module.exports = MAP;