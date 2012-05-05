"use strict";
const DB = require('simple-storage').storage,
      sjcl = require('core');

const {Cu} = require('chrome');
Cu.import("resource://services-common/async.js");
Cu.import('resource://services-sync/engines.js');
Cu.import('resource://services-sync/record.js');
Cu.import('resource://services-sync/main.js');
Cu.import('resource://services-sync/util.js');
console.debug("########### Initializing fncrypto.js");
var tabs = require('tabs');

/* Instance of FNCrypto
*/
var fnc = undefined;

/** FNCrypto
 *
 *  Firefox Notifications Crypto plugin
 *
 *  This provides a way to exchange secure messages with a providing url,
 *  but not allow the carrier to decrypt them.
 *
 */

    function FNCryptoException(message) {
            this.message = message;
    };

    FNCryptoException.prototype = new(Error);

    var FNCrypto = function() {
        var self = this;

        self._bitSize = 256;
        self._myAppName = 'fnCryptoClient';

        /** generate a sting of random characters

        @param bitLen bit length of string to generate (defaults to self._bitSize)
        */
        self._randString = function(bitLen) {
            var val="";
            if (bitLen == undefined) {
                bitLen = self._bitSize;
            }
            //var chars = sjcl.codec.base64._chars;
            var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            var charsLen = chars.length;
            for (var i=0; i < bitLen/8; i++) {
                val += chars[Math.floor(Math.random() * charsLen)];
            }
            return val;
        }

        self._newSiteKey = function() {
            var bits = 0;
            return Math.round(Math.random() * Math.pow(2, 256));
        }

        self._keyName = function(url, postfix) {
            if (url == undefined) {
                url = self._genUrl();
            }
            if (postfix == undefined) {
                postfix = '';
            }
            /* Sync has a key size limit, so use a SHA1 for the url value
            */
            var key = Utils.sha1(url+postfix);
            return 'fncrypto:kb:' + key;
        }

        self._getStorage = function(key) {
            if (key == undefined) {
                key = self._keyName();
            }
            var storeInfo = DB[key];
            if (storeInfo != undefined) {
                storeInfo = JSON.parse(storeInfo);
            }
            return storeInfo;
        }

        self._setStorage = function(key, info) {
            DB[key] = JSON.stringify(info);
            /* since this is only called on creation or modify, good point to
             * invoke the sync tracker.
             * Could also be invoked via Weave.Engines.get('fnsync').tracker
             */
            if (trackerInstance) {
                console.debug('setting Sync Tracking for ', key)
                trackerInstance.addChangedID(key);
                trackerInstance.score = 100;
            }
        }

        self._deleteStorage = function(key) {
            delete DB[key];
        }

        self._genUrl = function(){
            return self.window.location.protocol + self.window.location.host;
        }

        // -- Public functions

        /** retrieve/generate the "key bundle" for this url.

        Key Bundle consists of an object containing:
        "url" the originating url.
        "encryptionKey": Encryption/Decryption key.
        'hmac": HMAC value for signing the cipherText

        Content is currently stored in localStorage. Key Bundle is private and
        MUST NOT be shared.
        */
        self.getKeyBundle = function(url) {
            var keyBundle;
            if (url == undefined) {
                console.error('getKeyBundle undefined url');
                url = self._genUrl();
            }
            keyBundle = self._getStorage(self._keyName(url));
            if (keyBundle != undefined) {
                return keyBundle
            }
            var info = self._myAppName + "-AES_256_CBC-HMAC256" + url;
            var urlKey = self._newSiteKey();
            var encryptionKey = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(urlKey + info + "\x01"));
            var keyBundle = {'url': url,
                'encryptionKey': encryptionKey,
                'hmac': sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(encryptionKey + info + "\x02"))};
            self._setStorage(self._keyName(url), keyBundle);
            return keyBundle;
        }

        self.encrypt = function(plainText, url, keyBundle, iv) {
            if (plainText == undefined) {
                throw new FNCryptoException('nothing to encrypt');
            }
            if (url == undefined) {
                url = self._genUrl();
            }
            if (keyBundle == undefined) {
                keyBundle = self.getKeyBundle(url);
            }
            //
            if (iv == undefined) {
                iv = sjcl.codec.base64.toBits(self._randString());
            }
            var key = sjcl.hash.sha256.hash(sjcl.codec.hex.fromBits(sjcl.codec.hex.toBits(keyBundle.encryptionKey).concat(iv)));
            var aes = new sjcl.cipher.aes(key);
            var ptArray = sjcl.codec.utf8String.toBits(plainText);
            // bring the array to a 4 byte boundry
            if (ptArray.length % 4 != 0) {
                ptArray.concat([0,0,0].splice(0,ptArray.length % 4));
            }
            var ptArrayLen = ptArray.length;
            var bag = [];
            for (var i=0;i<ptArrayLen; i+=4) {
                var items = ptArray.splice(0,4);
                aes.encrypt(items).forEach(function(v){bag.push(v)});
            }
            var cipherText = sjcl.codec.base64.fromBits(bag);
            var hmac = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(keyBundle.hmac + cipherText + url));
            return {'iv': sjcl.codec.base64.fromBits(iv),
                'cipherText': cipherText,
                'url': url,
                'hmac': hmac}
        }

        /** Decrypt content returned from an "encrypt" call.

        @param url origin url.
        @param cryptBlock the encrypted info
        @param keyBundle optional keyBundle to use instead of the one stored for url

        The cryptBlock is an object that contains the following:
        { 'iv': base64 encoded Init Vector for this block.
            'cipherText': base64 encoded, AES encrypted text
            'hmac': HMAC for the cypherText derived from the keyBundle HMAC
        }

        @return an object containing:
        {
            'plainText': The UTF8 encoded string containing the decrypted content.
        }

        */
        self.decrypt = function(cryptBlock, url, keyBundle) {
            if (typeof(cryptBlock) == "string") {
                cryptBlock = JSON.parse(cryptBlock);
            }
            if (cryptBlock == undefined) {
                return undefined;
            }
            if (url == undefined) {
                if (cryptBlock.hasOwnProperty('url')) {
                    url = cryptBlock.url;
                } else {
                    url = self._genUrl();
                }
            }
            if (keyBundle == undefined) {
                keyBundle = self.getKeyBundle(url);
            }
            /* check the hmac
            */
            var localmac = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(keyBundle.hmac + cryptBlock.cipherText + url));
            if (localmac != cryptBlock.hmac) {
                throw new FNCryptoException('bad mac');
            }
            var iv = sjcl.codec.base64.toBits(cryptBlock.iv);
            var key = sjcl.hash.sha256.hash(sjcl.codec.hex.fromBits(sjcl.codec.hex.toBits(keyBundle.encryptionKey).concat(iv)));
            var aes = new sjcl.cipher.aes(key);
            /* Nulls can appear at the end of strings as padding. Strip those
            */
            var ptArray = sjcl.codec.base64.toBits(cryptBlock.cipherText);
            if (ptArray.length % 4 != 0) {
                ptArray.concat([0,0,0].splice(0,ptArray.length % 4));
            }
            var ptArrayLen = ptArray.length;
            var bag = [];
            for (var i=0; i < ptArrayLen; i += 4) {
                var items = ptArray.splice(0,4);
                aes.decrypt(items).forEach(function(v){bag.push(v)});
            }
            var result = {'plainText': sjcl.codec.utf8String.fromBits(bag).replace(/\x00*$/, '')};
            /* try to parse the plaintext as JSON.
            */
            try {
                result['json'] = JSON.parse(result.plainText);
                result['json']['url'] = url;
            } catch (e) {
                /* Couldn't convert to JSON. Non-fatal.
                */
            }
            return result;
        }

        function isRegistered(url) {
            return self._getStorage(self._keyName(url)) !=  undefined;
        }

        return {
            encrypt: this.encrypt,
            decrypt: this.decrypt,
            getKeyBundle: this.getKeyBundle,
            isRegistered: this.isRegistered
        }
    };

