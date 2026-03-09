package source

import (
	"bufio"
	"context"
	"io"
	"log"
	"os/exec"
	"time"

	"github.com/pushlog/pushlog-agent/internal/parser"
)

const dockerRestartDelay = 2 * time.Second

// TailDocker spawns `docker logs -f <container>` and reads both stdout and stderr.
// Restarts on exit (e.g. container stopped) with backoff.
func TailDocker(ctx context.Context, container, service, env string, out chan<- *parser.InboundEvent) {
	for {
		if ctx.Err() != nil {
			return
		}
		err := runDockerLogs(ctx, container, service, env, out)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			log.Printf("[source/docker] container=%s exited: %v, restarting in %s", container, err, dockerRestartDelay)
		} else {
			log.Printf("[source/docker] container=%s exited, restarting in %s", container, dockerRestartDelay)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(dockerRestartDelay):
		}
	}
}

func runDockerLogs(ctx context.Context, container, service, env string, out chan<- *parser.InboundEvent) error {
	cmd := exec.CommandContext(ctx, "docker", "logs", "-f", "--tail", "0", container)

	// docker logs sends container stdout and stderr on separate fd's.
	// Pipe both into a single reader so we see console.error / process.stderr output.
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderrPipe, err := cmd.StderrPipe()
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

	// Merge stdout and stderr concurrently into a single pipe for the scanner.
	pr, pw := io.Pipe()
	go func() {
		defer pw.Close()
		done := make(chan struct{}, 2)
		cp := func(r io.Reader) {
			io.Copy(pw, r)
			done <- struct{}{}
		}
		go cp(stdoutPipe)
		go cp(stderrPipe)
		<-done
		<-done
	}()

	scanner := bufio.NewScanner(pr)
	scanner.Buffer(make([]byte, 0, 256*1024), 256*1024)
	const maxStackLines = 50

	var pendingLine string
	for {
		if ctx.Err() != nil {
			return nil
		}
		var line string
		if pendingLine != "" {
			line = pendingLine
			pendingLine = ""
		} else if !scanner.Scan() {
			break
		} else {
			line = scanner.Text()
		}

		ev := parser.ParseLine(line, service, env)
		if ev == nil {
			continue
		}

		// Collect subsequent stack-like lines for multi-line stack traces
		block := []string{line}
		for scanner.Scan() {
			if ctx.Err() != nil {
				return nil
			}
			next := scanner.Text()
			if parser.IsStackLikeLine(next) {
				block = append(block, next)
				if len(block) >= maxStackLines {
					break
				}
			} else {
				pendingLine = next
				break
			}
		}

		if len(block) > 1 {
			ev = parser.ParseLines(block, service, env)
			if ev == nil {
				continue
			}
		}

		select {
		case out <- ev:
		case <-ctx.Done():
			return nil
		}
	}
	return scanner.Err()
}
