package queue

import (
	"sync"

	"github.com/pushlog/pushlog-agent/internal/parser"
)

const DefaultMaxSize = 10000

// Bounded is a thread-safe bounded channel-like queue.
// When full, oldest events are dropped.
type Bounded struct {
	mu      sync.Mutex
	items   []*parser.InboundEvent
	maxSize int
	dropped int64
}

func New(maxSize int) *Bounded {
	if maxSize <= 0 {
		maxSize = DefaultMaxSize
	}
	return &Bounded{
		items:   make([]*parser.InboundEvent, 0, maxSize),
		maxSize: maxSize,
	}
}

func (q *Bounded) Push(ev *parser.InboundEvent) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.items) >= q.maxSize {
		q.items = q.items[1:]
		q.dropped++
	}
	q.items = append(q.items, ev)
}

// Drain returns up to n events and removes them from the queue.
func (q *Bounded) Drain(n int) []*parser.InboundEvent {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.items) == 0 {
		return nil
	}
	if n > len(q.items) {
		n = len(q.items)
	}
	batch := make([]*parser.InboundEvent, n)
	copy(batch, q.items[:n])
	q.items = q.items[n:]
	return batch
}

func (q *Bounded) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.items)
}

func (q *Bounded) Dropped() int64 {
	q.mu.Lock()
	defer q.mu.Unlock()
	return q.dropped
}
