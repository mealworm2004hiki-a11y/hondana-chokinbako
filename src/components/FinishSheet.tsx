import { useStore } from '../store';
import { yen, type Book } from '../types';
import { haptic, Sheet, useToast } from '../ui';
import BookCover from './BookCover';
import RatingInput from './RatingInput';
import Icon from './Icon';

/** 読了直後に出す小さなシート：評価・ひとことメモ・返却。誤タップ用の取り消しも置く */
export default function FinishSheet({
  book,
  prev,
  onClose,
}: {
  book: Book;
  /** 読了前の状態（取り消し用） */
  prev: Book;
  onClose: () => void;
}) {
  const { updateBook, restoreBook } = useStore();
  const { toast } = useToast();
  const set = (patch: Partial<Book>) => updateBook(book.id, patch);
  const gained = prev.savedYen == null && book.savedYen != null ? book.savedYen : 0;
  // 返却の質問は、もともと未返却だった図書館の本だけに出す
  const askReturn = book.source === 'library' && !prev.returned;

  return (
    <Sheet onClose={onClose} title="読了おめでとう！" className="finish-sheet">
      {(close) => (
        <>
          <div className="finish-top">
            <BookCover
              coverUrl={book.coverUrl}
              isbn={book.isbn}
              title={book.title}
              className="finish-cover"
              placeholderChars={10}
            />
            <div className="finish-meta">
              <div className="finish-title">{book.title}</div>
              {gained > 0 ? (
                <div className="saved-chip">
                  <Icon name="coins" size={14} /> +{yen(gained)} 貯金
                </div>
              ) : (
                book.savedYen != null && (
                  <div className="finish-note">読み直し（貯金は前回分のまま）</div>
                )
              )}
            </div>
          </div>

          <RatingInput value={book.rating} onChange={(rating) => set({ rating })} />

          <label className="field">
            <span>ひとことメモ</span>
            <textarea
              rows={2}
              value={book.memo ?? ''}
              onChange={(e) => set({ memo: e.target.value })}
              placeholder="一番印象に残ったこと…"
            />
          </label>

          {askReturn && (
            <button
              className={'toggle-row' + (book.returned ? ' on' : '')}
              onClick={() => {
                haptic(8);
                set({ returned: !book.returned });
              }}
            >
              <span className="toggle-box">{book.returned ? '✓' : ''}</span>
              図書館に返却も済んだ
            </button>
          )}

          <div className="modal-actions">
            <button
              className="link-btn muted"
              onClick={() => {
                restoreBook(prev);
                close();
                toast('読了を取り消しました');
              }}
            >
              ← 読了を取り消す
            </button>
            <button className="btn primary" onClick={close}>
              完了
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
