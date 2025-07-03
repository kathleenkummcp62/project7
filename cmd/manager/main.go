package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

type scannerCfg struct {
	Script      string
	ProcessName string
	CredsFile   string
	Args        []string
}

var scanners = map[string]scannerCfg{
	"fortinet":   {Script: "sers1.go", ProcessName: "sers1", CredsFile: "creds/fortinet.txt"},
	"paloalto":   {Script: "sers2.go", ProcessName: "sers2", CredsFile: "creds/paloalto.txt"},
	"sonicwall":  {Script: "sers3.go", ProcessName: "sers3", CredsFile: "creds/sonicwall.txt"},
	"cisco":      {Script: "sers4.go", ProcessName: "sers4", CredsFile: "creds/cisco.txt"},
	"sophos":     {Script: "test_scanner.go", ProcessName: "test_scanner", CredsFile: "creds/sophos.txt", Args: []string{"--vpn-type", "sophos"}},
	"watchguard": {Script: "test_scanner.go", ProcessName: "test_scanner", CredsFile: "creds/watchguard.txt", Args: []string{"--vpn-type", "watchguard"}},
}

func getPIDs(name string) []int {
	out, err := exec.Command("pgrep", "-f", name).Output()
	if err != nil {
		return nil
	}
	fields := strings.Fields(string(out))
	var pids []int
	for _, f := range fields {
		if pid, err := strconv.Atoi(f); err == nil {
			pids = append(pids, pid)
		}
	}
	return pids
}

func startScanner(vpn string) {
	cfg, ok := scanners[vpn]
	if !ok {
		fmt.Printf("unknown vpn %s\n", vpn)
		return
	}
	if len(getPIDs(cfg.ProcessName)) > 0 {
		fmt.Printf("scanner %s already running\n", vpn)
		return
	}
	var cmdArgs []string
	if filepath.Ext(cfg.Script) == ".py" {
		cmdArgs = append([]string{"python3", cfg.Script}, cfg.Args...)
	} else {
		cmdArgs = append([]string{"go", "run", cfg.Script}, cfg.Args...)
	}
	if cfg.CredsFile != "" {
		cmdArgs = append(cmdArgs, "--creds-file", cfg.CredsFile)
	}
	cmd := exec.Command(cmdArgs[0], cmdArgs[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		fmt.Printf("failed to start %s: %v\n", vpn, err)
		return
	}
	fmt.Printf("started %s (PID %d)\n", vpn, cmd.Process.Pid)
}

func stopScanner(vpn string) {
	cfg, ok := scanners[vpn]
	if !ok {
		return
	}
	for _, pid := range getPIDs(cfg.ProcessName) {
		proc, _ := os.FindProcess(pid)
		proc.Signal(os.Interrupt)
		fmt.Printf("stopped %s (PID %d)\n", vpn, pid)
	}
}

func showStatus() {
	fmt.Println("\nScanner status:")
	for vpn, cfg := range scanners {
		ids := getPIDs(cfg.ProcessName)
		if len(ids) > 0 {
			fmt.Printf("%-12s running %v\n", vpn, ids)
		} else {
			fmt.Printf("%-12s stopped\n", vpn)
		}
	}
	files, _ := filepath.Glob("stats_*.json")
	if len(files) == 0 {
		return
	}
	total := map[string]int{}
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			continue
		}
		var m map[string]int
		if json.Unmarshal(data, &m) == nil {
			for k, v := range m {
				total[k] += v
			}
		}
	}
	fmt.Printf("TOTAL goods:%d bads:%d errors:%d offline:%d ipblock:%d processed:%d\n",
		total["goods"], total["bads"], total["errors"], total["offline"], total["ipblock"], total["processed"])
}

func main() {
	vpnType := flag.String("vpn-type", "", "VPN type or all")
	stopFlag := flag.Bool("stop", false, "Stop scanners")
	statusFlag := flag.Bool("status", false, "Show status")
	flag.Parse()

	if *statusFlag {
		showStatus()
		return
	}
	if *stopFlag {
		if *vpnType == "" || *vpnType == "all" {
			for t := range scanners {
				stopScanner(t)
			}
		} else {
			stopScanner(*vpnType)
		}
		return
	}
	if *vpnType == "" {
		flag.Usage()
		return
	}
	if *vpnType == "all" {
		for t := range scanners {
			startScanner(t)
		}
	} else {
		startScanner(*vpnType)
	}
}
