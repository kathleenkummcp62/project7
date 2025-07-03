package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

const (
	credFile  = "credentials.txt"
	remoteDir = "/root/NAM/Servis"
	pollSecs  = 5
)

type credential struct {
	IP     string
	User   string
	Secret string
}

func parseCreds() ([]credential, error) {
	data, err := os.ReadFile(credFile)
	if err != nil {
		return nil, err
	}
	var creds []credential
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.Split(line, ";")
		if len(parts) < 3 {
			continue
		}
		creds = append(creds, credential{
			IP:     strings.TrimSpace(parts[0]),
			User:   strings.TrimSpace(parts[1]),
			Secret: strings.TrimSpace(parts[2]),
		})
	}
	return creds, nil
}

func expandPath(p string) string {
	if strings.HasPrefix(p, "~/") {
		if h, err := os.UserHomeDir(); err == nil {
			return filepath.Join(h, p[2:])
		}
	}
	return p
}

func sshClient(ip, user, secret string) (*ssh.Client, error) {
	cfg := &ssh.ClientConfig{
		User:            user,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}
	if key, err := os.ReadFile(expandPath(secret)); err == nil {
		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			return nil, err
		}
		cfg.Auth = []ssh.AuthMethod{ssh.PublicKeys(signer)}
	} else {
		cfg.Auth = []ssh.AuthMethod{ssh.Password(secret)}
	}
	return ssh.Dial("tcp", ip+":22", cfg)
}

func collect(ip, user, secret string) []map[string]interface{} {
	var result []map[string]interface{}
	client, err := sshClient(ip, user, secret)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[!!] %s: %v\n", ip, err)
		return result
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[!!] %s: %v\n", ip, err)
		return result
	}
	out, err := session.Output("ls " + remoteDir)
	session.Close()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[!!] %s: %v\n", ip, err)
		return result
	}
	names := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, name := range names {
		if strings.HasPrefix(name, "stats_") && strings.HasSuffix(name, ".json") {
			sess, err := client.NewSession()
			if err != nil {
				fmt.Fprintf(os.Stderr, "[!!] %s: %v\n", ip, err)
				continue
			}
			data, err := sess.Output("cat " + filepath.Join(remoteDir, name))
			sess.Close()
			if err != nil {
				continue
			}
			var m map[string]interface{}
			if err := json.Unmarshal(data, &m); err == nil {
				result = append(result, m)
			}
		}
	}
	return result
}

func human(sec int) string {
	m := sec / 60
	s := sec % 60
	h := m / 60
	m = m % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}

func countLines(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	buf := make([]byte, 32*1024)
	count := 0
	for {
		n, err := f.Read(buf)
		count += bytes.Count(buf[:n], []byte{'\n'})
		if err != nil {
			if err == io.EOF {
				break
			}
			return count, err
		}
	}
	return count, nil
}

func main() {
	hflag := flag.Int("human", -1, "format seconds and exit")
	flag.Parse()
	if *hflag >= 0 {
		fmt.Print(human(*hflag))
		return
	}

	creds, err := parseCreds()
	if err != nil {
		fmt.Fprintf(os.Stderr, "load creds: %v\n", err)
		os.Exit(1)
	}

	totalLines := 0
	for i := 1; i <= len(creds); i++ {
		f := filepath.Join("Generated", fmt.Sprintf("part_%d.txt", i))
		if n, err := countLines(f); err == nil {
			totalLines += n
		}
	}
	if totalLines == 0 {
		totalLines = 1
	}

	start := time.Now()
	var lastLen int
	for {
		var stats []map[string]interface{}
		for _, c := range creds {
			stats = append(stats, collect(c.IP, c.User, c.Secret)...)
		}

		tot := func(k string) int64 {
			var sum int64
			for _, m := range stats {
				if v, ok := m[k]; ok {
					switch t := v.(type) {
					case float64:
						sum += int64(t)
					case int:
						sum += int64(t)
					}
				}
			}
			return sum
		}
		processed := tot("processed")
		percent := float64(processed) / float64(totalLines) * 100
		speed := float64(processed) / (time.Since(start).Seconds() + 1e-3)

		line := fmt.Sprintf("\r[Stat] G:%d B:%d E:%d Off:%d Blk:%d | \x1b[92m%d/%d\x1b[0m %6.2f%% | S:%6.1f/s | Uptime %s",
			tot("goods"), tot("bads"), tot("errors"), tot("offline"), tot("ipblock"),
			processed, totalLines, percent, speed, human(int(time.Since(start).Seconds())))

		fmt.Print("\r" + strings.Repeat(" ", lastLen) + "\r")
		fmt.Print(line)
		lastLen = len(line)
		time.Sleep(pollSecs * time.Second)
	}
}
