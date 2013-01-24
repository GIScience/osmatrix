/**
* OSMatrix REST-API
* Author: Oliver Roick
* 
* Written on top of Node.JS (http://nodejs.org)
*      Node.JS Package dependencies:
*      - Restify (for RESTful servers): http://mcavage.github.com/node-restify/
*      - Node-Postgres (Postgres connector): https://github.com/brianc/node-postgres
*	   - Node-Mapnik (Map renderer): https://github.com/mapnik/node-mapnik/
*
*/


DataBase = {
	host: '127.0.0.1',
	
	user: 'oroick',
	
	password: 's69KDZem',
	
	db: 'osmatrix2000',
	
	openDb: function () {
		var client = new pg.Client("postgres://" + this.user + ":" + this.password + "@" + this.host + ":5432/" + this.db);
		client.connect();
		
		return client;
	}
}

Util = {
	getWKTFromJSON: function (json) {
		var wkt;
		
		var coordinates;
		if (typeof json.coordinates == 'string') {
			coordinates = JSON.parse(json.coordinates);
		} else {
			coordinates = json.coordinates;
		}

		if (json.type == "Point") {
			return 'POINT(' + coordinates[0] + ' ' + coordinates[1] + ')';
		}
		
		// TODO: Please test linestring conversion
		if (json.type == "LineString") {
			wkt = 'LINETSTRING(';
			for (var i = 0; i < coordinates.length; i++) {
				if (i > 0) {
					wkt += ' ,';
				}
				wkt += coordinates[i][0] + ' ' + coordinates[i][1];
			}
		}
		
		if (json.type == "Polygon") {
			wkt = 'POLYGON('
			for (var i = 0; i < coordinates.length; i++) {
				wkt += '(';
				for (var j = 0; j < coordinates[i].length; j++) {
					if (j > 0) {
						wkt += ' ,';
					}
					wkt += coordinates[i][j][0] + ' ' + coordinates[i][j][1];
				}
				wkt += ')';
			}
		}
		wkt += ')';
		
		return wkt;
	}
}

