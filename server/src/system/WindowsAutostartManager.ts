import fs from 'node:fs';
import path from 'node:path';

export interface AutostartStatus {
  enabled: boolean;
  path: string;
}

/**
 * Windows User-Level Autostart Manager
 *
 * Places or removes a startup script in the user's Startup folder:
 * %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\AeroKin.cmd
 *
 * Operates strictly with standard user privileges (no admin required).
 * In tests, always specify a custom temp directory (Rule S7).
 */
export class WindowsAutostartManager {
  private startupDir: string;
  private scriptPath: string;
  private shortcutPath: string;

  constructor(customStartupDir?: string) {
    if (customStartupDir) {
      this.startupDir = customStartupDir;
    } else {
      const appData =
        process.env.APPDATA ||
        path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
      this.startupDir = path.join(
        appData,
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
        'Startup'
      );
    }
    this.scriptPath = path.join(this.startupDir, 'AeroKin.cmd');
    this.shortcutPath = path.join(this.startupDir, 'AeroKin.lnk');
  }

  public getStatus(): AutostartStatus {
    const lnkExists = fs.existsSync(this.shortcutPath);
    const cmdExists = fs.existsSync(this.scriptPath);
    return {
      enabled: lnkExists || cmdExists,
      path: lnkExists ? this.shortcutPath : this.scriptPath,
    };
  }

  public enable(targetLaunchCommand?: string): AutostartStatus {
    if (!fs.existsSync(this.startupDir)) {
      fs.mkdirSync(this.startupDir, { recursive: true });
    }
    const defaultCmd = targetLaunchCommand || 'pnpm --filter aerokin-server start';
    const cmdContent = `@echo off\r\nREM AeroKin Windows Autostart Entry\r\ncd /d "${process.cwd()}"\r\nstart "" /b ${defaultCmd}\r\n`;
    fs.writeFileSync(this.scriptPath, cmdContent, 'utf-8');
    return {
      enabled: true,
      path: this.scriptPath,
    };
  }

  public disable(): AutostartStatus {
    if (fs.existsSync(this.shortcutPath)) {
      try {
        fs.unlinkSync(this.shortcutPath);
      } catch {}
    }
    if (fs.existsSync(this.scriptPath)) {
      try {
        fs.unlinkSync(this.scriptPath);
      } catch {}
    }
    return {
      enabled: false,
      path: this.shortcutPath,
    };
  }
}
