package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"vpn-bruteforce-client/internal/bruteforce"
	"vpn-bruteforce-client/internal/config"
	"vpn-bruteforce-client/internal/stats"
)

func main() {
	vpnType := flag.String("vpn-type", "fortinet", "VPN type")
	creds := flag.String("creds-file", "credentials.txt", "Credentials file")
	output := flag.String("output", "valid.txt", "Output file")
	threads := flag.Int("threads", 100, "Number of goroutines")
	timeout := flag.Int("timeout", 10, "Timeout in seconds")
	verbose := flag.Bool("verbose", false, "Verbose output")
	flag.Parse()

	cfg := config.Default()
	cfg.VPNType = *vpnType
	cfg.InputFile = *creds
	cfg.OutputFile = *output
	cfg.Threads = *threads
	cfg.Timeout = time.Duration(*timeout) * time.Second
	cfg.Verbose = *verbose

	st := stats.New()
	go st.Start()

	engine, err := bruteforce.New(cfg, st, nil)
	if err != nil {
		log.Fatalf("init error: %v", err)
	}

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sig
		engine.Stop()
	}()

	if err := engine.Start(); err != nil {
		log.Fatalf("scan error: %v", err)
	}

	st.Stop()
}
