document.addEventListener('DOMContentLoaded', () => {
    const checkBtn = document.getElementById('check-updates-btn');
    const downloadBtn = document.getElementById('download-update-btn');
    const currentVersionSpan = document.getElementById('current-version');
    const updateInfoDiv = document.getElementById('update-info');
    const newVersionSpan = document.getElementById('new-version');
    const releaseNotesTextarea = document.getElementById('release-notes');
    const statusMessage = document.getElementById('status-message');
    const progressBar = document.getElementById('download-progress');

    // Initial load: Get current CatOS version
    window.electronAPI.getCurrentCatOSVersion().then(version => {
        currentVersionSpan.textContent = `Current Version: ${version}`;
    });

    checkBtn.addEventListener('click', async () => {
        statusMessage.textContent = 'Checking for updates...';
        updateInfoDiv.style.display = 'none';
        progressBar.style.display = 'none';

        try {
            const updateData = await window.electronAPI.checkForUpdates();
            if (updateData.updateAvailable) {
                newVersionSpan.textContent = updateData.latestVersion;
                releaseNotesTextarea.value = updateData.releaseNotes;
                updateInfoDiv.style.display = 'block';
                statusMessage.textContent = 'Update available!';
            } else {
                statusMessage.textContent = 'CatOS is up to date.';
            }
        } catch (error) {
            statusMessage.textContent = `Error checking for updates: ${error.message}`;
            console.error('Update check error:', error);
        }
    });

    downloadBtn.addEventListener('click', async () => {
        statusMessage.textContent = 'Starting download...';
        progressBar.style.display = 'block';
        downloadBtn.disabled = true; // Prevent multiple clicks

        try {
            await window.electronAPI.downloadAndInstallUpdate();
            statusMessage.textContent = 'Update successful! Please reboot CatOS to finalize changes.';
            downloadBtn.style.display = 'none'; // Hide download button after success
            checkBtn.disabled = true; // Disable check button too
        } catch (error) {
            statusMessage.textContent = `Update failed: ${error.message}`;
            console.error('Update install error:', error);
            downloadBtn.disabled = false; // Re-enable if failed
        }
    });

    // Listen for progress updates from the main process
    window.electronAPI.onDownloadProgress((_event, progress) => {
        progressBar.value = progress;
        statusMessage.textContent = `Downloading... ${progress}%`;
    });
});