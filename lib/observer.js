const {Cu} = require('chrome');

var tmp = {};
Cu.import('resource://gre/modules/Services.jsm', tmp);
var {Services} = tmp;


function Observer(cb) {
  this.cb = cb;
}
Observer.prototype = {
  observe: function(msg, topic) {
    this.cb(msg.wrappedJSObject, topic);
  }
};

exports.on = function(topic, cb) {
  Services.obs.addObserver(new Observer(cb), topic, false);
};

exports.emit = function(topic, data) {
  let e = {wrappedJSObject: {data: data}};
  Services.obs.notifyObservers(e, topic, null);
}
