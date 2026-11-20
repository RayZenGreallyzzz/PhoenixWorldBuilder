/* Phoenix Engine Core 0.1: platform-neutral game entities and editor mode.
 * No Three.js, Android APIs, rAF loops, physics or UI listeners here.
 * Exposed as window.PhoenixCore in WebView and module.exports in Node tests.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PhoenixCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 1;
  const MODES = Object.freeze(['edit', 'play', 'live-edit']);

  function validName(name) {
    return typeof name === 'string' && /^[a-z][a-z0-9_.:-]{0,63}$/i.test(name);
  }

  function copyData(value) {
    const seen = new Set();
    function walk(v, depth) {
      if (depth > 40) throw new TypeError('Component data is nested too deeply');
      if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v !== 'object') throw new TypeError('Component data must be JSON-serializable');
      if (seen.has(v)) throw new TypeError('Cyclic component data is unsupported');
      seen.add(v);
      let result;
      if (Array.isArray(v)) {
        result = v.map(x => walk(x, depth + 1));
      } else {
        if (Object.getPrototypeOf(v) !== Object.prototype &&
            Object.getPrototypeOf(v) !== null)
          throw new TypeError('Component data must be a plain object');
        result = Object.create(null);
        for (const key of Object.keys(v)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype')
            throw new TypeError('Unsafe component property');
          result[key] = walk(v[key], depth + 1);
        }
      }
      seen.delete(v);
      return result;
    }
    return walk(value, 0);
  }

  class PhoenixWorld {
    constructor() {
      this._nextId = 0;
      this._entities = new Map();
    }

    createEntity(name = 'entity') {
      if (typeof name !== 'string' || !name.trim() || name.length > 120)
        throw new TypeError('Invalid entity name');
      const id = 'entity-' + (++this._nextId);
      this._entities.set(id, { id, name, components: Object.create(null) });
      return id;
    }

    hasEntity(id) { return this._entities.has(id); }

    removeEntity(id) { return this._entities.delete(id); }

    setComponent(id, type, data) {
      const entity = this._entities.get(id);
      if (!entity) throw new Error('Unknown entity: ' + id);
      if (!validName(type)) throw new TypeError('Invalid component type');
      entity.components[type] = copyData(data);
    }

    getComponent(id, type) {
      const entity = this._entities.get(id);
      if (!entity) return undefined;
      if (!Object.prototype.hasOwnProperty.call(entity.components, type))
        return undefined;
      return copyData(entity.components[type]);
    }

    removeComponent(id, type) {
      const entity = this._entities.get(id);
      if (!entity) return false;
      if (!Object.prototype.hasOwnProperty.call(entity.components, type)) return false;
      delete entity.components[type];
      return true;
    }

    entityIds() { return Array.from(this._entities.keys()); }

    serialize() {
      const entities = [];
      for (const entity of this._entities.values()) {
        entities.push({
          id: entity.id,
          name: entity.name,
          components: copyData(entity.components)
        });
      }
      return { format: 'phoenix-world', version: VERSION, nextId: this._nextId, entities };
    }

    load(snapshot) {
      if (!snapshot || snapshot.format !== 'phoenix-world' ||
          snapshot.version !== VERSION || !Array.isArray(snapshot.entities) ||
          !Number.isSafeInteger(snapshot.nextId) || snapshot.nextId < 0)
        throw new TypeError('Invalid Phoenix world snapshot');
      const entities = new Map();
      for (const item of snapshot.entities) {
        if (!item || !/^entity-[1-9][0-9]*$/.test(item.id) ||
            typeof item.name !== 'string' || !item.name.trim() ||
            item.name.length > 120 || entities.has(item.id))
          throw new TypeError('Invalid or duplicate entity');
        if (Number(item.id.slice(7)) > snapshot.nextId)
          throw new TypeError('Entity ID exceeds sequence');
        if (!item.components || typeof item.components !== 'object' ||
            Array.isArray(item.components))
          throw new TypeError('Invalid components');
        const components = Object.create(null);
        for (const type of Object.keys(item.components)) {
          if (!validName(type)) throw new TypeError('Invalid component name');
          components[type] = copyData(item.components[type]);
        }
        entities.set(item.id, { id: item.id, name: item.name, components });
      }
      // Atomic commit: do not replace the current world on invalid input.
      this._entities = entities;
      this._nextId = snapshot.nextId;
    }
  }

  class PhoenixModeController {
    constructor(mode = 'edit') {
      if (!MODES.includes(mode)) throw new TypeError('Invalid mode');
      this.mode = mode;
      this._listeners = new Set();
    }
    setMode(next) {
      if (!MODES.includes(next)) throw new TypeError('Invalid mode');
      if (next === this.mode) return false;
      const previous = this.mode;
      this.mode = next;
      for (const handler of [...this._listeners]) handler({ previous, current: next });
      return true;
    }
    subscribe(handler) {
      if (typeof handler !== 'function') throw new TypeError('Handler required');
      this._listeners.add(handler);
      return () => this._listeners.delete(handler);
    }
  }

  return Object.freeze({ VERSION, MODES, PhoenixWorld, PhoenixModeController });
});
