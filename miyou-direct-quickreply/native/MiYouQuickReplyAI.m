#import <UIKit/UIKit.h>
#import <Foundation/Foundation.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>

static NSString * const MYQRVersion = @"0.3.0";
static NSString * const MYQREndpoint = @"https://sublink-worker-pink.vercel.app/api/miyou-ai";
static NSString * const MYQRPreset = @"结合聊天上下文判断关系、情绪和氛围，生成自然、合适、不突兀的回复，保持我的说话风格。";
static NSInteger const MYQRPanelTag = 0x4D595152;
static const void *MYQRTextKey = &MYQRTextKey;

static NSArray<NSString *> *gContext;
static NSString *gContact;
static NSString *gFingerprint;
static NSString *gRequestedFingerprint;
static NSArray<NSString *> *gReplies;
static NSString *gPendingReply;
static BOOL gRequesting = NO;
static NSUInteger gDebounceToken = 0;

#pragma mark - Helpers

static NSString *MYQRTrim(id value) {
    if (![value isKindOfClass:[NSString class]]) return @"";
    return [(NSString *)value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
}

static UIWindow *MYQRKeyWindow(void) {
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:UIWindowScene.class]) continue;
        if (scene.activationState != UISceneActivationStateForegroundActive) continue;
        for (UIWindow *window in ((UIWindowScene *)scene).windows) if (window.isKeyWindow) return window;
    }
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    return UIApplication.sharedApplication.keyWindow;
#pragma clang diagnostic pop
}

static UIViewController *MYQRTopFrom(UIViewController *vc) {
    if (!vc) return nil;
    if (vc.presentedViewController) return MYQRTopFrom(vc.presentedViewController);
    if ([vc isKindOfClass:UINavigationController.class]) return MYQRTopFrom(((UINavigationController *)vc).visibleViewController);
    if ([vc isKindOfClass:UITabBarController.class]) return MYQRTopFrom(((UITabBarController *)vc).selectedViewController);
    return vc;
}

static UIViewController *MYQRTop(void) {
    return MYQRTopFrom(MYQRKeyWindow().rootViewController);
}

static NSString *MYQRTitle(UIViewController *vc) {
    NSString *title = MYQRTrim(vc.navigationItem.title ?: vc.title);
    return title ?: @"";
}

static void MYQRCollectText(UIView *view, NSMutableArray<NSString *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    if ([view isKindOfClass:UILabel.class]) {
        NSString *t = MYQRTrim(((UILabel *)view).text);
        if (t.length) [out addObject:t];
    } else if ([view isKindOfClass:UIButton.class]) {
        NSString *t = MYQRTrim([((UIButton *)view) titleForState:UIControlStateNormal]);
        if (t.length) [out addObject:t];
    }
    for (UIView *sub in view.subviews) MYQRCollectText(sub, out);
}

static NSArray<NSString *> *MYQRTexts(UIView *view) {
    NSMutableArray *out = [NSMutableArray array];
    MYQRCollectText(view, out);
    return out;
}

static BOOL MYQRContains(NSArray<NSString *> *items, NSString *needle) {
    for (NSString *item in items) if ([item containsString:needle]) return YES;
    return NO;
}

static void MYQRCollectInputs(UIView *view, NSMutableArray<UIView *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    if ([view isKindOfClass:UITextView.class]) {
        UITextView *v = (UITextView *)view;
        if (v.editable && v.userInteractionEnabled) [out addObject:v];
    } else if ([view isKindOfClass:UITextField.class]) {
        UITextField *v = (UITextField *)view;
        if (v.enabled && v.userInteractionEnabled && !v.secureTextEntry) [out addObject:v];
    }
    for (UIView *sub in view.subviews) MYQRCollectInputs(sub, out);
}

static UIView *MYQRChatInput(UIView *root) {
    NSMutableArray<UIView *> *inputs = [NSMutableArray array];
    MYQRCollectInputs(root, inputs);
    UIWindow *window = MYQRKeyWindow();
    if (!window) return nil;
    CGFloat h = CGRectGetHeight(window.bounds);
    UIView *best = nil;
    CGFloat score = -CGFLOAT_MAX;
    for (UIView *v in inputs) {
        CGRect r = [v convertRect:v.bounds toView:window];
        if (r.size.width < 80 || r.size.height < 28 || CGRectGetMinY(r) < h * 0.48) continue;
        CGFloat s = CGRectGetMinY(r) + r.size.width * 0.01;
        if (s > score) { score = s; best = v; }
    }
    return best;
}

