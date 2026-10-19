import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useStore } from './store';
import { addDays, today, type Book } from './types';
import { haptic, useToast } from './ui';
import BookDetail from './components/BookDetail';
import FinishSheet from './components/FinishSheet';
import ReturnSheet from './components/ReturnSheet';

/* よく使う本の操作（詳細を開く・読了・返却・延長）をどの画面からでも呼べるようにする */

interface BookActions {
  openBook: (id: string) => void;
  quickFinish: (id: string) => void;
  returnBook: (id: string) => void;
  extendBook: (id: string) => void;
}

const Ctx = createContext<BookActions | null>(null);

export function useBookActions(): BookActions {
  const v = useContext(Ctx);
  if (!v) throw new Error('BookActionsProvider missing');
  return v;
}

const md = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
};

export function BookActionsProvider({ children }: { children: ReactNode }) {
  const { books, finishBook, updateBook, restoreBook } = useStore();
  const { toast } = useToast();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<{ id: string; prev: Book } | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);

  const find = useCallback((id: string) => books.find((b) => b.id === id), [books]);

  const openBook = useCallback((id: string) => {
    haptic(6);
    setDetailId(id);
  }, []);

  const quickFinish = useCallback(
    (id: string) => {
      const prev = find(id);
      if (!prev) return;
      haptic([12, 40, 18]);
      finishBook(id);
      setFinishing({ id, prev });
    },
    [find, finishBook]
  );

  const returnBook = useCallback(
    (id: string) => {
      const prev = find(id);
      if (!prev) return;
      if (prev.status === 'done') {
        haptic(10);
        updateBook(id, { returned: true });
        toast(`「${prev.title}」を返却しました`, {
          label: '取り消す',
          onClick: () => restoreBook(prev),
        });
      } else {
        setReturningId(id);
      }
    },
    [find, updateBook, restoreBook, toast]
  );

  const extendBook = useCallback(
    (id: string) => {
      const prev = find(id);
      if (!prev) return;
      const due = addDays(today(), 14);
      haptic(10);
      updateBook(id, { dueDate: due });
      toast(`期限を ${md(due)} まで延長しました`, {
        label: '取り消す',
        onClick: () => restoreBook(prev),
      });
    },
    [find, updateBook, restoreBook, toast]
  );

  const detailBook = detailId ? find(detailId) : undefined;
  const finishBookLive = finishing ? find(finishing.id) : undefined;
  const returningBook = returningId ? find(returningId) : undefined;

  return (
    <Ctx.Provider value={{ openBook, quickFinish, returnBook, extendBook }}>
      {children}
      {detailBook && <BookDetail book={detailBook} onClose={() => setDetailId(null)} />}
      {returningBook && (
        <ReturnSheet
          book={returningBook}
          onClose={() => setReturningId(null)}
          onFinished={(prev) => setFinishing({ id: prev.id, prev })}
        />
      )}
      {finishing && finishBookLive && (
        <FinishSheet
          book={finishBookLive}
          prev={finishing.prev}
          onClose={() => setFinishing(null)}
        />
      )}
    </Ctx.Provider>
  );
}
