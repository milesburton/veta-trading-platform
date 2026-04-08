BEGIN;

ALTER TABLE users.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('trader', 'admin', 'compliance', 'external-client', 'sales', 'viewer', 'desk-head'));

ALTER TABLE users.trading_limits
  ADD COLUMN IF NOT EXISTS trading_style TEXT NOT NULL DEFAULT 'high_touch'
    CHECK (trading_style IN (
      'high_touch',
      'low_touch',
      'fi_voice',
      'fx_electronic',
      'commodities_voice',
      'derivatives_high_touch',
      'derivatives_low_touch',
      'oversight'
    ));

ALTER TABLE users.trading_limits
  ADD COLUMN IF NOT EXISTS primary_desk TEXT NOT NULL DEFAULT 'equity-cash'
    CHECK (primary_desk IN (
      'equity-cash',
      'equity-derivs',
      'fi-rates',
      'fi-credit',
      'fi-govies',
      'fx-cash',
      'commodities',
      'cross-desk'
    ));

ALTER TABLE users.users
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';

UPDATE users.users SET description = '' WHERE description IS NULL;

UPDATE users.users SET
  name = 'Alice Chen',
  avatar_emoji = '👩‍💼',
  description = 'Canonical high-touch equity trader — clicks the ticket, submits orders manually'
WHERE id = 'alice';

UPDATE users.users SET
  name = 'Bob Kumar',
  avatar_emoji = '👨‍💻',
  description = 'Canonical low-touch equity trader — runs VWAP/POV/TWAP algos across the cash book'
WHERE id = 'bob';

UPDATE users.users SET
  name = 'Carol Martinez',
  avatar_emoji = '👩‍🔬',
  description = 'FI voice trader — govies RFQ workflow, duration ladder, yield curve'
WHERE id = 'carol';

UPDATE users.users SET
  name = 'Dave Thompson',
  avatar_emoji = '🧑‍💻',
  description = 'Junior low-touch equity trainee — tight limits, LIMIT/TWAP only'
WHERE id = 'dave';

UPDATE users.users SET
  role = 'desk-head',
  name = 'Frank Delacroix',
  avatar_emoji = '🧑‍💼',
  description = 'Desk head — read-only oversight across equity-cash, equity-derivs and fi-rates'
WHERE id = 'frank';

UPDATE users.users SET
  name = 'Grace Lin',
  avatar_emoji = '👩‍💻',
  description = 'Equity derivatives high-touch options trader — vol surface, greeks, manual pricing'
WHERE id = 'grace';

UPDATE users.users SET
  name = 'Henry Okafor',
  avatar_emoji = '👨‍🔬',
  description = 'FI credit voice trader — high-yield and IG credit RFQs via sales workbench'
WHERE id = 'henry';

UPDATE users.users SET
  name = 'Iris Nakamura',
  avatar_emoji = '👩‍📊',
  description = 'Low-touch equity algo trader — pairs with Bob for multi-user algo demos'
WHERE id = 'iris';

UPDATE users.users SET
  name = 'James Okafor',
  avatar_emoji = '👨‍💼',
  description = 'Senior high-touch equity trader — large tickets, dark pool access, ICEBERG/SNIPER'
WHERE id = 'james';

UPDATE users.users SET
  name = 'Sofia Reyes',
  avatar_emoji = '👩‍🎨',
  description = 'Junior low-touch equity algo trainee — LIMIT/TWAP only, 1k share cap'
WHERE id = 'sofia';

UPDATE users.users SET
  name = 'Omar Hassan',
  avatar_emoji = '👨‍🔬',
  description = 'Low-touch equity derivatives algo trader — vol-targeting strategies'
WHERE id = 'omar';

UPDATE users.users SET
  name = 'Priya Sharma',
  avatar_emoji = '👩‍💻',
  description = 'Derivatives high-touch options specialist — structured payoffs, volatility arb'
WHERE id = 'priya';

UPDATE users.users SET
  name = 'Luca Ferrari',
  avatar_emoji = '🧑‍🎯',
  description = 'FX electronic trader — high-notional cash FX, dark pool crossing'
WHERE id = 'luca';

UPDATE users.users SET
  name = 'Yuki Tanaka',
  avatar_emoji = '👩‍💼',
  description = 'FX cash high-touch desk head — EUR/USD, USD/JPY manual quotes'
WHERE id = 'yuki';

UPDATE users.users SET
  name = 'Rajesh Patel',
  avatar_emoji = '👨‍💻',
  description = 'Physical commodities voice trader — oil, metals, agriculture RFQs'
WHERE id = 'rajesh';

UPDATE users.users SET
  name = 'Amelia Brooks',
  avatar_emoji = '👩‍🎓',
  description = 'High-touch equity trader — mid-cap UK equities, manual execution'
WHERE id = 'amelia';

UPDATE users.users SET
  name = 'Sam Rivera',
  avatar_emoji = '🔍',
  description = 'Compliance officer — read-only audit, session replay, trade review'
WHERE id = 'compliance';

UPDATE users.users SET
  name = 'Admin',
  avatar_emoji = '🛡️',
  description = 'Platform administrator — Mission Control, load test, LLM subsystem, RBAC'
