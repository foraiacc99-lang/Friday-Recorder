/**
 * Strongly typed IPC channel name constants.
 * Scaffolding for Friday Recorder IPC communication.
 */
export const IPC_CHANNELS = {
  APP: {
    GET_VERSION: 'app:getVersion',
  },
  CAPTURE: {
    LIST_SOURCES: 'capture:listSources',
    START: 'capture:start',
    STOP: 'capture:stop',
    GET_STATUS: 'capture:getStatus',
  },
} as const;

export type IpcChannel =
  | (typeof IPC_CHANNELS.APP)[keyof typeof IPC_CHANNELS.APP]
  | (typeof IPC_CHANNELS.CAPTURE)[keyof typeof IPC_CHANNELS.CAPTURE];