/* Sync Classes.
 *
 * The following are used by the Sync mechanism. I've commented them here since
 * the docs currently leave something to be desired.
 * (Hey, guess what I'll be doing later?)
 *
*/

/** The core Sync record.
 *
 * This is what gets transferred between us and them. It's worth noting
 * that the magical "cleartext" value is encoded for exchange.
 */
function FNSyncRecord(moduleName, recordId) {
    //console.debug('FNSyncRecord... ', moduleName, recordId);
    CryptoWrapper.call(this, moduleName, recordId);
    //console.debug(' ...Record created for', recordId);
}

FNSyncRecord.prototype = {
    __proto__: CryptoWrapper.prototype,
    _logName: "Record.FNCrypto"
};

/** Utility function to autobuild the the getter/setter functions.
 * The getter setters add values to the "cleartext" object. It's a toss up
 * whether or not to toss everything into a single value (what i did here)
 * or break things apart. The object is serialized by JSON.stringify in any
 * case so as long as the final output is a simple object, it's kind of
 * arbitrary. I'm using a single value here.
 */
Utils.deferGetSet(FNSyncRecord, "cleartext", ["keyBundle"]);

/* convienence pointers.
*/
//var engineInstance = undefined;
let trackerInstance = undefined;
//let storeInstance = undefined;


/** Storage mechanism
 *
 * This is the workhorse of Sync responsible for marshalling sync objects to
 * however they are being stored.
 */
function FNSyncStore(moduleName) {
    //console.debug('FNSyncStore... ');
    //console.debug('Store: ', Store);
    Store.call(this, moduleName);
    //storeInstance = this;
    //console.debug('   ...Store created', moduleName);
}

