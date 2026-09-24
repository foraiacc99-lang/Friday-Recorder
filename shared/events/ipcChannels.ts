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
  AUDIO: {
    LIST_MICROPHONES: 'audio:listMicrophones',
    START_MIC: 'audio:startMic',
    START_SYSTEM_AUDIO: 'audio:startSystemAudio',
    STOP: 'audio:stop',
    GET_STATUS: 'audio:getStatus',
  },
} as const;

export type IpcChannel =
  | (typeof IPC_CHANNELS.APP)[keyof typeof IPC_CHANNELS.APP]
  | (typeof IPC_CHANNELS.CAPTURE)[keyof typeof IPC_CHANNELS.CAPTURE]
  | (typeof IPC_CHANNELS.AUDIO)[keyof typeof IPC_CHANNELS.AUDIO];

