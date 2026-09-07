export const MIYOU_MINIMAL = {
  version: '0.6.2',
  mode: 'keep-only',

  keepOnly: [
    'ai',
    'dbReader',
    'unrepliedScan',
    'presets',
    'manualSend',
    'quickReply',
    'messageSettings',
    'backgroundResident',
    'antiRecall'
  ],

  quickReply: {
    reuseNativeToolbar: true,
    reuseNativeList: true,
    aiSuggestions: 3,
    insertToInput: true,
    autoSend: false
  },

  messageSettings: {
    backgroundResident: true,
    antiRecall: true
  },

  disableByDefault: true
};