FNSyncStore.prototype = {
    __proto__: Store.prototype,
    self: this,

    itemExists: function(recordId) {
        return DB[recordId] != undefined;
    },

    /** Marshall an object into a Sync Record object.
    * Why are these values reversed from all the other creators?
    * Because sync code.
    */
    createRecord: function(recordId, moduleName) {
        //console.debug('storing record', recordId);
        var record = new FNSyncRecord(moduleName, recordId);
        //console.debug('  DB', DB[recordId]);
        if(DB[recordId]) {
            /* Again, if we had multiple fields, make sure you set them here.
            */
            record.keyBundle = DB[recordId];
            //console.debug('   returning', JSON.stringify(record))
            return record;
        }
        return undefined;
    },

    changeItemID: function(oldId, newId) {
        console.debug('Changing ID ', oldId, newId);
        DB[newId] = DB[oldId];
        delete DB[oldId];
    },

    getAllIDs: function() {
        //console.debug('######## Getting All the IDs!!!');
        /* It's important that this return an Object (a Dict/Hash)
        */
        var recordIds = {};
        for (var key in DB) {
            /* Only return keys that are actually pointing to values.
             * DB is a js object, so there can be all kinds of cruft in there.
            */
            if (key.indexOf('fncrypto:kb:') === 0) {
                /* The value stored is arbitrary. Only the key name is important.
                */
                recordIds[key]=true;
            }
        }
        return recordIds;
    },

    //Delete everything from local storage.
    wipe: function() {
        //console.debug('Wiping data');
        for (var i in self.getAllIDs()){
            delete DB[i];
        }
    },

    /* Create a new record.
    */
    create: function(record) {
        //console.debug('Creating a new record:', JSON.stringify(record));
        DB[record.id] = JSON.parse(record.payload);
    },

    /* Update a record from the info passed.
    */
    update: function(record) {
        //console.debug('Updating a record:', JSON.stringify(record));
        DB[record.id] = JSON.parse(record.payload);
    },

    remove: function(record) {
        //console.debug('Removing record:', JSON.stringify(record));
        delete DB[record.id];
    }
}


/** Track changes
 *
 * Tracker is used to monitor things and invoke builders. Only some of this
 * is automagic. Other bits... aren't.
 */
function FNSyncTracker(moduleName){
    //console.debug('###############FNSyncTracer... Tracker:', Tracker);
    Tracker.call(this, moduleName);
    trackerInstance = this;
    //console.debug('  ... Tracker created');
}

// We know when to trigger this, so no observer required.
FNSyncTracker.prototype = {
        __proto__: Tracker.prototype,
        /** In theory (and documentation) there's an "observe" method that
         * is supposed to handle events. It doesn't get called, or at least
         * I'm not sure how it's supposed to be triggered. For the time being
         * I'm leaving it out.
         */
        track: function(recordId){
            //console.debug("Adding tracking for ", recordId);
            /* Add the record to the list of items that have changed.
            */
            this.addChangedID(recordId);
            /* Any dirty records need to be propagated as soon as possible.
             * thus the immediate "100"
            */
            this.score = 100;
            //console.debug('Tracking: ',JSON.stringify(this));
        }
}

/** The main Sync engine.
*/
function FNSyncEngine() {
        //console.debug("FNSyncEngine...");
        // Defining "moduleName" here so that it's easy to figure out where
        // it comes from. This is case insensitive.
        var moduleName = "FNSync";
        Weave.SyncEngine.call(this, moduleName);
        //engineInstance = this;
        // turn the engine on(Why isn't this automatic?)
        this.enabled = true;
        //console.debug(" ...Engine created, Store: ", this._storeObj);
}
FNSyncEngine.prototype = {
        __proto__: Weave.SyncEngine.prototype,
        _storeObj: FNSyncStore,
        _recordObj: FNSyncRecord,
        _trackerObj: FNSyncTracker,
        version: 1
};


/* Register the engine with Sync. */
    //Svc.Obs.add("weave:service:ready", FNSyncTracker);
//console.debug("Weave ", Weave);
Weave.Engines.register(FNSyncEngine);
    /* Sadly, the observers don't seem to be working. */
    //Svc.Obs.add("weave:engine:start-tracking", FNSyncTracker);
    //Svc.Obs.add("weave:engine.stop-tracking", FNSyncTracker);

exports.encrypt = function(plainText, url, keyBundle, iv) {
    if (fnc == undefined) {
        fnc = new FNCrypto();
    }
    return fnc.encrypt(plainText, url, keyBundle, iv);
};

exports.decrypt = function(cryptBlock, url, keyBundle) {
    if (fnc == undefined) {
        fnc = new FNCrypto();
    }
    return fnc.decrypt(cryptBlock, url, keyBundle);
};

exports.getKeyBundle = function(url) {
    if (fnc == undefined) {
        fnc = new FNCrypto();
    }
    return fnc.getKeyBundle(url);
};

exports.isRegistered = function(url) {
    if (fnc == undefined) {
        fnc = new FNCrypto();
    }
    return fnc.isRegistered(url);
};

/*
exports.FNSyncTracker = FNSyncTracker;
exports.FNSyncRecord = FNSyncRecord;
exports.FNSyncEngine = FNSyncEngine;
exports.FNSyncStore = FNSyncStore;
*/