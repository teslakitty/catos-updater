const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios'); // npm install axios
const fs = require('fs/promises'); // Node.js built-in for async file ops
const { createWriteStream } = require('fs');
const { exec } = require('child_process'); // For running shell commands
const crypto = require('crypto'); // Node.js built-in for SHA256

// --- Configuration ---
const UPDATE_MANIFEST_URL = 'https://teslakitty-cdn.netlify.app/cat-os-update/update_manifest.json';
const UPDATE_DOWNLOAD_BASE_URL = 'https://teslakitty-cdn.netlify.app/cat-os-update/';
const CATOS_VERSION_FILE = '/etc/catos-version'; // Path on the CatOS system
const DOWNLOAD_DIR = path.join(app.getPath('temp'), 'catos_updates'); // Temporary download location

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, // Recommended for security
            nodeIntegration: false // Recommended for security
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC Handlers ---

ipcMain.handle('get-current-catos-version', async () => {
    try {
        // Read the current CatOS version from a system file
        const versionContent = await fs.readFile(CATOS_VERSION_FILE, 'utf8');
        return versionContent.trim();
    } catch (error) {
        console.error('Failed to read CatOS version file:', error);
        return 'Unknown'; // Fallback if file doesn't exist or can't be read
    }
});

ipcMain.handle('check-for-updates', async () => {
    try {
        const currentVersion = await ipcMain.handle('get-current-catos-version'); // Get current version
        const response = await axios.get(UPDATE_MANIFEST_URL);
        const manifest = response.data;

        if (manifest.latest_version && manifest.update_package && manifest.update_package.filename) {
            // Simple string comparison for versions (works for 1.0, 1.1, 1.2.0, etc.)
            // For more robust version comparison (e.g., 1.0.1 vs 1.0.10), use a library like 'semver'
            const updateAvailable = compareVersions(manifest.latest_version, currentVersion.toString()) > 0;

            return {
                updateAvailable,
                latestVersion: manifest.latest_version,
                releaseNotes: manifest.release_notes,
                updatePackage: manifest.update_package
            };
        } else {
            throw new Error('Invalid update manifest format.');
        }
    } catch (error) {
        console.error('Error during update check:', error);
        throw error;
    }
});

ipcMain.handle('download-and-install-update', async (event, updatePackage) => {
    const { filename, sha256sum } = updatePackage; // Get from the main process call

    try {
        await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
        const downloadPath = path.join(DOWNLOAD_DIR, filename);
        const url = UPDATE_DOWNLOAD_BASE_URL + filename;

        const writer = createWriteStream(downloadPath);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        const totalLength = response.headers['content-length'];
        let downloadedLength = 0;

        response.data.on('data', (chunk) => {
            downloadedLength += chunk.length;
            const progress = Math.round((downloadedLength / totalLength) * 100);
            mainWindow.webContents.send('download-progress', progress);
        });

        await new Promise((resolve, reject) => {
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        console.log('Download complete. Verifying checksum...');

        // --- Verify Checksum ---
        const fileBuffer = await fs.readFile(downloadPath);
        const hash = crypto.createHash('sha256');
        hash.update(fileBuffer);
        const calculatedSha256 = hash.digest('hex');

        if (calculatedSha256 !== sha256sum) {
            await fs.unlink(downloadPath); // Delete potentially corrupted file
            throw new Error('Checksum mismatch! Downloaded file is corrupted or tampered with.');
        }

        console.log('Checksum verified. Installing update...');

        // --- Install Update (Crucial Step - Needs Root Privileges) ---
        // This is where you run your installation script.
        // You'll likely need to prompt for sudo password here or run this updater as root.
        // For a production OS, consider pkexec for secure privilege escalation.
        const installScriptPath = path.join(DOWNLOAD_DIR, 'scripts/install_update.sh'); // Assuming the ZIP extracts this script
        const unzipCommand = `unzip -o ${downloadPath} -d /tmp/catos_update_temp`; // Extract to temp dir
        const installCommand = `sudo /tmp/catos_update_temp/scripts/install_update.sh`; // Execute script

        // NOTE: Executing `sudo` directly from an Electron app might be problematic for password prompting.
        // You might need a helper script that uses `pkexec` or `gksu` (if still available)
        // or an authentication agent. This is a complex part of OS updating.
        // For simplicity, this example assumes `sudo` works directly.

        await new Promise((resolve, reject) => {
            exec(unzipCommand, (unzipError, stdout, stderr) => {
                if (unzipError) {
                    console.error(`unzip error: ${unzipError}`);
                    return reject(new Error(`Failed to unzip update: ${stderr}`));
                }
                console.log('Unzip successful. Running install script...');

                exec(installCommand, (installError, stdout, stderr) => {
                    if (installError) {
                        console.error(`install script error: ${installError}`);
                        return reject(new Error(`Update installation failed: ${stderr}`));
                    }
                    console.log(`Installation stdout: ${stdout}`);
                    console.error(`Installation stderr: ${stderr}`);
                    resolve();
                });
            });
        });

        console.log('Update installed successfully!');
        // Clean up downloaded files
        await fs.rm(DOWNLOAD_DIR, { recursive: true, force: true });

        // Optionally, update the /etc/catos-version file here after successful install
        // This would require elevated privileges as well.
        // await fs.writeFile(CATOS_VERSION_FILE, manifest.latest_version, 'utf8');

    } catch (error) {
        console.error('Error during download or installation:', error);
        throw error; // Re-throw to be caught by renderer
    }
});

// Simple version comparison function (e.g., "1.0" < "1.2.0")
function compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
    }
    return 0;
}