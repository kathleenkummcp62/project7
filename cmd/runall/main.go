package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"
)

var (
	dashboardPort int
	setupFlag     bool
	vpnType       string
)

func runCmd(args []string, wait bool) *exec.Cmd {
	fmt.Printf("📋 Executing: %s\n", args)
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if wait {
		cmd.Run()
	} else {
		cmd.Start()
	}
	return cmd
}

func setup() {
	if setupFlag {
		fmt.Println("🔧 Setting up environment...")
		runCmd([]string{"python3", "dashboard_setup.py", "--setup"}, true)
		os.MkdirAll("Generated", 0755)
		os.MkdirAll("Valid", 0755)
		fmt.Println("setup completed")
	}
}

func main() {
	flag.IntVar(&dashboardPort, "dashboard-port", 8080, "Dashboard port")
	flag.BoolVar(&setupFlag, "setup", false, "Run setup")
	flag.StringVar(&vpnType, "vpn-type", "", "VPN type")
	flag.Parse()

	fmt.Println("🚀 Starting all components")
	setup()

	dash := runCmd([]string{"go", "run", "cmd/dashboard/main.go", fmt.Sprintf("-port=%d", dashboardPort)}, false)
	time.Sleep(2 * time.Second)
	if dash.ProcessState != nil && dash.ProcessState.Exited() {
		fmt.Println("dashboard failed to start")
		return
	}

	if vpnType != "" {
		runCmd([]string{"go", "run", "cmd/manager/main.go", "--vpn-type", vpnType}, true)
	} else {
		fmt.Println("scanners not started (no --vpn-type)")
	}

	fmt.Println("\nAll components started. Press Ctrl+C to exit.")
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	dash.Process.Signal(os.Interrupt)
}