OSMatrixApi = {
	urlBase: '/osmatrix/api',

	getAttributes: function (req, res, next) {
		
		var dbClient = DataBase.openDb();
// 		var bboxSuccess = false;
// 		var attributeSuccess = false;
// 		var bboxResult, attributeResult = [];

		res.header("Content-Type", "appplication/json");

// 		dbClient.query('SELECT EXTENT(geom) as extent FROM cells', function (error, result) {
// 			if (error) {
// 				dbClient.end();	
// 	 			res.send(500, new Error('Error querying database: ' + error));
// 			} else {
// 				bboxResult = result.rows[0].extent.replace(/\s/g, ',').substring(4, result.rows[0].extent.indexOf(')') - 4);
// 				bboxSuccess = true;
// 				
// 				if (attributeSuccess) {
// 					dbClient.end();
// 					res.send('{"bbox": [' + bboxResult + '], "attributes": [' + JSON.stringify(attributeResult) + ']}');
// 				} 
// 			}
// 		});
		
		dbClient.query('SELECT id, attribute AS name, description, title FROM attribute_types WHERE id NOT IN (19) ORDER BY title', function (error, result) {
			if (error) {
				dbClient.end();	
				res.send(500, new Error('Error querying database: ' + error));
			} else {
				var attributeResult = [];
				for (i in result.rows) {
					attributeResult.push(result.rows[i]);
				}
				dbClient.end();
				res.send('{"attributes": ' + JSON.stringify(attributeResult) + '}');
			}
		});
		return next();
	},
	
	getSingleAttribute: function (req, res, next) {
		var table = attributes[req.params.name].table;
		
		var statsResults = [];
		var timesResults = [];
		var attributesResults = [];
		
		
		var filters = [];
		var geomReq = 'ST_AsGeoJSON(cells.geom)';
		if (req.method == 'POST') {
			filters.push('(ST_Intersects(cells.geom, ST_Transform(geomfromtext(\'' + Util.getWKTFromJSON(req.body.geometry) + '\', 4326), 900913)))');
			if (req.body.cutGeometry) {
				geomReq = 'ST_AsGeoJSON(ST_Intersection(cells.geom, ST_Transform(geomfromtext(\'' + Util.getWKTFromJSON(req.body.geometry) + '\', 4326), 900913)))';
			} 
		} else {
			if (req.query) {
				var queryParams = querystring.parse(req.query);
				if (queryParams.cells) {
					filters.push('(' + table + '.cell_id IN (' + queryParams.cells + '))');
				}
				
				if (queryParams.lat && queryParams.lon) {
					filters.push('(ST_Intersects(ST_Buffer(ST_Transform(geomfromtext(\'POINT(' + queryParams.lon + ' ' + queryParams.lat + ')\', 4326), 900913), 4000), geom))');
					filters.push('((ST_Within(ST_Transform(geomfromtext(\'POINT(' + queryParams.lon + ' ' + queryParams.lat + ')\', 4326), 900913), geom)) OR (ST_DWithin((SELECT geom from cells WHERE ST_Within(ST_Transform(geomfromtext(\'POINT(' + queryParams.lon + ' ' + queryParams.lat + ')\', 4326), 900913), geom)), geom, 1)))');
				}
								
				if (queryParams.bbox) {
					var bbox = queryParams.bbox.split(',');
					filters.push('(ST_Within(cells.geom, ST_Transform(geomfromtext(\'POLYGON((' + bbox[0] + ' ' + bbox[1] + ',' + bbox[0] + ' ' + bbox[3] + ',' + bbox[2] + ' ' + bbox[3] + ',' + bbox[2] + ' ' + bbox[1] + ',' + bbox[0] + ' ' + bbox[1] + '))\', 4326), 900913)))');
					
				}
				if (queryParams.timestamps) {
					var timestamps = queryParams.timestamps.split(',');
					var timeFilter = [];
					for (var i = 0; i < timestamps.length; i++) {
						timeFilter.push('(timesV.time <= to_timestamp(\'' + timestamps[i] + '\', \'YYYY-MM-DD\') AND ((timesE.time > to_timestamp(\'' + timestamps[i] + '\', \'YYYY-MM-DD\')) OR (timesE.time IS NULL)))');
					}
					filters.push(timeFilter.join(' OR '));
				}
			}
		}
		
		var fromWhere = "FROM " + 
  			table + " " +
			"LEFT JOIN cells ON (" + table + ".cell_id = cells.id) " + 
			"LEFT JOIN times AS timesV ON (" + table + ".valid = timesV.id) " + 
			"LEFT JOIN times  AS timesE ON (" + table + ".expired = timesE.id) ";
		
		if (filters.length > 0) {
			fromWhere += ' WHERE ' + filters.join(' AND ');
		}
		
		var statsQueryString = "SELECT to_char(timesV.time, 'YYYY-MM-DD') AS timestamp, min(value), max(value), avg(value), stddev_samp(value) AS stddev, var_samp(value) AS var";
			
		var dbClient = DataBase.openDb();
			
		console.log('get stats');
		var stats = dbClient.query(statsQueryString + ' ' + fromWhere + ' GROUP BY timesV.time;');
		stats.on('row', function (row) {
			statsResults.push(row);
		});
		
		stats.on('end', function () {
			dbClient.end();
			getTimes();
		});
		stats.on('error', function (error) {
//			res.send(500, new Error('Error querying database for statistics: ' + error));
			dbClient.end();
		});
		
		var getTimes = function () {
			console.log('get times');
			var dbClient = DataBase.openDb();
			var timestamps = dbClient.query('SELECT id, date(time) AS time FROM times');

			timestamps.on('row', function (row) {
				timesResults.push(row.time);
			});
		
			timestamps.on('end', function () {
				dbClient.end();
				getValues();
			});
			timestamps.on('error', function () {
				dbClient.end();	
				res.send(500, new Error('Error querying database for timestamps: ' + error));
			});
		};
			
		var getValues = function () {
			console.log('get values');
			var attrQueryString = "SELECT " + 
  				table + ".id, " +  
				table + ".cell_id, " +  
  				"CAST(round(CAST(value AS numeric), 3) AS double precision) AS value, " + 
  					geomReq + " AS geometry, " + 
		  		"	to_char(timesV.time, 'YYYY-MM-DD') AS timeValid, " + 
  				"	to_char(timesE.time, 'YYYY-MM-DD') AS timeExpired ";
			
			
			
			var dbClient = DataBase.openDb();
			
			var dbResults = [];
			var readItems = [];
		console.log(attrQueryString + ' ' + fromWhere + ' ORDER BY cell_id, timevalid;');
			var attributes = dbClient.query(attrQueryString + ' ' + fromWhere + ' ORDER BY cell_id, timevalid;');
			attributes.on('row', function (row) {
				var index = readItems.indexOf(row.cell_id);
				var timeSet = false;
				if (index == -1) {
					var values = [];

					for (var i = 0; i < timesResults.length; i++) {
						if (row.timevalid == timesResults[i] || timeSet) {
							values.push({"timestamp": timesResults[i], "value": row.value});
							timeSet = true;
						} else {
							values.push({"timestamp": timesResults[i], "value": 0});
						}
					}

					dbResults.push({
						"cell_id": row.cell_id, 
						"geometry": JSON.parse(row.geometry),
						"attribute": req.params.name,
						"values": values
					});
					
					readItems.push(row.cell_id);
				} else {
					if (dbResults[index].cell_id == row.cell_id) {
						for (var i = 0; i < dbResults[index].values.length; i++) {
							if (row.timevalid == dbResults[index].values[i].timestamp || timeSet) {
								dbResults[index].values[i].value = row.value;
								timeSet = true;
							}
						}
					} else {
						console.log('false');
					}
				}
			});
			
			attributes.on('end', function (result) {
				dbClient.end();
				res.write('{"result": [');
				for (var i = 0; i < dbResults.length; i++) {
					if (i > 0) {
						res.write(',');
					}
					res.write(JSON.stringify(dbResults[i]));
				}
				res.write('], "stats": ' + JSON.stringify(statsResults));
				res.end('}');
			});
			
			attributes.on('error', function(error) {
				console.log(error);
				res.send(500, 'Error querying database for attributes:' + error);
			});
		}
		return next();
	},
	
	getCells: function (req, res, next) {
		var whereClause = '';
	
		if (req.query) {
			var queryParams = querystring.parse(req.query);
			
			if (queryParams.lat && queryParams.lon) {
				whereClause = 'WHERE ST_Within(ST_Transform(geomfromtext(\'POINT(' + queryParams.lon + ' ' + queryParams.lat + ')\', 4326), 900913), geom)';
			} else {
				whereClause = false;
				res.send(400, new Error('Either lat and/or lon parameters not set correctly'));
			}
		}
		
		if (whereClause) {
			var count = 0;
			var dbClient = DataBase.openDb();
			
			var cells = dbClient.query('SELECT id, ST_AsGeoJSON(geom) AS geometry FROM cells ' + whereClause);
			cells.on('row', function (row) {
				if (count == 0) {
					res.write('{"cells": [');
				} else {
					res.write(', ');
				}
				res.write('{"id": ' + row.id + ', "geometry": ' + JSON.stringify(row.geometry).substring(JSON.stringify(row.geometry).indexOf('"') + 1, JSON.stringify(row.geometry).lastIndexOf('"')) + '}\n\n');
				count++;
			});
			cells.on('end', function () {
				dbClient.end();
				res.end(']}');
			});
			cells.on('error', function () {
				dbClient.end();	
				res.send(500, new Error('Error querying database for cells: ' + error));
			});
		}
		
		return next();
	},
	
	getTimestamps: function (req, res, next) {
		var dbClient = DataBase.openDb();
		var timestamps = dbClient.query('SELECT id, date(time) AS time FROM times');
		var count = 0;
		timestamps.on('row', function (row) {
			if (count == 0) {
				res.write('{"timestamps": [');				
			} else {
				res.write(', ');
			}
			res.write('{"id": ' + row.id + ', "timestamp": "' + row.time + '"}\n\n');
			count++;
		});
		
		timestamps.on('end', function () {
			dbClient.end();
			res.end(']}');
		});
		timestamps.on('error', function () {
			dbClient.end();	
			res.send(500, new Error('Error querying database for timestamps: ' + error));
		});
		
		return next();
	}
}

