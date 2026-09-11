export type SignedState = 'none' | 'signed' | 'to';

export interface Region {
  province: string;
  city: string;
  district: string;
}

export interface Item {
  id: string;
  name: string;
  typeId: string | null;
  work: string;
  author: string; // 主 coser（= cosers[0] 或旧单值），用于兼容展示
  cosers?: string[]; // 多人 coser 列表
  event: string;
  date: string; // 'YYYY-MM-DD' 或 ''
  signed: SignedState;
  toSign: string;
  region: Region | null;
  location: string;
  quantity: number | null;
  price: number | null;
  source: string;
  notes: string;
  tags: string[];
  custom: Record<string, string>;
  photoIds: string[];
  mainPhotoId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PhotoRec {
  id: string;
  itemId: string;
  blob: Blob;
  order: number;
  addedAt: number;
  side?: 'front' | 'back'; // 双面色纸：正面/反面
}

export interface TypeDef {
  id: string;
  name: string;
  color: string;
  order: number;
}

export type CustomFieldKind = 'text' | 'number' | 'select';

export interface CustomFieldDef {
  id: string;
  name: string;
  kind: CustomFieldKind;
  options: string[];
  order: number;
}

export interface AppSettings {
  id: string; // 恒为 'main'
  showLocation: boolean;
  showQuantity: boolean;
  showPrice: boolean;
  showSource: boolean;
  skipCorrection: boolean; // 照片已拍正，跳过矫正直接入
}

export interface Filters {
  search: string;
  typeId: string | null;
  work: string | null;
  author: string | null;
  event: string | null;
  year: string | null;
  region: Region | null;
  signed: 'all' | SignedState;
  custom: Record<string, string>;
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'main',
  showLocation: false,
  showQuantity: false,
  showPrice: false,
  showSource: false,
  skipCorrection: false,
};

export const EMPTY_FILTERS: Filters = {
  search: '',
  typeId: null,
  work: null,
  author: null,
  event: null,
  year: null,
  region: null,
  signed: 'all',
  custom: {},
};

export const PRESET_TYPES: Omit<TypeDef, 'order'>[] = [
  { id: 't-post', name: '海报', color: '#e25c6c' },
  { id: 't-shikishi', name: '色纸', color: '#e07b3a' },
  { id: 't-book', name: '书', color: '#3a8de0' },
  { id: 't-badge', name: '徽章/吧唧', color: '#2fae8f' },
  { id: 't-stand', name: '立牌', color: '#8b5ce0' },
  { id: 't-postcard', name: '明信片', color: '#d94f9e' },
  { id: 't-ticket', name: '票根', color: '#5c6bc0' },
  { id: 't-folder', name: '文件夹', color: '#43a047' },
  { id: 't-fan', name: '扇子', color: '#f0a530' },
  { id: 't-banner', name: '手幅', color: '#607d8b' },
  { id: 't-other', name: '其他', color: '#9aa0a6' },
];
