const notifications = require('notifications'),
      pageWorker = require('page-worker'),
      observer = require('observer'),
      main = require('./main');


exports.worker = function() {
  var worker = pageWorker.Page({
    contentURL: 'about:blank',
    contentScript: 'new ' + function() {
      self.port.emit('load');

      self.port.on('token', function(token) {

        ws = new WebSocket('ws://localhost:8888');
        ws.onopen = function() {
          ws.send('token: ' + token);
        };
        ws.onmessage = function(e) {
          self.port.emit('message', e.data);
        };
      });
    }
  });

  worker.port.on('load', function() {
    if (main.DB.token) {
      worker.port.emit('token', main.DB.token);
    }
  });

  worker.port.on('message', function(msg) {
      let msg = JSON.parse(msg);
      notifications.notify(msg);
  });

  observer.on('token', function(token) {
    worker.port.emit('token', main.DB.token);
  });
}
