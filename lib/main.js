"use strict";
const {Cc, Ci, Cu, Cm, Cr} = require('chrome'),
      DB = require('simple-storage').storage,
      prefs = require('simple-prefs').prefs,
      observer = require('observer'),
      SERVER_PREF = 'push.server',
      fnc = require('fncrypto');


var tmp = {};
Cu.import('resource://gre/modules/Services.jsm', tmp);
Cu.import("resource://gre/modules/XPCOMUtils.jsm", tmp);
var {Services, XPCOMUtils} = tmp;


function xhr(opts) {
  let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
              .createInstance(Ci.nsIXMLHttpRequest);
  xhr.open(opts.method, opts.url, true);
  xhr.addEventListener('load', function() {
    if (xhr.status == 200) {
      opts.success(xhr);
    } else if (opts.error) {
      opts.error(xhr);
    }
  });
  if (opts.headers) {
    for (let key in opts.headers) {
      xhr.setRequestHeader(key, opts.headers[key]);
    }
  }
  xhr.addEventListener('error', function(){ opts.error(xhr); });
  xhr.send(opts.data || null);
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
}
NotificationApi.prototype = {
  requestRemotePermission: function() {
    let self = this,
        request = new DOMRequest(self.window);

    let action = {
      label: "yes yes yes",
      accessKey: "y",
      callback: function(){
        self.getToken(function(token) {
          self.getQueue(token, self.window.location.hostname, request);
        });
      }
    };

    let wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    let chromeWindow = wm.getMostRecentWindow("navigator:browser");
    chromeWindow.PopupNotifications.show(
        chromeWindow.gBrowser.selectedBrowser,
        "request-remote-permission",
        "Would you like to receive push notifications from " + self.window.location.hostname + "?",
        null,
        action,
        [],
        {popupIconURL: "chrome://browser/skin/Geolocation-64.png"});

    return request;
  },

  checkRemotePermission: function() {
    let request = new DOMRequest(this.window),
        url = DB['queue:' + this.window.location.hostname];
    request.result.url = url;
    // add crypto elements
    if (url) {
        let kb = fnc.getKeyBundle(url);
        if (kb) {
            request.result['encryptionKey'] = kb.encryptionKey;
            request.result['hmac'] = kb.hmac;
        } else {
            request.dispatch('failure');
        }
    }
    request.dispatch('success');
    return request;
  },

  getToken: function(cb) {
    let self = this;
    if (DB['token']) {
      return cb(DB['token']);
    }
    xhr({method: 'POST',
         url: prefs[SERVER_PREF] + '/token/',
         success: function(xhr) {
           DB.token = JSON.parse(xhr.responseText).token;
           observer.emit('token', DB.token);
           cb(DB.token);
         },
         error: function (xhr) {
            console.error('getToken: failed', JSON.stringify(xhr));
         }
    });
  },

  getQueue: function(token, hostname, request) {
    var self = this,
        url = DB['queue:' + hostname];

    if (url) {
      request.result.url = url;
      let kb = fnc.getKeyBundle(url);
      request.result['encryptionKey'] = kb.encryptionKey;
      request.result['hmac'] = kb.hmac;
      request.dispatch('success');
      return;
    }

    xhr({
      method: 'POST',
      url: prefs[SERVER_PREF] + '/queue/',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      data: 'domain=' + hostname + '&token=' + token,
      success: function(xhr) {
        let url = JSON.parse(xhr.responseText).queue,
            queue = url.split('/')[url.split('/').length - 2];
        DB['queue:' + hostname] = url;
        DB['domain:' + queue] = hostname;

        request.result.url = url;
        let kb = fnc.getKeyBundle(url);
        if (kb) {
            request.result['encryptionKey'] = kb.encryptionKey;
            request.result['hmac'] = kb.hmac;
        }
        request.dispatch('success');
      }
    });
  },

  __exposedProps__: {
    requestRemotePermission: 'r',
    checkRemotePermission: 'r'
  }
};


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

  require('./worker').worker();
  require('./ui').ui();
  require('./ui').model();

  if (DB.version !== 2) {
    for (var key in DB) {
      delete DB[key];
    }
    DB.messages = [];
    DB.version = 2;
  }
};

exports.onUnload = function() {

  Cm.QueryInterface(Ci.nsIComponentRegistrar)
    .unregisterFactory(NotificationApiClassId, NotificationApiFactory);
  Cc['@mozilla.org/categorymanager;1'].getService(Ci.nsICategoryManager)
    .deleteCategoryEntry('JavaScript-navigator-property', 'mozNotification', false);
};

exports.DB = DB;
