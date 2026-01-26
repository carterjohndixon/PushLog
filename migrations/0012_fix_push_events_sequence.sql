-- Fix push_events sequence if it's stuck or reset
-- This ensures the sequence continues from the highest existing ID

-- Get the current maximum ID from push_events
DO $$
DECLARE
    max_id INTEGER;
    current_seq_val BIGINT;
BEGIN
    -- Get the maximum ID currently in the table
    SELECT COALESCE(MAX(id), 0) INTO max_id FROM push_events;
    
    -- Get the current sequence value
    SELECT last_value INTO current_seq_val FROM push_events_id_seq;
    
    -- If the sequence is behind the max ID, reset it
    IF current_seq_val < max_id THEN
        RAISE NOTICE 'Sequence is behind max ID. Max ID: %, Current sequence: %', max_id, current_seq_val;
        PERFORM setval('push_events_id_seq', max_id, true);
        RAISE NOTICE 'Sequence reset to: %', max_id;
    ELSE
        RAISE NOTICE 'Sequence is correct. Max ID: %, Current sequence: %', max_id, current_seq_val;
    END IF;
END $$;

-- Verify the sequence is working
SELECT 
    (SELECT MAX(id) FROM push_events) as max_id,
    (SELECT last_value FROM push_events_id_seq) as sequence_value,
    (SELECT last_value FROM push_events_id_seq) >= (SELECT MAX(id) FROM push_events) as is_correct;
