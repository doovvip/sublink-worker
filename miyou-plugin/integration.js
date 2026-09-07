import { scanUnrepliedForContact, scanAllUnreplied } from './core.js';
import {
  buildQuickReplyRequest,
  requestQuickReplies,
  applyQuickReply,
  QUICK_REPLY_BEHAVIOR
} from './quick-reply.js';
import { MIYOU_MINIMAL } from './minimal-config.js';

export const MIYOU_INTEGRATION_VERSION = '0.6.4';

export const MIYOU_FEATURE_BUNDLE = Object.freeze({
  toolbar: Object.freeze({
    keepOnly: ['quickReply'],
    quickReply: QUICK_REPLY_BEHAVIOR
  }),

  messageSettings: Object.freeze({
    keepOnly: ['backgroundResident', 'antiRecall']
  }),

  preserveWhole: Object.freeze([
    'secretFriendSettings',
    'fileManagement',
    'ai',
    'dbReader',
    'unrepliedScan',
    'presets',
    'manualSend'
  ]),

  pruneFeatureCode: Object.freeze([
    'voiceVideo',
    'groupAssistant',
    'messagePreviewFold',
    'groupChatGrouping',
    'groupExtras',
    'transferTools',
    'locationSpoof',
    'stepCountModify',
    'forceFollowOfficialAccount',
    'massMessageAssistant',
    'keywordAutoReply',
    'ocr',
    'toolbarPhoto',
    'toolbarCamera',
    'toolbarFile',
    'toolbarAdd'
  ]),

  pruningPolicy: Object.freeze({
    preserveDependencies: true,
    preserveSharedCode: true,
    preserveCommonHooks: true,
    preserveStorageAndNetworkLayers: true,
    removeOnlyExclusiveFeatureImplementation: true,
    removeOnlyFeatureEntryAndResources: true,
    unknownDependencyAction: 'keep'
  })
});

export function createMiYouIntegration({
  quickReplyEndpoint,
  setInputText,
  preset,
  presetId = 'default'
} = {}) {
  return {
    version: MIYOU_INTEGRATION_VERSION,
    profile: MIYOU_MINIMAL,
    features: MIYOU_FEATURE_BUNDLE,

    scanContact(args = {}) {
      return scanUnrepliedForContact(args);
    },

    scanAll(conversations = []) {
      return scanAllUnreplied(conversations);
    },

    buildReplyContext({ contact, messages } = {}) {
      return buildQuickReplyRequest({
        contact,
        messages,
        preset,
        presetId
      });
    },

    async generateReplies({ contact, messages } = {}) {
      return requestQuickReplies(quickReplyEndpoint, {
        contact,
        messages,
        preset,
        presetId
      });
    },

    chooseReply(suggestion) {
      return applyQuickReply(setInputText, suggestion);
    }
  };
}
