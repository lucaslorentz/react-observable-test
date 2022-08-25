export class TreeMap<V> {
  constructor(public innerMap: Map<any, any> = new Map()) {}
  get size() {
    return this.innerMap.size;
  }
  get(keys: any[]): V {
    if (keys.length === 0) return this.innerMap as any;
    return this.getMap(keys, true, false)?.get(keys[keys.length - 1]);
  }
  keys(keys: any[]): IterableIterator<any> {
    return this.getMap(keys, false, false)?.keys() ?? [][Symbol.iterator]();
  }
  has(keys: any[]): boolean {
    if (keys.length === 0) return true;
    return this.getMap(keys, true, false)?.has(keys[keys.length - 1]) ?? false;
  }
  set(keys: any[], value: V): this {
    const map = this.getMap(keys, true, true);
    map.set(keys[keys.length - 1], value);
    return this;
  }
  delete(keys: any[]) {
    const maps = this.getMaps(keys, true, false);
    if (maps.length === keys.length) {
      const map = maps[maps.length - 1];
      if (map.delete(keys[keys.length - 1])) {
        this.cleanup(maps, keys);
      }
    }
  }
  clear(keys: any[]): void {
    const maps = this.getMaps(keys, false, false);
    if (maps.length === keys.length + 1) {
      const map = maps[maps.length - 1];
      map.clear();
      this.cleanup(maps, keys);
    }
  }
  private getMap(keys: any[], ignoreLast: boolean, create: true): Map<any, any>;
  private getMap(
    keys: any[],
    ignoreLast: boolean,
    create: false
  ): Map<any, any> | undefined;
  private getMap(
    keys: any[],
    ignoreLast: boolean,
    create: boolean
  ): Map<any, any> | undefined {
    let current = this.innerMap;
    const length = keys.length - (ignoreLast ? 1 : 0);
    for (let k = 0; k < length; k++) {
      const key = keys[k];
      if (!current.has(key)) {
        if (!create) return undefined;
        current.set(key, new Map());
      }
      current = current.get(key);
    }
    return current;
  }
  private getMaps(
    keys: any[],
    ignoreLast: boolean,
    create: boolean
  ): Map<any, any>[] {
    const maps: Map<any, any>[] = [this.innerMap];
    let current = this.innerMap;
    const length = keys.length - (ignoreLast ? 1 : 0);
    for (let k = 0; k < length; k++) {
      const key = keys[k];
      if (!current.has(key)) {
        if (!create) return maps;
        current.set(key, new Map());
      }
      current = current.get(key);
      maps.push(current);
    }
    return maps;
  }
  private cleanup(maps: Map<any, any>[], keys: any[]) {
    for (let i = maps.length - 1; i > 0; i--) {
      if (maps[i].size === 0) {
        maps[i - 1].delete(keys[i - 1]);
      }
    }
  }
}
