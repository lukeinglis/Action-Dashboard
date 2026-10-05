-- Saved Views and working state persist their date window, so changing the
-- default in code does not reach rows created before this migration. A
-- rolling window with pastHours = 0 opens at "now", which drops a game from
-- the Schedule Rail (and from View restore) the moment it kicks off.

update dashboard_views
set filters = jsonb_set(filters, '{dateWindow,pastHours}', '12'::jsonb)
where filters -> 'dateWindow' ->> 'kind' = 'rolling'
  and filters -> 'dateWindow' ->> 'pastHours' = '0';

update workspace_state
set filters = jsonb_set(filters, '{dateWindow,pastHours}', '12'::jsonb)
where filters -> 'dateWindow' ->> 'kind' = 'rolling'
  and filters -> 'dateWindow' ->> 'pastHours' = '0';