static void MYQRCollectTables(UIView *view, NSMutableArray<UITableView *> *out) {
    if (!view || view.hidden) return;
    if ([view isKindOfClass:UITableView.class]) [out addObject:(UITableView *)view];
    for (UIView *sub in view.subviews) MYQRCollectTables(sub, out);
}

static NSString *MYQRCellText(UITableViewCell *cell) {
    if (!cell) return @"";
    NSMutableArray *items = [NSMutableArray array];
    MYQRCollectText(cell.contentView, items);
    NSMutableArray *clean = [NSMutableArray array];
    NSSet *noise = [NSSet setWithArray:@[@"快捷回复", @"照片", @"拍摄", @"文件", @"添加"]];
    for (NSString *item in items) {
        NSString *t = MYQRTrim(item);
        if (!t.length || t.length > 700 || [noise containsObject:t]) continue;
        [clean addObject:t];
    }
    return [clean componentsJoinedByString:@" "];
}

static NSArray<NSString *> *MYQRVisibleContext(UIViewController *vc) {
    if (!vc || !vc.isViewLoaded || !MYQRChatInput(vc.view)) return @[];
    NSMutableArray<UITableView *> *tables = [NSMutableArray array];
    MYQRCollectTables(vc.view, tables);
    UITableView *best = nil;
    NSUInteger bestCount = 0;
    for (UITableView *table in tables) {
        NSUInteger count = table.indexPathsForVisibleRows.count;
        if (count > bestCount) { best = table; bestCount = count; }
    }
    if (!best || !bestCount) return @[];
    NSArray<NSIndexPath *> *rows = [best.indexPathsForVisibleRows sortedArrayUsingComparator:^NSComparisonResult(NSIndexPath *a, NSIndexPath *b) {
        if (a.section != b.section) return a.section < b.section ? NSOrderedAscending : NSOrderedDescending;
        if (a.row == b.row) return NSOrderedSame;
        return a.row < b.row ? NSOrderedAscending : NSOrderedDescending;
    }];
    NSMutableArray<NSString *> *out = [NSMutableArray array];
    for (NSIndexPath *path in rows) {
        NSString *line = MYQRCellText([best cellForRowAtIndexPath:path]);
        if (line.length) [out addObject:line];
    }
    if (out.count > 30) return [out subarrayWithRange:NSMakeRange(out.count - 30, 30)];
    return out;
}

static NSString *MYQRFingerprint(NSString *contact, NSArray<NSString *> *context) {
    return [NSString stringWithFormat:@"%@||%@", contact ?: @"", [context componentsJoinedByString:@"\n"]];
}

static BOOL MYQRIsQuickReplyList(UIViewController *vc) {
    NSString *title = MYQRTitle(vc);
    if ([title containsString:@"快捷回复列表"]) return YES;
    return MYQRContains(MYQRTexts(vc.view), @"快捷回复列表");
}

static BOOL MYQRLooksLikeSettings(UIViewController *vc) {
    NSString *title = MYQRTitle(vc);
    return [title containsString:@"设置"] || [title containsString:@"工具栏"] || [title containsString:@"文件管理"] || [title containsString:@"秘友"] || [title containsString:@"快捷回复列表"];
}

#pragma mark - Network / pre-generation

static void MYQRRenderCurrentPanel(void);

static void MYQRRequest(NSString *fingerprint, NSString *contact, NSArray<NSString *> *context) {
    if (!fingerprint.length || !context.count || gRequesting) return;
    gRequesting = YES;
    gRequestedFingerprint = [fingerprint copy];

    NSDictionary *payload = @{
        @"contact": contact ?: @"",
        @"context": context,
        @"preset": MYQRPreset,
        @"count": @3,
        @"client": @"MiYouQuickReplyAI",
        @"version": MYQRVersion
    };
    NSData *body = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSURL *url = [NSURL URLWithString:MYQREndpoint];
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:12];
    req.HTTPMethod = @"POST";
    req.HTTPBody = body;
    [req setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];

    [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSDictionary *json = data.length ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        NSArray *raw = [json isKindOfClass:NSDictionary.class] ? json[@"replies"] : nil;
        NSMutableArray<NSString *> *clean = [NSMutableArray array];
        if (!error && [raw isKindOfClass:NSArray.class]) {
            for (id item in raw) {
                NSString *t = MYQRTrim(item);
                if (t.length) [clean addObject:t];
                if (clean.count == 3) break;
            }
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            BOOL stillCurrent = [gFingerprint isEqualToString:fingerprint] && [gRequestedFingerprint isEqualToString:fingerprint];
            gRequesting = NO;
            if (stillCurrent && clean.count) gReplies = [clean copy];
            if (stillCurrent && !clean.count) gReplies = @[];
            MYQRRenderCurrentPanel();
        });
    }] resume];
}

