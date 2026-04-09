BEGIN;

ALTER TABLE users.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'trader',
    'admin',
    'compliance',
    'external-client',
    'sales',
    'viewer',
    'desk-head',
    'risk-manager'
  ));

INSERT INTO users.users (id, name, role, avatar_emoji, description) VALUES
  (
    'maya',
    'Maya Tanaka',
    'risk-manager',
    '📊',
    'Senior market risk manager — sets VaR and notional limits per desk, halts trading on breach'
  )
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  role         = EXCLUDED.role,
  avatar_emoji = EXCLUDED.avatar_emoji,
  description  = EXCLUDED.description;

INSERT INTO users.trading_limits (
  user_id,
  max_order_qty,
  max_daily_notional,
  allowed_strategies,
  allowed_desks,
  dark_pool_access,
  trading_style,
  primary_desk
) VALUES (
  'maya',
  0,
  0,
  '',
  'equity,fi,derivatives,fx,commodities',
  false,
  'oversight',
  'cross-desk'
)
ON CONFLICT (user_id) DO UPDATE SET
  max_order_qty      = 0,
  max_daily_notional = 0,
  allowed_strategies = '',
  allowed_desks      = EXCLUDED.allowed_desks,
  dark_pool_access   = false,
  trading_style      = 'oversight',
  primary_desk       = 'cross-desk';

INSERT INTO users.user_preferences (user_id, data)
VALUES ('maya', '{}')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.schema_migrations (version) VALUES ('0011_risk_manager_role')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
