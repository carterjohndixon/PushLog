package shipper

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"time"

	"github.com/pushlog/pushlog-agent/internal/parser"
	"github.com/pushlog/pushlog-agent/internal/queue"
	"github.com/pushlog/pushlog-agent/internal/spool"
)

const (
	FlushInterval   = 500 * time.Millisecond
	BatchSize       = 50
	HTTPTimeout     = 10 * time.Second
	MaxBackoff      = 60 * time.Second
	InitialBackoff  = 1 * time.Second
)

type Shipper struct {
	endpoint string
	token    string
	queue    *queue.Bounded
	spool   *spool.Disk
	client   *http.Client
}

func New(endpoint, token string, q *queue.Bounded, sp *spool.Disk) *Shipper {
	return &Shipper{
		endpoint: endpoint + "/api/ingest/events",
		token:    token,
		queue:    q,
		spool:    sp,
		client: &http.Client{
			Timeout: HTTPTimeout,
		},
	}
}

// Run flushes the queue and spool in a loop until ctx is cancelled.
func (s *Shipper) Run(ctx context.Context) {
	// On startup, try to flush any spooled events first
	s.flushSpool(ctx)

	ticker := time.NewTicker(FlushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			s.flushRemaining()
			return
		case <-ticker.C:
			s.flush(ctx)
		}
	}
}

func (s *Shipper) flush(ctx context.Context) {
	for {
		batch := s.queue.Drain(BatchSize)
		if len(batch) == 0 {
			return
		}
		if err := s.sendBatch(ctx, batch); err != nil {
			log.Printf("[shipper] send failed: %v, spooling %d events", err, len(batch))
			if spoolErr := s.spool.Write(batch); spoolErr != nil {
				log.Printf("[shipper] spool write failed: %v (dropping %d events)", spoolErr, len(batch))
			}
			return
		}
	}
}

func (s *Shipper) flushSpool(ctx context.Context) {
	events := s.spool.ReadAll()
	if len(events) == 0 {
		return
	}
	log.Printf("[shipper] flushing %d spooled events", len(events))

	for i := 0; i < len(events); i += BatchSize {
		end := i + BatchSize
		if end > len(events) {
			end = len(events)
		}
		batch := events[i:end]
		if err := s.sendBatch(ctx, batch); err != nil {
			log.Printf("[shipper] spool flush failed: %v, re-spooling %d events", err, len(events)-i)
			if spoolErr := s.spool.Write(events[i:]); spoolErr != nil {
				log.Printf("[shipper] re-spool failed: %v", spoolErr)
			}
			return
		}
	}
}

func (s *Shipper) flushRemaining() {
	batch := s.queue.Drain(s.queue.Len())
	if len(batch) > 0 {
		log.Printf("[shipper] shutdown: spooling %d remaining events", len(batch))
		if err := s.spool.Write(batch); err != nil {
			log.Printf("[shipper] shutdown spool failed: %v", err)
		}
	}
}

func (s *Shipper) sendBatch(ctx context.Context, events []*parser.InboundEvent) error {
	backoff := InitialBackoff

	for _, ev := range events {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		body, err := json.Marshal(ev)
		if err != nil {
			log.Printf("[shipper] marshal error (skipping): %v", err)
			continue
		}

		for attempt := 0; ; attempt++ {
			if ctx.Err() != nil {
				return ctx.Err()
			}

			status, retryAfter, err := s.doPost(ctx, body)
			if err != nil {
				backoff = nextBackoff(backoff)
				log.Printf("[shipper] HTTP error: %v, retry in %s", err, backoff)
				sleep(ctx, backoff)
				continue
			}

			switch {
			case status == 202:
				backoff = InitialBackoff
			case status == 429:
				wait := backoff
				if retryAfter > 0 {
					wait = time.Duration(retryAfter) * time.Second
				}
				log.Printf("[shipper] rate limited, waiting %s", wait)
				sleep(ctx, wait)
				continue
			case status == 400, status == 401:
				return fmt.Errorf("fatal HTTP %d (check token/payload)", status)
			default: // 5xx
				backoff = nextBackoff(backoff)
				log.Printf("[shipper] HTTP %d, retry in %s", status, backoff)
				sleep(ctx, backoff)
				continue
			}

			break
		}
	}
	return nil
}

func (s *Shipper) doPost(ctx context.Context, body []byte) (int, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.endpoint, bytes.NewReader(body))
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return 0, 0, err
	}
	defer func() {
		_, _ = io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()

	retryAfter := 0
	if ra := resp.Header.Get("Retry-After"); ra != "" {
		if v, err := strconv.Atoi(ra); err == nil {
			retryAfter = v
		}
	}

	return resp.StatusCode, retryAfter, nil
}

func nextBackoff(current time.Duration) time.Duration {
	next := current * 2
	if next > MaxBackoff {
		next = MaxBackoff
	}
	jitter := time.Duration(rand.Int63n(int64(next / 4)))
	return next + jitter
}

func sleep(ctx context.Context, d time.Duration) {
	select {
	case <-ctx.Done():
	case <-time.After(d):
	}
}
