export const MIYOU_MINIMAL = {
  version: '0.6.3',
  mode: 'keep-only',

  // Only these feature families belong in the slim build.
  // Everything not listed here is disabled by default.
  keepOnly: [
    'ai',
    'dbReader',
    'unrepliedScan',
    'presets',
    'manualSend',

    // Reuse MiYou's native chat toolbar and quick-reply UI.
    'chatToolbar',
    'quickReply',
    'quickReplyList',

    // Keep the Message Settings page, but only the two items below.
    'messageSettings',
    'backgroundResident',
    'antiRecall',

    // Preserve these MiYou sections as-is for now.
    'secretFriendSettings',
    'fileManagement'
  ],

  quickReply: {
    reuseNativeToolbar: true,
    reuseNativeList: true,
    aiSuggestions: 3,
    insertToInput: true,
    autoSend: false,
    regenerate: true
  },

  messageSettings: {
    keepOnly: [
      'backgroundResident',
      'antiRecall'
    ]
  },

  preserveWhole: [
    'secretFriendSettings',
    'fileManagement'
  ],

  disableByDefault: true
};
