/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ['WindowSizeFixer']; 

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import('resource://gre/modules/XPCOMUtils.jsm');

XPCOMUtils.defineLazyModuleGetter(this, 'prefs', 'resource://windowsizefixer-modules/lib/prefs.js');

const DOMAIN = 'extensions.windowsizefixer@clear-code.com.';

function WindowSizeFixer(aWindow) {
  this.window = aWindow;
  this.document = aWindow.document;

  aWindow.addEventListener('DOMContentLoaded', this, true);
}
WindowSizeFixer.prototype = {
  window : null, 
  document : null,

  get keySet() {
    return this.document.getElementById('mainKeyset');
  },

  get fixedSize() {
    if (this._fixedSize)
      return this._fixedSize;

    var size = prefs.getPref(DOMAIN + 'fixedSize');
    var matched = size.match(/^(\d+)[x,\s]\s*(\d+)$/);
    if (matched)
      return (this._fixedSize = { width: parseInt(matched[1]),
                                  height: parseInt(matched[2]) });
    else
      return { width: 100,
               height: 100 };
  },

  fixSize: function WST_fixSize() {
    var size = this.fixedSize;
    this.window.resizeTo(size.width, size.height);
  },

  initShortcut: function WST_initShortcut() {
    var key = prefs.getPref(DOMAIN + 'shortcut.key');
    var keyCode = prefs.getPref(DOMAIN + 'shortcut.keyCode');
    var modifiers = prefs.getPref(DOMAIN + 'shortcut.modifiers');
    if ((!key && !keyCode) ||
        (key && keyCode))
      return;

    this._key = this.document.createElement('key');
    this._key.setAttribute('id', 'key_windowSizeFixer_fixSize');
    this._key.setAttribute('oncommand', 'gWindowSizeFixer.fixSize()');

    if (key)
      this._key.setAttribute('key', key);
    else
      this._key.setAttribute('keyCode', key);

    if (modifiers)
      this._key.setAttribute('modifiers', modifiers);

    this.keySet.appendChild(this._key);
  },

  destroyShortcut: function WST_destroyShortcut() {
    if (this._key)
      this.keySet.removeChild(this._key);
  },

  init: function WSF_init() {
    this.window.removeEventListener('DOMContentLoaded', this, true);
    this.window.addEventListener('load', this, false);
    this.window.addEventListener('SSWindowStateReady', this, false);
    this.window.addEventListener('unload', this, false);
    this.initShortcut()
  },

  destroy: function WSF_destroy() {
    this.window.removeEventListener('unload', this, false);
    this.destroyShortcut();
    delete this.window;
    delete this.document;
  },

  onStartup: function WST_onStartup(aEvent) {
    this.window.removeEventListener(aEvent.type, this, false);
    if (prefs.getPref(DOMAIN + 'fixOnStartup'))
      this.fixSize();
  },

  handleEvent: function WSF_handleEvent(aEvent) {
    switch (aEvent.type) {
      case 'DOMContentLoaded':
        return this.init();

      case 'load':
      case 'SSWindowStateReady':
        return this.onStartup(aEvent);

      case 'unload':
        return this.destroy();
    }
  }
};