static void MYQRSchedulePreGenerate(UIViewController *vc, BOOL force) {
    if (!vc || !vc.isViewLoaded || MYQRLooksLikeSettings(vc)) return;
    NSArray<NSString *> *context = MYQRVisibleContext(vc);
    if (!context.count) return;
    NSString *contact = MYQRTitle(vc);
    NSString *fingerprint = MYQRFingerprint(contact, context);
    BOOL changed = ![gFingerprint isEqualToString:fingerprint];
    if (changed) {
        gFingerprint = [fingerprint copy];
        gContact = [contact copy];
        gContext = [context copy];
        gReplies = nil;
    }
    if (!force && !changed && gReplies.count) return;
    if (!force && [gRequestedFingerprint isEqualToString:fingerprint] && gRequesting) return;

    NSUInteger token = ++gDebounceToken;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.38 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (token != gDebounceToken) return;
        if (![gFingerprint isEqualToString:fingerprint]) return;
        if (!force && gReplies.count) return;
        MYQRRequest(fingerprint, contact, context);
    });
}

#pragma mark - Direct quick reply UI

@interface MYQRProxy : NSObject
+ (instancetype)shared;
- (void)replyTapped:(UIButton *)sender;
- (void)reloadTapped:(UIButton *)sender;
@end

static void MYQRHideOriginalQuickList(UIViewController *vc) {
    vc.navigationItem.rightBarButtonItem = nil;
    vc.navigationItem.rightBarButtonItems = @[];
    NSMutableArray<UITableView *> *tables = [NSMutableArray array];
    MYQRCollectTables(vc.view, tables);
    for (UITableView *table in tables) {
        table.hidden = YES;
        table.userInteractionEnabled = NO;
    }
    for (UIView *sub in vc.view.subviews) {
        if ([sub isKindOfClass:UIButton.class]) {
            UIButton *b = (UIButton *)sub;
            NSString *t = MYQRTrim([b titleForState:UIControlStateNormal]);
            if ([t isEqualToString:@"+"] || [t isEqualToString:@"添加"]) b.hidden = YES;
        }
    }
}

static UIView *MYQRBuildPanel(UIViewController *vc) {
    UIView *panel = [[UIView alloc] initWithFrame:CGRectZero];
    panel.tag = MYQRPanelTag;
    panel.backgroundColor = UIColor.secondarySystemBackgroundColor;
    panel.layer.cornerRadius = 14;
    panel.translatesAutoresizingMaskIntoConstraints = NO;

    UILabel *title = [[UILabel alloc] init];
    title.text = @"AI 快捷回复";
    title.font = [UIFont boldSystemFontOfSize:16];
    title.translatesAutoresizingMaskIntoConstraints = NO;
    [panel addSubview:title];

    UIButton *reload = [UIButton buttonWithType:UIButtonTypeSystem];
    [reload setTitle:@"重新生成" forState:UIControlStateNormal];
    reload.translatesAutoresizingMaskIntoConstraints = NO;
    [reload addTarget:MYQRProxy.shared action:@selector(reloadTapped:) forControlEvents:UIControlEventTouchUpInside];
    [panel addSubview:reload];

    NSMutableArray<UIButton *> *buttons = [NSMutableArray array];
    for (NSInteger i = 0; i < 3; i++) {
        UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
        button.tag = 700 + i;
        button.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft;
        button.titleLabel.numberOfLines = 3;
        button.titleLabel.font = [UIFont systemFontOfSize:15];
        button.translatesAutoresizingMaskIntoConstraints = NO;
        [button addTarget:MYQRProxy.shared action:@selector(replyTapped:) forControlEvents:UIControlEventTouchUpInside];
        [panel addSubview:button];
        [buttons addObject:button];
    }

    [vc.view addSubview:panel];
    UILayoutGuide *g = vc.view.safeAreaLayoutGuide;
    [NSLayoutConstraint activateConstraints:@[
        [panel.leadingAnchor constraintEqualToAnchor:g.leadingAnchor constant:10],
        [panel.trailingAnchor constraintEqualToAnchor:g.trailingAnchor constant:-10],
        [panel.topAnchor constraintEqualToAnchor:g.topAnchor constant:10],
        [title.leadingAnchor constraintEqualToAnchor:panel.leadingAnchor constant:14],
        [title.topAnchor constraintEqualToAnchor:panel.topAnchor constant:12],
        [reload.trailingAnchor constraintEqualToAnchor:panel.trailingAnchor constant:-14],
        [reload.centerYAnchor constraintEqualToAnchor:title.centerYAnchor],
        [buttons[0].leadingAnchor constraintEqualToAnchor:panel.leadingAnchor constant:14],
        [buttons[0].trailingAnchor constraintEqualToAnchor:panel.trailingAnchor constant:-14],
        [buttons[0].topAnchor constraintEqualToAnchor:title.bottomAnchor constant:10],
        [buttons[0].heightAnchor constraintGreaterThanOrEqualToConstant:48],
        [buttons[1].leadingAnchor constraintEqualToAnchor:buttons[0].leadingAnchor],
        [buttons[1].trailingAnchor constraintEqualToAnchor:buttons[0].trailingAnchor],
        [buttons[1].topAnchor constraintEqualToAnchor:buttons[0].bottomAnchor constant:4],
        [buttons[1].heightAnchor constraintGreaterThanOrEqualToConstant:48],
        [buttons[2].leadingAnchor constraintEqualToAnchor:buttons[0].leadingAnchor],
        [buttons[2].trailingAnchor constraintEqualToAnchor:buttons[0].trailingAnchor],
        [buttons[2].topAnchor constraintEqualToAnchor:buttons[1].bottomAnchor constant:4],
        [buttons[2].heightAnchor constraintGreaterThanOrEqualToConstant:48],
        [buttons[2].bottomAnchor constraintEqualToAnchor:panel.bottomAnchor constant:-10]
    ]];
    return panel;
}

