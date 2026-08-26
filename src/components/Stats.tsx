import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { yen, type Book } from '../types';
import Icon from './Icon';

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dateKey(d: Date): string {
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export default function Stats() {
  const { books } = useStore();
  const [metric, setMetric] = useState<'count' | 'yen'>('count');

  const done = useMemo(
    () => books.filter((b): b is Book & { finishedAt: string } => b.status === 'done' && !!b.finishedAt),
    [books]
  );

  // ---- 月別グラフ（直近12ヶ月） ----
  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      return { key: monthKey(d), label: `${d.getMonth() + 1}月` };
    });
  }, []);

  const monthly = useMemo(
    () =>
      months.map((m) => {
        const inMonth = done.filter((b) => b.finishedAt.startsWith(m.key));
        return {
          ...m,
          count: inMonth.length,
          yen: inMonth.reduce((s, b) => s + (b.savedYen ?? 0), 0),
        };
      }),
    [months, done]
  );
  const maxVal = Math.max(1, ...monthly.map((m) => m[metric]));

  // ---- 年間サマリー ----
  const year = String(new Date().getFullYear());
  const yearDone = done.filter((b) => b.finishedAt.startsWith(year));
  const yearPages = yearDone.reduce((s, b) => s + (b.pageCount ?? 0), 0);
  const yearSaved = yearDone.reduce((s, b) => s + (b.savedYen ?? 0), 0);
  const monthsElapsed = new Date().getMonth() + 1;
  const avgPerMonth = (yearDone.length / monthsElapsed).toFixed(1);

  // ---- 読書カレンダー（月表示・読了した本を表示） ----
  const finishedByDate = useMemo(() => {
    const m = new Map<string, Book[]>();
    for (const b of done) {
      const arr = m.get(b.finishedAt) ?? [];
      arr.push(b);
      m.set(b.finishedAt, arr);
    }
    return m;
  }, [done]);

  const [calDate, setCalDate] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const shiftMonth = (delta: number) =>
    setCalDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));

  const calendar = useMemo(() => {
    const y = calDate.getFullYear();
    const mo = calDate.getMonth();
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const lead = new Date(y, mo, 1).getDay(); // 0=日
    const todayKey = dateKey(new Date());
    const cells: (
      | { day: number; date: string; dow: number; books: Book[]; today: boolean }
      | null
    )[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, mo, d);
      const key = dateKey(date);
      cells.push({
        day: d,
        date: key,
        dow: date.getDay(),
        books: finishedByDate.get(key) ?? [],
        today: key === todayKey,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calDate, finishedByDate]);

  const monthCount = calendar.reduce((s, c) => s + (c ? c.books.length : 0), 0);
  const isCurrentMonth =
    calDate.getFullYear() === new Date().getFullYear() &&
    calDate.getMonth() === new Date().getMonth();

  return (
    <div className="page">
      <header className="page-header">
        <h1><Icon name="chart" size={24} /> 統計</h1>
      </header>

      <section className="card">
        <div className="card-head-row">
          <h2>月別のあゆみ</h2>
          <div className="toggle-group">
            <button
              className={'chip' + (metric === 'count' ? ' active' : '')}
              onClick={() => setMetric('count')}
            >
              冊数
            </button>
            <button
              className={'chip' + (metric === 'yen' ? ' active' : '')}
              onClick={() => setMetric('yen')}
            >
              貯金額
            </button>
          </div>
        </div>
        <svg viewBox="0 0 360 170" className="bar-chart">
          {monthly.map((m, i) => {
            const h = (m[metric] / maxVal) * 110;
            const x = 8 + i * 29.5;
            return (
              <g key={m.key}>
                <rect
                  x={x}
                  y={135 - h}
                  width={20}
                  height={Math.max(h, m[metric] > 0 ? 3 : 0)}
                  rx={4}
                  fill={metric === 'count' ? '#ad4c2e' : '#d99a3a'}
                />
                {m[metric] > 0 && (
                  <text x={x + 10} y={128 - h} textAnchor="middle" fontSize={9} fill="#2c2018">
                    {metric === 'yen' ? (m.yen >= 10000 ? Math.round(m.yen / 1000) + 'k' : m.yen) : m.count}
                  </text>
                )}
                <text x={x + 10} y={150} textAnchor="middle" fontSize={9} fill="#7a6450">
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <section className="card">
        <h2>{year}年のまとめ</h2>
        <div className="summary-grid">
          <div className="mini-card"><div className="mini-value">{yearDone.length}冊</div><div className="mini-label">読了</div></div>
          <div className="mini-card"><div className="mini-value">{yearPages.toLocaleString()}p</div><div className="mini-label">総ページ</div></div>
          <div className="mini-card"><div className="mini-value">{yen(yearSaved)}</div><div className="mini-label">貯金</div></div>
          <div className="mini-card"><div className="mini-value">{avgPerMonth}冊</div><div className="mini-label">月平均</div></div>
        </div>
      </section>

      <section className="card">
        <div className="cal-head">
          <button className="cal-nav" onClick={() => shiftMonth(-1)} aria-label="前の月">
            <Icon name="chevronLeft" size={18} />
          </button>
          <div className="cal-title">
            <h2>{calDate.getFullYear()}年 {calDate.getMonth() + 1}月</h2>
            <span className="cal-sub">読了 {monthCount}冊</span>
          </div>
          <button
            className="cal-nav"
            onClick={() => shiftMonth(1)}
            aria-label="次の月"
            disabled={isCurrentMonth}
          >
            <Icon name="chevronRight" size={18} />
          </button>
        </div>

        <div className="cal-grid">
          {DOW.map((w, i) => (
            <div key={w} className={'cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</div>
          ))}
          {calendar.map((c, i) =>
            c === null ? (
              <div key={i} className="cal-cell empty" />
            ) : (
              <div
                key={i}
                className={
                  'cal-cell' +
                  (c.books.length ? ' has' : '') +
                  (c.today ? ' today' : '') +
                  (c.dow === 0 ? ' sun' : c.dow === 6 ? ' sat' : '')
                }
                title={
                  c.books.length
                    ? `${c.date}：${c.books.map((b) => b.title).join('、')}`
                    : c.date
                }
              >
                <span className="cal-day">{c.day}</span>
                {c.books.length > 0 && (
                  <span className="cal-mark">
                    <Icon name="book" size={11} />
                    {c.books.length > 1 && <span className="cal-count">{c.books.length}</span>}
                  </span>
                )}
              </div>
            )
          )}
        </div>

        {monthCount === 0 && (
          <p className="empty-hint cal-empty">この月に読了した本はありません</p>
        )}
      </section>
    </div>
  );
}
