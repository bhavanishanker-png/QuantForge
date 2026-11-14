import {
  Activity,
  Bot,
  CandlestickChart,
  FlaskConical,
  LayoutDashboard,
  type LucideIcon,
  Settings,
  SlidersHorizontal,
  Sigma,
  Wallet,
  Workflow,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Roadmap phase in which the module arrives; undefined = available now. */
  phase?: number;
  blurb?: string;
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/markets', label: 'Markets', icon: CandlestickChart, phase: 2, blurb: 'Binance spot candles for BTC, ETH and SOL with data-quality reports and live updates.' },
  { to: '/strategies', label: 'Strategies', icon: Workflow, phase: 3, blurb: 'Built-in strategies and a JSON rule language, with immutable versions.' },
  { to: '/backtesting', label: 'Backtesting', icon: FlaskConical, phase: 4, blurb: 'Reproducible backtests with explicit costs and next-bar execution.' },
  { to: '/optimization', label: 'Optimization', icon: SlidersHorizontal, phase: 6, blurb: 'Parameter search with walk-forward validation and a protected holdout.' },
  { to: '/factor-lab', label: 'Factor Lab', icon: Sigma, phase: 7, blurb: 'Information coefficient, decay and correlation for technical factors.' },
  { to: '/virtual-trading', label: 'Virtual Trading', icon: Wallet, phase: 5, blurb: 'Simulated accounts that run strategies forward with exact accounting.' },
  { to: '/assistant', label: 'AI Assistant', icon: Bot, phase: 8, blurb: 'Ask questions about your real strategies and results.' },
  { to: '/jobs', label: 'Job Monitor', icon: Activity },
  { to: '/settings', label: 'Settings', icon: Settings },
];