static void MYQRRenderPanel(UIViewController *vc) {
    if (!vc || !MYQRIsQuickReplyList(vc)) return;
    MYQRHideOriginalQuickList(vc);
    UIView *panel = [vc.view viewWithTag:MYQRPanelTag] ?: MYQRBuildPanel(vc);
    for (NSInteger i = 0; i < 3; i++) {
        UIButton *button = (UIButton *)[panel viewWithTag:700 + i];
        NSString *text = i < gReplies.count ? gReplies[i] : @"";
        if (text.length) {
            [button setTitle:text forState:UIControlStateNormal];
            button.enabled = YES;
            objc_setAssociatedObject(button, MYQRTextKey, text, OBJC_ASSOCIATION_COPY_NONATOMIC);
        } else {
            [button setTitle:gRequesting ? @"正在生成…" : @"正在准备回复…" forState:UIControlStateNormal];
            button.enabled = NO;
            objc_setAssociatedObject(button, MYQRTextKey, nil, OBJC_ASSOCIATION_COPY_NONATOMIC);
        }
    }
}

static void MYQRRenderCurrentPanel(void) {
    UIViewController *top = MYQRTop();
    if (top && MYQRIsQuickReplyList(top)) MYQRRenderPanel(top);
}

static UIViewController *MYQRPreviousChat(UIViewController *vc) {
    UINavigationController *nav = vc.navigationController;
    NSUInteger idx = [nav.viewControllers indexOfObject:vc];
    if (idx != NSNotFound && idx > 0) return nav.viewControllers[idx - 1];
    return vc.presentingViewController;
}

static void MYQRInsertPending(void) {
    if (!gPendingReply.length) return;
    UIViewController *top = MYQRTop();
    UIView *input = top ? MYQRChatInput(top.view) : nil;
    if (!input) return;
    if ([input isKindOfClass:UITextView.class]) {
        UITextView *v = (UITextView *)input;
        v.text = gPendingReply;
        [v becomeFirstResponder];
        [NSNotificationCenter.defaultCenter postNotificationName:UITextViewTextDidChangeNotification object:v];
        if ([v.delegate respondsToSelector:@selector(textViewDidChange:)]) [v.delegate textViewDidChange:v];
    } else if ([input isKindOfClass:UITextField.class]) {
        UITextField *v = (UITextField *)input;
        v.text = gPendingReply;
        [v becomeFirstResponder];
        [v sendActionsForControlEvents:UIControlEventEditingChanged];
    }
    gPendingReply = nil;
}