OSMatrixMap = {
	urlBase: '/osmatrix/map',

	colors: ["FFFFFF", "FFF7FB", "ECE7F2", "D0D1E6", "A6BDDB", "74A9CF", "3690C0", "0570B0", "045A8D", "023858"], // blue
	//colors = ["FFFFFF", "FFF7EC", "FEE8C8", "FDD49E", "FDBB84", "FC8D59", "EF6548", "D7301F", "B30000", "7F0000"], // red
	//colors = ["FFFFFF", "FFFFD9", "EDF8B1", "C7E9B4", "7FCDBB", "41B6C4", "1D91C0", "225EA8", "253494", "081D58"], // yellow - blue
	
	elseColor: "ae3825",
	
	opacity: 0.5,
	
	getStyle: function (layer, zoom) {
		var quantiles = attributes[layer].quantiles;
		
		var renderLabel = '', renderOutline = '', strokeWidth = 1;
		
		if (zoom > 12) {
			renderLabel = '<TextSymbolizer face-name="DejaVu Sans Book" size="16" dy="-10" fill="black" halo-fill= "white" halo-radius="2" character-spacing="1">[cell_id]</TextSymbolizer>' + 
				'<TextSymbolizer face-name="DejaVu Sans Book" size="16" dy="10" fill="black" halo-fill= "white" halo-radius="2" character-spacing="1">[label]</TextSymbolizer>';
			renderOutline = '<LineSymbolizer stroke="#000000" stroke-width="2"/>';
		}
		if (zoom > 11) {
			strokeWidth = 2;
		}
	
		var styleString = '<?xml version="1.0" encoding="utf-8"?>' + 
			'<Map minimum-version="2.0.0" buffer-size="128">' + 
			'<Style name="' + layer + '" filter-mode="first">';
			
		for (var i = 0; i < quantiles.length; i++) {
		
			styleString += '<Rule>';

			switch (i) {
				case 0:
					styleString += '<Filter>[value] &lt;= ' + quantiles[i] + ' </Filter>' +
						'<PolygonSymbolizer gamma=".65" fill-opacity="' + this.opacity + '" fill="#' + this.colors[i] +'"/>' + 
						renderOutline + 
						renderLabel;
					break;
					
				case (quantiles.length - 1):
					styleString += '<Filter>[value] &gt; ' + quantiles[i-1] + ' and [value] &lt;= ' + quantiles[i] + ' </Filter>' +
						'<PolygonSymbolizer gamma=".65" fill-opacity="' + this.opacity + '" fill="#' + this.colors[i] +'"/>' + 
						renderOutline + 
						renderLabel;
						
					styleString += '</Rule><Rule><Filter>[value] &gt; ' + quantiles[i] + '</Filter>' +
						'<PolygonSymbolizer gamma=".65" fill-opacity="' + this.opacity + '" fill="#' + this.colors[i + 1] + '"/>' + 
						renderOutline + 
						renderLabel;
					break;
					
				default:
					styleString += '<Filter>[value] &gt; ' + quantiles[i-1] + ' and [value] &lt;= ' + quantiles[i] + ' </Filter>' +
						'<PolygonSymbolizer gamma=".65" fill-opacity="' + this.opacity + '" fill="#' + this.colors[i] + '"/>' + 
						renderOutline + 
						renderLabel;
					break;
			}

			styleString += '</Rule>';
		}
		
		styleString += '<Rule><ElseFilter/><PolygonSymbolizer fill-opacity="0.7" fill="#' + this.elseColor + '"/>' + 
						renderOutline + 
						renderLabel + '</Rule>';
		styleString += '</Style>';
			
		styleString += '<Style name="cells"><Rule><LineSymbolizer stroke="#ccc" stroke-width="' + strokeWidth + '"/></Rule></Style>';
		styleString += '</Map>';

		return styleString;
	},
	
	getLegend: function (req, res, next) {
		var quantiles = attributes[req.params.layer].quantiles;
	
		var entries = [];
		for (var i = 0; i < quantiles.length; i++) {
			var label;
			switch (i) {
				case 0:
					label = '[value] &lt;=' + quantiles[i];
					break;
				default:
					label = quantiles[i-1] + ' &lt; [value] &lt;= ' + quantiles[i];
					break;
			}
			entries.push({
				'color': '#' + OSMatrixMap.colors[i],
				'label': label
			});
		}
		
		entries.push({
			'color': '#' + OSMatrixMap.colors[quantiles.length],
			'label': quantiles[quantiles.length - 1] + ' &lt; [value]'
		});
		
		entries.push({
			'color': '#' + OSMatrixMap.elseColor,
			'label': 'Other values'
		});
		
		res.send('{"attributeName": "' + req.params.layer + '", "labels": ' + JSON.stringify(entries) + '}');
		next();
	},

	getTile: function (req, res, next) {
		var table = attributes[req.params.layer].table;
	
		var mercator = require(path.join(__dirname, 'node_modules/mapnik/examples/utils/sphericalmercator.js'));
		var parseXYZ = require(path.join(__dirname, 'node_modules/mapnik/examples/utils/tile.js')).parseXYZ;

		var TMS_SCHEME = false;
		
		var queryParams = querystring.parse(req.query);
		var bbox = mercator.xyz_to_envelope(parseInt(queryParams.x), parseInt(queryParams.y), parseInt(queryParams.z), false);
		
		console.log(new Date() + ": " + req.params.layer);
		
		var valueReq = table + ".value AS value, ";
		var labelReq = "CAST(round(CAST(" + table + ".value AS numeric), 3) AS text) AS label, "
		if (req.params.layer == 'DateOfLatestEdit' || req.params.layer == 'dateOfEldestEdit') {
			valueReq = "	to_char(to_timestamp(" + table + ".value / 1000), 'YYYY-MM-DD') AS value, ";
			labelReq = "	to_char(to_timestamp(" + table + ".value / 1000), 'YYYY-MM-DD') AS label, "
		} 

		var attributesQuery = "(SELECT " + 
  				table + ".id, " +  
				"	'#' || CAST(" + table + ".cell_id AS text) AS cell_id, " +  
  				valueReq + 
  				labelReq + 
  				" 	geom " + 
  				"FROM " + table + 
				" LEFT JOIN cells ON (" + table + ".cell_id = cells.id) " + 
				"WHERE " +
				"(ST_Intersects(geom, geomfromtext(\'POLYGON((" + bbox[0] + " " + bbox[1] + "," + bbox[0] + " " + bbox[3] + "," + bbox[2] + " " + bbox[3] + "," + bbox[2] + " " + bbox[1] + "," + bbox[0] + " " + bbox[1] + "))\', 900913))) AND " + 
				"(" + table + ".valid <= " + queryParams.timestamp + " AND ((" + table + ".expired > " + queryParams.timestamp + ") OR (" + table + ".expired IS NULL)))) as awesometable";
		
//		console.log(attributesQuery);
		var cellsQuery = "(SELECT geom from cells) as cells";
		
		parseXYZ(req, TMS_SCHEME, function(err,params) {
			if (err) {
				res.writeHead(500, {'Content-Type': 'text/plain'});
				res.end(err.message);
			} else {
				try {
					var map = new mapnik.Map(256, 256, mercator.proj4);

        			var style = OSMatrixMap.getStyle(req.params.layer, queryParams.z);

        			map.bufferSize = 64;
        			map.fromStringSync(style, {strict: true});
        			
        			if (queryParams.z > 8) {
    	    			var cellsLayer = new mapnik.Layer('tile', mercator.proj4);
   		     			cellsLayer.datasource = new mapnik.Datasource({
  							'host': DataBase.host,
				  			'dbname' : DataBase.db,
  							'user' : DataBase.user,
				  			'password': DataBase.password,
  							'type' : 'postgis',
  							'table': cellsQuery,
 				 			'geometry_field': 'geom',
 				 			'extent' : bbox.join(',')
  							//'extent' : '-20005048.4188,-9039211.13765,19907487.2779,17096598.5401'  //change this if not merc
						});
	        			cellsLayer.styles = ['cells'];
	        			map.add_layer(cellsLayer);
        			}
        			
					var attributesLayer = new mapnik.Layer('tile', mercator.proj4);
        			attributesLayer.datasource = new mapnik.Datasource({
  						'host': DataBase.host,
			  			'dbname' : DataBase.db,
  						'user' : DataBase.user,
			  			'password': DataBase.password,
  						'type' : 'postgis',
  						'table': attributesQuery,
 			 			'geometry_field': 'geom',
 			 			'extent' : bbox.join(',')
  						//'extent' : '-20005048.4188,-9039211.13765,19907487.2779,17096598.5401'  //change this if not merc
					});
        			attributesLayer.styles = [req.params.layer];
        			map.add_layer(attributesLayer);
			        
			        map.extent = bbox;
            		var im = new mapnik.Image(map.width, map.height);
			        map.render(im, function(err, im) {
              			if (err) {
                			throw err;
              			} else {
                			res.writeHead(200, {'Content-Type': 'image/png'});
                			res.end(im.encodeSync('png'));
              			}
           			});
        		} catch (err) {
			        res.writeHead(500, {'Content-Type': 'text/plain'});
			        res.end(err.message);
        		}
			}
		});

	
		next();
	}
}



