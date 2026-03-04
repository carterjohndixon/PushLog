package source

import (
	"bufio"
	"context"
	"log"
	"os"
	"time"

	"github.com/pushlog/pushlog-agent/internal/parser"
)

const (
	filePollInterval = 250 * time.Millisecond
	fileReopenDelay  = 1 * time.Second
)

// TailFile follows a file like tail -F: reads appended lines and reopens on rotation.
func TailFile(ctx context.Context, path, service, env string, out chan<- *parser.InboundEvent) {
	for {
		if err := tailFileOnce(ctx, path, service, env, out); err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("[source/file] %s: %v, retrying in %s", path, err, fileReopenDelay)
			select {
			case <-ctx.Done():
				return
			case <-time.After(fileReopenDelay):
			}
		}
	}
}

func tailFileOnce(ctx context.Context, path, service, env string, out chan<- *parser.InboundEvent) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	// Seek to end so we only process new lines
	if _, err := f.Seek(0, os.SEEK_END); err != nil {
		return err
	}

	origInfo, err := f.Stat()
	if err != nil {
		return err
	}

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 256*1024), 256*1024)

	for {
		for scanner.Scan() {
			if ctx.Err() != nil {
				return nil
			}
			ev := parser.ParseLine(scanner.Text(), service, env)
			if ev != nil {
				select {
				case out <- ev:
				case <-ctx.Done():
					return nil
				}
			}
		}

		if err := scanner.Err(); err != nil {
			return err
		}

		// Check for file rotation: inode changed or file truncated
		newInfo, err := os.Stat(path)
		if err != nil {
			return err
		}
		if !os.SameFile(origInfo, newInfo) {
			log.Printf("[source/file] %s rotated (inode changed), reopening", path)
			return nil // caller will reopen
		}
		currentInfo, err := f.Stat()
		if err != nil {
			return err
		}
		pos, _ := f.Seek(0, os.SEEK_CUR)
		if currentInfo.Size() < pos {
			log.Printf("[source/file] %s truncated, reopening", path)
			return nil
		}

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(filePollInterval):
		}

		// Reset scanner for next batch of reads
		scanner = bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 0, 256*1024), 256*1024)
	}
}
