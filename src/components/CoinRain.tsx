import { useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { yen } from '../types';
import Icon from './Icon';

export default function CoinRain({ amount }: { amount: number }) {
  const { clearCelebration } = useStore();

  useEffect(() => {
    const t = setTimeout(clearCelebration, 2600);
    return () => clearTimeout(t);
  }, [clearCelebration]);

  const coins = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        left: 8 + Math.random() * 84,
        delay: Math.random() * 0.9,
        size: 22 + Math.random() * 18,
        id: i,
      })),
    []
  );

  return (
    <div className="coin-overlay" onClick={clearCelebration}>
      {coins.map((c) => (
        <span
          key={c.id}
          className="coin"
          style={{
            left: c.left + '%',
            animationDelay: c.delay + 's',
            fontSize: c.size + 'px',
          }}
        >
          <span className="coin-yen">¥</span>
        </span>
      ))}
      <div className="coin-message">
        <div className="coin-pig"><Icon name="piggy" size={42} /></div>
        <div className="coin-amount">+{yen(amount)}</div>
        <div className="coin-note">読了おめでとう！貯金しました</div>
      </div>
    </div>
  );
}
