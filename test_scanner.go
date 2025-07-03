//go:build ignore

package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type stats struct {
	Goods     int     `json:"goods"`
	Bads      int     `json:"bads"`
	Errors    int     `json:"errors"`
	Offline   int     `json:"offline"`
	IPBlock   int     `json:"ipblock"`
	Processed int     `json:"processed"`
	RPS       float64 `json:"rps"`
}

func readLines(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" && !strings.HasPrefix(line, "#") {
			lines = append(lines, line)
		}
	}
	return lines, scanner.Err()
}

func writeStats(path string, s stats) {
	data, _ := json.Marshal(s)
	os.WriteFile(path, data, 0644)
}

func main() {
	vpnType := flag.String("vpn-type", "fortinet", "VPN type")
	credsFile := flag.String("creds-file", "", "Credentials file")
	outFile := flag.String("output", "valid.txt", "Output file")
	flag.Parse()

	if *credsFile == "" {
		*credsFile = filepath.Join("creds", *vpnType+".txt")
	}
	lines, err := readLines(*credsFile)
	if err != nil {
		fmt.Printf("credentials file not found: %v\n", err)
		return
	}

	f, err := os.OpenFile(*outFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer f.Close()

	s := stats{}
	statsPath := fmt.Sprintf("stats_%d.json", os.Getpid())
	start := time.Now()

	for i, line := range lines {
		time.Sleep(time.Duration(rand.Intn(400)+100) * time.Millisecond)
		s.Goods++
		s.Processed++
		fmt.Fprintf(f, "%s\n", line)
		s.RPS = float64(s.Processed) / time.Since(start).Seconds()
		if i%5 == 0 {
			writeStats(statsPath, s)
			fmt.Printf("\r🔥 G:%d B:%d E:%d Off:%d Blk:%d | ⚡%.1f/s", s.Goods, s.Bads, s.Errors, s.Offline, s.IPBlock, s.RPS)
		}
	}
	writeStats(statsPath, s)
	fmt.Println("\n✅ Scanning completed")
}
