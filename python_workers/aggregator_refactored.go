package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// AggregatedStats holds combined metrics from all workers.
type AggregatedStats struct {
	Goods         int64   `json:"goods"`
	Bads          int64   `json:"bads"`
	Errors        int64   `json:"errors"`
	Offline       int64   `json:"offline"`
	IPBlock       int64   `json:"ipblock"`
	Processed     int64   `json:"processed"`
	RPS           float64 `json:"rps"`
	Servers       int     `json:"servers"`
	ActiveServers int     `json:"active_servers"`
	StartTime     time.Time
}

// ServerStats holds statistics for a single worker.
type ServerStats struct {
	IP        string
	Goods     int64   `json:"goods"`
	Bads      int64   `json:"bads"`
	Errors    int64   `json:"errors"`
	Offline   int64   `json:"offline"`
	IPBlock   int64   `json:"ipblock"`
	Processed int64   `json:"processed"`
	RPS       float64 `json:"rps"`
	Timestamp int64   `json:"timestamp"`
}

// Config for the aggregator.
type Config struct {
	StatsDir   string
	OutputFile string
	Interval   time.Duration
	Verbose    bool
}

func human(sec int64) string {
	m := sec / 60
	s := sec % 60
	h := m / 60
	m = m % 60
	return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
}

func collect(dir string) (map[string]ServerStats, error) {
	res := make(map[string]ServerStats)
	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if d != nil && strings.HasPrefix(d.Name(), "stats_") {
				log.Printf("walk error for %s: %v", path, err)
				return nil
			}
			return err
		}
		if d.IsDir() {
			return nil
		}
		name := d.Name()
		if strings.HasPrefix(name, "stats_") && strings.HasSuffix(name, ".json") {
			data, err := os.ReadFile(path)
			if err != nil {
				log.Printf("read error for %s: %v", path, err)
				return nil
			}
			var s ServerStats
			if err := json.Unmarshal(data, &s); err != nil {
				log.Printf("parse error for %s: %v", path, err)
				return nil
			}
			ip := strings.TrimSuffix(strings.TrimPrefix(name, "stats_"), ".json")
			s.IP = ip
			res[ip] = s
		}
		return nil
	})
	return res, err
}

func writeJSON(path string, v interface{}) error {
	data, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func run(cfg Config) {
	aggr := AggregatedStats{StartTime: time.Now()}
	for {
		stats, err := collect(cfg.StatsDir)
		if err != nil {
			log.Printf("collect error: %v", err)
		}
		aggr.Goods, aggr.Bads, aggr.Errors = 0, 0, 0
		aggr.Offline, aggr.IPBlock, aggr.Processed = 0, 0, 0
		active := 0
		for _, s := range stats {
			aggr.Goods += s.Goods
			aggr.Bads += s.Bads
			aggr.Errors += s.Errors
			aggr.Offline += s.Offline
			aggr.IPBlock += s.IPBlock
			aggr.Processed += s.Processed
			if time.Since(time.Unix(s.Timestamp, 0)) < 30*time.Second {
				active++
			}
		}
		aggr.Servers = len(stats)
		aggr.ActiveServers = active
		elapsed := time.Since(aggr.StartTime).Seconds()
		if elapsed > 0 {
			aggr.RPS = float64(aggr.Processed) / elapsed
		}
		out := map[string]interface{}{
			"goods":          aggr.Goods,
			"bads":           aggr.Bads,
			"errors":         aggr.Errors,
			"offline":        aggr.Offline,
			"ipblock":        aggr.IPBlock,
			"processed":      aggr.Processed,
			"rps":            aggr.RPS,
			"servers":        aggr.Servers,
			"active_servers": aggr.ActiveServers,
			"timestamp":      time.Now().Unix(),
			"uptime":         int(time.Since(aggr.StartTime).Seconds()),
		}
		if err := writeJSON(cfg.OutputFile, out); err != nil {
			log.Printf("write json: %v", err)
		}
		if cfg.Verbose {
			log.Printf("[Stat] G:%d B:%d E:%d Off:%d Blk:%d | \u26A1%.1f/s | Uptime %s | Servers: %d/%d",
				aggr.Goods, aggr.Bads, aggr.Errors, aggr.Offline, aggr.IPBlock,
				aggr.RPS, human(int64(time.Since(aggr.StartTime).Seconds())),
				aggr.ActiveServers, aggr.Servers)
		}
		time.Sleep(cfg.Interval)
	}
}

func main() {
	cfg := Config{}
	flag.StringVar(&cfg.StatsDir, "stats-dir", ".", "directory with stats files")
	flag.StringVar(&cfg.OutputFile, "output", "aggregated_stats.json", "output json file")
	interval := flag.Int("interval", 5, "poll interval seconds")
	flag.BoolVar(&cfg.Verbose, "verbose", false, "verbose output")
	flag.Parse()
	cfg.Interval = time.Duration(*interval) * time.Second

	run(cfg)
}
