// Saving and loading the garden. The storage object arrives as an argument, so
// this runs under node with a plain Map standing in for the browser's store.

import { serialize } from './game.js';

export function createStore(storage, key) {
  let discarding = false; // reset() must not be undone by the pagehide save

  return {
    load() {
      try {
        return JSON.parse(storage.getItem(key));
      } catch {
        return null; // unreadable save: open the sky empty rather than fail
      }
    },

    save(world) {
      if (discarding) return;
      try {
        storage.setItem(key, JSON.stringify(serialize(world)));
      } catch {
        // private mode or a full quota: play on without memory
      }
    },

    reset() {
      discarding = true;
      try {
        storage.removeItem(key);
      } catch {
        // nothing to clear
      }
    }
  };
}
