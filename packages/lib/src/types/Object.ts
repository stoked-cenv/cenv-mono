import {Chalk} from "chalk";
import {CenvLog} from "../log";

export const getValue = <T extends Object>(dataItem: T, key: string) => {
  let currentData = JSON.parse(JSON.stringify(dataItem));
  const keyNodes = key.split('.');
  for (const keyNode of keyNodes) {
    currentData = currentData[keyNode];
  }
  return currentData;
}

const printKey = (dataItem: Object, meta: Record<string, number>, key: string, valueColor: Chalk, valueOnly: boolean = false) => {
  const value = getValue(dataItem, key);
  if (value === undefined) {
    return '';
  } else if (valueOnly) {
    return `${valueColor(value.toString().padEnd(meta[key], ' '))}\t`;
  }
  return `${key.split('.').pop()}: ${valueColor(value.toString().padEnd(meta[key], ' '))}\t`;
}

const updateMeta = <T extends Object>(dataItem: T, keys: string[] = [], meta: Record<string, number> = {}) => {
  for (const key of keys) {
    const value = getValue(dataItem, key);
    if (value && (!meta[key] || meta[key] < value.toString().length)) {
      meta[key] = value.toString().length;
    }
  }
  return meta;
}

export const getMeta = (data: Object[], keys: string[] = []) => {
  let meta: Record<string, number> = {};
  try {
    for (const dataItem of data) {
      meta = updateMeta(dataItem, keys, meta);
    }
  } catch(e) {
    CenvLog.single.catchLog(e);
  }
  return meta;
}

export const printItemColumns = <T extends Object>(data: T, colors: {valueColor: Chalk, keyColor: Chalk}, keys: string[], meta: Record<string, number>, keyToString?: (dataItem: Object, meta: Record<string, number>, key: string, valueColor: Chalk, valueOnly: boolean) => string) => {
  let output = '';
  try {
    if (!keyToString) {
      keyToString = printKey;
    }

    let initialKey = true;
    for (const key of keys) {
      output += keyToString(data, meta, key, colors.valueColor, initialKey);
      initialKey = false;
    }

  } catch(e) {
    CenvLog.single.catchLog(e);
  }
  return colors.keyColor(output);
}

export const printColumns = <A extends Object>(data: A[], getColors: (item: A) => {valueColor: Chalk, keyColor: Chalk}, keys: string[]) => {
  let output = '';
  const meta = getMeta(data, keys);
  let lines = '';
  for (const item of data) {
    const colors = getColors(item);
    lines += printItemColumns(item, colors, keys, meta) + '\n';
  }
  return lines;
}


export const pick = <T extends {}, K extends keyof T>(obj: T, ...keys: K[]) => (
  Object.fromEntries(
    keys
    .filter(key => key in obj)
    .map(key => [key, obj[key]])
  ) as Pick<T, K>
);

export const inclusivePick = <T extends {}, K extends (string | number | symbol)>(
  obj: T, ...keys: K[]
) => (
  Object.fromEntries(
    keys
    .map(key => [key, obj[key as unknown as keyof T]])
  ) as {[key in K]: key extends keyof T ? T[key] : undefined}
)

export const omit = <T extends {}, K extends keyof T>(
  obj: T, ...keys: K[]
) =>(
  Object.fromEntries(
    Object.entries(obj)
          .filter(([key]) => !keys.includes(key as K))
  ) as Omit<T, K>
)

function isArray(x: any) {
  return Object.prototype.toString.call(x) === '[object Array]';
}

function isObject(x: any) {
  return Object.prototype.toString.call(x) === '[object Object]';
}

export const valueWrapper = function (key: string, value: any) {
  if (!isObject(value) && !isArray(value)) {
    return `\x1b[33m${value}\x1b[0m`;
  }
  return value;
}

export enum DiffMapperType {
  VALUE_CREATED = 'created',
  VALUE_UPDATED = 'updated',
  VALUE_DELETED = 'deleted',
  VALUE_UNCHANGED = 'unchanged',
}

