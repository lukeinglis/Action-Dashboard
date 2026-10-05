-- Short codes and colors are the cross-reference handle between the Schedule
-- Rail (action grouped by game) and the ticket grid (action grouped by ticket),
-- the same role the 3-letter tags play on the printed cheat sheets.
--
-- Both stay nullable: src/lib/tickets/ticket-code.ts derives a stable code and
-- color from the name and id when the column is empty, so existing tickets need
-- no backfill and the columns only hold user overrides.

alter table tickets
  add column code text,
  add column color text;
