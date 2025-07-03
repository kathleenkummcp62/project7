#!/usr/bin/env node

/**
 * Setup environment for VPN Bruteforce Dashboard
 * This script creates necessary directories and files for testing
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

let vpnCredentials = {};
let sshCredentials = [];

async function loadSetupData() {
  const dataPath = path.join(projectRoot, 'setup-data.json');
  const data = await fs.readJson(dataPath);
  vpnCredentials = data.vpnCredentials || {};
  sshCredentials = data.sshCredentials || [];
}

// Create necessary directories
async function createDirectories() {
  console.log('Creating necessary directories...');
  
  const directories = [
    'Generated',
    'Valid',
    'creds/dictionaries'
  ];
  
  for (const dir of directories) {
    const dirPath = path.join(projectRoot, dir);
    await fs.ensureDir(dirPath);
    console.log(`Created directory: ${dir}`);
  }
}

// Create VPN credential files
async function createVpnCredentialFiles() {
  console.log('Creating VPN credential files...');

  for (const [type, credentials] of Object.entries(vpnCredentials)) {
    const filePath = path.join(projectRoot, 'creds', `${type}.txt`);
    await fs.writeFile(filePath, credentials.join('\n'));
    console.log(`Created file: creds/${type}.txt`);
  }
}

// Create SSH credentials file
async function createSshCredentialsFile() {
  console.log('Creating SSH credentials file...');
  
  const filePath = path.join(projectRoot, 'credentials.txt');
  await fs.writeFile(filePath, sshCredentials.join('\n'));
  console.log('Created file: credentials.txt');
}


// Build test scanner binary
async function buildTestScannerBinary() {
  console.log('Building test scanner binary...');

  const src = path.join(projectRoot, 'test_scanner.go');
  const out = path.join(projectRoot, 'test_scanner');

  try {
    execSync(`go build -o ${out} ${src}`, { stdio: 'inherit' });
    await fs.chmod(out, '755');
    console.log('Created binary: test_scanner');
  } catch (err) {
    console.log('⚠️ Failed to build test_scanner:', err.message);
  }
}
// Create config files
async function createConfigFiles() {
  console.log('Creating configuration files...');
  
  // Create config.txt
  const configPath = path.join(projectRoot, 'config.txt');
  await fs.writeFile(configPath, 'threads = 2500\n');
  console.log('Created file: config.txt');
  
  // Create proxy_config.txt
  const proxyConfigPath = path.join(projectRoot, 'proxy_config.txt');
  await fs.writeFile(proxyConfigPath, '\n');
  console.log('Created file: proxy_config.txt');
}

// Configure firewall to allow external access
async function configureFirewall() {
  console.log('Configuring firewall for external access...');
  
  try {
    // Check if we have sudo access
    const hasSudo = process.getuid && process.getuid() === 0;
    
    if (hasSudo) {
      // Open ports for the application
      execSync('ufw allow 3000/tcp', { stdio: 'inherit' });
      execSync('ufw allow 5173/tcp', { stdio: 'inherit' });
      execSync('ufw allow 8080/tcp', { stdio: 'inherit' });
      console.log('✅ Firewall configured to allow external access');
    } else {
      console.log('⚠️ Cannot configure firewall - not running as root');
      console.log('To allow external access, run the following commands:');
      console.log('  sudo ufw allow 3000/tcp');
      console.log('  sudo ufw allow 5173/tcp');
      console.log('  sudo ufw allow 8080/tcp');
    }
  } catch (error) {
    console.log('⚠️ Failed to configure firewall:', error.message);
    console.log('To allow external access, run the following commands:');
    console.log('  sudo ufw allow 3000/tcp');
    console.log('  sudo ufw allow 5173/tcp');
    console.log('  sudo ufw allow 8080/tcp');
  }
}

// Main function
async function main() {
  console.log('=== VPN Bruteforce Dashboard Environment Setup ===');

  try {
    await loadSetupData();
    // Create directories
    await createDirectories();
    
    // Create VPN credential files
    await createVpnCredentialFiles();
    
    // Create SSH credentials file
    await createSshCredentialsFile();
    
  // Build test scanner binary
    await buildTestScannerBinary();
    
    // Create config files
    await createConfigFiles();
    
    // Configure firewall
    await configureFirewall();
    try {
      execSync('npm install', { stdio: 'inherit' });
    } catch (err) {
      console.log('⚠️ Failed to install Node dependencies:', err.message);
    }

    console.log('\n✅ Environment setup completed successfully!');
    console.log('\nYou can now run the following commands:');
    console.log('  - npm run dev  (to start the dashboard)');
    console.log('  - ./test_scanner --vpn-type fortinet  (to test VPN scanning)');
    
    return true;
  } catch (error) {
    console.error(`\n❌ Error during setup: ${error.message}`);
    return false;
  }
}

// Run the main function
main().catch(error => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});