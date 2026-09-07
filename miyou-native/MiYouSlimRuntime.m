#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import <dispatch/dispatch.h>

static BOOL gFilteringMessageManage = NO;
static IMP gOrigMessageManage = NULL;
static IMP gOrigAddSwitch = NULL;
static IMP gOrigAddNormal = NULL;

static void MiYouSlimNoop(id self, SEL _cmd) {
    (void)self;
    (void)_cmd;
}

static void MiYouSlimMessageManage(id self, SEL _cmd) {
    gFilteringMessageManage = YES;
    if (gOrigMessageManage) {
        ((void (*)(id, SEL))gOrigMessageManage)(self, _cmd);
    }
    gFilteringMessageManage = NO;
}

static id MiYouSlimAddSwitch(id self, SEL _cmd, SEL action, id title, BOOL on) {
    if (gFilteringMessageManage) {
        SEL keepBackground = sel_registerName("settingBakgrunnur:");
        SEL keepAntiRecall = sel_registerName("settingRevokeMsg:");
        if (action != keepBackground && action != keepAntiRecall) {
            return nil;
        }
    }

    if (!gOrigAddSwitch) return nil;
    return ((id (*)(id, SEL, SEL, id, BOOL))gOrigAddSwitch)(self, _cmd, action, title, on);
}

static id MiYouSlimAddNormal(id self, SEL _cmd, SEL action, id title, id rightValue) {
    if (gFilteringMessageManage) {
        // Message management should contain only the two switches above.
        return nil;
    }

    if (!gOrigAddNormal) return nil;
    return ((id (*)(id, SEL, SEL, id, id))gOrigAddNormal)(self, _cmd, action, title, rightValue);
}

static BOOL ReplaceVoidMethod(Class cls, const char *selectorName) {
    SEL sel = sel_registerName(selectorName);
    Method method = class_getInstanceMethod(cls, sel);
    if (!method) return NO;
    method_setImplementation(method, (IMP)MiYouSlimNoop);
    return YES;
}

static BOOL InstallMiYouSlimHooks(void) {
    Class cls = objc_getClass("MiYouSettingViewController");
    if (!cls) return NO;

    // Keep these original sections untouched:
    // addFileBrowserSection, addFileManagerSection,
    // addMessageToolBarSection, addChatGPTSection,
    // addMessageManageSection, addMiYouSettingSection.
    // MiYouViewController (secret-friend settings) is not hooked at all.
    const char *disabledSections[] = {
        "addShareSection",
        "addMsgSendOpEntrySection",
        "addDonotdisturbSection",
        "addKeywordMessageSection",
        "addMessageSyncSection",
        "addReplyMessageSection",
        "addVoiceSection",
        "addMsgGestureSection",
        "addAutoGetPaySection",
        "addSessionBoxSection",
        "addChatBoxSection",
        "addGroupHelperSection",
        "otherSettingSection",
        "addMessageShieldSection",
        "addMessageFloatingViewSection",
        "addMessagePreviewSection",
        "addAuthorizeSection",
        "addCustomFontSection",
        "addMessageTimeSection",
        "addFakeStepSection",
        "addFakeLocationSection",
        "addSendToRoomHelper"
    };

    for (NSUInteger i = 0; i < sizeof(disabledSections) / sizeof(disabledSections[0]); i++) {
        ReplaceVoidMethod(cls, disabledSections[i]);
    }

    SEL manageSel = sel_registerName("addMessageManageSection");
    Method manageMethod = class_getInstanceMethod(cls, manageSel);
    if (manageMethod) {
        gOrigMessageManage = method_setImplementation(manageMethod, (IMP)MiYouSlimMessageManage);
    }

    SEL addSwitchSel = sel_registerName("addSwitchCellForSel:title:on:");
    Method addSwitchMethod = class_getInstanceMethod(cls, addSwitchSel);
    if (addSwitchMethod) {
        gOrigAddSwitch = method_setImplementation(addSwitchMethod, (IMP)MiYouSlimAddSwitch);
    }

    SEL addNormalSel = sel_registerName("addNormalCellForSel:title:rightValue:");
    Method addNormalMethod = class_getInstanceMethod(cls, addNormalSel);
    if (addNormalMethod) {
        gOrigAddNormal = method_setImplementation(addNormalMethod, (IMP)MiYouSlimAddNormal);
    }

    return manageMethod && addSwitchMethod && addNormalMethod;
}

static void InstallWithRetry(NSUInteger attempt) {
    if (InstallMiYouSlimHooks()) return;
    if (attempt >= 20) return;

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(500 * NSEC_PER_MSEC)),
                   dispatch_get_main_queue(), ^{
        InstallWithRetry(attempt + 1);
    });
}

__attribute__((constructor))
static void MiYouSlimRuntimeInit(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        InstallWithRetry(0);
    });
}
