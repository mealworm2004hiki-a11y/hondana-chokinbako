import { lazy, Suspense, useCallback, useState } from 'react';
import { lookupIsbn, searchBooks, type BookInfo } from '../api';
import { useStore } from '../store';
import {
  addDays,
  SOURCE_LABEL,
  STATUS_LABEL,
  today,
  uid,
  type Book,
  type Source,
  type Status,
} from '../types';
const Scanner = lazy(() => import('./Scanner'));
import BookCover from './BookCover';
import Icon from './Icon';

interface Draft {
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  coverUrl: string;
  priceYen: string;
  pageCount: string;
  status: Status;
  source: Source;
  borrowedAt: string;
  dueDate: string;
  tags: string;
}

const emptyDraft = (): Draft => ({
  isbn: '',
  title: '',
  author: '',
  publisher: '',
  coverUrl: '',
  priceYen: '',
  pageCount: '',
  status: 'reading',
  source: 'library',
  borrowedAt: today(),
  dueDate: addDays(today(), 14),
  tags: '',
});

type Mode = 'keyword' | 'scan';

export default function AddBook({ onAdded }: { onAdded: () => void }) {
  const { addBook } = useStore();
  const [mode, setMode] = useState<Mode>('keyword');
  const [scanning, setScanning] = useState(false);
  const [looking, setLooking] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [message, setMessage] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<BookInfo[] | null>(null);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const applyInfo = useCallback((info: BookInfo, isbn: string) => {
    setDraft((d) => ({
      ...d,
      isbn,
      title: info.title,
      author: info.author ?? d.author,
      publisher: info.publisher ?? d.publisher,
      coverUrl: info.coverUrl ?? d.coverUrl,
      priceYen: info.priceYen != null ? String(info.priceYen) : d.priceYen,
      pageCount: info.pageCount != null ? String(info.pageCount) : d.pageCount,
    }));
  }, []);

  const fillFromIsbn = useCallback(
    async (isbn: string) => {
      setScanning(false);
      setLooking(true);
      setMessage(null);
      const info = await lookupIsbn(isbn);
      setLooking(false);
      if (info) {
        applyInfo(info, isbn);
        setMessage(`「${info.title}」の情報を取得しました`);
      } else {
        setDraft((d) => ({ ...d, isbn }));
        setMessage('書誌データが見つかりませんでした。手入力してください。');
      }
    },
    [applyInfo]
  );

  const runSearch = useCallback(async () => {
    const q = keyword.trim();
    if (!q) return;
    setSearching(true);
    setMessage(null);
    setResults(null);
    const found = await searchBooks(q);
    setSearching(false);
    setResults(found);
    if (found.length === 0) {
      setMessage('見つかりませんでした。別のキーワードで試すか、手入力してください。');
    }
  }, [keyword]);

  const pickResult = useCallback(
    async (info: BookInfo) => {
      // まず検索結果の情報で即座に埋める
      applyInfo(info, info.isbn ?? '');
      setResults(null);
      setKeyword('');
      // ISBNがあれば定価などをopenBDで補完する
      if (info.isbn && /^97[89]\d{10}$/.test(info.isbn)) {
        setLooking(true);
        const detail = await lookupIsbn(info.isbn);
        setLooking(false);
        if (detail) applyInfo(detail, info.isbn);
      }
      setMessage(`「${info.title}」を選びました。内容を確認して登録してください。`);
    },
    [applyInfo]
  );

  const submit = () => {
    if (!draft.title.trim()) {
      setMessage('タイトルを入力してください');
      return;
    }
    const price = Number(draft.priceYen);
    const pages = Number(draft.pageCount);
    const book: Book = {
      id: uid(),
      isbn: draft.isbn.trim() || undefined,
      title: draft.title.trim(),
      author: draft.author.trim() || undefined,
      publisher: draft.publisher.trim() || undefined,
      coverUrl: draft.coverUrl.trim() || undefined,
      priceYen: Number.isFinite(price) && price > 0 ? price : undefined,
      pageCount: Number.isFinite(pages) && pages > 0 ? pages : undefined,
      status: draft.status,
      source: draft.source,
      tags: draft.tags.split(/[,、，]/).map((t) => t.trim()).filter(Boolean),
      addedAt: today(),
      borrowedAt: draft.source === 'library' ? draft.borrowedAt || undefined : undefined,
      dueDate: draft.source === 'library' ? draft.dueDate || undefined : undefined,
    };
    addBook(book);
    setDraft(emptyDraft());
    onAdded();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><Icon name="camera" size={24} /> 本を登録</h1>
      </header>

      {scanning ? (
        <Suspense fallback={<p className="notice">カメラを準備中…</p>}>
          <Scanner onDetect={fillFromIsbn} onClose={() => setScanning(false)} />
        </Suspense>
      ) : (
        <section className="card">
          <div className="seg-group">
            <button
              className={'seg' + (mode === 'keyword' ? ' active' : '')}
              onClick={() => setMode('keyword')}
            >
              <Icon name="search" size={16} /> タイトルで探す
            </button>
            <button
              className={'seg' + (mode === 'scan' ? ' active' : '')}
              onClick={() => setMode('scan')}
            >
              <Icon name="scan" size={16} /> バーコード
            </button>
          </div>

          {mode === 'keyword' ? (
            <>
              <div className="isbn-row">
                <input
                  type="text"
                  placeholder="書名・著者などで検索"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') runSearch();
                  }}
                />
                <button
                  className="btn"
                  disabled={!keyword.trim() || searching}
                  onClick={runSearch}
                >
                  {searching ? '検索中…' : '検索'}
                </button>
              </div>

              {searching && <p className="search-status">📚 探しています…</p>}

              {results && results.length > 0 && (
                <ul className="result-list">
                  {results.map((r, i) => (
                    <li key={r.isbn || i}>
                      <button className="result-item" onClick={() => pickResult(r)}>
                        <BookCover
                          coverUrl={r.coverUrl}
                          isbn={r.isbn}
                          title={r.title}
                          className="result-cover"
                          placeholderChars={10}
                        />
                        <div className="result-meta">
                          <span className="result-title">{r.title}</span>
                          {r.author && <span className="result-author">{r.author}</span>}
                          {r.publisher && <span className="result-pub">{r.publisher}</span>}
                        </div>
                        <Icon name="plus" size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              <button className="btn primary wide" onClick={() => setScanning(true)}>
                <Icon name="scan" size={18} /> バーコードをスキャン
              </button>
              <div className="isbn-row">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="ISBNを直接入力（978…）"
                  value={draft.isbn}
                  onChange={(e) => set({ isbn: e.target.value.replace(/[-\s]/g, '') })}
                />
                <button
                  className="btn"
                  disabled={!/^97[89]\d{10}$/.test(draft.isbn) || looking}
                  onClick={() => fillFromIsbn(draft.isbn)}
                >
                  {looking ? '検索中…' : '検索'}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {message && <p className="notice">{message}</p>}

      <section className="card">
        <h2>書誌情報</h2>
        {(draft.coverUrl || draft.isbn) && draft.title && (
          <BookCover
            coverUrl={draft.coverUrl || undefined}
            isbn={draft.isbn || undefined}
            title={draft.title}
            className="add-cover-preview"
          />
        )}
        <label className="field">
          <span>タイトル *</span>
          <input value={draft.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="field">
          <span>著者</span>
          <input value={draft.author} onChange={(e) => set({ author: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>定価（税抜）</span>
            <input
              type="number"
              inputMode="numeric"
              value={draft.priceYen}
              onChange={(e) => set({ priceYen: e.target.value })}
            />
          </label>
          <label className="field">
            <span>ページ数</span>
            <input
              type="number"
              inputMode="numeric"
              value={draft.pageCount}
              onChange={(e) => set({ pageCount: e.target.value })}
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>入手方法</span>
            <select value={draft.source} onChange={(e) => set({ source: e.target.value as Source })}>
              {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>ステータス</span>
            <select value={draft.status} onChange={(e) => set({ status: e.target.value as Status })}>
              {(Object.keys(STATUS_LABEL) as Status[])
                .filter((s) => s !== 'done')
                .map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
            </select>
          </label>
        </div>

        {draft.source === 'library' && (
          <div className="field-row">
            <label className="field">
              <span>借りた日</span>
              <input
                type="date"
                value={draft.borrowedAt}
                onChange={(e) => set({ borrowedAt: e.target.value })}
              />
            </label>
            <label className="field">
              <span>返却期限</span>
              <input
                type="date"
                value={draft.dueDate}
                onChange={(e) => set({ dueDate: e.target.value })}
              />
            </label>
          </div>
        )}

        <label className="field">
          <span>タグ（カンマ区切り）</span>
          <input
            value={draft.tags}
            onChange={(e) => set({ tags: e.target.value })}
            placeholder="小説, ミステリ"
          />
        </label>

        <button className="btn primary wide" onClick={submit}>
          <Icon name="library" size={18} /> 本棚に登録する
        </button>
      </section>
    </div>
  );
}
