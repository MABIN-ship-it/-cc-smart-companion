import { describe, it, expect } from 'vitest';
import { checkCommandSafety, checkFileSafety } from '../safetyGuard';

describe('checkCommandSafety', () => {
  // 危险命令拦截
  it('拦截 rm -rf /', () => {
    const r = checkCommandSafety('rm -rf /');
    expect(r.safe).toBe(false);
    expect(r.reason).toBe('禁止删除根目录');
  });

  it('拦截 rm -rf /*', () => {
    const r = checkCommandSafety('rm -rf /*');
    expect(r.safe).toBe(false);
  });

  it('拦截 rm -rf ~', () => {
    const r = checkCommandSafety('rm -rf ~');
    expect(r.safe).toBe(false);
  });

  it('拦截 mkfs', () => {
    expect(checkCommandSafety('mkfs.ext4 /dev/sda1').safe).toBe(false);
  });

  it('拦截 dd 写入磁盘', () => {
    expect(checkCommandSafety('dd if=/dev/zero of=/dev/sda').safe).toBe(false);
  });

  it('拦截覆盖磁盘设备', () => {
    expect(checkCommandSafety('echo > /dev/sda').safe).toBe(false);
  });

  it('拦截 Fork 炸弹 :(){:|:&};:', () => {
    expect(checkCommandSafety(':(){ :|:& };:').safe).toBe(false);
  });

  it('拦截 Windows format C:', () => {
    expect(checkCommandSafety('format C:').safe).toBe(false);
  });

  it('拦截 del /f /s /q C:\\', () => {
    expect(checkCommandSafety('del /f /s /q C:\\').safe).toBe(false);
  });

  it('拦截 rd /s /q C:\\', () => {
    expect(checkCommandSafety('rd /s /q C:\\').safe).toBe(false);
  });

  it('拦截 shutdown /s', () => {
    expect(checkCommandSafety('shutdown /s /t 0').safe).toBe(false);
  });

  it('拦截 reboot', () => {
    expect(checkCommandSafety('reboot').safe).toBe(false);
  });

  it('拦截 chmod 777 /', () => {
    expect(checkCommandSafety('chmod 777 /').safe).toBe(false);
  });

  it('拦截 chmod -R 777 /', () => {
    expect(checkCommandSafety('chmod -R 777 /').safe).toBe(false);
  });

  it('拦截删除注册表 HKLM', () => {
    expect(checkCommandSafety('reg delete HKLM\\SOFTWARE\\test').safe).toBe(false);
  });

  // 允许正常命令
  it('允许 ls -la', () => {
    expect(checkCommandSafety('ls -la').safe).toBe(true);
  });

  it('允许 npm install', () => {
    expect(checkCommandSafety('npm install react').safe).toBe(true);
  });

  it('允许 pip install', () => {
    expect(checkCommandSafety('pip install numpy').safe).toBe(true);
  });

  it('允许 git status', () => {
    expect(checkCommandSafety('git status').safe).toBe(true);
  });

  it('允许 mkdir new_dir', () => {
    expect(checkCommandSafety('mkdir new_dir').safe).toBe(true);
  });

  it('空命令安全', () => {
    expect(checkCommandSafety('').safe).toBe(true);
    expect(checkCommandSafety(null).safe).toBe(true);
  });

  // 提醒但不拦截
  it('提醒 pip uninstall', () => {
    const r = checkCommandSafety('pip uninstall numpy');
    expect(r.safe).toBe(true);
    expect(r.caution).toBeTruthy();
  });

  it('提醒 npm uninstall', () => {
    const r = checkCommandSafety('npm uninstall react');
    expect(r.safe).toBe(true);
    expect(r.caution).toBeTruthy();
  });

  it('提醒 git push --force', () => {
    const r = checkCommandSafety('git push --force origin main');
    expect(r.safe).toBe(true);
    expect(r.caution).toContain('force push');
  });

  it('提醒 git reset --hard', () => {
    const r = checkCommandSafety('git reset --hard HEAD~1');
    expect(r.safe).toBe(true);
    expect(r.caution).toContain('hard reset');
  });
});

describe('checkFileSafety', () => {
  it('禁止删除 Windows System32（Unix风格路径）', () => {
    const r = checkFileSafety('/windows/system32/x.dll', 'delete');
    expect(r.safe).toBe(false);
  });

  it('禁止写入 System32（Unix风格路径）', () => {
    const r = checkFileSafety('/windows/system32/x.dll', 'write');
    expect(r.safe).toBe(false);
  });

  it('禁止删除 /etc 目录', () => {
    const r = checkFileSafety('/etc/nginx/nginx.conf', 'delete');
    expect(r.safe).toBe(false);
  });

  it('禁止删除 /boot 目录', () => {
    const r = checkFileSafety('/boot/vmlinuz', 'delete');
    expect(r.safe).toBe(false);
  });

  it('禁止删除 /usr/bin', () => {
    const r = checkFileSafety('/usr/bin/bash', 'delete');
    expect(r.safe).toBe(false);
  });

  it('禁止写入 /sys 目录', () => {
    const r = checkFileSafety('/sys/class/power_supply/test', 'write');
    expect(r.safe).toBe(false);
  });

  it('删除 SSH 私钥时提醒', () => {
    const r = checkFileSafety('/home/user/.ssh/id_rsa', 'delete');
    expect(r.safe).toBe(true);
    expect(r.note).toBeTruthy();
  });

  it('删除 AWS credentials 时提醒', () => {
    const r = checkFileSafety('/home/user/.aws/credentials', 'delete');
    expect(r.safe).toBe(true);
    expect(r.note).toBeTruthy();
  });

  it('允许删除普通文件', () => {
    const r = checkFileSafety('D:\\projects\\temp.txt', 'delete');
    expect(r.safe).toBe(true);
  });

  it('允许写入普通文件', () => {
    const r = checkFileSafety('D:\\projects\\new.js', 'write');
    expect(r.safe).toBe(true);
  });

  it('空路径安全', () => {
    expect(checkFileSafety('', 'delete').safe).toBe(true);
    expect(checkFileSafety(null, 'write').safe).toBe(true);
  });
});
