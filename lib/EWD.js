/*

 ----------------------------------------------------------------------------
 | EWD.js: Client-side logic for non-browser EWD.js Clients                 |
 |                                                                          |
 | Copyright (c) 2015 M/Gateway Developments Ltd,                        |
 | Reigate, Surrey UK.                                                      |
 | All rights reserved.                                                     |
 |                                                                          |
 | http://www.mgateway.com                                                  |
 | Email: rtweed@mgateway.com                                               |
 |                                                                          |
 |                                                                          |
 | Licensed under the Apache License, Version 2.0 (the "License");          |
 | you may not use this file except in compliance with the License.         |
 | You may obtain a copy of the License at                                  |
 |                                                                          |
 |     http://www.apache.org/licenses/LICENSE-2.0                           |
 |                                                                          |
 | Unless required by applicable law or agreed to in writing, software      |
 | distributed under the License is distributed on an "AS IS" BASIS,        |
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. |
 | See the License for the specific language governing permissions and      |
 |  limitations under the License.                                          |
 ----------------------------------------------------------------------------

*/

var EWD = {
  version: {
    build: 1,
    date: '27 May 2015'
  }, 
  sockets: {
    log: false,
    handlerFunction: {},

    // Simon Tweed's pub/sub additions
    // object store for socket message events - used by on/off/emit:
    events:{},

    /** 
     * Binds a callback to a socket message type
     * @param {string} messageType - Socket message type name to bind callback to
     * @param {function} callback  - Callback to bind to message type
     */
    on: function(messageType, callback) {
      if (!this.events[messageType]) this.events[messageType] = [];
      this.events[messageType].push(callback);
    },

    /**
     * Unbinds callback(s) from a socket message type
     *
     * USAGE:
     * EWD.sockets.off(messageType) 
     * removes all event callbacks for a socket message type
     *
     * EWD.sockets.off(messageType, callback) 
     * removes a specific event callback for a socket message type
     *
     * @param {string} messageType - socket message type name
     * @param {function} [callback] - Specific callback to remove from a message type
     */
    off: function(messageType, callback) {
      if (typeof callback === 'function') {
        if (!this.events[messageType]) {
          return
        }
        else if (this.events[messageType]) {
          for (var i = 0; i < this.events[messageType].length; i++) {
            if (this.events[messageType][i] === callback) {
              this.events[messageType].splice(i,1);
            }
          }
        }
      }
      else {
        this.events[messageType] = [];
      }
    },

    /**
     * Invokes all callbacks associated with a socket message type. <br>
     * Invoked automatically when a socket message is recieved from the server <br>
     *
     * @param {string} messageType - message type to invoke callbacks for
     * @param {object} data - data object passed to callback(s)
     */
    emit: function(messageType, data) {
      if (!this.events[messageType] || this.events[messageType].length < 1) return;
      data = data || {};
      for (var i = 0; i < this.events[messageType].length; i++) {
        this.events[messageType][i](data);
      }
    },
    // End of Simon Tweed's additions

    keepAlive: function(mins) {
      EWD.sockets.timeout = mins || 59;
      setTimeout(function() {
        EWD.sockets.sendMessage({type: "keepAlive", message:  "1"});
        EWD.sockets.keepAlive(EWD.sockets.timeout);
      },EWD.sockets.timeout*60000);
    },

    submitForm: function(params) {
      var framework = EWD.application.framework || 'extjs';
      var payload = params.fields;
      if (framework === 'extjs') {
        payload = Ext.getCmp(params.id).getValues();
      }
      if (framework === 'bootstrap') {
          if (params.popover) {
            EWD.application.popover = params.popover;
            if (!EWD.application.popovers) EWD.application.popovers = {};
            if (!EWD.application.popovers[params.popover.buttonId]) {
              $('#' + params.popover.buttonId).popover({
                title: params.alertTitle || 'Error',
                content: 'Testing',
                placement: 'top',
                container: '#' + params.popover.container,
                trigger: 'manual'
              });
              $('#' + params.popover.buttonId).on('shown.bs.popover', function() {
                var time = params.popover.time || 4000;
                setTimeout(function() {
                  $('#' + params.popover.buttonId).popover('hide');
                },time);
              });
              EWD.application.popovers[params.popover.buttonId] = true;
            }
          }
          if (params.toastr) {
            if (params.toastr.target) {
              toastr.options.target = '#' + params.toastr.target;
            }
            else {
              toastr.options.target = 'body';
            }
          }
      }
      if (params.alertTitle) payload.alertTitle = params.alertTitle;
      //payload.js_framework = framework;
      var msgObj = {
        type: params.messageType, 
        params: payload
      };
      if (params.done) msgObj.done = params.done;
      EWD.sockets.sendMessage(msgObj);
    }
  },

  start: function(io, url) {

    // io (socket.io instantiation) passed in from outside
    // url of the form http(s)://xx.xx.xx.xx:8080  - ie pointing to EWD.js back-end system

    var socket = io(url);

    socket.on('disconnect', function() {
      if (EWD.sockets.log) console.log('socket.io disconnected');
      if (EWD.application.onMessage.error) {
        EWD.application.onMessage.error({
          type: 'error',
          messageType: 'EWD.socket.disconnected',
          error: 'Socket disconnected'
        });
      }
    });

    socket.on('message', function(obj){
      if (EWD.sockets.log) {
        if (obj.type !== 'EWD.registered' && obj.type !== 'consoleText') {
          console.log("onMessage: " + JSON.stringify(obj));
        }
        else if(obj.type !== 'EWD.registered') {
          console.log('Registered successfully');
        }
      }
      if (EWD.application) {
        if (socket && obj.type === 'EWD.connected') {
          var json = {
            type: 'EWD.register', 
            application: EWD.application
          };
          socket.json.send(JSON.stringify(json));
          return;
        }
      }
      else {
        console.log('Unable to register application: EWD.application has not been defined');
        return;
      }
      if (obj.type === 'EWD.registered') {

        EWD.sockets.sendMessage = (function() {
          var applicationName = EWD.application.name;
          delete EWD.application.name;
          var io = socket;
          var token = obj.token;
          var augment = function(params) {
            params.token = token;
            return params;
          };
          return function(params) {
            if (typeof params.type === 'undefined') {
              if (EWD.sockets.log) console.log('Message not sent: type not defined');
            }
            else {
              params = augment(params);
              if (typeof console !== 'undefined') {
                if (EWD.sockets.log) console.log("sendMessage: " + JSON.stringify(params));
              }
              if (params.done) {
                if (!EWD.application.onMessage) EWD.application.onMessage = {};
                EWD.application.onMessage[params.type] = params.done;
                delete params.done;
              }
              if (params.ajax &&typeof $ !== 'undefined') {
                delete params.ajax;
                $.ajax({
                  url: '/ajax',
                  type: 'post',
                  data: JSON.stringify(params),
                  dataType: 'json',
                  timeout: 10000
                })
                .done(function (data ) {
                  if (EWD.sockets.log) console.log("onMessage: " + JSON.stringify(data));
                  // invoke the message handler function for returned type
                  if (EWD.application && EWD.application.onMessage && EWD.application.onMessage[data.type]) {
                    EWD.application.onMessage[data.type](data);
                    data = null;
                  }
                });
              }
              else {
                if (io.connected) {
                  io.json.send(JSON.stringify(params)); 
                }
                else {
                  if (EWD.sockets.log) console.log('Socket is disconnected and unavilable for use');
                  if (EWD.application.onMessage.error) {
                    EWD.application.onMessage.error({
                      type: 'error',
                      messageType: params.type,
                      error: 'Socket disconnected'
                    });
                  }
                }
              }
            }
          };
        })();
        obj = null;
        socket = null;
        EWD.initialised = true;
        if (EWD.onSocketsReady) EWD.onSocketsReady();
        return;
      }

      // pub-sub support:

      EWD.sockets.emit(obj.type, obj);

      if (obj.type.indexOf('EWD.form.') !== -1) {
        if (obj.error) {
          var alertTitle = 'Form Error';
          if (obj.alertTitle) alertTitle = obj.alertTitle;
          if (EWD.application.framework === 'extjs') {
            Ext.Msg.alert(alertTitle, obj.error);
          }
          else if (EWD.application.framework === 'bootstrap') {
            if (typeof toastr !== 'undefined') {
              toastr.clear();
              toastr.error(obj.error);
            }
            else {
              if (EWD.sockets.log) console.log("error = " + obj.error);
              $('#' + EWD.application.popover.buttonId).popover('show');
              $('#' + EWD.application.popover.container).find('div.popover-content').html(obj.error);
            }
          }
          else {
            alert(obj.error);
          }
          return;
        }
        else {
          if (EWD.application.framework === 'bootstrap') {
            $('#loginBtn').popover('hide');
          }
        }
      }
      if (obj.type.indexOf('EWD.error') !== -1) {
        if (obj.error) {
          if (EWD.sockets.log) console.log(obj.error);
        }
        return;
      }
      if (typeof EWD.token !== 'undefined' && typeof EWD.sockets.handlerFunction[obj.type] !== 'undefined') {
        EWD.sockets.handlerFunction[obj.type](obj);
        obj = null;
        return;
      }
      if (EWD.application && EWD.application.onMessage && EWD.application.onMessage[obj.type]) {
        EWD.application.onMessage[obj.type](obj);
        obj = null;
        return;
      }
    });
    io = null;
  }
};

module.exports = EWD;

