package source

import (
	"bufio"
	"context"
	"log"
	"os/exec"
	"time"

	"github.com/pushlog/pushlog-agent/internal/parser"
)

const journaldRestartDelay = 2 * time.Second

// TailJournald spawns journalctl -u <unit> -f -o json and reads stdout.
// Restarts on exit with backoff.
func TailJournald(ctx context.Context, unit, service, env string, out chan<- *parser.InboundEvent) {
	for {
		if ctx.Err() != nil {
			return
		}
		err := runJournalctl(ctx, unit, service, env, out)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Printf("[source/journald] unit=%s exited: %v, restarting in %s", unit, err, journaldRestartDelay)
		} else {
			log.Printf("[source/journald] unit=%s exited, restarting in %s", unit, journaldRestartDelay)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(journaldRestartDelay):
		}
	}
}

func runJournalctl(ctx context.Context, unit, service, env string, out chan<- *parser.InboundEvent) error {
	cmd := exec.CommandContext(ctx, "journalctl", "-u", unit, "-f", "-o", "json", "-n", "0")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	defer func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
	}()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 256*1024), 256*1024)

	for scanner.Scan() {
		if ctx.Err() != nil {
			return nil
		}
		ev := parser.ParseJournaldLine(scanner.Bytes(), service, env)
		if ev != nil {
			select {
			case out <- ev:
			case <-ctx.Done():
				return nil
			}
		}
	}
	return scanner.Err()
}
