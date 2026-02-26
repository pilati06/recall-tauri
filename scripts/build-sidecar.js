import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.join(__dirname, '..');
const tauriDir = path.join(rootDir, 'src-tauri');
const binDir = path.join(tauriDir, 'bin');

async function buildSidecar() {
  try {
    console.log('Detecting target triple...');
    let targetTriple = '';
    try {
      const rustcOutput = execSync('rustc -vV').toString();
      const hostMatch = rustcOutput.match(/host: ([\w\-]+)/);
      if (hostMatch) targetTriple = hostMatch[1];
    } catch (e) {
      // Fallback or better error
    }
    
    if (!targetTriple) {
      // Manual fallback for common platforms if rustc fails or triple not found
      if (process.platform === 'win32') targetTriple = 'x86_64-pc-windows-msvc';
      else if (process.platform === 'darwin') targetTriple = 'x86_64-apple-darwin';
      else targetTriple = 'x86_64-unknown-linux-gnu';
    }
    
    console.log(`Target triple: ${targetTriple}`);

    const isWindows = process.platform === 'win32';
    const extension = isWindows ? '.exe' : '';
    const srcName = `analyzer_engine${extension}`;
    const destName = `analyzer-${targetTriple}${extension}`;
    const destPath = path.join(binDir, destName);

    // CRITICAL: Tauri build process (build.rs) checks if the sidecar exists.
    // If we are building the sidecar for the first time, it doesn't exist yet.
    // We create a dummy placeholder to satisfy the Tauri build check.
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }
    
    if (!fs.existsSync(destPath)) {
      console.log(`Creating placeholder: ${destPath}`);
      fs.writeFileSync(destPath, '');
    }

    const isRelease = process.argv.includes('--release');
    const mode = isRelease ? 'release' : 'debug';
    const cargoFlags = isRelease ? '--release' : '';

    console.log(`Building analyzer binary (${mode} mode)...`);
    execSync(`cargo build --bin analyzer_engine ${cargoFlags}`, {
      cwd: tauriDir,
      stdio: 'inherit'
    });

    const srcPath = path.join(tauriDir, 'target', mode, srcName);

    console.log(`Copying ${srcName} to ${destPath}...`);
    fs.copyFileSync(srcPath, destPath);

    console.log('Sidecar build successfully automated!');
  } catch (error) {
    console.error('Failed to automate sidecar build:', error.message);
    process.exit(1);
  }
}

buildSidecar();
