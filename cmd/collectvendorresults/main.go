package main

import (
	"flag"
	"fmt"
	"log"

	"vpn-bruteforce-client/internal/collect"
)

func main() {
	credsFile := flag.String("credentials", "credentials.txt", "Credentials file")
	remoteDir := flag.String("remote-dir", "/root/NAM/Servis", "Remote directory")
	outputDir := flag.String("output-dir", "Valid", "Local output directory")
	flag.Parse()

	creds, err := collect.ParseCredentials(*credsFile)
	if err != nil {
		log.Fatalf("read credentials: %v", err)
	}
	fmt.Printf("📋 Found %d workers\n", len(creds))

	success := 0
	for _, c := range creds {
		fmt.Printf("\n📥 Collecting from %s\n", c.IP)
		ok, err := collect.CollectFromWorker(c, *remoteDir, *outputDir, "valid_")
		if err != nil {
			fmt.Printf("❌ %s: %v\n", c.IP, err)
			continue
		}
		if ok {
			fmt.Printf("✅ %s\n", c.IP)
			success++
		} else {
			fmt.Printf("⚠️ No files on %s\n", c.IP)
		}
	}

	if err := collect.CombineResults(*outputDir); err != nil {
		log.Printf("combine error: %v", err)
	}

	fmt.Printf("\n✅ Successfully collected from %d of %d workers\n", success, len(creds))
}
