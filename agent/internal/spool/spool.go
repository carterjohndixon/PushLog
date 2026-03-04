package spool

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/pushlog/pushlog-agent/internal/parser"
)

const (
	MaxSpoolFiles = 1000
	MaxPerFile    = 100
)

// Disk persists unsent events to disk so they survive restarts.
type Disk struct {
	mu  sync.Mutex
	dir string
}

func New(dir string) (*Disk, error) {
	if err := os.MkdirAll(dir, 0750); err != nil {
		return nil, fmt.Errorf("spool: create dir %s: %w", dir, err)
	}
	return &Disk{dir: dir}, nil
}

// Write persists a batch of events to a timestamped file.
func (d *Disk) Write(events []*parser.InboundEvent) error {
	if len(events) == 0 {
		return nil
	}
	d.mu.Lock()
	defer d.mu.Unlock()

	d.enforceLimit()

	name := fmt.Sprintf("%d.json", time.Now().UnixNano())
	path := filepath.Join(d.dir, name)
	data, err := json.Marshal(events)
	if err != nil {
		return fmt.Errorf("spool: marshal: %w", err)
	}
	if err := os.WriteFile(path, data, 0640); err != nil {
		return fmt.Errorf("spool: write %s: %w", path, err)
	}
	return nil
}

// ReadAll reads all spooled event files, returns events, and removes the files.
func (d *Disk) ReadAll() []*parser.InboundEvent {
	d.mu.Lock()
	defer d.mu.Unlock()

	files, err := d.listFiles()
	if err != nil {
		log.Printf("[spool] list error: %v", err)
		return nil
	}

	var all []*parser.InboundEvent
	for _, f := range files {
		path := filepath.Join(d.dir, f)
		data, err := os.ReadFile(path)
		if err != nil {
			log.Printf("[spool] read %s: %v", f, err)
			continue
		}
		var events []*parser.InboundEvent
		if err := json.Unmarshal(data, &events); err != nil {
			log.Printf("[spool] parse %s: %v", f, err)
			_ = os.Remove(path)
			continue
		}
		all = append(all, events...)
		_ = os.Remove(path)
	}
	return all
}

func (d *Disk) Count() int {
	d.mu.Lock()
	defer d.mu.Unlock()
	files, _ := d.listFiles()
	return len(files)
}

func (d *Disk) listFiles() ([]string, error) {
	entries, err := os.ReadDir(d.dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".json" {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names, nil
}

func (d *Disk) enforceLimit() {
	files, err := d.listFiles()
	if err != nil {
		return
	}
	for len(files) >= MaxSpoolFiles {
		oldest := filepath.Join(d.dir, files[0])
		_ = os.Remove(oldest)
		files = files[1:]
		log.Printf("[spool] dropped oldest file (at limit %d)", MaxSpoolFiles)
	}
}
