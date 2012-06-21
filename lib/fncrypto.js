/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Author: jr conlin
 */
"use strict";
const DB = require('simple-storage').storage,
      sjcl = require('sjcl');

const {Cu} = require('chrome');
/*defines:
 * Tracker, Store, Engine
 */
Cu.import('resource://services-sync/engines.js');
/*defines:
 * CryptoWrapper (base for Record)
 */
Cu.import('resource://services-sync/record.js');
/*defines:
 * Weave (core Sync class)
 */
Cu.import('resource://services-sync/main.js');
/*defines:
 * Utils
 */
Cu.import('resource://services-sync/util.js');


/** FNCrypto
 *
 *  Firefox Notifications Crypto plugin
 *
 *  This provides a way to exchange secure messages with a providing url,
 *  but not allow the carrier to decrypt them.
 *
 */

/* Instance of FNCrypto
 * used as a convenience pointer.
 */
var fnc = undefined;

function FNCryptoException(message) {
        this.message = message;
};

FNCryptoException.prototype = new Error;

var FNCrypto = function() {
    var self = this;

    self._bitSize = 256;
    self._myAppName = 'fnCryptoClient';

    /** generate a string of random characters
     *
     * @param bitLen bit length of string to generate (defaults to self._bitSize)
     *
     * @returns {string} a string containing random characters
     */
    var _randString = function(bitLen) {
        var val="";
        bitLen = bitLen || self._bitSize;
        //var chars = sjcl.codec.base64._chars;
        var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        var charsLen = chars.length;
        for (var i=0; i < bitLen/8; i++) {
            val += chars[Math.floor(Math.random() * charsLen)];
        }
        return val;
    }

    /** Generate a new site key
     *
     * @returns {long} a 256bit random number
     */
    var _newSiteKey = function() {
        return Math.round(Math.random() * Math.pow(2, 256));
    }

    /** Generate a key name for the stored URL+postfix
     *
     * @param url The url associated with the record
     * @param postfix (optional) additional information to use for this record id
     */
    var _keyName = function(url, postfix) {
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

    /** return an item from "storage"
     * This does automatic JSON encode/decode
     *
     * @param key index name to pull
     * @returns Object stored value
     */
    var _getItem = function(key) {
        if (key == undefined) {
            key = self._keyName();
        }
        var storeInfo = DB[key];
        if (storeInfo != undefined) {
            storeInfo = JSON.parse(storeInfo);
        }
        return storeInfo;
    }

    /** Store a value into local data store.
     *
     * This does automatic JSON encode/decode
     *
     * @param key index value
     * @param value Object to store
     */
    var _setItem = function(key, info) {
        info['modified'] = new Date().getTime();
        DB[key] = JSON.stringify(info);
        /* track mods */
        //self._setMod(key,'m');
        /* since this is only called on creation or modify, good point to
         * invoke the sync tracker.
         * Could also be invoked via Weave.Engines.get('fnsync').tracker
         */
        if (trackerInstance) {
            trackerInstance.addChangedID(key);
            trackerInstance.score = 100;
        }
    }

    var _deleteStorage = function(key) {
        delete DB[key];
    }

    var _genUrl = function(){
        return self.window.location.protocol + self.window.location.host;
    }

    // -- Public functions

    /** retrieve/generate the "key bundle" for this url.
     *
     * Key Bundle is an object that contains critical private encryption
     * info.
     *
     * @param url The URL associated with this keybundle
     *
     * @returns {object} Key Bundle consists of an object containing:
     * "url" the originating url.
     * "encryptionKey": Encryption/Decryption key.
     * "hmac": HMAC value for signing the cipherText
     */
    self.getKeyBundle = function(url) {
        var keyBundle;
        if (url == undefined) {
            console.error('FNCrypto: getKeyBundle undefined url');
            url = _genUrl();
        }
        keyBundle = _getItem(_keyName(url));
        if (keyBundle != undefined) {
            return keyBundle
        }
        // sljc uses ecb encryption. 
        var info = self._myAppName + "-AES_256_ECB-HMAC256" + url;
        var urlKey = _newSiteKey();
        var encryptionKey = sjcl.codec.hex.fromBits(
                sjcl.hash.sha256.hash(urlKey + info + "\x01"));
        var keyBundle = {'url': url,
            'created': new Date().getTime(),
            'encryptionKey': encryptionKey,
            'hmac': sjcl.codec.hex.fromBits(
                    sjcl.hash.sha256.hash(encryptionKey + info + "\x02"))};
        _setItem(_keyName(url), keyBundle);
        return keyBundle;
    }

    /** Encrypt notification content.
     *
     * @param {String} plainText A string containing content to send
     * @param {String} url A string containing the SOURCE url.
     * @param {Object} keyBundle (optional) key bundle to use instead of one registered for url
     * @param {Number} iv (optional) Initialization Vector to use.
     *
     * @returns {Object} Cryptoblock for notification.
     * The cryptoBlock is an object that contains the following:
     * { 'iv': base64 encoded Init Vector for this block.
     *   'cipherText': base64 encoded, AES encrypted text
     *   'hmac': HMAC for the cypherText derived from the keyBundle HMAC
     * }
     */
    self.encrypt = function(plainText, url, keyBundle, iv) {
        if (plainText == undefined) {
            throw new FNCryptoException('nothing to encrypt');
        }
        if (url == undefined) {
            url = _genUrl();
        }
        if (keyBundle == undefined) {
            keyBundle = self.getKeyBundle(url);
        }
        if (iv == undefined) {
            iv = sjcl.codec.base64.toBits(_randString());
        }
        var key = sjcl.hash.sha256.hash(
                sjcl.codec.hex.fromBits(
                    sjcl.codec.hex.toBits(keyBundle.encryptionKey).concat(iv)));
        var aes = new sjcl.cipher.aes(key);
        var ptArray = sjcl.codec.utf8String.toBits(plainText);
        // bring the array to a 4 byte boundry
        if (ptArray.length % 4 != 0) {
            for (var i=(ptArray.length % 4); i < 4; i++) {
                ptArray = ptArray.concat(0);
        }
        var ptArrayLen = ptArray.length;
        var bag = [];
        for (var i=0; i < ptArrayLen; i += 4) {
            var items = ptArray.splice(0, 4);
            aes.encrypt(items).forEach(function(v){bag.push(v)});
        }
        var cipherText = sjcl.codec.base64.fromBits(bag);
        var hmac = sjcl.codec.hex.fromBits(
                sjcl.hash.sha256.hash(keyBundle.hmac + cipherText + url));
        return {'iv': sjcl.codec.base64.fromBits(iv),
            'cipherText': cipherText,
            'url': url,
            'hmac': hmac}
    }

    /** Decrypt content returned from an "encrypt" call.
     *
     * @param url origin url.
     * @param cryptBlock the encrypted info
     * @param keyBundle optional keyBundle to use instead of the one stored for url
     *
     * The cryptBlock is an object that contains the following:
     * { 'iv': base64 encoded Init Vector for this block.
     *   'cipherText': base64 encoded, AES encrypted text
     *   'hmac': HMAC for the cypherText derived from the keyBundle HMAC
     * }
     *
     * @returns {object} containing:
     * {
     *   'plainText': The UTF8 encoded string containing the decrypted content.
     * }
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
                url = _genUrl();
            }
        }
        if (keyBundle == undefined) {
            keyBundle = self.getKeyBundle(url);
        }
        /* check the hmac
        */
        var localmac = sjcl.codec.hex.fromBits(
                sjcl.hash.sha256.hash(keyBundle.hmac + 
                    cryptBlock.cipherText + url));
        if (localmac != cryptBlock.hmac) {
            throw new FNCryptoException('bad mac');
        }
        var iv = sjcl.codec.base64.toBits(cryptBlock.iv);
        var key = sjcl.hash.sha256.hash(
                sjcl.codec.hex.fromBits(
                    sjcl.codec.hex.toBits(keyBundle.encryptionKey).concat(iv)));
        console.debug('encKey:', keyBundle.encryptionKey);
        console.debug('    iv:', sjcl.codec.hex.fromBits(iv));
        console.debug('   Key:', sjcl.codec.hex.fromBits(key));
        var aes = new sjcl.cipher.aes(key);
        /* Nulls can appear at the end of strings as padding. Strip those
        */
        var ptArray = sjcl.codec.base64.toBits(cryptBlock.cipherText);
        console.info('  Block:', sjcl.codec.hex.fromBits(ptArray)), 
            ' Len:', ptArray.length);
        if (ptArray.length % 4 != 0) {
            for (var i=(ptArray.length % 4); i < 4; i++){
                ptArray = ptArray.concat(0);
            }
        }
        var ptArrayLen = ptArray.length;
        console.info('fixedLen:', ptArrayLen;
        var bag = [];
        for (var i=0; i < ptArrayLen; i += 4) {
            var items = ptArray.splice(0, 4);
            console.info('Decrypting', json.stringify(items));
            try{
                aes.decrypt(items).forEach(function(v){bag.push(v)});
            } catch (e) {
                console.error('AES error', e, ptArray.length, ptArray);
            }
        }
        var plainText = sjcl.codec.utf8String.fromBits(bag);
        // Strip the extra padding off the end of the plaintext. 
        plainText = plainText.replace(/[\x00-\x10]+$/,'');
        var result = {
            'plainText': sjcl.codec.utf8String.fromBits(bag).replace(/\x00*$/, '')};
        console.info(' plain:', result);
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

    /** Simple check to see if we have any info for this URL
     *
     * @param url URL to check
     *
     * @returns {bool} return "true" if data exists.
     */
    function isRegistered(url) {
        return _getItem(_keyName(url)) !=  undefined;
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
    CryptoWrapper.call(this, moduleName, recordId);
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
let trackerInstance = undefined;


/** Storage mechanism
 *
 * This is the workhorse of Sync responsible for marshalling sync objects to
 * however they are being stored.
 */
function FNSyncStore(moduleName) {
    Store.call(this, moduleName);
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
        var record = new FNSyncRecord(moduleName, recordId);
        if(DB[recordId]) {
            /* Again, if we had multiple fields, make sure you set them here.
            */
            record.keyBundle = DB[recordId];
            return record;
        }
        return undefined;
    },

    changeItemID: function(oldId, newId) {
        DB[newId] = DB[oldId];
        delete DB[oldId];
    },

    getAllIDs: function() {
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

    /*Delete everything from local storage.
    */
    wipe: function() {
        for (var i in self.getAllIDs()){
            delete DB[i];
        }
    },

    /* Create a new record.
     * Note: simple-store does not write out the record immediately.
     * In addition, it stores the data in an unprotected flat file.
     * May need to revisit that.
    */
    create: function(record) {
        DB[record.id] = record.payload;
    },

    /* Update a record from the info passed.
    */
    update: function(record) {
        DB[record.id] = record.payload;
    },

    remove: function(recrd) {
        delete DB[record.id];
    }
}


/** Track changes
 *
 * Tracker is used to monitor things and invoke builders. Only some of this
 * is automagic. Other bits... aren't.
 */
function FNSyncTracker(moduleName){
    Tracker.call(this, moduleName);
    trackerInstance = this;
}

/* We know when to trigger this, so no observer required.
*/
FNSyncTracker.prototype = {
        __proto__: Tracker.prototype,

        /** In theory (and documentation) there's an "observe" method that
         * is supposed to handle events. Sadly, jetpack sandboxes the extension
         * so that it
         */
        track: function(recordId){
            /* Add the record to the list of items that have changed.
            */
            this.addChangedID(recordId);
            /* Any dirty records need to be propagated as soon as possible.
             * thus the immediate "100"
            */
            this.score = 100;
        }
}

/** The main Sync engine.
*/
function FNSyncEngine() {
        // Defining "moduleName" here so that it's easy to figure out where
        // it comes from. This is case insensitive.
        var moduleName = "FNSync";
        Weave.SyncEngine.call(this, moduleName);
        // turn the engine on. Jetpack prevents this by default.
        this.enabled = true;

}
FNSyncEngine.prototype = {
        __proto__: Weave.SyncEngine.prototype,
        _storeObj: FNSyncStore,
        _recordObj: FNSyncRecord,
        _trackerObj: FNSyncTracker,
        version: 1
};


/* Register the engine with Sync. */
Weave.Engines.register(FNSyncEngine);

/* Jetpack 'helpfully' sandboxes extensions. This messes up how Sync wants
 * to communicate and do things. For instance, observer services don't always
 * appear to send all messages to the callback. (...ready works, start/stop
 * do not), or prevent some data from being propagated (the ready flag
 * returns null).
 */
//const observerService = require("observer-service");
//observerService.add("weave:engine:ready", trackerInstance.observe);
//observerService.add("weave:engine:start-tracking", trackerInstance.observe);
//observerService.add("weave:engine:stop-tracking", trackerInstance.observe);

//Svc.Obs.add("weave:service:ready", FNSyncTracker);
//Svc.Obs.add("weave:engine:start-tracking", FNSyncTracker);
//Svc.Obs.add("weave:engine:stop-tracking", FNSyncTracker);

/* Define exportable functions for this module
*/
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
