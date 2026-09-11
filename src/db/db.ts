import Dexie, { Table } from 'dexie';
import type { Item, PhotoRec, TypeDef, CustomFieldDef, AppSettings } from './types';

export class ShounaDB extends Dexie {
  items!: Table<Item, string>;
  photos!: Table<PhotoRec, string>;
  types!: Table<TypeDef, string>;
  customFields!: Table<CustomFieldDef, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('shouna');
    this.version(1).stores({
      items: 'id, typeId, work, author, event, date, signed, createdAt, updatedAt',
      photos: 'id, itemId',
      types: 'id, order',
      customFields: 'id, order',
      settings: 'id',
    });
  }
}

export const db = new ShounaDB();
