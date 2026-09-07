# MiYou 3.9-5 Native Map

Static-analysis target: `MiYou-3.9-5.dylib` (arm64)

This map records the original MiYou 3.9-5 entries used by the slim build. It is intentionally limited to features needed by the current project.

## Keep

### Native chat toolbar / quick reply

Classes and selectors found in the original binary:

- `MiYouMessageToolBar`
  - `handleSingle:`
  - `actionsChange:`
  - `setActions:`
- `MiYouRepayMsgViewController`
  - `reloadTableViewData`
  - `addMessageAction`
- `MiYouSettingViewController`
  - `addMessageToolBarSection`
  - `settingActions`
  - `settingMessageList`
- `MiYouConfig`
  - `messageList`
  - `setMessageList:`
  - `mQuickReplyView`
- hooked chat selectors:
  - `quickReply`
  - `quickRepaySheetAdapter`
  - `QuickReplyMessage:`
  - `getChatUsername`

`MiYouRepayMsgViewController.reloadTableViewData` reads `MiYouConfig.sharedConfig.messageList`, confirming the existing `快捷回复列表` is backed by MiYou's own configuration.

### Native ChatGPT

Class: `MYChatGPT`

Relevant selectors:

- `sharedConfig`
- `prompts` / `setPrompts:`
- `systemMessage` / `setSystemMessage:`
- `chatModel` / `setChatModel:`
- `mChatGPTAPIKey` / `setMChatGPTAPIKey:`
- `mIsChatGPTEnabled` / `setMIsChatGPTEnabled:`
- `mIsTheContextEnabled` / `setMIsTheContextEnabled:`
- `getPromptWithUser:message:`
- `getContentsWithUser:message:`
- `chatGPTWithPrompt:success:failure:`
- `chatGPTTurboWithContents:success:failure:`
- `chatGPTWithUser:message:`

Original MiYou also contains the message action selector `ChatGPTReply:`. The original `chatGPTWithUser:message:` path can write/send through WeChat message APIs, so the slim build must not use that automatic-send path. For manual-send mode, use the lower-level prompt/request methods and insert the returned draft into the input box only.

### Message settings: keep only two rows

`MiYouSettingViewController.addMessageManageSection` contains many settings. The slim build keeps only:

- 常驻后台
  - `mIsBakgrunnur`
  - `settingBakgrunnur:`
  - associated background runtime methods include `runBackground`, `runBackgroundTask`, `requestMoreTime`, `playBlankAudio`, `stopBackground`
- 消息防撤回
  - `mIsRevokeMsg`
  - `settingRevokeMsg:`

`settingBackgroundTime` is a message timestamp-background setting and is not the background-resident feature.

### 秘友设置

Class: `MiYouViewController`

Relevant selectors include:

- `addHideFriendSection`
- `settingHideFriend:`
- `settingHidePassword`
- `settingHideNotice`
- `showHideFriendListVC`
- `showHideRoomListVC`

`MiYouSettingViewController.addMiYouSettingSection` is kept. `MiYouViewController` is not filtered by `MiYouSlimRuntime`.

### 文件管理

Keep original sections:

- `addFileBrowserSection`
- `addFileManagerSection`
- `openFileBrowser`

Original file-browser class found: `LMFileBrowserViewController`.

## Disable / hide in slim build

The runtime filter suppresses the following original setting-section builders:

- `addShareSection`
- `addMsgSendOpEntrySection`
- `addDonotdisturbSection`
- `addKeywordMessageSection`
- `addMessageSyncSection`
- `addReplyMessageSection`
- `addVoiceSection`
- `addMsgGestureSection`
- `addAutoGetPaySection`
- `addSessionBoxSection`
- `addChatBoxSection`
- `addGroupHelperSection`
- `otherSettingSection`
- `addMessageShieldSection`
- `addMessageFloatingViewSection`
- `addMessagePreviewSection`
- `addAuthorizeSection`
- `addCustomFontSection`
- `addMessageTimeSection`
- `addFakeStepSection`
- `addFakeLocationSection`
- `addSendToRoomHelper`

`MYReplyConfig` is the automatic/keyword reply subsystem, not the native manual `快捷回复列表`; it is not part of the slim quick-reply path.

## Slim runtime

Source: `miyou-native/MiYouSlimRuntime.m`

It does not rewrite the original MiYou machine code. At runtime it filters the original `MiYouSettingViewController` section builders and restricts `addMessageManageSection` to the two requested switches.

Current arm64 build verification:

- format: Mach-O 64-bit dynamically linked shared library arm64
- size: 69,504 bytes
- SHA-256: `0a48d41c92f1b8ee3ce819ada6a2e2a7eeb1a0b78127028b9790aa631c5fb0a5`

Device runtime behavior still requires an on-device test before the build is considered release-ready.
