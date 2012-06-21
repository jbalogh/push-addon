const notifications = require('notifications'),
      pageWorker = require('page-worker'),
      observer = require('observer'),
      prefs = require('simple-prefs').prefs,
      main = require('./main'),
      SOCKET_PREF = 'push.websocket';


exports.worker = function() {
  var worker = pageWorker.Page({
    contentURL: 'about:blank',
    contentScript: 'new ' + function() {
      var socketURL, token;
      self.port.emit('load');

      self.port.on('socket', function(url) {
          console.log('port.on.socket');
        socketURL = url;
      });

      var backoff = 1, backoffMax = 60;

      function startSocket() {
        console.log('Starting socket for token:', token);
        ws = new WebSocket(socketURL);
        ws.onopen = function() {
          console.log('Socket open.');
          ws.send('token: ' + token);
          backoff = 1;
        };
        ws.onmessage = function(e) {
          console.log('Got a message:', e.data);
          self.port.emit('message', e.data);
        };
        ws.onerror = function(e) {
          console.log('websocket error ' + e);
          console.log('Reconnect backoff:', backoff);

          setTimeout(startSocket, backoff * 1000);
          backoff = Math.min(backoff * 2, backoffMax);
        };
        ws.onclose = function() {
          console.log('websocket close');
        }
      }

      self.port.on('token', function(t) {
          console.log('port.on.token');
        token = t;
        startSocket();
      });
    }
  });

  worker.port.emit('socket', prefs[SOCKET_PREF]);

  worker.port.on('load', function() {
    if (main.DB.token) {
      worker.port.emit('token', main.DB.token);
    }
  });

  worker.port.on('message', function(msg) {
      observer.emit('message', JSON.parse(msg));
  });

  observer.on('token', function(token) {
    worker.port.emit('token', main.DB.token);
  });
}
