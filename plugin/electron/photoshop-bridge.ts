import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const EXTENDSCRIPT_PATH = path.resolve(__dirname, '..', 'photoshop', 'apply-mask.jsx');

export class PhotoshopBridge {
  /**
   * Check if Photoshop is running.
   */
  async isRunning(): Promise<boolean> {
    return new Promise((resolve) => {
      const platform = os.platform();
      let cmd: string;

      if (platform === 'darwin') {
        cmd = 'pgrep -x "Adobe Photoshop"';
      } else if (platform === 'win32') {
        cmd = 'tasklist /FI "IMAGENAME eq Photoshop.exe" /NH';
      } else {
        resolve(false);
        return;
      }

      exec(cmd, (error, stdout) => {
        if (error) {
          resolve(false);
          return;
        }
        if (platform === 'win32') {
          resolve(stdout.toLowerCase().includes('photoshop.exe'));
        } else {
          resolve(stdout.trim().length > 0);
        }
      });
    });
  }

  /**
   * Apply a mask to the active Photoshop document.
   * Takes base64-encoded PNG data, writes to temp file, then
   * executes ExtendScript to load it as a layer mask.
   */
  async applyMask(maskPngBase64: string): Promise<{ success: boolean; message: string }> {
    const tmpDir = os.tmpdir();
    const maskPath = path.join(tmpDir, `depth_mask_${Date.now()}.png`);

    try {
      // Write mask to temp file
      const buffer = Buffer.from(maskPngBase64, 'base64');
      fs.writeFileSync(maskPath, buffer);

      // Execute ExtendScript
      const platform = os.platform();

      if (platform === 'darwin') {
        return this.executeOnMac(maskPath);
      } else if (platform === 'win32') {
        return this.executeOnWindows(maskPath);
      } else {
        return { success: false, message: 'Unsupported platform for Photoshop integration' };
      }
    } catch (err) {
      return { success: false, message: `Failed to apply mask: ${err}` };
    } finally {
      // Cleanup temp file after a delay
      setTimeout(() => {
        try {
          fs.unlinkSync(maskPath);
        } catch {
          // ignore
        }
      }, 5000);
    }
  }

  private executeOnMac(maskPath: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      // Use osascript to execute ExtendScript in Photoshop
      const script = `
        tell application "Adobe Photoshop 2025"
          do javascript file "${EXTENDSCRIPT_PATH}" with arguments {"${maskPath.replace(/\\/g, '/')}"}
        end tell
      `;

      exec(`osascript -e '${script}'`, (error, _stdout, stderr) => {
        if (error) {
          resolve({ success: false, message: `AppleScript error: ${stderr || error.message}` });
        } else {
          resolve({ success: true, message: 'Mask applied to Photoshop' });
        }
      });
    });
  }

  private executeOnWindows(maskPath: string): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      // Use COM automation via PowerShell on Windows
      const psScript = `
        $ps = New-Object -ComObject Photoshop.Application
        $scriptFile = "${EXTENDSCRIPT_PATH.replace(/\\/g, '/')}"
        $maskFile = "${maskPath.replace(/\\/g, '/')}"
        $ps.DoJavaScriptFile($scriptFile, @($maskFile))
      `;

      exec(`powershell -Command "${psScript}"`, (error, _stdout, stderr) => {
        if (error) {
          resolve({ success: false, message: `PowerShell error: ${stderr || error.message}` });
        } else {
          resolve({ success: true, message: 'Mask applied to Photoshop' });
        }
      });
    });
  }
}
