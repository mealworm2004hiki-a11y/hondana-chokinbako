import { useStore } from '../store';
import {
  SOURCE_LABEL,
  STATUS_LABEL,
  yen,
  type Book,
  type Source,
  type Status,
} from '../types';
import { useState } from 'react';
import RatingInput from './RatingInput';
import BookCover from './BookCover';
import Icon from './Icon';
import { haptic, Sheet, useToast } from '../ui';

export default function BookDetail({
  book,
  onClose,
}: {
  book: Book;
  onClose: () => void;
}) {
  const { updateBook, finishBook, deleteBook, leaveDone, restoreBook } = useStore();
  const { toast } = useToast();
  // 読了済みから別のステータスへ変えるときの行き先（確認シート表示中）
  const [leavingTo, setLeavingTo] = useState<Status | null>(null);

  const set = (patch: Partial<Book>) => updateBook(book.id, patch);

  const onStatusChange = (s: Status) => {
    if (s === book.status) return;
    if (s === 'done') {
      haptic([12, 40, 18]);
      finishBook(book.id);
    } else if (book.status === 'done') {
      setLeavingTo(s);
    } else {
      haptic(6);
      set({ status: s });
    }
  };

  const onDelete = (close: () => void) => {
    const snapshot = book;
    haptic(14);
    deleteBook(book.id);
    close();
    toast(`「${snapshot.title}」を削除しました`, {
      label: '取り消す',
      onClick: () => restoreBook(snapshot),
    });
  };

  return (
    <Sheet onClose={onClose} title="本の詳細">
      {(close) => (
      <>

        <div className="detail-top">
          <BookCover coverUrl={book.coverUrl} isbn={book.isbn} title={book.title} className="detail-cover" placeholderChars={14} />
          <div className="detail-summary">
            {book.savedYen != null && (
              <div className="saved-chip"><Icon name="coins" size={14} /> {yen(book.savedYen)} 貯金済み</div>
            )}
            {book.isbn && <div className="detail-isbn">ISBN: {book.isbn}</div>}
          </div>
        </div>

        <label className="field">
          <span>タイトル</span>
          <input value={book.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="field">
          <span>著者</span>
          <input value={book.author ?? ''} onChange={(e) => set({ author: e.target.value })} />
        </label>

        <div className="field-row">
          <label className="field">
            <span>定価（税抜）</span>
            <input
              type="number"
              inputMode="numeric"
              value={book.priceYen ?? ''}
              onChange={(e) =>
                set({ priceYen: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </label>
          <label className="field">
            <span>ページ数</span>
            <input
              type="number"
              inputMode="numeric"
              value={book.pageCount ?? ''}
              onChange={(e) =>
                set({ pageCount: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>ステータス</span>
            <select value={book.status} onChange={(e) => onStatusChange(e.target.value as Status)}>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>入手方法</span>
            <select value={book.source} onChange={(e) => set({ source: e.target.value as Source })}>
              {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
              ))}
            </select>
          </label>
        </div>

        {book.source === 'library' && (
          <>
            <div className="field-row">
              <label className="field">
                <span>借りた日</span>
                <input
                  type="date"
                  value={book.borrowedAt ?? ''}
                  onChange={(e) => set({ borrowedAt: e.target.value || undefined })}
                />
              </label>
              <label className="field">
                <span>返却期限</span>
                <input
                  type="date"
                  value={book.dueDate ?? ''}
                  onChange={(e) => set({ dueDate: e.target.value || undefined })}
                />
              </label>
            </div>
            <label className="check-field">
              <input
                type="checkbox"
                checked={book.returned ?? false}
                onChange={(e) => set({ returned: e.target.checked })}
              />
              返却済み
            </label>
          </>
        )}

        {book.status === 'done' && (
          <label className="field">
            <span>読了日（任意）</span>
            <input
              type="date"
              value={book.finishedAt ?? ''}
              onChange={(e) => set({ finishedAt: e.target.value || undefined })}
            />
          </label>
        )}

        <RatingInput value={book.rating} onChange={(rating) => set({ rating })} />

        <label className="field">
          <span>感想メモ</span>
          <textarea
            rows={4}
            value={book.memo ?? ''}
            onChange={(e) => set({ memo: e.target.value })}
            placeholder="この本の感想を残しておく…"
          />
        </label>

        <label className="field">
          <span>タグ（カンマ区切り）</span>
          <input
            value={book.tags.join(', ')}
            onChange={(e) =>
              set({
                tags: e.target.value
                  .split(/[,、，]/)
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
            placeholder="小説, ミステリ"
          />
        </label>

        <div className="modal-actions">
          <button className="btn danger" onClick={() => onDelete(close)}>削除</button>
          <button className="btn primary" onClick={close}>閉じる</button>
        </div>

        {leavingTo && (
          <Sheet onClose={() => setLeavingTo(null)} title="読了をやめますか？" className="choice-sheet">
            {(closeChoice) => (
              <>
                <p className="choice-lead">
                  「{STATUS_LABEL[leavingTo]}」に変えます。
                  {book.savedYen != null
                    ? `この本の貯金（${yen(book.savedYen)}）と読了日はどうしますか？`
                    : 'この本の読了日はどうしますか？'}
                </p>
                <div className="choice-list">
                  <button
                    className="btn primary wide"
                    onClick={() => {
                      haptic(8);
                      leaveDone(book.id, leavingTo, true);
                      closeChoice();
                    }}
                  >
                    読み直し（{book.savedYen != null ? '貯金と' : ''}読了日は残す）
                  </button>
                  <button
                    className="btn wide"
                    onClick={() => {
                      haptic(8);
                      leaveDone(book.id, leavingTo, false);
                      closeChoice();
                    }}
                  >
                    間違いだった（{book.savedYen != null ? '貯金と' : ''}読了日を取り消す）
                  </button>
                  <button className="link-btn muted" onClick={closeChoice}>
                    やめる
                  </button>
                </div>
              </>
            )}
          </Sheet>
        )}
      </>
      )}
    </Sheet>
  );
}
