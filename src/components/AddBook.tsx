import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useBookActions } from '../actions';
import { haptic, useToast } from '../ui';
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

// 前回選んだ入手方法・ステータスを覚えておく
const DEFAULTS_KEY = 'hondana.addDefaults';
function loadDefaults(): { source: Source; status: Status } {
  try {
    const v = JSON.parse(localStorage.getItem(DEFAULTS_KEY) ?? '{}');
    if (v.source in SOURCE_LABEL && v.status in STATUS_LABEL && v.status !== 'done') return v;
  } catch {
    /* 読めなければ初期値 */
  }
  return { source: 'library', status: 'reading' };
}
function saveDefaults(source: Source, status: Status) {
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify({ source, status }));
  } catch {
    /* 保存できなくても登録は続ける */
  }
}

const normTitle = (t: string) => t.normalize('NFKC').replace(/\s+/g, '').toLowerCase();

const emptyDraft = (): Draft => ({
  ...loadDefaults(),
  isbn: '',
  title: '',
  author: '',
  publisher: '',
  coverUrl: '',
  priceYen: '',
  pageCount: '',
  borrowedAt: today(),
  dueDate: addDays(today(), 14),
  tags: '',
});

type Mode = 'keyword' | 'scan';

export default function AddBook() {
  const { books, addBook, updateBook } = useStore();
  const { openBook } = useBookActions();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('keyword');
  // バーコードで読み取った本を登録したら、次の本のためにカメラを開き直す
  const [fromScan, setFromScan] = useState(false);
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
    async (isbn: string, viaScan = false) => {
      if (viaScan) haptic(15);
      setFromScan(viaScan);
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

  const onScanDetect = useCallback((isbn: string) => fillFromIsbn(isbn, true), [fillFromIsbn]);

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
      setFromScan(false);
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

  // 本棚にすでにある本（ISBNかタイトルが一致）
  const duplicate = useMemo(() => {
    const isbn = draft.isbn.trim();
    const t = normTitle(draft.title);
    if (!isbn && !t) return undefined;
    return books.find(
      (b) => (isbn && b.isbn === isbn) || (t && normTitle(b.title) === t)
    );
  }, [books, draft.isbn, draft.title]);

  const afterSave = (title: string, id: string, verb = '登録') => {
    saveDefaults(draft.source, draft.status);
    setDraft(emptyDraft());
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast(`「${title}」を${verb}しました`, { label: '見る', onClick: () => openBook(id) });
    if (fromScan) setScanning(true);
  };

  // 既存の記録を、今の入力（入手方法・ステータス・借りた日）で更新する
  const updateExisting = () => {
    if (!duplicate) return;
    const lib = draft.source === 'library';
    const price = Number(draft.priceYen);
    const pages = Number(draft.pageCount);
    haptic(12);
    updateBook(duplicate.id, {
      source: draft.source,
      status: draft.status,
      // 読了日・貯金は残す（読み直しでも貯金は1冊1回）
      borrowedAt: lib ? draft.borrowedAt || undefined : duplicate.borrowedAt,
      dueDate: lib ? draft.dueDate || undefined : duplicate.dueDate,
      returned: lib ? false : duplicate.returned,
      isbn: duplicate.isbn ?? (draft.isbn.trim() || undefined),
      coverUrl: duplicate.coverUrl ?? (draft.coverUrl.trim() || undefined),
      priceYen: duplicate.priceYen ?? (price > 0 ? price : undefined),
      pageCount: duplicate.pageCount ?? (pages > 0 ? pages : undefined),
    });
    afterSave(duplicate.title, duplicate.id, '更新');
  };

  const submit = () => {
    if (!draft.title.trim()) {
      setMessage('タイトルを入力してください');
      haptic([20, 40, 20]);
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
    haptic(12);
    addBook(book);
    afterSave(book.title, book.id);
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1><Icon name="camera" size={24} /> 本を登録</h1>
      </header>

      {scanning ? (
        <Suspense fallback={<p className="notice">カメラを準備中…</p>}>
          <Scanner
            onDetect={onScanDetect}
            onClose={() => {
              setScanning(false);
              setFromScan(false);
            }}
          />
        </Suspense>
      ) : (
        <section className="card">
          <div className="seg-group">
            <button
              className={'seg' + (mode === 'keyword' ? ' active' : '')}
              onClick={() => {
                setMode('keyword');
                setFromScan(false);
              }}
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
                  type="search"
                  enterKeyHint="search"
                  placeholder="書名・著者などで検索"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                      runSearch();
                    }
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

        {duplicate ? (
          <div className="dup-box">
            <p>
              この本はもう本棚にあります（{SOURCE_LABEL[duplicate.source]}・
              {STATUS_LABEL[duplicate.status]}）
            </p>
            <button className="btn primary wide" onClick={updateExisting}>
              {draft.source === 'library'
                ? 'この本を借りたことにする'
                : `この本を「${STATUS_LABEL[draft.status]}」に更新する`}
            </button>
            <div className="dup-actions">
              <button className="link-btn" onClick={() => openBook(duplicate.id)}>
                本棚の記録を見る
              </button>
              <button className="link-btn muted" onClick={submit}>
                別の本として登録
              </button>
            </div>
          </div>
        ) : (
          <button className="btn primary wide" onClick={submit}>
            <Icon name="library" size={18} /> 本棚に登録する
          </button>
        )}
      </section>
    </div>
  );
}
