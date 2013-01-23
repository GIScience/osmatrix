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