WHERE id = 'admin';

UPDATE users.trading_limits SET
  trading_style = 'high_touch',
  primary_desk = 'equity-cash',
  allowed_desks = 'equity',
  allowed_strategies = 'LIMIT,TWAP,POV,VWAP,ICEBERG,ARRIVAL_PRICE'
WHERE user_id = 'alice';

UPDATE users.trading_limits SET
  trading_style = 'low_touch',
  primary_desk = 'equity-cash',
  allowed_desks = 'equity',
  allowed_strategies = 'LIMIT,TWAP,POV,VWAP'
WHERE user_id = 'bob';

UPDATE users.trading_limits SET
  trading_style = 'fi_voice',
  primary_desk = 'fi-govies',
  allowed_desks = 'fi',
  allowed_strategies = 'LIMIT'
WHERE user_id = 'carol';

UPDATE users.trading_limits SET
  trading_style = 'low_touch',
  primary_desk = 'equity-cash',
  allowed_desks = 'equity',
  allowed_strategies = 'LIMIT,TWAP'
WHERE user_id = 'dave';

UPDATE users.trading_limits SET
  trading_style = 'oversight',
  primary_desk = 'cross-desk',
  allowed_desks = 'equity,fi,derivatives',
  allowed_strategies = '',
  max_order_qty = 0,
  max_daily_notional = 0
WHERE user_id = 'frank';

UPDATE users.trading_limits SET
  trading_style = 'derivatives_high_touch',
  primary_desk = 'equity-derivs',
  allowed_desks = 'derivatives',
  allowed_strategies = 'LIMIT,TWAP,POV,ICEBERG'
WHERE user_id = 'grace';

UPDATE users.trading_limits SET
  trading_style = 'fi_voice',
  primary_desk = 'fi-credit',
  allowed_desks = 'fi',
  allowed_strategies = 'LIMIT'
WHERE user_id = 'henry';

UPDATE users.trading_limits SET
  trading_style = 'low_touch',
  primary_desk = 'equity-cash',
  allowed_desks = 'equity',
  allowed_strategies = 'LIMIT,TWAP,POV,VWAP'
WHERE user_id = 'iris';

UPDATE users.trading_limits SET
  trading_style = 'high_touch',
  primary_desk = 'equity-cash',
  allowed_desks = 'equity',
  allowed_strategies = 'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE'
WHERE user_id = 'james';

UPDATE users.trading_limits SET
  trading_style = 'low_touch',
  primary_desk = 'equity-cash',
  allowed_desks = 'equity',
  allowed_strategies = 'LIMIT,TWAP'
WHERE user_id = 'sofia';

UPDATE users.trading_limits SET
  trading_style = 'derivatives_low_touch',
  primary_desk = 'equity-derivs',
  allowed_desks = 'derivatives',
  allowed_strategies = 'LIMIT,TWAP,POV,VWAP,ICEBERG'
WHERE user_id = 'omar';

UPDATE users.trading_limits SET
  trading_style = 'derivatives_high_touch',
  primary_desk = 'equity-derivs',
  allowed_desks = 'derivatives',
  allowed_strategies = 'LIMIT,TWAP,ICEBERG,ARRIVAL_PRICE'
WHERE user_id = 'priya';

UPDATE users.trading_limits SET
  trading_style = 'fx_electronic',
  primary_desk = 'fx-cash',
  allowed_desks = 'fx',
  allowed_strategies = 'LIMIT,TWAP,POV,VWAP',
  dark_pool_access = true
WHERE user_id = 'luca';

UPDATE users.trading_limits SET
  trading_style = 'high_touch',
  primary_desk = 'fx-cash',
  allowed_desks = 'fx',
  allowed_strategies = 'LIMIT,TWAP'
WHERE user_id = 'yuki';

UPDATE users.trading_limits SET
  trading_style = 'commodities_voice',
  primary_desk = 'commodities',
  allowed_desks = 'commodities',
  allowed_strategies = 'LIMIT'
WHERE user_id = 'rajesh';

UPDATE users.trading_limits SET
  trading_style = 'high_touch',
  primary_desk = 'equity-cash',
  allowed_desks = 'equity',
  allowed_strategies = 'LIMIT,TWAP,POV,VWAP'
WHERE user_id = 'amelia';

UPDATE users.trading_limits SET
  trading_style = 'oversight',
  primary_desk = 'cross-desk',
  allowed_desks = 'equity,fi,derivatives,fx,commodities',
  allowed_strategies = '',
  max_order_qty = 0,
  max_daily_notional = 0
WHERE user_id = 'compliance';

UPDATE users.trading_limits SET
  trading_style = 'oversight',
  primary_desk = 'cross-desk',
  allowed_desks = 'equity,fi,derivatives,fx,commodities',
  allowed_strategies = 'LIMIT,TWAP,POV,VWAP,ICEBERG,SNIPER,ARRIVAL_PRICE,IS,MOMENTUM'
WHERE user_id = 'admin';

INSERT INTO public.schema_migrations (version) VALUES ('0010_trader_personas')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
