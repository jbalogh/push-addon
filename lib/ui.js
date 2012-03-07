const main = require('main'),
      observer = require('observer');


exports.ui = function() {
  let data = require('self').data;

  let panel = require('panel').Panel({
    contentURL: data.url('panel.html'),
    contentScriptFile: [data.url('prettyTime.js'),
                        data.url('mustache.js'),
                        data.url('panel.js')],
    width: 420,
    height: 400,
    onHide: function() { observer.emit('panel:hide'); }
  });

  let widget = require('widget').Widget({
    id: 'notifications',
    label: 'Notification Center',
    width: 20,
    contentURL: data.url('widget.html'),
    contentScriptFile: data.url('widget.js'),
    panel: panel
  });

  observer.on('message:init', function(e) {
    panel.port.emit('message:init', e.data);
  });
  observer.on('message', function(e) {
    panel.port.emit('message', e.data);
  });
  observer.on('count', function(e) {
    widget.port.emit('count', e.data);
  });
};

exports.model = function() {
  let messages = main.DB.messages || (main.DB.messages = []),
      count = messages.length;

  observer.emit('message:init', messages);
  observer.emit('count', count);

  observer.on('message', function(e) {
    main.DB.messages.push(e);
    observer.emit('count', ++count);
  });

  observer.on('panel:hide', function() {
    count = 0;
    observer.emit('count', count);
  });
};
