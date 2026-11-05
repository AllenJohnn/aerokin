import { describe, it, expect } from 'vitest';
import { parseSystemPowerStatus, getHostPowerStatus } from '../src/power.js';

describe('Windows System Power & Battery Monitor', () => {
  it('correctly identifies a desktop PC without a battery', () => {
    const desktopStatus = parseSystemPowerStatus({
      ACLineStatus: 1,
      BatteryFlag: 128, // 128 = No battery
      BatteryLifePercent: 255, // 255 = Unknown/None
    });

    expect(desktopStatus.hasBattery).toBe(false);
    expect(desktopStatus.batteryPercent).toBeNull();
    expect(desktopStatus.isCharging).toBe(false);
    expect(desktopStatus.acConnected).toBe(true);
  });

  it('correctly parses a laptop discharging on battery', () => {
    const laptopOnBattery = parseSystemPowerStatus({
      ACLineStatus: 0, // Disconnected from AC
      BatteryFlag: 1,  // High battery (>66%)
      BatteryLifePercent: 78,
    });

    expect(laptopOnBattery.hasBattery).toBe(true);
    expect(laptopOnBattery.batteryPercent).toBe(78);
    expect(laptopOnBattery.isCharging).toBe(false);
    expect(laptopOnBattery.acConnected).toBe(false);
  });

  it('correctly parses a laptop plugged in and charging', () => {
    const laptopCharging = parseSystemPowerStatus({
      ACLineStatus: 1, // AC Online
      BatteryFlag: 9,  // Bit 0 (High) + Bit 3 (Charging: 8) = 9
      BatteryLifePercent: 62,
    });

    expect(laptopCharging.hasBattery).toBe(true);
    expect(laptopCharging.batteryPercent).toBe(62);
    expect(laptopCharging.isCharging).toBe(true);
    expect(laptopCharging.acConnected).toBe(true);
  });

  it('can query host power status without throwing', () => {
    const hostStatus = getHostPowerStatus();
    expect(hostStatus).toBeDefined();
    expect(typeof hostStatus.hasBattery).toBe('boolean');
    expect(typeof hostStatus.acConnected).toBe('boolean');
  });
});
