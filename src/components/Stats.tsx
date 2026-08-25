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

const SPINE_COLORS = ['#ad4c2e', '#2e4a44', '#d99a3a', '#9c6b3a', '#7d5a4a', '#b0432c', '#3a6350'];

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

  // ---- 読書カレンダー（直近26週の草マップ） ----
  const heatmap = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of done) counts.set(b.finishedAt, (counts.get(b.finishedAt) ?? 0) + 1);
    const todayD = new Date();
    // 直近の土曜日を右端の列末尾とする
    const end = new Date(todayD);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const weeks: { date: string; count: number; future: boolean }[][] = [];
    for (let w = 25; w >= 0; w--) {
      const col: { date: string; count: number; future: boolean }[] = [];
      for (let dow = 0; dow < 7; dow++) {
        const d = new Date(end);
        d.setDate(end.getDate() - w * 7 - (6 - dow));
        const key = dateKey(d);
        col.push({ date: key, count: counts.get(key) ?? 0, future: d > todayD });
      }
      weeks.push(col);
    }
    return weeks;
  }, [done]);

  // ---- 積み上がる本の山 ----
  const pile = useMemo(
    () =>
      [...done]
        .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))
        .slice(-20),
    [done]
  );
  const pileH = Math.max(60, pile.length * 20 + 30);

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
        <h2>読書カレンダー</h2>
        <div className="heatmap-scroll">
          <div className="heatmap">
            {heatmap.map((col, i) => (
              <div key={i} className="heat-col">
                {col.map((cell) => (
                  <div
                    key={cell.date}
                    title={`${cell.date}: ${cell.count}冊`}
                    className={
                      'heat-cell' +
                      (cell.future ? ' future' : ' lv' + Math.min(cell.count, 3))
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="heat-legend">
          少 <span className="heat-cell lv0" /><span className="heat-cell lv1" /><span className="heat-cell lv2" /><span className="heat-cell lv3" /> 多
        </div>
      </section>

      <section className="card">
        <h2>積み上がった本の山（直近{pile.length}冊）</h2>
        {pile.length === 0 ? (
          <p className="empty-hint">読了した本がここに積み上がっていきます</p>
        ) : (
          <svg viewBox={`0 0 320 ${pileH}`} className="pile-chart">
            <line x1={20} y1={pileH - 12} x2={300} y2={pileH - 12} stroke="#d8c3a0" strokeWidth={3} strokeLinecap="round" />
            {pile.map((b, i) => {
              const hash = [...b.title].reduce((a, c) => a + c.charCodeAt(0), 0);
              const w = 130 + (hash % 90);
              const x = 160 - w / 2 + ((hash % 21) - 10);
              const y = pileH - 12 - (i + 1) * 20 + 1;
              return (
                <g key={b.id}>
                  <rect x={x} y={y} width={w} height={17} rx={4}
                    fill={SPINE_COLORS[i % SPINE_COLORS.length]} />
                  <text x={160} y={y + 12} textAnchor="middle" fontSize={9.5} fill="#fff">
                    {b.title.length > 16 ? b.title.slice(0, 15) + '…' : b.title}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </section>
    </div>
  );
}
