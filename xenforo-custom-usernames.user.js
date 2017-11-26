// ==UserScript==
// @name         XenForo Custom Usernames
// @version      1.3
// @description  Replaces Usernames on Profile Page and other pages
// @author       aequabit
// @match 		   *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        unsafeWindow
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js
// ==/UserScript==

const XCU = {
  config: {
    prefix: '',
    suffix: '<span style="color: #ccc"> ({NAME})</span>', // Placeholders: NAME = nickname of the user
    interval: 500
  },
  routes: [
    {
      test: /\/members\//,
      action: () => {
        $('div.followBlock ul').append(
          `<li><a href="#" onClick="XCU_CustomName(event);">Custom name</a></li>`
        );
      }
    }
  ],
  defaultStorage: {
    storageVersion: 1,
    sites: {}
  },
  getStorage: function() {
    /**
     * Get the serialized storage.
     * @type {String}
     */
    let serializedStorage = GM_getValue('xcu_storage');

    /**
     * If it doesn't exists, create it.
     */
    if (serializedStorage === undefined) {
      GM_setValue('xcu_storage', JSON.stringify(this.defaultStorage));
      return this.defaultStorage;
    }

    /**
     * Try to parse the storage.
     */
    let storage = null;
    try {
      storage = JSON.parse(serializedStorage);
    } catch (e) {
      return console.error(
        new Error('xenforo-custom-usernames: Failed to parse storage')
      );
    }

    /**
     * If the storage is out-to-date, reset it to default.
     */
    if (storage.storageVersion != this.defaultStorage.storageVersion) {
      GM_setValue('xcu_storage', JSON.stringify(this.defaultStorage));
      return this.defaultStorage;
    }

    return storage;
  },
  setStorage: function(storage) {
    GM_setValue('xcu_storage', JSON.stringify(storage));
  },
  getSiteStorage: function() {
    const storage = this.getStorage();
    const domain = location.hostname;
    if (!(domain in storage.sites)) {
      storage.sites[domain] = {};
      this.setStorage(storage);
    }
    return { domain, users: storage.sites[domain] };
  },
  setSiteStorage: function(siteStorage) {
    const storage = this.getStorage();
    storage.sites[siteStorage.domain] = siteStorage.users;
    this.setStorage(storage);
  },
  getUserStorage: function(userId) {
    const siteStorage = this.getSiteStorage();
    if (!(userId in siteStorage.users)) return false;
    return { userId, name: siteStorage.users[userId] };
  },
  setUserStorage: function(userStorage) {
    const siteStorage = this.getSiteStorage();
    console.log(userStorage, siteStorage);
    if (userStorage.name === null) delete siteStorage.users[userStorage.userId];
    else siteStorage.users[userStorage.userId] = userStorage.name;
    this.setSiteStorage(siteStorage);
  },
  getUserIdFromUrl: function(url) {
    /**
     * Get the user using Regex.
     * @type {Array}
     */
    const matches = url
      .replace(/\/$/, '') // Remove trailing slash.
      .match(/\d+$/); // Match trailing numbers.

    /**
     * If there's no match, continue.
     */
    if (!matches || matches.length === 0) return null;

    /**
     * Get the user ID as a number.
     * @type {Number}
     */
    const userId = parseInt(matches[0]);

    /**
     * If the user ID failed to parse, continue.
     */
    if (isNaN(userId)) return null;

    return userId;
  }
};

(function() {
  'use strict';

  unsafeWindow.XCU_CustomName = function(e, _userId) {
    e.preventDefault();

    const userId = _userId || XCU.getUserIdFromUrl(location.pathname);
    const currentName = $('h1.username')
      .children('span')
      .clone()
      .children()
      .remove()
      .end()
      .text(); // https://stackoverflow.com/a/8851526
    const userStorage = XCU.getUserStorage(userId) || {};
    const newName = prompt(
      `Set a name for ${currentName} (leave empty to unset)`,
      userStorage.name || ''
    );
    XCU.setUserStorage({
      userId,
      name: newName.length > 0 ? newName : null
    });
  };

  unsafeWindow.XCU_Storage = () => XCU.getStorage();

  /**
   * If the current page is not a XenForo forum, return.
   */
  if (unsafeWindow.XenForo === undefined) return;

  /**
   * Get the configuration.
   * @type {Object}
   */
  const config = XCU.config;

  setInterval(() => {
    $('.userInfo .userLinks').each((i, userLinksElement) => {
      const userLinks = $(userLinksElement);
      if (userLinks.data('xcu-modified') !== undefined) return;
      const userHref = userLinks
        .children('a')
        .eq(0)
        .attr('href');
      const userId = XCU.getUserIdFromUrl(userHref);
      userLinks.append(
        `<li><a href="#" onClick="XCU_CustomName(event, ${userId});">Custom name</a></li>`
      );
      userLinks.data('xcu-modified', true);
    });

    $('a.username').each((i, usernameElement) => {
      const username = $(usernameElement);

      /**
       * If the user was already renamed, continue.
       */
      if (username.data('xcu-name') !== undefined) return;

      /**
       * Get the URL to the user's profile.
       * @type {String}
       */
      const href = username.attr('href');

      /**
       * If there's no href for some reason, continue.
       */
      if (!href) return;

      /**
       * Get the user ID from the href.
       * @type {Number}
       */
      const userId = XCU.getUserIdFromUrl(href);

      /**
       * If the user ID is invalid, continue;
       */
      if (userId === null) return;

      /**
       * Get the user storage.
       * @type {Object}
       */
      const userStorage = XCU.getUserStorage(userId);

      if (userStorage === false) return;

      /**
       * Create suffix and prefix from the template.
       * @type {String}
       */
      const prefix = config.prefix.replace('{NAME}', userStorage.name);
      const suffix = config.suffix.replace('{NAME}', userStorage.name);

      /**
       * If the username element has no children.
       */
      if (username.children('span').length === 0) {
        username.prepend(prefix);
        username.append(suffix);
      } else {
        const firstChild = username.children().eq(0);
        if (firstChild.is('span')) {
          firstChild.prepend(prefix);
          firstChild.append(suffix);
        }
      }
      username.data('xcu-name', userStorage.name);
    });

    $('.username').each((i, usernameElement) => {
      const username = $(usernameElement);

      if (!username.is('h1') && !username.is('h3')) return;

      if (
        username.is('h3') &&
        (username.children('.StatusTooltip').length > 0 ||
          username.children('.NoOverlay').length > 0)
      )
        return;

      /**
       * If the user was already renamed, continue.
       */
      if (username.data('xcu-name') !== undefined) return;

      /**
       * Get the user ID from the href.
       * @type {Number}
       */
      const userId = XCU.getUserIdFromUrl(location.pathname);

      /**
       * If the user ID is invalid, continue;
       */
      if (userId === null) return;

      const userStorage = XCU.getUserStorage(userId);

      if (userStorage === false) return;

      /**
       * Create suffix and prefix from the template.
       * @type {String}
       */
      const prefix = config.prefix.replace('{NAME}', userStorage.name);
      const suffix = config.suffix.replace('{NAME}', userStorage.name);

      /**
       * If the username element has no children.
       */
      if (username.children('span').length === 0) {
        username.prepend(prefix);
        username.append(suffix);
      } else {
        const firstChild = username.children().eq(0);
        if (firstChild.is('span')) {
          firstChild.prepend(prefix);
          firstChild.append(suffix);
        }
      }
      username.data('xcu-name', userStorage.name);
    });
  }, config.interval);

  for (const route of XCU.routes)
    if (route.test.test(location.pathname)) route.action();
})();
