import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as http from 'http';

const BACKEND_PORT = 8089;
const HEALTH_CHECK_INTERVAL = 500; // ms
const HEALTH_CHECK_TIMEOUT = 60000; // ms — model loading can take a while
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export class PythonManager {
  private process: ChildProcess | null = null;
  private ready = false;

  getPort(): number {
    return BACKEND_PORT;
  }

  async start(): Promise<{ success: boolean; message: string }> {
    if (this.process && this.ready) {
      return { success: true, message: 'Backend already running' };
    }

    return new Promise((resolve) => {
      // Spawn the Python backend using the project's existing FastAPI server
      this.process = spawn(
        'python',
        [
          '-m',
          'uvicorn',
          'depth_anything_3.services.backend:create_app',
          '--factory',
          '--host',
          '127.0.0.1',
          '--port',
          String(BACKEND_PORT),
        ],
        {
          cwd: path.join(PROJECT_ROOT, 'src'),
          env: {
            ...process.env,
            PYTHONPATH: path.join(PROJECT_ROOT, 'src'),
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      this.process.stdout?.on('data', (data: Buffer) => {
        console.log(`[python] ${data.toString().trim()}`);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error(`[python] ${data.toString().trim()}`);
      });

      this.process.on('exit', (code) => {
        console.log(`[python] Process exited with code ${code}`);
        this.ready = false;
        this.process = null;
      });

      // Poll for health check
      this.waitForReady()
        .then(() => {
          this.ready = true;
          resolve({ success: true, message: `Backend ready on port ${BACKEND_PORT}` });
        })
        .catch((err) => {
          resolve({ success: false, message: `Backend failed to start: ${err.message}` });
        });
    });
  }

  stop(): { success: boolean; message: string } {
    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
      this.ready = false;
      return { success: true, message: 'Backend stopped' };
    }
    return { success: true, message: 'Backend was not running' };
  }

  getStatus(): { running: boolean; port: number } {
    return { running: this.ready, port: BACKEND_PORT };
  }

  private waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = () => {
        if (Date.now() - startTime > HEALTH_CHECK_TIMEOUT) {
          reject(new Error('Timeout waiting for backend'));
          return;
        }

        const req = http.get(
          `http://127.0.0.1:${BACKEND_PORT}/api/v1/status`,
          (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              setTimeout(check, HEALTH_CHECK_INTERVAL);
            }
          }
        );

        req.on('error', () => {
          setTimeout(check, HEALTH_CHECK_INTERVAL);
        });

        req.end();
      };

      setTimeout(check, 1000); // Initial delay for process startup
    });
  }
}