@implementation MYQRProxy
+ (instancetype)shared {
    static MYQRProxy *obj; static dispatch_once_t once;
    dispatch_once(&once, ^{ obj = [MYQRProxy new]; });
    return obj;
}
- (void)replyTapped:(UIButton *)sender {
    NSString *text = objc_getAssociatedObject(sender, MYQRTextKey);
    if (!text.length) return;
    gPendingReply = [text copy];
    UIViewController *top = MYQRTop();
    if (top.navigationController && top.navigationController.viewControllers.count > 1) {
        [top.navigationController popViewControllerAnimated:YES];
    } else if (top.presentingViewController) {
        [top dismissViewControllerAnimated:YES completion:nil];
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.35 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ MYQRInsertPending(); });
}
- (void)reloadTapped:(UIButton *)sender {
    UIViewController *top = MYQRTop();
    UIViewController *chat = MYQRPreviousChat(top);
    if (chat) {
        gReplies = nil;
        MYQRSchedulePreGenerate(chat, YES);
        MYQRRenderPanel(top);
    }
}
@end

#pragma mark - Keep only Quick Reply in MiYou chat toolbar

static UIView *MYQRFindToolbar(UIView *view) {
    if (!view || view.hidden) return nil;
    NSArray *texts = MYQRTexts(view);
    NSInteger hits = 0;
    for (NSString *key in @[@"快捷回复", @"照片", @"拍摄", @"文件", @"添加"]) if ([texts containsObject:key]) hits++;
    if (hits >= 3 && CGRectGetHeight(view.bounds) >= 35 && CGRectGetHeight(view.bounds) <= 220) return view;
    for (UIView *sub in view.subviews) {
        UIView *found = MYQRFindToolbar(sub);
        if (found) return found;
    }
    return nil;
}

static void MYQRHideToolbarExtrasIn(UIView *view, UIView *container) {
    if (!view || view.hidden) return;
    NSString *text = @"";
    if ([view isKindOfClass:UILabel.class]) text = MYQRTrim(((UILabel *)view).text);
    if ([view isKindOfClass:UIButton.class]) text = MYQRTrim([((UIButton *)view) titleForState:UIControlStateNormal]);
    NSSet *remove = [NSSet setWithArray:@[@"照片", @"拍摄", @"文件", @"添加"]];
    if ([remove containsObject:text]) {
        UIView *node = view;
        while (node.superview && node.superview != container) {
            if ([node isKindOfClass:UIControl.class]) break;
            if (node.superview.subviews.count > 1) break;
            node = node.superview;
        }
        node.hidden = YES;
        node.userInteractionEnabled = NO;
        return;
    }
    for (UIView *sub in [view.subviews copy]) MYQRHideToolbarExtrasIn(sub, container);
}

static void MYQRPruneChatToolbar(UIViewController *vc) {
    UIView *toolbar = MYQRFindToolbar(vc.view);
    if (!toolbar) return;
    MYQRHideToolbarExtrasIn(toolbar, toolbar);
}

#pragma mark - Runtime

static void (*MYQROriginalDidAppear)(UIViewController *, SEL, BOOL) = NULL;
static void MYQRDidAppear(UIViewController *self, SEL _cmd, BOOL animated) {
    if (MYQROriginalDidAppear) MYQROriginalDidAppear(self, _cmd, animated);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.06 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (!self.isViewLoaded || !self.view.window) return;
        if (MYQRIsQuickReplyList(self)) {
            UIViewController *chat = MYQRPreviousChat(self);
            if (chat) MYQRSchedulePreGenerate(chat, NO);
            MYQRRenderPanel(self);
        } else if (!MYQRLooksLikeSettings(self) && MYQRChatInput(self.view)) {
            MYQRPruneChatToolbar(self);
            MYQRSchedulePreGenerate(self, NO);
            MYQRInsertPending();
        }
    });
}

static void (*MYQROriginalDidLayout)(UIViewController *, SEL) = NULL;
static void MYQRDidLayout(UIViewController *self, SEL _cmd) {
    if (MYQROriginalDidLayout) MYQROriginalDidLayout(self, _cmd);
    if (!self.isViewLoaded || !self.view.window || MYQRLooksLikeSettings(self)) return;
    if (!MYQRChatInput(self.view)) return;
    MYQRPruneChatToolbar(self);
    MYQRSchedulePreGenerate(self, NO);
}

__attribute__((constructor)) static void MYQRInit(void) {
    @autoreleasepool {
        Class cls = UIViewController.class;
        Method a = class_getInstanceMethod(cls, @selector(viewDidAppear:));
        if (a) {
            MYQROriginalDidAppear = (void *)method_getImplementation(a);
            method_setImplementation(a, (IMP)MYQRDidAppear);
        }
        Method l = class_getInstanceMethod(cls, @selector(viewDidLayoutSubviews));
        if (l) {
            MYQROriginalDidLayout = (void *)method_getImplementation(l);
            method_setImplementation(l, (IMP)MYQRDidLayout);
        }
    }
}
