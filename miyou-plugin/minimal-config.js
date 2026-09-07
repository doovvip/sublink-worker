export const MIYOU_MINIMAL = {
  version: '0.6.4',
  mode: 'integrated-slim',

  // Keep the feature families required by the final MiYou AI build.
  keepOnly: [
    'ai',
    'dbReader',
    'unrepliedScan',
    'presets',
    'manualSend',

    // Native chat toolbar remains, but it exposes only Quick Reply.
    'chatToolbar',
    'quickReply',
    'quickReplyList',

    // Keep Message Settings shell with only these two user-facing items.
    'messageSettings',
    'backgroundResident',
    'antiRecall',

    // Preserve these MiYou sections as-is.
    'secretFriendSettings',
    'fileManagement'
  ],

  toolbar: {
    keepOnly: ['quickReply']
  },

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
    'ai',
    'dbReader',
    'unrepliedScan',
    'presets',
    'manualSend',
    'secretFriendSettings',
    'fileManagement'
  ],

  pruningPolicy: {
    preserveDependencies: true,
    preserveSharedCode: true,
    preserveCommonHooks: true,
    preserveStorageAndNetworkLayers: true,
    removeOnlyExclusiveFeatureImplementation: true,
    removeOnlyFeatureEntryAndResources: true,
    unknownDependencyAction: 'keep'
  },

  disableByDefault: true
};