export const deepDiffMapper = function () {
  return {
    compareData: function(obj1: any, obj2: any) {

      if (this.isFunction(obj1) || this.isFunction(obj2)) {
        throw 'Invalid argument. Function given, object expected.';
      }
      if (this.isValue(obj1) || this.isValue(obj2)) {
        const type = this.compareValues(obj1, obj2);
        let oldData = obj1 === undefined ? 'undefined' : obj1;
        let data = obj2 === undefined ? 'undefined' : obj2;
        if (type === 'created') {
          return { type, data };
        } else if (type === 'deleted') {
          return { type, data: oldData };
        } else if (type === 'updated') {
          return { type, data, oldData };
        } else if (type === 'unchanged') {
          return { type, data };
        }
        CenvLog.single.catchLog(new Error('unsupported diff type: ' + type));
      }

      const diff: any = {};
      for (const key in obj1) {

        if (this.isFunction(obj1[key])) {
          continue;
        }

        let value2 = undefined;
        if (obj2[key] !== undefined) {
          value2 = obj2[key];
        }

        diff[key] = this.compareData(obj1[key], value2);
      }
      for (const key in obj2) {
        if (this.isFunction(obj2[key]) || diff[key] !== undefined) {
          continue;
        }

        diff[key] = this.compareData(undefined, obj2[key]);
      }

      return diff;
    },
    validateDiff: function(compared: any, diffMapperTypes: DiffMapperType[]) {
      if (this.isResult(compared)) {
        return this.includeResult(compared, diffMapperTypes);
      }

      const diff: any = {};
      for (const key in compared) {
        if (this.isFunction(compared[key])) {
          continue;
        }

        const validatedDiff = this.validateDiff(compared[key], diffMapperTypes);
        if (validatedDiff !== undefined) {
          diff[key] = validatedDiff;
        }
      }
      if (diffMapperTypes.length !== Object.keys(DiffMapperType).length && !Object.values(diff).filter(d => d).length) {
        return undefined;
      }
      return diff;
    },
    map: function(obj1: any, obj2: any, diffMapperTypes: DiffMapperType[] = [DiffMapperType.VALUE_CREATED, DiffMapperType.VALUE_DELETED, DiffMapperType.VALUE_UPDATED, DiffMapperType.VALUE_UNCHANGED]) {
      const compared = this.compareData(obj1, obj2);
      return this.validateDiff(compared, diffMapperTypes);
    },
    unchanged: function(value1: any, value2: any) {
      if (value1 === value2) {
        return true;
      }
      return this.isDate(value1) && this.isDate(value2) && (value1 as Date).getTime() === (value2 as Date).getTime();
    },
    compareValues: function (value1: object, value2: object) {
      if (this.unchanged(value1,  value2)) {
        return DiffMapperType.VALUE_UNCHANGED;
      }
      if (value1 === undefined) {
        return DiffMapperType.VALUE_CREATED;
      }
      if (value2 === undefined) {
        return DiffMapperType.VALUE_DELETED;
      }
      return DiffMapperType.VALUE_UPDATED;
    },
    includeResult: function (result: { type: string, data: any }, diffMapperTypes: DiffMapperType[]) {
      return Object.values(diffMapperTypes).map(d => d.toString()).includes(result.type) ? result : undefined;
    },
    isFunction: function (x: any) {
      return Object.prototype.toString.call(x) === '[object Function]';
    },
    isArray: function (x: any) {
      return Object.prototype.toString.call(x) === '[object Array]';
    },
    isDate: function (x: any) {
      return Object.prototype.toString.call(x) === '[object Date]';
    },
    isObject: function (x: any) {
      return Object.prototype.toString.call(x) === '[object Object]';
    },
    isValue: function (x: any) {
      return (!this.isObject(x) || !Object.keys(x).length) && !this.isArray(x);
    },
    isResult: function(x: any) {
      return this.isObject(x) && x.type !== undefined && x.data !== undefined;
    }
  }
}();