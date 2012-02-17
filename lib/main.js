const {Cc, Ci, Cu, Cm, Cr} = require('chrome');
const DB = require('simple-storage').storage;

var tmp = {};
Cu.import('resource://gre/modules/Services.jsm', tmp);
Cu.import("resource://gre/modules/XPCOMUtils.jsm", tmp);
var {Services, XPCOMUtils} = tmp;


function Storage(aWindow) {
  this.window = aWindow;
}
Storage.prototype = {
  getQueue: function(cb) {
    let loc = this.window.location.hostname,
        url = DB['queue:' + loc];
    cb(url);
  },

  setQueue: function(val) {
    let loc = this.window.location.hostname;
    DB['queue:' + loc] = val;
  },
}


function DOMRequest(aWindow) {
  this.window = aWindow;
  this.result = {};
  this.success = [];
  this.error = [];
  this.dispatched = false;
}
DOMRequest.prototype = {
  set onsuccess(f) {
    if (this.dispatched == 'success') {
      f({target: this});
    } else {
      this.success.push(f);
    }
  },
  set onerror(f) {
    if (this.dispatched == 'error') {
      f({target: this});
    } else {
      this.error.push(f);
    }
  },

  dispatch: function(type) {
    let callbacks = this[type];
    if (callbacks) {
      for (let i = 0; i < callbacks.length; i++) {
        callbacks[i]({target: this});
      }
    }
    this.dispatched = type;
  }
};


function NotificationApi(aWindow) {
  this.window = aWindow;
  this.storage = new Storage(aWindow);
}
NotificationApi.prototype = {
  requestRemotePermission: function() {
  },

  checkRemotePermission: function() {
    let request = new DOMRequest(this.window);
    this.storage.getQueue(function(url) {
      request.result.url = url;
      request.dispatch('success');
    });
    return request;
  },

  __exposedProps__: {
    requestRemotePermission: 'r',
    checkRemotePermission: 'r'
  }
}


/************************
 * Firefox boilerplate. *
 ************************/
const NotificationApiContract = '@mozilla.org/push/mozNotification;1';
const NotificationApiClassId = Components.ID('{29c6a16b-18d1-f749-a2c7-fa23e70daf2b}');

function NotificationInterface() {};
NotificationInterface.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMGlobalPropertyInitializer]),
  classID: NotificationApiClassId,

  init: function(aWindow) {
    let self = this;

    let chromeObject = new NotificationApi(aWindow);

    function genPropDesc(f) {
      return {enumerable: true, configurable: true, writable: true,
              value: chromeObject[f].bind(chromeObject)};
    }
    const properties = {
      requestRemotePermission: genPropDesc('requestRemotePermission'),
      checkRemotePermission: genPropDesc('checkRemotePermission'),
    };

    let contentObj = Cu.createObjectIn(aWindow);
    Object.defineProperties(contentObj, properties);
    Cu.makeObjectPropsNormal(contentObj);
    return contentObj;
  }
};

let NotificationApiFactory = {
  createInstance: function(outer, iid) {
    if (outer !== null) throw Cr.NS_ERROR_NO_AGGREGATION;
    return new NotificationInterface().QueryInterface(iid);
  }
};


exports.main = function() {
  Cm.QueryInterface(Ci.nsIComponentRegistrar).registerFactory(
    NotificationApiClassId, 'NotificationInterface',
    NotificationApiContract, NotificationApiFactory
  );

  Cc['@mozilla.org/categorymanager;1'].getService(Ci.nsICategoryManager)
    .addCategoryEntry('JavaScript-navigator-property', 'mozNotification',
                      NotificationApiContract, false, true);
}
