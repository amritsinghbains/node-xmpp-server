'use strict';

var util = require('util')
  , SRV = require('node-xmpp-core').SRV
  , Connection = require('node-xmpp-core').Connection
  , Server = require('./server')
  , debug = require('debug')('xmpp:s2s:outserver')

var NS_XMPP_SASL = 'urn:ietf:params:xml:ns:xmpp-sasl'

var OutgoingServer = function(srcDomain, destDomain, credentials) {
    debug(util.format('establish an outgoing S2S connection from %s to %s', srcDomain, destDomain))

    this.streamId = null

    var streamAttrs = {}
    streamAttrs.version = '1.0'

    Server.call(this, {streamAttrs: streamAttrs})

    this.streamTo = destDomain

    // For outgoing, we only need our own cert & key
    this.credentials = credentials

    // No credentials means we cannot <starttls/> on the server
    // side. Unfortunately this is required for XMPP 1.0.
    if (!this.credentials) delete this.xmppVersion

    this.on('connect', function() {
        debug('connected to remote server: ' + this.streamTo)
        //this.startParser()
        this.startStream()
    })

    this.on('streamStart', function(attrs) {
        debug('streamStart and emit event ' + JSON.stringify(attrs))
        if (attrs.version !== '1.0') {
            // Don't wait for <stream:features/>
            this.emit('auth', 'dialback')
        }

        // extract stream id
        this.streamId = attrs.id
    })

    this.on('stanza', function(stanza) {
        debug('recieved stanza' + stanza.toString())
        if (stanza.is('features', Connection.NS_STREAM)) {
            debug('send features')
            var mechsEl
            if ((mechsEl = stanza.getChild('mechanisms', NS_XMPP_SASL))) {
                var mechs = mechsEl
                    .getChildren('mechanism', NS_XMPP_SASL)
                    .map(function(el) { return el.getText() })

                if (mechs.indexOf('EXTERNAL') >= 0) {
                    this.emit('auth', 'external')
                } else {
                    this.emit('auth', 'dialback')
                }
            } else {
                // No SASL mechanisms
                this.emit('auth', 'dialback')
            }
        }

        this.handleDialback(stanza)
    })

    // establish connection
    var socket = SRV.connect({
        connection:  this,
        services:    ['_xmpp-server._tcp', '_jabber._tcp'],
        domain:      destDomain,
        defaultPort: 5269
    });

    this.listen({'socket': socket})

}

util.inherits(OutgoingServer, Server)

module.exports = OutgoingServer