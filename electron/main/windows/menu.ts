import { app, dialog, Menu, MenuItemConstructorOptions } from 'electron';
import { getAppVersion } from '../ipc/appHandlers';

/**
 * Builds and sets the minimal application menu.
 * Only standard File, Edit, View, and Help menus are included.
 */
export function setupApplicationMenu(isDev: boolean): void {
  const version = getAppVersion();

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev
          ? [
              { type: 'separator' as const },
              { role: 'toggleDevTools' as const },
            ]
          : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Friday Recorder',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About Friday Recorder',
              message: 'Friday Recorder',
              detail: `Version: ${version}\nWindows desktop screen recording + non-destructive video editing application.`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
