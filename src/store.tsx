import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { kvGet, kvSet } from './db';
import {
  taxedPrice,
  today,
  type BackupData,
  type Book,
  type Settings,
  type Withdrawal,
} from './types';

export interface Celebration {
  amount: number;
  key: number;
}

interface StoreValue {
  loaded: boolean;
  books: Book[];
  withdrawals: Withdrawal[];
  settings: Settings;
  savedGross: number;
  savedTotal: number;
  celebration: Celebration | null;
  clearCelebration: () => void;
  addBook: (book: Book) => void;
  addBooks: (books: Book[]) => void;
  updateBook: (id: string, patch: Partial<Book>) => void;
  finishBook: (id: string, date?: string) => void;
  deleteBook: (id: string) => void;
  addWithdrawal: (w: Withdrawal) => void;
  deleteWithdrawal: (id: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  replaceAll: (data: BackupData) => void;
}

const Ctx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider missing');
  return v;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [settings, setSettingsState] = useState<Settings>({});
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  useEffect(() => {
    (async () => {
      const [b, w, s] = await Promise.all([
        kvGet<Book[]>('books'),
        kvGet<Withdrawal[]>('withdrawals'),
        kvGet<Settings>('settings'),
      ]);
      if (b) setBooks(b);
      if (w) setWithdrawals(w);
      if (s) setSettingsState(s);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) kvSet('books', books);
  }, [books, loaded]);
  useEffect(() => {
    if (loaded) kvSet('withdrawals', withdrawals);
  }, [withdrawals, loaded]);
  useEffect(() => {
    if (loaded) kvSet('settings', settings);
  }, [settings, loaded]);

  const addBook = useCallback((book: Book) => {
    setBooks((bs) => [book, ...bs]);
  }, []);

  const addBooks = useCallback((newBooks: Book[]) => {
    setBooks((bs) => [...newBooks, ...bs]);
  }, []);

  const updateBook = useCallback((id: string, patch: Partial<Book>) => {
    setBooks((bs) =>
      bs.map((b) => {
        if (b.id !== id) return b;
        const nb = { ...b, ...patch };
        // 読了以外に戻したら貯金計上と読了日を取り消す
        if (nb.status !== 'done') {
          nb.savedYen = undefined;
          nb.finishedAt = undefined;
        }
        return nb;
      })
    );
  }, []);

  const finishBook = useCallback(
    (id: string, date?: string) => {
      const target = books.find((b) => b.id === id);
      if (!target) return;
      const finishedAt = date ?? target.finishedAt ?? today();
      const shouldSave =
        target.source === 'library' &&
        target.priceYen != null &&
        target.priceYen > 0 &&
        target.savedYen == null;
      const savedYen = shouldSave ? taxedPrice(target.priceYen!) : target.savedYen;
      setBooks((bs) =>
        bs.map((b) =>
          b.id === id ? { ...b, status: 'done', finishedAt, savedYen } : b
        )
      );
      if (shouldSave && savedYen) {
        setCelebration({ amount: savedYen, key: Date.now() });
      }
    },
    [books]
  );

  const deleteBook = useCallback((id: string) => {
    setBooks((bs) => bs.filter((b) => b.id !== id));
  }, []);

  const addWithdrawal = useCallback((w: Withdrawal) => {
    setWithdrawals((ws) => [w, ...ws]);
  }, []);

  const deleteWithdrawal = useCallback((id: string) => {
    setWithdrawals((ws) => ws.filter((w) => w.id !== id));
  }, []);

  const setSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((s) => ({ ...s, ...patch }));
  }, []);

  const replaceAll = useCallback((data: BackupData) => {
    setBooks(data.books ?? []);
    setWithdrawals(data.withdrawals ?? []);
    setSettingsState(data.settings ?? {});
  }, []);

  const clearCelebration = useCallback(() => setCelebration(null), []);

  const savedGross = useMemo(
    () => books.reduce((sum, b) => sum + (b.savedYen ?? 0), 0),
    [books]
  );
  const savedTotal = useMemo(
    () => savedGross - withdrawals.reduce((sum, w) => sum + w.amountYen, 0),
    [savedGross, withdrawals]
  );

  const value: StoreValue = {
    loaded,
    books,
    withdrawals,
    settings,
    savedGross,
    savedTotal,
    celebration,
    clearCelebration,
    addBook,
    addBooks,
    updateBook,
    finishBook,
    deleteBook,
    addWithdrawal,
    deleteWithdrawal,
    setSettings,
    replaceAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
