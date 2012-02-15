const {Cc, Ci, Cu, Cm, Cr} = require('chrome');

var tmp = {};
Cu.import('resource://gre/modules/Services.jsm', tmp);
Cu.import("resource://gre/modules/XPCOMUtils.jsm", tmp);
var {Services, XPCOMUtils} = tmp;


const PushApiContract = '@mozilla.org/push/mozPush;1';
const PushApiClassId = Components.ID('{29c6a16b-18d1-f749-a2c7-fa23e70daf2b}');

function PushApi() {};
PushApi.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIDOMGlobalPropertyInitializer]),
  classID: PushApiClassId,

  init: function(aWindow) {
    let self = this;

    let chromeObject = {
      requestRemotePermission: function() {
        console.log('request remote');
      },
      checkRemotePermission: function() {
        console.log('check remote');
      },

      __exposedProps__: {
        requestRemotePermission: 'r',
        checkRemotePermission: 'r'
      }
    };

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

let PushApiFactory = {
  createInstance: function(outer, iid) {
    if (outer !== null) throw Cr.NS_ERROR_NO_AGGREGATION;
    return new PushApi().QueryInterface(iid);
  }
};


exports.main = function() {
  Cm.QueryInterface(Ci.nsIComponentRegistrar).registerFactory(
    PushApiClassId, 'PushApi', PushApiContract, PushApiFactory
  );

  Cc['@mozilla.org/categorymanager;1'].getService(Ci.nsICategoryManager)
    .addCategoryEntry('JavaScript-navigator-property', 'mozPush',
                      PushApiContract, false, true);
}
