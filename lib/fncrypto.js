"use strict";
const DB = require('simple-storage').storage;
const sjcl = require('core');
var tabs = require('tabs');

// Instance of FNCrypto
var fnc = undefined;

/** FNCrypto
 *
 *  Firefox Notifications Crypto plugin
 *
 *  This provides a way to exchange secure messages with a providing site,
 *  but not allow the carrier to decrypt them.
 *
 */

    function FNCryptoException(message) {
            this.message = message;
    };

    FNCryptoException.prototype = new(Error);

    function FNCrypto() {
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

        self._keyName = function(site, postfix) {
            if (site == undefined) {
                site = self._getSite();
            }
            if (postfix == undefined) {
                postfix = '';
            }
            return 'fncrypto:kb:' + site + postfix;
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
        }

        self._getSite = function(){
            return self.window.location.protocol + self.window.location.host;
        }

        // -- Public functions

        /** retrieve/generate the "key bundle" for this site.

        Key Bundle consists of an object containing:
        "site" protocol:sitename of the originating site.
        "encryptionKey": Encryption/Decryption key.
        'hmac": HMAC value for signing the cipherText

        Content is currently stored in localStorage. Key Bundle is private and
        MUST NOT be shared.
        */
        self.getKeyBundle = function(site) {
            var keyBundle;
            if (site == undefined) {
                site = self._getSite();
            }
            keyBundle = self._getStorage(self._keyName(site));
            if (keyBundle != undefined) {
                return keyBundle
            }
            var info = self._myAppName + "-AES_256_CBC-HMAC256" + site;
            var siteKey = self._newSiteKey();
            var encryptionKey = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(siteKey + info + "\x01"));
            var keyBundle = {'site': site,
                'encryptionKey': encryptionKey,
                'hmac': sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(encryptionKey + info + "\x02"))};
            self._setStorage(self._keyName(site), keyBundle);
            return keyBundle;
        }

        self.encrypt = function(plainText, site, keyBundle, iv) {
            if (plainText == undefined) {
                throw new FNCryptoException('nothing to encrypt');
            }
            if (site == undefined) {
                site = self._getSite();
            }
            if (keyBundle == undefined) {
                keyBundle = self.getKeyBundle(site);
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
            var hmac = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(keyBundle.hmac + cipherText + site));
            return {'iv': sjcl.codec.base64.fromBits(iv),
                'cipherText': cipherText,
                'site': site,
                'hmac': hmac}
        }

        /** Decrypt content returned from an "encrypt" call.

        @param site    protocol + host name for origin site.
        @param cryptBlock the encrypted info
        @param keyBundle optional keyBundle to use instead of the one stored for site

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
        self.decrypt = function(cryptBlock, site, keyBundle) {
            if (typeof(cryptBlock) == "string") {
                cryptBlock = JSON.parse(cryptBlock);
            }
            if (cryptBlock == undefined) {
                return undefined;
            }
            if (site == undefined) {
                if (cryptBlock.hasOwnProperty('site')) {
                    site = cryptBlock.site;
                } else {
                    site = self._getSite();
                }
            }
            if (keyBundle == undefined) {
                keyBundle = self.getKeyBundle(site);
            }
            // check the hmac
            var localmac = sjcl.codec.hex.fromBits(sjcl.hash.sha256.hash(keyBundle.hmac + cryptBlock.cipherText + site));
            if (localmac != cryptBlock.hmac) {
                throw new FNCryptoException('bad mac');
            }
            var iv = sjcl.codec.base64.toBits(cryptBlock.iv);
            var key = sjcl.hash.sha256.hash(sjcl.codec.hex.fromBits(sjcl.codec.hex.toBits(keyBundle.encryptionKey).concat(iv)));
            var aes = new sjcl.cipher.aes(key);
            // Nulls can appear at the end of strings as padding. Strip those
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
            // try to parse the plaintext as JSON.
            try {
                result['json'] = JSON.parse(result.plainText);
            } catch (e) {
                // Couldn't convert to JSON. Non-fatal.
            }
            return result;
        }

        function isRegistered(site) {
            return self._getStorage(self._keyName(site)) !=  undefined;
        }
    };

exports.encrypt = function(plainText, site, keyBundle, iv) {
    if (fnc == undefined) {
        fnc = new FNCrypto();
    }
    return fnc.encrypt(plainText, site, keyBundle, iv);
};

exports.decrypt = function(cryptBlock, site, keyBundle) {
    if (fnc == undefined) {
        fnc = new FNCrypto();
    }
    return fnc.decrypt(cryptBlock, site, keyBundle);
};

exports.getKeyBundle = function(site) {
    if (fnc == undefined) {
        fnc = new FNCrypto();
    }
    return fnc.getKeyBundle(site);
};

exports.isRegistered = function(site) {
    if (fnc == undefined) {
        fnc = new FNCrypto();
    }
    return fnc.isRegistered(site);
};
