// Generated by CoffeeScript 1.4.0
(function() {
  "use strict";
  var IRC, exports, _ref,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __slice = [].slice;

  var exports = (_ref = window.irc) != null ? _ref : window.irc = {};

  //
  // Android doesn't implement ArrayBuffer.slice()
  //
  window.ArrayBuffer.prototype.slice = window.ArrayBuffer.prototype.slice || window.ArrayBuffer.prototype.webkitSlice || function(a, b) {
    var src = Uint8Array.prototype.subarray.apply(new Uint8Array(this), arguments);
    var dst = new Uint8Array(src.length);
    dst.set(src);
    return dst.buffer;
  }

  /*
   * Represents a connection to an IRC server.
   */
  IRC = (function(_super) {

    __extends(IRC, _super);

    function IRC(opt_socket) {
      this.reconnect = __bind(this.reconnect, this);

      this.onTimeout = __bind(this.onTimeout, this);
      IRC.__super__.constructor.apply(this, arguments);
      this.util = irc.util;
      this.preferredNick = "circ-user-" + (this.util.randomName(5));
      this.setSocket(opt_socket != null ? opt_socket : new net.ChromeSocket);
      this.data = this.util.emptySocketData();
      this.exponentialBackoff = 0;
      this.partialNameLists = {};
      this.channels = {};
      this.serverResponseHandler = new irc.ServerResponseHandler(this);
      this.state = 'disconnected';
      this.support = {};
    }

    IRC.prototype.setSocket = function(socket) {
      var _this = this;
      delete this.socket;
      this.socket = socket;
      this.socket.on('connect', function() {
        return _this.onConnect();
      });
      this.socket.on('data', function(data) {
        return _this.onData(data);
      });
      this.socket.on('drain', function() {
        return _this.onDrain();
      });
      this.socket.on('error', function(err) {
        return _this.onError(err);
      });
      this.socket.on('end', function(err) {
        return _this.onEnd(err);
      });
      return this.socket.on('close', function(err) {
        return _this.onClose(err);
      });
    };

    IRC.prototype.setPreferredNick = function(preferredNick) {
      this.preferredNick = preferredNick;
    };

    /*
       * user-facing
    */


    IRC.prototype.connect = function(server, port, password) {
      var _ref1;
      this.server = server != null ? server : this.server;
      this.port = port != null ? port : this.port;
      this.password = password != null ? password : this.password;
      if ((_ref1 = this.state) !== 'disconnected' && _ref1 !== 'reconnecting') {
        return;
      }
      clearTimeout(this.reconnectTimeout);
      this.socket.connect(this.server, this.port);
      return this.state = 'connecting';
    };

    /*
       * user-facing
    */


    IRC.prototype.quit = function(reason) {
      var _ref1;
      if ((_ref1 = this.state) === 'connected' || _ref1 === 'disconnecting') {
        this.send('QUIT', reason != null ? reason : this.quitReason);
        this.state = 'disconnected';
        return this.endSocketOnDrain = true;
      } else {
        this.quitReason = reason;
        return this.state = 'disconnecting';
      }
    };

    /*
       * user-facing
    */


    IRC.prototype.giveup = function() {
      if (this.state !== 'reconnecting') {
        return;
      }
      clearTimeout(this.reconnectTimeout);
      return this.state = 'disconnected';
    };

    IRC.prototype.join = function(channel, key) {
      if (this.state === 'connected') {
        if (key) {
          return this.doCommand('JOIN', channel, key);
        } else {
          return this.doCommand('JOIN', channel);
        }
      } else if (!this.channels[channel]) {
        return this.channels[channel] = {
          names: [],
          key: key
        };
      }
    };

    IRC.prototype.part = function(channel, reason) {
      if (this.state === 'connected') {
        return this.doCommand('PART', channel, reason);
      } else if (this.channels[channel]) {
        return delete this.channels[channel];
      }
    };

    /*
       * user-facing
    */


    IRC.prototype.doCommand = function() {
      var args, cmd;
      cmd = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      return this.sendIfConnected.apply(this, [cmd].concat(__slice.call(args)));
    };

    IRC.prototype.onConnect = function() {
      if (this.password) {
        this.send('PASS', this.password);
      }
      this.send('NICK', this.preferredNick);
      this.send('USER', this.preferredNick.replace(/[^a-zA-Z0-9]/,''), '0', '*', 'A CIRC user');
      return this.socket.setTimeout(60000, this.onTimeout);
    };

    IRC.prototype.onTimeout = function() {
      this.send('PING', +(new Date));
      return this.socket.setTimeout(60000, this.onTimeout);
    };

    IRC.prototype.onError = function(err) {
      this.emitMessage('socket_error', chat.SERVER_WINDOW, err);
      this.setReconnect();
      return this.socket.close();
    };

    IRC.prototype.onClose = function() {
      this.socket.setTimeout(0, this.onTimeout);
      if (this.state === 'connected') {
        this.emit('disconnect');
        return this.setReconnect();
      }
    };

    IRC.prototype.onEnd = function() {
      console.error("remote peer closed connection");
      if (this.state === 'connected') {
        return this.setReconnect();
      }
    };

    IRC.prototype.setReconnect = function() {
      var backoff;
      this.state = 'reconnecting';
      backoff = 2000 * Math.pow(2, this.exponentialBackoff);
      this.reconnectTimeout = setTimeout(this.reconnect, backoff);
      if (!(this.exponentialBackoff > 4)) {
        return this.exponentialBackoff++;
      }
    };

    IRC.prototype.reconnect = function() {
      return this.connect();
    };

    IRC.prototype.onData = function(pdata) {
      var cr, crlf, d, dataView, i, line, _i, _len, _results,
        _this = this;
      this.data = this.util.concatSocketData(this.data, pdata);
      dataView = new Uint8Array(this.data);
      _results = [];
      while (dataView.length > 0) {
        cr = false;
        crlf = void 0;
        for (i = _i = 0, _len = dataView.length; _i < _len; i = ++_i) {
          d = dataView[i];
          if (d === 0x0d) {
            cr = true;
          } else if (cr && d === 0x0a) {
            crlf = i;
            break;
          } else {
            cr = false;
          }
        }
        if (crlf != null) {
          line = this.data.slice(0, crlf - 1);
          this.data = this.data.slice(crlf + 1);
          dataView = new Uint8Array(this.data);
          _results.push(this.util.fromSocketData(line, function(lineStr) {
            console.log('<=', "(" + _this.server + ")", lineStr);
            return _this.onServerMessage(_this.util.parseCommand(lineStr));
          }));
        } else {
          break;
        }
      }
      return _results;
    };

    IRC.prototype.onDrain = function() {
      if (this.endSocketOnDrain) {
        this.socket.close();
      }
      return this.endSocketOnDrain = false;
    };

    IRC.prototype.send = function() {
      var args, msg, _ref1,
        _this = this;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      msg = (_ref1 = this.util).makeCommand.apply(_ref1, args);
      console.log('=>', "(" + this.server + ")", msg.slice(0, msg.length - 2));
      return this.util.toSocketData(msg, function(arr) {
        return _this.socket.write(arr);
      });
    };

    IRC.prototype.sendIfConnected = function() {
      var args;
      args = 1 <= arguments.length ? __slice.call(arguments, 0) : [];
      if (this.state === 'connected') {
        return this.send.apply(this, args);
      }
    };

    IRC.prototype.onServerMessage = function(cmd) {
      if (/^\d{3}$/.test(cmd.command)) {
        cmd.command = parseInt(cmd.command, 10);
      }
      if (this.serverResponseHandler.canHandle(cmd.command)) {
        return this.handle.apply(this, [cmd.command, this.util.parsePrefix(cmd.prefix)].concat(__slice.call(cmd.params)));
      } else {
        return this.emitMessage('other', chat.SERVER_WINDOW, cmd);
      }
    };

    IRC.prototype.handle = function() {
      var args, cmd, _ref1;
      cmd = arguments[0], args = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
      return (_ref1 = this.serverResponseHandler).handle.apply(_ref1, [cmd].concat(__slice.call(args)));
    };

    IRC.prototype.emit = function() {
      var args, channel, event, name;
      name = arguments[0], channel = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      event = (function(func, args, ctor) {
        ctor.prototype = func.prototype;
        var child = new ctor, result = func.apply(child, args);
        return Object(result) === result ? result : child;
      })(Event, ['server', name].concat(__slice.call(args)), function(){});
      event.setContext(this.server, channel);
      return this.emitCustomEvent(event);
    };

    IRC.prototype.emitMessage = function() {
      var args, channel, event, name;
      name = arguments[0], channel = arguments[1], args = 3 <= arguments.length ? __slice.call(arguments, 2) : [];
      event = (function(func, args, ctor) {
        ctor.prototype = func.prototype;
        var child = new ctor, result = func.apply(child, args);
        return Object(result) === result ? result : child;
      })(Event, ['message', name].concat(__slice.call(args)), function(){});
      event.setContext(this.server, channel);
      return this.emitCustomMessage(event);
    };

    IRC.prototype.emitCustomMessage = function(event) {
      return this.emitCustomEvent(event);
    };

    IRC.prototype.emitCustomEvent = function(event) {
      return IRC.__super__.emit.call(this, event.type, event);
    };

    IRC.prototype.isOwnNick = function(nick) {
      return irc.util.nicksEqual(this.nick, nick);
    };

    IRC.prototype.isValidChannelPrefix = function(channel) {
      var prefixes = this.support['chantypes'] || '#&';
      return prefixes.indexOf(channel.substr(0, 1)) != -1;
    };

    return IRC;

  })(EventEmitter);

  /*
   * Our IRC version - should match the version in the manifest.
  */


  exports.VERSION = "0.6.2";

  exports.IRC = IRC;

}).call(this);
