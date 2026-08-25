import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import {
  SOURCE_LABEL,
  STATUS_LABEL,
  type Book,
  type Source,
  type Status,
} from '../types';
import BookDetail from './BookDetail';
import BookCover from './BookCover';
import Icon from './Icon';

type SortKey =
  | 'added-desc'
  | 'added-asc'
  | 'finished-desc'
  | 'rating-desc'
  | 'rating-asc'
  | 'title'
  | 'author'
  | 'price-desc'
  | 'due-asc';

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: 'added-desc', label: '登録が新しい順' },
  { id: 'added-asc', label: '登録が古い順' },
  { id: 'finished-desc', label: '読了日が新しい順' },
  { id: 'rating-desc', label: '評価が高い順' },
  { id: 'rating-asc', label: '評価が低い順' },
  { id: 'title', label: 'タイトル順' },
  { id: 'author', label: '著者順' },
  { id: 'price-desc', label: '定価が高い順' },
  { id: 'due-asc', label: '返却期限が近い順' },
];

type View = 'cover' | 'spine';

/** 背表紙の色パレット（純喫茶テーマに寄せた落ち着いた配色） */
const SPINE_COLORS = [
  '#8c3b21', '#3a6350', '#6b4a2f', '#4f6f8f', '#a2543f',
  '#5a6e46', '#7d5a86', '#b0813a', '#2f5560', '#8a4a52',
  '#556b7a', '#7a6450',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function spineColor(b: Book): string {
  return SPINE_COLORS[hashStr(b.title + (b.author ?? '')) % SPINE_COLORS.length];
}

/** ページ数に応じた背表紙の厚み（px）。不明なら中庸。 */
function spineWidth(b: Book): number {
  const p = b.pageCount ?? 240;
  return Math.round(Math.max(34, Math.min(54, 26 + p / 14)));
}

/** 背表紙を棚の横幅に合わせて行ごとに詰める */
function packRows(books: Book[], budget: number): Book[][] {
  const rows: Book[][] = [];
  let row: Book[] = [];
  let used = 0;
  for (const b of books) {
    const w = spineWidth(b) + 4; // gap込み
    if (used + w > budget && row.length > 0) {
      rows.push(row);
      row = [];
      used = 0;
    }
    row.push(b);
    used += w;
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

function sortBooks(books: Book[], key: SortKey): Book[] {
  const bs = [...books];
  const collator = new Intl.Collator('ja');
  switch (key) {
    case 'added-desc':
      return bs.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
    case 'added-asc':
      return bs.sort((a, b) => (a.addedAt < b.addedAt ? -1 : 1));
    case 'finished-desc':
      return bs.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));
    case 'rating-desc':
      return bs.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    case 'rating-asc':
      return bs.sort((a, b) => (a.rating ?? 99) - (b.rating ?? 99));
    case 'title':
      return bs.sort((a, b) => collator.compare(a.title, b.title));
    case 'author':
      return bs.sort((a, b) => collator.compare(a.author ?? '', b.author ?? ''));
    case 'price-desc':
      return bs.sort((a, b) => (b.priceYen ?? -1) - (a.priceYen ?? -1));
    case 'due-asc':
      return bs.sort((a, b) =>
        (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99')
      );
  }
}

export default function Shelf() {
  const { books } = useStore();
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [source, setSource] = useState<Source | 'all'>('all');
  const [tag, setTag] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('rating-desc');
  const [openId, setOpenId] = useState<string | null>(null);
  const [view, setView] = useState<View>(
    () => (localStorage.getItem('shelfView') as View) || 'cover'
  );

  const changeView = (v: View) => {
    setView(v);
    localStorage.setItem('shelfView', v);
  };

  const allTags = useMemo(
    () => Array.from(new Set(books.flatMap((b) => b.tags))).sort(),
    [books]
  );

  const shown = useMemo(() => {
    let bs = books;
    if (status !== 'all') bs = bs.filter((b) => b.status === status);
    if (source !== 'all') bs = bs.filter((b) => b.source === source);
    if (tag !== 'all') bs = bs.filter((b) => b.tags.includes(tag));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      bs = bs.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.author ?? '').toLowerCase().includes(q)
      );
    }
    return sortBooks(bs, sort);
  }, [books, status, source, tag, query, sort]);

  const shelfRef = useRef<HTMLDivElement>(null);
  const [shelfW, setShelfW] = useState(320);
  useEffect(() => {
    if (view !== 'spine') return;
    const measure = () => {
      const el = shelfRef.current;
      if (el) setShelfW(el.clientWidth - 28); // 内側パディング分を差し引く
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [view]);

  const spineRows = useMemo(
    () => (view === 'spine' ? packRows(shown, shelfW) : []),
    [view, shown, shelfW]
  );

  const openBook = openId ? books.find((b) => b.id === openId) : undefined;

  return (
    <div className="page">
      <header className="page-header">
        <h1><Icon name="library" size={24} /> 本棚 <span className="count-badge">{shown.length}冊</span></h1>
      </header>

      <div className="shelf-controls">
        <input
          className="search-input"
          type="search"
          placeholder="タイトル・著者で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chip-row">
          {(['all', 'want', 'reading', 'done', 'tsundoku'] as const).map((s) => (
            <button
              key={s}
              className={'chip' + (status === s ? ' active' : '')}
              onClick={() => setStatus(s)}
            >
              {s === 'all' ? 'すべて' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="select-row">
          <select value={source} onChange={(e) => setSource(e.target.value as Source | 'all')}>
            <option value="all">入手方法: 全部</option>
            {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
              <option key={s} value={s}>{SOURCE_LABEL[s]}</option>
            ))}
          </select>
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="all">タグ: 全部</option>
            {allTags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="view-toggle">
          <button
            className={'seg' + (view === 'cover' ? ' active' : '')}
            onClick={() => changeView('cover')}
          >
            <Icon name="grid" size={15} /> 表紙
          </button>
          <button
            className={'seg' + (view === 'spine' ? ' active' : '')}
            onClick={() => changeView('spine')}
          >
            <Icon name="spine" size={15} /> 背表紙
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="empty-hint">該当する本がありません。「登録」タブから追加できます。</p>
      ) : view === 'spine' ? (
        <div className="bookshelf" ref={shelfRef}>
          {spineRows.map((row, i) => (
            <div className="shelf-row" key={i}>
              <div className="shelf-books">
                {row.map((b) => (
                  <button
                    key={b.id}
                    className={'spine' + (b.status === 'reading' ? ' reading' : '')}
                    style={{ width: spineWidth(b), background: spineColor(b) }}
                    onClick={() => setOpenId(b.id)}
                    title={b.title}
                  >
                    {b.rating != null && (
                      <span className="spine-rating">★{b.rating.toFixed(1)}</span>
                    )}
                    <span className="spine-title">{b.title}</span>
                  </button>
                ))}
              </div>
              <div className="shelf-plank" />
            </div>
          ))}
        </div>
      ) : (
        <div className="shelf-grid">
          {shown.map((b) => (
            <button key={b.id} className="shelf-item" onClick={() => setOpenId(b.id)}>
              <div className="shelf-cover-wrap">
                <BookCover coverUrl={b.coverUrl} isbn={b.isbn} title={b.title} className="shelf-cover" />
                {b.rating != null && (
                  <div className="rating-badge">
                    <span className="rb-star">★</span>
                    <span className="rb-num">{b.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>

              <div className="shelf-badges">
                <span className={'badge src-' + b.source}>{SOURCE_LABEL[b.source]}</span>
                <span className={'badge st-' + b.status}>{STATUS_LABEL[b.status]}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {openBook && <BookDetail book={openBook} onClose={() => setOpenId(null)} />}
    </div>
  );
}
