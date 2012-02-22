let env = require('environment').env,
    httpd = require('httpd'),
    main = require('main'),
    request = require('request'),
    tabs = require('tabs');

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

function testPage(name) {
  return function(test) {
    tabs.on('ready', function(tab) {
      tab.attach({
        contentScriptWhen: 'start',
        contentScript: 'new ' + function() {
          document.addEventListener('testDone', function(e) {
            let pass = document.body.getAttribute('pass'),
                fail = document.body.getAttribute('fail'),
                timeout = document.body.getAttribute('timeout');
            self.postMessage([pass, fail, timeout]);
          });
        },
        onMessage: function(m) {
          test.assert(m[0] > 0, m[0] + " tests passed.");
          test.assert(m[1] == 0, m[1] == 1 ? "1 test failed."
                                           : m[1] + " tests failed.");
          test.assert(m[2] == 0, m[2] == 1 ? "1 test timed out."
                                           : m[2] + " tests timed out.");
          test.done();
        }
      });
    });
    tabs.open(HOST + name);
    test.waitUntilDone();
  };
}

exports['test:navigator.mozNotification'] = testPage('/one.html');
exports['test:checkRemotePermission'] = testPage('/two.html');
exports['test:requestRemotePermission'] = testPage('/three.html');

/* TODO: tests
 * use a local test server
 * checkPermission error
 * requestRemotePermission errors:
 ** server isn't there
 ** server returns a negative response (40x/50x)
 ** server returns an invalid response (bad JSON)
 * should only get one token
 * should remember queues that have been fetched previously
 * check that the right data/headers sent for getting token and getting queue
 * test confirmation dialog
 */
