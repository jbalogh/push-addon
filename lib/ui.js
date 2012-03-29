const main = require('main'),
      observer = require('observer'),
      tabs = require('tabs');


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

  panel.port.on('click', function(url, bg) {
    if (url) {
      tabs.open({
        url: url,
        inBackground: bg
      });
    }
  });

  panel.port.on('delete', function(index) {
    panel.port.emit('delete', index);
    main.DB.messages.splice(index, 1);
  });

  observer.on('message:init', function(e) {
    panel.port.emit('message:init', e.data);
  });
  observer.on('message', function(e) {
    let msg = {
      title: e.data.body.title,
      body: e.data.body.body,
      time: e.data.timestamp * 1000,
      actionUrl: e.data.body.actionUrl,
      site: main.DB['domain:' + e.data.queue]
    };
    main.DB.messages.push(msg);
    panel.port.emit('message', msg);
  });
  observer.on('count', function(e) {
    widget.port.emit('count', e.data);
  });
};

exports.model = function() {
  let intro = {
    title: 'Thanks for installing the add-on!',
    body: 'Click on this message to read more about notifications.',
    time: new Date(),
    actionUrl: 'http://jbalogh.me/2012/01/30/push-notifications/?addon',
    site: 'Intro'
  };

  let messages = main.DB.messages || (main.DB.messages = [intro]),
      count = 'count' in main.DB ? main.DB.count : messages.length;

  observer.emit('message:init', messages);
  observer.emit('count', count);

  observer.on('message', function(e) {
    observer.emit('count', ++count);
  });

  observer.on('panel:hide', function() {
    count = 0;
    observer.emit('count', count);
  });

  observer.on('count', function(e) {
    main.DB.count = e.data;
  });
};
