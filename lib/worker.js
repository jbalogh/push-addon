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
        ws = new WebSocket(socket);
        ws.onopen = function() {
          ws.send('token: ' + token);
        };
        ws.onmessage = function(e) {
          self.port.emit('message', e.data);
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
      let msg = JSON.parse(msg);
      notifications.notify(msg.body);
  });

  observer.on('token', function(token) {
    worker.port.emit('token', main.DB.token);
  });
}
