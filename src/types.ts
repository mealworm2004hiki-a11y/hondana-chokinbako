export type Status = 'want' | 'reading' | 'done' | 'tsundoku';
export type Source = 'library' | 'purchased' | 'owned';

export interface Book {
  id: string;
  isbn?: string;
  title: string;
  author?: string;
  publisher?: string;
  coverUrl?: string;
  /** 本体価格（税抜） */
  priceYen?: number;
  pageCount?: number;
  status: Status;
  source: Source;
  /** 0.0〜5.0（0.1刻み） */
  rating?: number;
  memo?: string;
  tags: string[];
  addedAt: string;
  finishedAt?: string;
  borrowedAt?: string;
  dueDate?: string;
  returned?: boolean;
  /** 読了時に計上した税込額（図書館本のみ） */
  savedYen?: number;
}

export interface Withdrawal {
  id: string;
  amountYen: number;
  note: string;
  date: string;
}

export interface Settings {
  goalYen?: number;
  goalLabel?: string;
}

export interface BackupData {
  app: string;
  exportedAt: string;
  books: Book[];
  withdrawals: Withdrawal[];
  settings: Settings;
}

export const STATUS_LABEL: Record<Status, string> = {
  want: '読みたい',
  reading: '読んでる',
  done: '読了',
  tsundoku: '積読',
};

export const SOURCE_LABEL: Record<Source, string> = {
  library: '図書館',
  purchased: '購入',
  owned: '所有',
};

export const taxedPrice = (priceYen: number) => Math.round(priceYen * 1.1);

export const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addDays = (isoDate: string, days: number) => {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const yen = (n: number) => '¥' + n.toLocaleString('ja-JP');
