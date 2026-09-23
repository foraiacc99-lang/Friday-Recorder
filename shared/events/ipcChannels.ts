/**
 * Strongly typed IPC channel name constants.
 * Scaffolding for Friday Recorder IPC communication.
 */
export const IPC_CHANNELS = {
  APP: {
    GET_VERSION: 'app:getVersion',
  },
} as const;

export type IpcChannel = typeof IPC_CHANNELS.APP[keyof typeof IPC_CHANNELS.APP];
