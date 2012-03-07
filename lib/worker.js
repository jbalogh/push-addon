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
      var socket;
      self.port.emit('load');

      self.port.on('socket', function(url) {
        socket = url;
      });

      self.port.on('token', function(token) {
        console.log('Starting socket for token:', token);
        ws = new WebSocket(socket);
        ws.onopen = function() {
          console.log('Socket open.');
          ws.send('token: ' + token);
        };
        ws.onmessage = function(e) {
          console.log('Got a message:', e.data);
          self.port.emit('message', e.data);
        };
        ws.onerror = function(e) {
          console.log('websocket error ' + e);
        };
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
