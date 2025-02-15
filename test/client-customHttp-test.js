// Copyright IBM Corp. 2015,2016. All Rights Reserved.
// Node module: strong-soap
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var fs = require('fs'),
  soap = require('..').soap,
  assert = require('assert'),
  duplexer = require('duplexer'),
  httpClient = require('..').http,
// stream = require('stream'),
  stream = require('readable-stream'),
  util = require('util'),
  events = require('events'),
  semver = require('semver'),
  should = require('should');

describe('custom http client', function() {
  it('should be used by wsdl file loading', function(done) {

//Make a custom http agent to use streams instead on net socket
    function CustomAgent(options, socket) {
      var self = this;
      events.EventEmitter.call(this);
      self.requests = [];
      self.maxSockets = 1;
      self.proxyStream = socket;
      self.options = options || {};
      self.proxyOptions = {};
    }

    util.inherits(CustomAgent, events.EventEmitter);

    CustomAgent.prototype.addRequest = function(req, options) {
      req.onSocket(this.proxyStream);
    };

    //Create a duplex stream

    var httpReqStream = new stream.PassThrough();
    var httpResStream = new stream.PassThrough();
    var socketStream = duplexer(httpReqStream, httpResStream);

    // Node 4.x requires cork/uncork
    socketStream.cork = function() {
    };

    socketStream.uncork = function() {
    };

    socketStream.destroy = function() {
    };

    //Custom httpClient
    function MyHttpClient(options, socket) {
      this.httpCl = new httpClient(options);
      this.agent = new CustomAgent(options, socket);
    }

    util.inherits(MyHttpClient, httpClient);

    MyHttpClient.prototype.request = function(rurl, data, callback, exheaders, exoptions) {
      var self = this;
      var options = self.buildRequest(rurl, data, exheaders, exoptions);
      //Specify agent to use
      options.agent = this.agent;
      this.httpCl.makeHttpRequest(options, callback)

      util.inherits(CustomAgent, events.EventEmitter);

      CustomAgent.prototype.addRequest = function(req, options) {
        req.onSocket(this.proxyStream);
      };

      //Create a duplex stream

      var httpReqStream = new stream.PassThrough();
      var httpResStream = new stream.PassThrough();
      var socketStream = duplexer(httpReqStream, httpResStream);

      // Node 4.x requires cork/uncork
      socketStream.cork = function() {
      };

      socketStream.uncork = function() {
      };

      socketStream.destroy = function() {
      };

      //Custom httpClient
      function MyHttpClient(options, socket) {
        this.httpCl = new httpClient(options);
        this.agent = new CustomAgent(options, socket);
      }

      util.inherits(MyHttpClient, httpClient);

      MyHttpClient.prototype.request =
        function(rurl, data, callback, exheaders, exoptions) {
          var self = this;
          var options = self.buildRequest(rurl, data, exheaders, exoptions);
          //Specify agent to use
          options.agent = this.agent;
          return this.httpCl.makeHttpRequest(options, callback);
        };
    };

    var wsdl = fs.readFileSync('./test/wsdl/default_namespace.wsdl')
      .toString('utf8');
    //Should be able to read from stream the request
    httpReqStream.once('readable', function readRequest() {
      var chunk = httpReqStream.read();
      should.exist(chunk);

      //This is for compatibility with old node releases <= 0.10
      //Hackish
      if (semver.lt(process.version, '0.11.0')) {
        socketStream.on('data', function(data) {
          socketStream.ondata(data, 0, wsdl.length + 80);
        });
      }
      //Now write the response with the wsdl
      var state = httpResStream.write('HTTP/1.1 200 OK\r\nContent-Type: ' +
        'text/xml; charset=utf-8\r\nContent-Length: ' + wsdl.length +
        '\r\n\r\n' + wsdl);
    });

    var httpCustomClient = new MyHttpClient({}, socketStream);
    var url = 'http://localhost:50000/Platform.asmx?wsdl';
    soap.createClient(url,
      {httpClient: httpCustomClient},
      function(err, client) {
        if (err) console.error(err);
        assert.ok(!err);
        assert.ok(client);
        assert.equal(client.httpClient, httpCustomClient);
        var description = client.describe();
        var myOp = description.MyService.MyServicePort.MyOperation;
        assert.equal(myOp.name, 'MyOperation');
        assert.equal(myOp.style, 'documentLiteral');
        assert.equal(myOp.soapAction, 'MyOperation');

        var reqElement = myOp.input.body.elements[0].qname;
        assert.equal(reqElement.nsURI, 'http://www.example.com/v1');
        assert.equal(reqElement.name, 'Request');

        var resElement = myOp.output.body.elements[0].qname;
        assert.equal(resElement.nsURI, 'http://www.example.com/v1');
        assert.equal(resElement.name, 'Response');

        done();
      });
  });
});
