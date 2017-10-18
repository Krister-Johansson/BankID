'use strict';
const soap = require('soap');
const fs = require('fs');
const util = require('util');
const EventEmitter = require('events').EventEmitter;

const ClientSecurity = require('./ClientSecurity');

const testCert = fs.readFileSync(__dirname + '/certificates/test.crt');
const prodCert = fs.readFileSync(__dirname + '/certificates/production.crt');

const _get = function (obj, key) {
    return key.split(".").reduce(function (o, x) {
        return (typeof o == "undefined" || o === null) ? o : o[x];
    }, obj);
}

const _btoa = function (text) {
    return new Buffer(text).toString('base64');
}

const _getErrorDetails = function (err) {

    var fault = _get(err, 'root.Envelope.Body.Fault.detail.RpFault');

    return {
        status: fault.faultStatus,
        description: fault.detailedDescription
    }
}

const BankID = function (config) {
    var self = this;
    this.isReady = false;
    this.checkStatus = null;
    this.PFX = Buffer.isBuffer(config.pfx) ? config.pfx : fs.readFileSync(config.pfx);
    this.PASSPHRASE = config.passphrase;

    this.TEST = config.test;
    this.CERT = this.TEST ? testCert : prodCert;
    this.HOST = this.TEST ? 'appapi2.test.bankid.com' : 'appapi2.bankid.com';
    this.PATH = '/rp/v4';
    var wsdlUrl = 'https://' + this.HOST + this.PATH + '?wsdl';

    var soapOptions = {
        wsdl_options: {
            pfx: this.PFX,
            passphrase: this.PASSPHRASE,
            ca: this.CERT,
        },
    }

    soap.createClient(wsdlUrl, soapOptions, (err, client) => {
        self.emit('connecting');
        if (err) {
            self.emit('error', err);
            clearInterval(self.checkStatus);
        } else {
            client.setSecurity(new ClientSecurity(
                this.PFX,
                this.PASSPHRASE,
                this.CERT
            ));

            this.client = client;
            this.isReady = true;
            self.emit('connected');
        }
    });
}

BankID.prototype.Authenticate = function (options) {
    const self = this;

    var params = {
        personalNumber: options.personalNumber,
        endUserInfo: options.endUserInfo ? options.endUserInfo : undefined,
        requirementAlternatives: options.requirementAlternatives ? options.requirementAlternatives : undefined,
    }

    self.client.Authenticate(params, (err, result, raw, soapHeader) => {
        if (err) {
            self.emit('error', _getErrorDetails(err));
            clearInterval(self.checkStatus);
        } else {
            self.emit('authenticate', result);
            self.Collect(result.orderRef);
        }
    });
}

BankID.prototype.Sign = function (options) {
    const self = this;

    var params = {
        personalNumber: options.personalNumber,
        endUserInfo: options.endUserInfo ? options.endUserInfo : undefined,
        requirementAlternatives: options.requirementAlternatives ? options.requirementAlternatives : undefined,
        userVisibleData: _btoa(options.userVisibleData),
        userNonVisibleData: options.userNonVisibleData ? options.userNonVisibleData : undefined,
    }

    self.client.Sign(params, (err, result, raw, soapHeader) => {
        if (err) {
            self.emit('error', _getErrorDetails(err));
            clearInterval(self.checkStatus);
        } else {
            self.emit('sign', result);
            self.Collect(result.orderRef);
        }
    });
}

BankID.prototype.Collect = function (orderRef) {
    const self = this;
    self.checkStatus = setInterval(function () {
        self.client.Collect(orderRef, (err, result, raw, soapHeader) => {
            if (err) {
                self.emit('error', _getErrorDetails(err));
                clearInterval(self.checkStatus);
            } else {
                switch (result.progressStatus) {
                    case 'OUTSTANDING_TRANSACTION':
                        self.emit('outstanding_transaction', result);
                        break;
                    case 'NO_CLIENT':
                        self.emit('no_client', result);
                        break;
                    case 'STARTED':
                        self.emit('started', result);
                        break;
                    case 'USER_SIGN':
                        self.emit('user_sign', result);
                        break;
                    case 'USER_REQ':
                        self.emit('user_req', result);
                        break;
                    case 'COMPLETE':
                        self.emit('complete', result);
                        clearInterval(self.checkStatus);
                        break;
                    default:
                        self.emit('error', { status: 'COLLECT', description: 'Unable to find progressStatus' });
                        clearInterval(self.checkStatus);
                        break;
                }
            }
        });
    }, 1000);
}

util.inherits(BankID, EventEmitter);

module.exports = BankID; 