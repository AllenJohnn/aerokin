/**
 * AEROKIN Windows System Power & Battery Monitor
 *
 * Interrogates Win32 GetSystemPowerStatus via koffi.
 * If running on a desktop PC without a battery, hasBattery returns false so the UI
 * can hide the battery widget cleanly without guessing or inventing numbers.
 */

import koffi from 'koffi';

export interface PowerStatus {
  hasBattery: boolean;
  batteryPercent: number | null;
  isCharging: boolean;
  acConnected: boolean;
}

let getSystemPowerStatusFn: any = null;
let SYSTEM_POWER_STATUS_TYPE: any = null;

if (process.platform === 'win32') {
  try {
    const kernel32 = koffi.load('kernel32.dll');
    SYSTEM_POWER_STATUS_TYPE = koffi.struct('SYSTEM_POWER_STATUS', {
      ACLineStatus: 'uint8',
      BatteryFlag: 'uint8',
      BatteryLifePercent: 'uint8',
      SystemStatusFlag: 'uint8',
      BatteryLifeTime: 'uint32',
      BatteryFullLifeTime: 'uint32',
    });

    getSystemPowerStatusFn = kernel32.func(
      'bool __stdcall GetSystemPowerStatus(_Out_ SYSTEM_POWER_STATUS *lpSystemPowerStatus)'
    );
  } catch (err) {
    console.warn('[Power] Failed to bind kernel32 GetSystemPowerStatus:', err);
  }
}

/**
 * Pure parser for raw SYSTEM_POWER_STATUS fields.
 */
export function parseSystemPowerStatus(status: {
  ACLineStatus: number;
  BatteryFlag: number;
  BatteryLifePercent: number;
}): PowerStatus {
  const { ACLineStatus, BatteryFlag, BatteryLifePercent } = status;

  // 128 = No system battery, 255 = Unknown status
  const hasNoBattery = BatteryFlag === 128 || (BatteryFlag === 255 && BatteryLifePercent === 255);

  if (hasNoBattery) {
    return {
      hasBattery: false,
      batteryPercent: null,
      isCharging: false,
      acConnected: ACLineStatus === 1,
    };
  }

  const acConnected = ACLineStatus === 1;
  // BatteryFlag bit 3 (value 8) indicates charging
  const isCharging = (BatteryFlag & 8) !== 0 || (acConnected && BatteryLifePercent < 100);
  const batteryPercent = BatteryLifePercent !== 255 ? BatteryLifePercent : null;

  return {
    hasBattery: true,
    batteryPercent,
    isCharging,
    acConnected,
  };
}

/**
 * Reads live power status on the host machine.
 */
export function getHostPowerStatus(): PowerStatus {
  if (!getSystemPowerStatusFn || !SYSTEM_POWER_STATUS_TYPE) {
    return {
      hasBattery: false,
      batteryPercent: null,
      isCharging: false,
      acConnected: true,
    };
  }

  try {
    const rawStatus = {};
    const success = getSystemPowerStatusFn(rawStatus);
    if (!success) {
      return {
        hasBattery: false,
        batteryPercent: null,
        isCharging: false,
        acConnected: true,
      };
    }
    return parseSystemPowerStatus(rawStatus as any);
  } catch {
    return {
      hasBattery: false,
      batteryPercent: null,
      isCharging: false,
      acConnected: true,
    };
  }
}
