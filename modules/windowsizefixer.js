/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ['WindowSizeFixer']; 

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');

XPCOMUtils.defineLazyModuleGetter(this, 'prefs', 'resource://windowsizefixer-modules/lib/prefs.js');
XPCOMUtils.defineLazyModuleGetter(this, 'Services', 'resource://gre/modules/Services.jsm');

const DOMAIN = 'extensions.windowsizefixer@clear-code.com.';

function WindowSizeFixer(aWindow) {
  this.window = aWindow;
  this.document = aWindow.document;

  aWindow.addEventListener('DOMContentLoaded', this, true);
}
WindowSizeFixer.prototype = {
  window : null, 
  document : null,

  get fixedSize() {
    if (this._fixedSize)
      return this._fixedSize;

    var width = prefs.getPref(DOMAIN + 'fixedSize.width');
    var height = prefs.getPref(DOMAIN + 'fixedSize.height');
    if (width !== null && height !== null)
      return { width: width,
               height: height };

    // for backward compatibility
    var size = prefs.getPref(DOMAIN + 'fixedSize');
    var matched = size.match(/^(\d+)[x,\s]\s*(\d+)$/);
    if (matched)
      return (this._fixedSize = { width: parseInt(matched[1]),
                                  height: parseInt(matched[2]) });
    else
      return { width: 100,
               height: 100 };
  },

  get currentScreenRect() {
    var currentScreen = Cc['@mozilla.org/gfx/screenmanager;1']
          .getService(Ci.nsIScreenManager)
          .screenForRect(this.window.screenX,
                         this.window.screenY,
                         this.window.outerWidth,
                         this.window.outerHeight);
    var screenLeft   = {},
        screenTop    = {},
        screenWidth  = {},
        screenHeight = {};
    currentScreen.GetAvailRect(screenLeft, screenTop, screenWidth, screenHeight);
    return {
      x:      screenLeft.value,
      y:      screenTop.value,
      width:  screenWidth.value,
      height: screenHeight.value
    };
  },

  fixSize: function WST_fixSize() {
    var size   = this.fixedSize;
    var rect   = this.currentScreenRect;
    var x      = this.window.screenX;
    var y      = this.window.screenY;
    var width  = this.window.outerWidth;
    var height = this.window.outerHeight;
    var newX   = x;
    var newY   = y;
    var newWidth = Math.min(rect.width, size.width);
    var newHeight = Math.min(rect.height, size.height);

    if (x < rect.x)
      newX = rect.x;
    else if (x + newWidth > rect.x + rect.width)
      newX = x - ((x + newWidth) - (rect.x + rect.width));

    if (y < rect.y)
      newY = rect.y;
    else if (y + newHeight > rect.y + rect.height)
      newY = y - ((y + newHeight) - (rect.y + rect.height));

    if (newX != x || newY != y)
      this.window.moveTo(newX, newY);
    if (newWidth != width || newHeight != height)
      this.window.resizeTo(newWidth, newHeight);
  },

  initShortcut: function WST_initShortcut() {
    var key = prefs.getPref(DOMAIN + 'shortcut.key');
    var keyCode = prefs.getPref(DOMAIN + 'shortcut.keyCode');
    var modifiers = prefs.getPref(DOMAIN + 'shortcut.modifiers');
    if ((!key && !keyCode) ||
        (key && keyCode))
      return;

    var isMacOS = false;///mac/i.test(navigator.platform);
    var modifiers = {
      altKey : modifiers.indexOf('alt') > -1,
      ctrlKey : modifiers.indexOf('control') > -1 ||
                  (!isMacOS && modifiers.indexOf('accel') > -1),
      metaKey : modifiers.indexOf('meta') > -1 ||
                  (isMacOS && modifiers.indexOf('accel') > -1),
      shiftKey : modifiers.indexOf('shift') > -1
    };
    this._keyListener = (function(aEvent) {
      if (aEvent.altKey != modifiers.altKey ||
          aEvent.ctrlKey != modifiers.ctrlKey ||
          aEvent.metaKey != modifiers.metaKey ||
          aEvent.shiftKey != modifiers.shiftKey)
        return;
      if (key) {
        if (String.fromCharCode(aEvent.charCode).toLowerCase() != key.toLowerCase())
          return;
      }
      else {
        if (Ci.nsIDOMKeyEvent['DOM_' + keyCode] != aEvent.keyCode)
          return;
      }
      this.fixSize();
    }).bind(this);

    this.window.addEventListener('keypress', this._keyListener, true);
  },

  destroyShortcut: function WST_destroyShortcut() {
    if (this._keyListener) {
      this.window.removeEventListener('keypress', this._keyListener, true);
      delete this._keyListener;
    }
  },

  init: function WSF_init() {
    this.window.removeEventListener('DOMContentLoaded', this, true);

    this.window.addEventListener('load', this, false);
    this.waitingLoaded = true;
    this.window.addEventListener('SSWindowStateReady', this, false);
    this.waitingRestored = true;

    Services.obs.addObserver(this, 'sessionstore-windows-restored', false);
    this.observing = true;

    this.window.addEventListener('unload', this, false);

    this.initShortcut()
  },

  destroy: function WSF_destroy() {
    this.window.removeEventListener('unload', this, false);
    this.stopWaitingLoaded();
    this.stopWaitingRestored();
    this.stopObserve();
    this.destroyShortcut();
    delete this.window;
    delete this.document;
  },

  onStartup: function WST_onStartup() {
    if (prefs.getPref(DOMAIN + 'fixOnStartup'))
      this.fixSize();
  },

  handleEvent: function WSF_handleEvent(aEvent) {
    switch (aEvent.type) {
      case 'DOMContentLoaded':
        return this.init();

      case 'load':
        this.stopWaitingLoaded();
        this.onStartup();
        return;

      case 'SSWindowStateReady':
        this.stopWaitingRestored();
        this.onStartup();
        return;

      case 'unload':
        return this.destroy();
    }
  },

  stopWaitingLoaded: function WSF_stopWaiting() {
    if (this.waitingLoaded)
      this.window.removeEventListener('load', this, false);
    this.waitingLoaded = false;
  },

  stopWaitingRestored: function WSF_stopWaiting() {
    if (this.waitingRestored)
      this.window.removeEventListener('SSWindowStateReady', this, false);
    this.waitingRestored = false;
  },

  observe: function WSF_observe(aSubject, aTopic, aData) {
    this.stopObserve();
    this.window.setTimeout(this.onStartup.bind(this), 0);
  },

  stopObserve: function WSF_stopObserve() {
    if (this.observing)
      Services.obs.removeObserver(this, 'sessionstore-windows-restored');
    this.observing = false;
  }
};
