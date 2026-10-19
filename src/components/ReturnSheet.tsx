import { useStore } from '../store';
import type { Book } from '../types';
import { haptic, Sheet, useToast } from '../ui';

/** 未読了の図書館本を返すとき：読み終えたか、読まずに返したかを聞く */
export default function ReturnSheet({
  book,
  onClose,
  onFinished,
}: {
  book: Book;
  onClose: () => void;
  /** 「読了した」を選んだら読了シートへ引き継ぐ（引数は返却前の状態） */
  onFinished: (prev: Book) => void;
}) {
  const { finishBook, updateBook, restoreBook } = useStore();
  const { toast } = useToast();

  return (
    <Sheet onClose={onClose} title="返却" className="choice-sheet">
      {(close) => (
        <>
          <p className="choice-lead">「{book.title}」は読み終えましたか？</p>
          <div className="choice-list">
            <button
              className="btn primary wide"
              onClick={() => {
                const prev = book;
                haptic([12, 40, 18]);
                finishBook(book.id);
                updateBook(book.id, { returned: true });
                close();
                onFinished(prev);
              }}
            >
              読了した
            </button>
            <button
              className="btn wide"
              onClick={() => {
                const prev = book;
                haptic(10);
                updateBook(book.id, { returned: true, status: 'want' });
                close();
                toast('「読みたい」に戻しました', {
                  label: '取り消す',
                  onClick: () => restoreBook(prev),
                });
              }}
            >
              読まずに返した（「読みたい」に戻す）
            </button>
            <button className="link-btn muted" onClick={close}>
              やめる
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
