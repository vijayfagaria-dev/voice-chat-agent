-- A claim the customer deleted from the list is hidden, not erased: the append-only history stays, and nothing about it
-- (timers, delivery) may finalize or send it again.
ALTER TABLE sessions ADD COLUMN deleted_at timestamptz;
