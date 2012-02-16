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


exports['test:navigator.mozPush'] = function(test) {
  tabs.on('ready', function(tab) {
    tab.attach({
      contentScriptWhen: 'start',
      contentScript: 'new ' + function() {
        document.addEventListener('testDone', function(e) {
          let pass = document.body.getAttribute('pass'),
              fail = document.body.getAttribute('fail');
          self.postMessage([pass, fail]);
        });
      },
      onMessage: function(m) {
        test.assert(m[0] > 0, m[0] + " tests passed.");
        test.assert(m[1] == 0, m[1] == 1 ? "1 test failed."
                                         : m[1] + " tests failed.");
        test.done();
      }
    });
  });
  tabs.open(HOST + '/one.html');
  test.waitUntilDone();
};
