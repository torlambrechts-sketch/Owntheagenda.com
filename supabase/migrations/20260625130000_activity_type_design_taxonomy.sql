-- Adopt the design's block taxonomy. Additive only here (Postgres enum values
-- cannot be added and used in the same transaction); legacy rows are remapped in
-- a later migration once the run modules understand the new types.
alter type activity_type add value if not exists 'framing';
alter type activity_type add value if not exists 'discussion';
alter type activity_type add value if not exists 'breakout';
alter type activity_type add value if not exists 'decision';
alter type activity_type add value if not exists 'actions';
alter type activity_type add value if not exists 'reflect';
alter type activity_type add value if not exists 'break';