var restify = require('restify');
var querystring = require('querystring');
var pg = require('pg');
var mapnik = require('mapnik');
var fileSystem = require('fs');
var path = require('path');




var attributes = {};


var attributesClient = DataBase.openDb();
var attributeQuery = attributesClient.query("SELECT * FROM attribute_types");

attributeQuery.on('row', function(row) {
	var table = "attribute_";
	if (row.id < 10) {
		table += "00" + row.id;
	} else {
		table += "0" + row.id;
	}
	
	var a = row.attribute;
	
	if (a == 'dateOfEldestEdit' || a == 'DateOfLatestEdit') {
		attributes[a] = {'table' : table, 'quantiles': [
			"'2008-01-01'", "'2008-07-01'","'2009-01-01'", "'2009-07-01'","'2010-01-01'", "'2010-07-01'", "'2011-01-01'", "'2011-07-01'", "'2012-01-01'"
		]}
	} else {
		var quantileClient = DataBase.openDb();
		var quantileQuery = quantileClient.query("SELECT quantile(CAST(round(CAST(value AS numeric), 3) AS double precision), ARRAY[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) FROM " + table);
		
		quantileQuery.on('row', function (row) {
			attributes[a] = {'table' : table, 'quantiles': row.quantile}
		});
		
		quantileQuery.on('end', function () {
			quantileClient.end();
		});
		
		quantileQuery.on('error', function (e) {
			console.log(e);
			quantileClient.end();
		});
	}
});

attributeQuery.on('end', function() {
	attributesClient.end();
});

attributeQuery.on('error', function(e) {
	console.log(e);
	attributesClient.end();
});

var server = restify.createServer({
	name: 'OSMatrix'
});

server.use(restify.bodyParser({ mapParams: false }));

server.get(OSMatrixApi.urlBase + '/attributes/', OSMatrixApi.getAttributes);
server.get(OSMatrixApi.urlBase + '/attributes/:name', OSMatrixApi.getSingleAttribute);
server.post(OSMatrixApi.urlBase + '/attributes/:name/geometryIntersect', OSMatrixApi.getSingleAttribute);
server.get(OSMatrixApi.urlBase + '/timestamps/', OSMatrixApi.getTimestamps);
server.get(OSMatrixApi.urlBase + '/cells/', OSMatrixApi.getCells);
server.get(OSMatrixMap.urlBase + '/:layer', OSMatrixMap.getTile);
server.get(OSMatrixMap.urlBase + '/:layer/legend', OSMatrixMap.getLegend);

server.listen(50684, function() {
	console.log('%s listening at %s', server.name, server.url);
});