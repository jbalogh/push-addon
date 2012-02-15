let env = require('environment').env,
    httpd = require('httpd'),
    main = require('main'),
    request = require('request');

let PORT = 9984,
    HOST = 'http://localhost:' + PORT;
console.log('Test server listening on ' + HOST);

// Load up the addon.
main.main();

var server = httpd.startServerAsync(PORT, env['TEST_DIR']);
require('unload').when(server.stop.bind(server));

exports['test:http'] = function(test) {
  request.Request({
    url: HOST + '/ok.html',
    onComplete: function(response) {
      test.assertEqual(response.status, 200, "The httpd server is running.");
      test.done()
    }
  }).get();
  test.waitUntilDone();
};
