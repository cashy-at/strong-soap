// Copyright IBM Corp. 2016. All Rights Reserved.
// Node module: strong-soap
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

'use strict';

var soap = require('..').soap,
  assert = require('assert'),
  httpClient = require('..').http,
  util = require('util'),
  events = require('events'),
  createSocketStream = require('./_socketStream');

describe('custom http client', function() {
  it('should be used by download of wsdl file, and associated xsds',
    function(done) {

      //Make a custom http agent to use streams instead of a real net socket
      function CustomAgent(options, wsdl, xsd) {
        var self = this;
        events.EventEmitter.call(this);
        self.requests = [];
        self.maxSockets = 1;
        self.wsdlStream = wsdl;
        self.xsdStream = xsd;
        self.options = options || {};
        self.proxyOptions = {};
      }

      util.inherits(CustomAgent, events.EventEmitter);

      CustomAgent.prototype.addRequest = function(req, options) {
        if (/\?xsd$/.test(req.path)) {
          req.onSocket(this.xsdStream);
        } else {
          req.onSocket(this.wsdlStream);
        }
      };

      //Custom httpClient
      function MyHttpClient(options, wsdlSocket, xsdSocket) {
        this.httpCl = new httpClient(options);
        this.agent = new CustomAgent(options, wsdlSocket, xsdSocket);
      }

      util.inherits(MyHttpClient, httpClient);

      MyHttpClient.prototype.request =
        function(rurl, data, callback, exheaders, exoptions) {
          var self = this;
          var options = self.buildRequest(rurl, data, exheaders, exoptions);
          //Specify agent to use
          options.agent = this.agent;
          return this.httpCl.makeHttpRequest(options, callback)
        };

      var httpCustomClient = new MyHttpClient({},
        createSocketStream(__dirname +
          '/wsdl/xsdinclude/xsd_include_http.wsdl'),
        createSocketStream(__dirname + '/wsdl/xsdinclude/types.xsd')
      );
      var url = 'http://localhost:50000/Dummy.asmx?wsdl';
      soap.createClient(url,
        {httpClient: httpCustomClient},
        function(err, client) {
          assert.ok(client);
          assert.ok(!err);
          assert.equal(client.httpClient, httpCustomClient);

          var description = client.describe();
          var myOp = description.DummyService.DummyPortType.Dummy;
          assert.equal(myOp.name, 'Dummy');
          assert.equal(myOp.style, 'documentLiteral');
          assert.equal(myOp.soapAction, 'tns#Dummy');

          var reqElement = myOp.input.body.elements[0].qname;
          assert.equal(reqElement.nsURI, 'http://www.dummy.com/Types');
          assert.equal(reqElement.name, 'DummyRequest');

          var resElement = myOp.output.body.elements[0].qname;
          assert.equal(resElement.nsURI, 'http://www.dummy.com/Types');
          assert.equal(resElement.name, 'DummyResponse');

          done();
        });
    });
});
