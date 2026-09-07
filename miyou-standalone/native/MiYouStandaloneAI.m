#import "MiYouStandaloneAI.h"
#import <QuartzCore/QuartzCore.h>
#import <objc/runtime.h>

static NSString * const kMYSAVersion = @"0.4.0";
static NSString * const kMYSAEndpoint = @"https://sublink-worker-pink.vercel.app/api/miyou-ai";
static NSString * const kMYSAPreset = @"结合聊天上下文判断关系、情绪和氛围，生成自然、合适、不突兀的回复，保持我的说话风格。";
static NSInteger const kMYSAButtonTag = 0x4D595341;
static NSInteger const kMYSAPanelTag  = 0x4D595342;
static NSInteger const kMYSAReplyTag  = 0x4D595350;

static NSDictionary *gConfig;
static NSString *gContact;
static NSArray<NSString *> *gContext;
static NSString *gFingerprint;
static NSArray<NSString *> *gReplies;
static NSString *gRepliesFingerprint;
static NSString *gLastError;
static NSURLSessionDataTask *gTask;
static NSString *gTaskFingerprint;
static NSUInteger gGeneration = 0;
static NSTimeInterval gLastRequestAt = 0;
static NSTimeInterval gBackoffUntil = 0;
static NSTimeInterval gExternalContextAt = 0;
static NSMutableArray<NSDictionary *> *gExtensions;

#pragma mark - Helpers

static NSString *MYSATrim(id value) {
    if (![value isKindOfClass:NSString.class]) return @"";
    return [(NSString *)value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
}

static UIWindow *MYSAKeyWindow(void) {
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

static UIViewController *MYSATopFrom(UIViewController *vc) {
    if (!vc) return nil;
    if (vc.presentedViewController) return MYSATopFrom(vc.presentedViewController);
    if ([vc isKindOfClass:UINavigationController.class]) return MYSATopFrom(((UINavigationController *)vc).visibleViewController);
    if ([vc isKindOfClass:UITabBarController.class]) return MYSATopFrom(((UITabBarController *)vc).selectedViewController);
    return vc;
}

static UIViewController *MYSATopController(void) {
    return MYSATopFrom(MYSAKeyWindow().rootViewController);
}

static NSString *MYSAControllerTitle(UIViewController *vc) {
    NSString *title = MYSATrim(vc.navigationItem.title ?: vc.title);
    return title.length ? title : @"";
}

static void MYSACollectInputs(UIView *view, NSMutableArray<UIView *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    if ([view isKindOfClass:UITextView.class]) {
        UITextView *v = (UITextView *)view;
        if (v.editable && v.userInteractionEnabled) [out addObject:v];
    } else if ([view isKindOfClass:UITextField.class]) {
        UITextField *v = (UITextField *)view;
        if (v.enabled && v.userInteractionEnabled && !v.secureTextEntry) [out addObject:v];
    }
    for (UIView *sub in view.subviews) MYSACollectInputs(sub, out);
}

static UIView *MYSABestChatInput(UIViewController *vc) {
    if (!vc || !vc.isViewLoaded || !vc.view.window) return nil;
    NSMutableArray<UIView *> *items = [NSMutableArray array];
    MYSACollectInputs(vc.view, items);
    UIWindow *window = MYSAKeyWindow();
    CGFloat screenH = MAX(window.bounds.size.height, 1);
    UIView *best = nil;
    CGFloat bestScore = -CGFLOAT_MAX;
    for (UIView *candidate in items) {
        CGRect r = [candidate convertRect:candidate.bounds toView:window];
        if (r.size.width < 120 || r.size.height < 28 || r.size.height > 180) continue;
        if (CGRectGetMinY(r) < screenH * 0.55) continue;
        CGFloat score = CGRectGetMinY(r) + r.size.width * 0.02;
        if (score > bestScore) { bestScore = score; best = candidate; }
    }
    return best;
}

static void MYSACollectTables(UIView *view, NSMutableArray<UITableView *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    if ([view isKindOfClass:UITableView.class]) [out addObject:(UITableView *)view];
    for (UIView *sub in view.subviews) MYSACollectTables(sub, out);
}

static UITableView *MYSABestChatTable(UIViewController *vc, UIView *input) {
    if (!vc || !input) return nil;
    NSMutableArray<UITableView *> *tables = [NSMutableArray array];
    MYSACollectTables(vc.view, tables);
    CGRect inputRect = [input convertRect:input.bounds toView:vc.view];
    UITableView *best = nil;
    CGFloat bestScore = -1;
    for (UITableView *table in tables) {
        CGRect r = [table convertRect:table.bounds toView:vc.view];
        NSUInteger rows = table.indexPathsForVisibleRows.count;
        if (!rows) continue;
        if (CGRectGetMinY(r) > CGRectGetMinY(inputRect)) continue;
        if (r.size.height < vc.view.bounds.size.height * 0.30) continue;
        CGFloat score = rows * 1000.0 + r.size.width * r.size.height / 1000.0;
        if (score > bestScore) { bestScore = score; best = table; }
    }
    return best;
}

static BOOL MYSAIsChatController(UIViewController *vc, UIView **inputOut, UITableView **tableOut) {
    if (!vc || !vc.isViewLoaded || !vc.view.window) return NO;
    UIView *input = MYSABestChatInput(vc);
    UITableView *table = MYSABestChatTable(vc, input);
    if (!input || !table) return NO;
    if (inputOut) *inputOut = input;
    if (tableOut) *tableOut = table;
    return YES;
}

static void MYSACollectText(UIView *view, NSMutableArray<NSString *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    NSString *text = nil;
    if ([view isKindOfClass:UILabel.class]) text = MYSATrim(((UILabel *)view).text);
    else if ([view isKindOfClass:UITextView.class] && !((UITextView *)view).editable) text = MYSATrim(((UITextView *)view).text);
    if (text.length && text.length <= 700) [out addObject:text];
    for (UIView *sub in view.subviews) MYSACollectText(sub, out);
}

static NSString *MYSALineFromCell(UITableViewCell *cell) {
    NSMutableArray<NSString *> *items = [NSMutableArray array];
    MYSACollectText(cell.contentView, items);
    static NSSet *noise;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ noise = [NSSet setWithArray:@[@"快捷回复", @"发送", @"按住 说话", @"照片", @"拍摄", @"文件", @"添加"]]; });
    NSMutableArray<NSString *> *clean = [NSMutableArray array];
    for (NSString *text in items) if (text.length && ![noise containsObject:text]) [clean addObject:text];
    return clean.count ? [clean componentsJoinedByString:@" "] : @"";
}

static NSArray<NSString *> *MYSAVisibleContext(UITableView *table) {
    NSArray<NSIndexPath *> *rows = [table.indexPathsForVisibleRows sortedArrayUsingComparator:^NSComparisonResult(NSIndexPath *a, NSIndexPath *b) {
        if (a.section != b.section) return a.section < b.section ? NSOrderedAscending : NSOrderedDescending;
        if (a.row == b.row) return NSOrderedSame;
        return a.row < b.row ? NSOrderedAscending : NSOrderedDescending;
    }];
    NSMutableArray<NSString *> *out = [NSMutableArray array];
    for (NSIndexPath *path in rows) {
        UITableViewCell *cell = [table cellForRowAtIndexPath:path];
        NSString *line = cell ? MYSALineFromCell(cell) : @"";
        if (line.length) [out addObject:line];
    }
    NSInteger maxContext = [gConfig[@"maxContext"] integerValue];
    if (maxContext <= 0 || maxContext > 60) maxContext = 30;
    if (out.count > maxContext) return [out subarrayWithRange:NSMakeRange(out.count - maxContext, maxContext)];
    return out;
}

static NSString *MYSAFingerprint(NSString *contact, NSArray<NSString *> *context) {
    return [NSString stringWithFormat:@"%@|%@", contact ?: @"", [context componentsJoinedByString:@"||"]];
}

#pragma mark - Config

static NSString *MYSAConfigPath(void) {
    NSString *docs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    return [docs stringByAppendingPathComponent:@"MiYouStandaloneAI.json"];
}

static NSDictionary *MYSADefaultConfig(void) {
    return @{
        @"endpoint": kMYSAEndpoint,
        @"token": @"",
        @"preset": kMYSAPreset,
        @"maxContext": @30,
        @"continuousPrefetch": @YES,
        @"debounceMs": @450,
        @"minRequestIntervalMs": @1000
    };
}

static void MYSALoadConfig(void) {
    NSMutableDictionary *merged = [MYSADefaultConfig() mutableCopy];
    NSData *data = [NSData dataWithContentsOfFile:MYSAConfigPath()];
    if (data.length) {
        NSDictionary *parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if ([parsed isKindOfClass:NSDictionary.class]) [merged addEntriesFromDictionary:parsed];
    } else {
        NSData *json = [NSJSONSerialization dataWithJSONObject:merged options:NSJSONWritingPrettyPrinted error:nil];
        [json writeToFile:MYSAConfigPath() atomically:YES];
    }
    gConfig = [merged copy];
}

#pragma mark - State / network

static void MYSAShowOrRefreshPanel(UIViewController *vc);
static void MYSASendRequest(BOOL force, BOOL openWhenReady);

static void MYSASchedulePrefetch(void) {
    if (![gConfig[@"continuousPrefetch"] boolValue] || !gContext.count) return;
    NSUInteger generation = ++gGeneration;
    NSInteger ms = [gConfig[@"debounceMs"] integerValue];
    if (ms < 150 || ms > 3000) ms = 450;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(ms * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
        if (generation != gGeneration) return;
        MYSASendRequest(NO, NO);
    });
}

static void MYSASetContextInternal(NSString *contact, NSArray<NSString *> *context, BOOL external) {
    NSMutableArray<NSString *> *clean = [NSMutableArray array];
    for (id item in context) {
        NSString *text = MYSATrim(item);
        if (!text.length) continue;
        if (text.length > 700) text = [text substringToIndex:700];
        [clean addObject:text];
    }
    if (!clean.count) return;
    NSString *c = MYSATrim(contact);
    NSString *fp = MYSAFingerprint(c, clean);
    if ([fp isEqualToString:gFingerprint]) return;
    gContact = c;
    gContext = [clean copy];
    gFingerprint = fp;
    gReplies = nil;
    gRepliesFingerprint = nil;
    gLastError = nil;
    if (external) gExternalContextAt = NSDate.date.timeIntervalSince1970;
    MYSASchedulePrefetch();
}

static void MYSAUpdateContextFromChat(UIViewController *vc, UITableView *table) {
    if (NSDate.date.timeIntervalSince1970 - gExternalContextAt < 45.0) return;
    NSArray<NSString *> *context = MYSAVisibleContext(table);
    if (context.count) MYSASetContextInternal(MYSAControllerTitle(vc), context, NO);
}

static void MYSABackoffForStatus(NSInteger status) {
    NSTimeInterval now = NSDate.date.timeIntervalSince1970;
    if (status == 401 || status == 429 || status == 503) gBackoffUntil = now + 20;
    else if (status >= 500) gBackoffUntil = now + 4;
}

static void MYSASendRequest(BOOL force, BOOL openWhenReady) {
    if (!gContext.count || !gFingerprint.length) return;
    if (!force && gReplies.count && [gRepliesFingerprint isEqualToString:gFingerprint]) {
        if (openWhenReady) MYSAShowOrRefreshPanel(MYSATopController());
        return;
    }
    NSTimeInterval now = NSDate.date.timeIntervalSince1970;
    if (!force && now < gBackoffUntil) return;
    NSInteger minMs = [gConfig[@"minRequestIntervalMs"] integerValue];
    if (minMs < 300 || minMs > 5000) minMs = 1000;
    NSTimeInterval wait = ((double)minMs / 1000.0) - (now - gLastRequestAt);
    if (!force && wait > 0) {
        NSString *fp = [gFingerprint copy];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(wait * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if ([fp isEqualToString:gFingerprint]) MYSASendRequest(NO, openWhenReady);
        });
        return;
    }
    if (gTask) {
        if ([gTaskFingerprint isEqualToString:gFingerprint] && !force) return;
        [gTask cancel];
        gTask = nil;
    }
    NSString *endpoint = MYSATrim(gConfig[@"endpoint"]);
    NSURL *url = [NSURL URLWithString:endpoint.length ? endpoint : kMYSAEndpoint];
    if (!url) { gLastError = @"AI 地址无效"; if (openWhenReady) MYSAShowOrRefreshPanel(MYSATopController()); return; }
    NSString *fp = [gFingerprint copy];
    NSDictionary *payload = @{
        @"contact": gContact ?: @"",
        @"context": gContext ?: @[],
        @"preset": MYSATrim(gConfig[@"preset"]).length ? MYSATrim(gConfig[@"preset"]) : kMYSAPreset,
        @"count": @3,
        @"client": @"MiYouStandaloneAI",
        @"version": kMYSAVersion
    };
    NSData *body = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:10];
    req.HTTPMethod = @"POST";
    req.HTTPBody = body;
    [req setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    NSString *token = MYSATrim(gConfig[@"token"]);
    if (token.length) [req setValue:token forHTTPHeaderField:@"x-miyou-token"];
    gLastRequestAt = now;
    gTaskFingerprint = fp;
    gTask = [NSURLSession.sharedSession dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 0;
        NSDictionary *json = data.length ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        dispatch_async(dispatch_get_main_queue(), ^{
            if (![fp isEqualToString:gFingerprint]) return;
            gTask = nil;
            gTaskFingerprint = nil;
            if (error) {
                gLastError = error.localizedDescription ?: @"网络请求失败";
            } else {
                MYSABackoffForStatus(status);
                NSArray *raw = [json isKindOfClass:NSDictionary.class] ? json[@"replies"] : nil;
                NSMutableArray<NSString *> *replies = [NSMutableArray array];
                if ([raw isKindOfClass:NSArray.class]) {
                    for (id item in raw) {
                        NSString *text = MYSATrim(item);
                        if (text.length) [replies addObject:text];
                        if (replies.count == 3) break;
                    }
                }
                if (replies.count) {
                    gReplies = [replies copy];
                    gRepliesFingerprint = fp;
                    gLastError = nil;
                } else {
                    NSString *e = [json isKindOfClass:NSDictionary.class] ? MYSATrim(json[@"error"]) : @"";
                    gLastError = e.length ? e : [NSString stringWithFormat:@"AI 返回异常(%ld)", (long)status];
                }
            }
            UIViewController *top = MYSATopController();
            if (top && [top.view viewWithTag:kMYSAPanelTag]) MYSAShowOrRefreshPanel(top);
        });
    }];
    [gTask resume];
}

#pragma mark - Chat UI

@interface MYSABridge : NSObject
+ (instancetype)shared;
- (void)quickReplyTapped:(UIButton *)sender;
- (void)replyTapped:(UIButton *)sender;
- (void)reloadTapped:(UIButton *)sender;
@end

static void MYSAFillInput(UIViewController *vc, NSString *text) {
    UIView *input = MYSABestChatInput(vc);
    if (!input || !text.length) return;
    if ([input isKindOfClass:UITextView.class]) {
        UITextView *tv = (UITextView *)input;
        tv.text = text;
        [tv becomeFirstResponder];
        [NSNotificationCenter.defaultCenter postNotificationName:UITextViewTextDidChangeNotification object:tv];
        if ([tv.delegate respondsToSelector:@selector(textViewDidChange:)]) [tv.delegate textViewDidChange:tv];
    } else if ([input isKindOfClass:UITextField.class]) {
        UITextField *tf = (UITextField *)input;
        tf.text = text;
        [tf becomeFirstResponder];
        [tf sendActionsForControlEvents:UIControlEventEditingChanged];
    }
}

static UIButton *MYSAEnsureQuickReplyButton(UIViewController *vc, UIView *input) {
    UIButton *button = (UIButton *)[vc.view viewWithTag:kMYSAButtonTag];
    if (!button) {
        button = [UIButton buttonWithType:UIButtonTypeSystem];
        button.tag = kMYSAButtonTag;
        [button setTitle:@"快捷回复" forState:UIControlStateNormal];
        button.titleLabel.font = [UIFont systemFontOfSize:13 weight:UIFontWeightMedium];
        button.backgroundColor = UIColor.secondarySystemBackgroundColor;
        button.layer.cornerRadius = 14;
        button.layer.borderWidth = 0.5;
        button.layer.borderColor = UIColor.separatorColor.CGColor;
        [button addTarget:MYSABridge.shared action:@selector(quickReplyTapped:) forControlEvents:UIControlEventTouchUpInside];
        [vc.view addSubview:button];
    }
    CGRect r = [input convertRect:input.bounds toView:vc.view];
    CGFloat w = 76, h = 30;
    CGFloat x = MAX(8, CGRectGetMinX(r));
    CGFloat y = MAX(vc.view.safeAreaInsets.top + 4, CGRectGetMinY(r) - h - 6);
    button.frame = CGRectIntegral(CGRectMake(x, y, w, h));
    button.hidden = NO;
    [vc.view bringSubviewToFront:button];
    return button;
}

static UIView *MYSABuildPanel(UIViewController *vc, UIView *input) {
    UIView *panel = [[UIView alloc] initWithFrame:CGRectZero];
    panel.tag = kMYSAPanelTag;
    panel.backgroundColor = UIColor.systemBackgroundColor;
    panel.layer.cornerRadius = 14;
    panel.layer.shadowOpacity = 0.15;
    panel.layer.shadowRadius = 12;
    panel.layer.shadowOffset = CGSizeMake(0, -3);
    panel.layer.borderWidth = 0.5;
    panel.layer.borderColor = UIColor.separatorColor.CGColor;

    UILabel *title = [[UILabel alloc] initWithFrame:CGRectZero];
    title.text = @"AI 快捷回复";
    title.font = [UIFont boldSystemFontOfSize:15];
    title.tag = kMYSAReplyTag - 1;
    [panel addSubview:title];

    UIButton *reload = [UIButton buttonWithType:UIButtonTypeSystem];
    [reload setTitle:@"重新生成" forState:UIControlStateNormal];
    reload.titleLabel.font = [UIFont systemFontOfSize:13];
    [reload addTarget:MYSABridge.shared action:@selector(reloadTapped:) forControlEvents:UIControlEventTouchUpInside];
    reload.tag = kMYSAReplyTag - 2;
    [panel addSubview:reload];

    for (NSInteger i = 0; i < 3; i++) {
        UIButton *b = [UIButton buttonWithType:UIButtonTypeSystem];
        b.tag = kMYSAReplyTag + i;
        b.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft;
        b.titleLabel.numberOfLines = 2;
        b.titleLabel.font = [UIFont systemFontOfSize:15];
        b.contentEdgeInsets = UIEdgeInsetsMake(5, 10, 5, 10);
        b.layer.cornerRadius = 9;
        b.backgroundColor = UIColor.secondarySystemBackgroundColor;
        [b addTarget:MYSABridge.shared action:@selector(replyTapped:) forControlEvents:UIControlEventTouchUpInside];
        [panel addSubview:b];
    }
    [vc.view addSubview:panel];
    return panel;
}

static void MYSALayoutPanel(UIViewController *vc, UIView *panel, UIView *input) {
    CGRect inputRect = [input convertRect:input.bounds toView:vc.view];
    CGFloat margin = 10;
    CGFloat width = vc.view.bounds.size.width - margin * 2;
    CGFloat rowH = 48;
    CGFloat headerH = 38;
    CGFloat height = headerH + rowH * 3 + 10;
    CGFloat y = CGRectGetMinY(inputRect) - height - 8;
    y = MAX(vc.view.safeAreaInsets.top + 8, y);
    panel.frame = CGRectIntegral(CGRectMake(margin, y, width, height));
    UILabel *title = (UILabel *)[panel viewWithTag:kMYSAReplyTag - 1];
    UIButton *reload = (UIButton *)[panel viewWithTag:kMYSAReplyTag - 2];
    title.frame = CGRectMake(12, 7, width - 120, 26);
    reload.frame = CGRectMake(width - 92, 5, 80, 28);
    for (NSInteger i = 0; i < 3; i++) {
        UIButton *b = (UIButton *)[panel viewWithTag:kMYSAReplyTag + i];
        b.frame = CGRectMake(8, headerH + i * rowH, width - 16, rowH - 4);
    }
    [vc.view bringSubviewToFront:panel];
}

static void MYSAApplyRepliesToPanel(UIView *panel) {
    BOOL ready = gReplies.count && [gRepliesFingerprint isEqualToString:gFingerprint];
    for (NSInteger i = 0; i < 3; i++) {
        UIButton *b = (UIButton *)[panel viewWithTag:kMYSAReplyTag + i];
        NSString *text = ready && i < gReplies.count ? gReplies[i] : @"";
        if (text.length) {
            [b setTitle:text forState:UIControlStateNormal];
            b.enabled = YES;
            b.accessibilityValue = text;
        } else {
            NSString *placeholder = (i == 0 && gLastError.length) ? [NSString stringWithFormat:@"⚠️ %@", gLastError] : @"正在生成…";
            [b setTitle:placeholder forState:UIControlStateNormal];
            b.enabled = NO;
            b.accessibilityValue = nil;
        }
    }
}

static void MYSAShowOrRefreshPanel(UIViewController *vc) {
    if (!vc) return;
    UIView *input = nil;
    UITableView *table = nil;
    if (!MYSAIsChatController(vc, &input, &table)) return;
    MYSAUpdateContextFromChat(vc, table);
    UIView *panel = [vc.view viewWithTag:kMYSAPanelTag];
    if (!panel) panel = MYSABuildPanel(vc, input);
    MYSALayoutPanel(vc, panel, input);
    MYSAApplyRepliesToPanel(panel);
}

@implementation MYSABridge
+ (instancetype)shared {
    static MYSABridge *obj;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ obj = [MYSABridge new]; });
    return obj;
}

- (void)quickReplyTapped:(UIButton *)sender {
    UIViewController *vc = MYSATopController();
    UIView *input = nil;
    UITableView *table = nil;
    if (!MYSAIsChatController(vc, &input, &table)) return;
    MYSAUpdateContextFromChat(vc, table);
    MYSAShowOrRefreshPanel(vc);
    BOOL ready = gReplies.count && [gRepliesFingerprint isEqualToString:gFingerprint];
    if (!ready) MYSASendRequest(NO, YES);
}

- (void)replyTapped:(UIButton *)sender {
    NSString *text = MYSATrim(sender.accessibilityValue ?: [sender titleForState:UIControlStateNormal]);
    if (!text.length || [text containsString:@"正在生成"] || [text hasPrefix:@"⚠️"]) return;
    UIViewController *vc = MYSATopController();
    MYSAFillInput(vc, text);
    [[vc.view viewWithTag:kMYSAPanelTag] removeFromSuperview];
}

- (void)reloadTapped:(UIButton *)sender {
    UIViewController *vc = MYSATopController();
    UIView *input = nil;
    UITableView *table = nil;
    if (!MYSAIsChatController(vc, &input, &table)) return;
    MYSAUpdateContextFromChat(vc, table);
    gReplies = nil;
    gRepliesFingerprint = nil;
    gLastError = nil;
    MYSAShowOrRefreshPanel(vc);
    MYSASendRequest(YES, YES);
}
@end

#pragma mark - Runtime integration

static void (*MYSAOriginalViewDidAppear)(UIViewController *, SEL, BOOL) = NULL;
static void (*MYSAOriginalViewDidLayoutSubviews)(UIViewController *, SEL) = NULL;

static void MYSAViewDidAppear(UIViewController *self, SEL _cmd, BOOL animated) {
    if (MYSAOriginalViewDidAppear) MYSAOriginalViewDidAppear(self, _cmd, animated);
    dispatch_async(dispatch_get_main_queue(), ^{
        UIView *input = nil;
        UITableView *table = nil;
        if (MYSAIsChatController(self, &input, &table)) {
            MYSAEnsureQuickReplyButton(self, input);
            MYSAUpdateContextFromChat(self, table);
        } else {
            [[self.view viewWithTag:kMYSAButtonTag] removeFromSuperview];
            [[self.view viewWithTag:kMYSAPanelTag] removeFromSuperview];
        }
    });
}

static void MYSAViewDidLayoutSubviews(UIViewController *self, SEL _cmd) {
    if (MYSAOriginalViewDidLayoutSubviews) MYSAOriginalViewDidLayoutSubviews(self, _cmd);
    UIView *input = nil;
    UITableView *table = nil;
    if (!MYSAIsChatController(self, &input, &table)) return;
    MYSAEnsureQuickReplyButton(self, input);
    UIView *panel = [self.view viewWithTag:kMYSAPanelTag];
    if (panel) MYSALayoutPanel(self, panel, input);
    MYSAUpdateContextFromChat(self, table);
}

static void MYSASwizzle(void) {
    Class cls = UIViewController.class;
    Method a = class_getInstanceMethod(cls, @selector(viewDidAppear:));
    Method b = class_getInstanceMethod(cls, @selector(viewDidLayoutSubviews));
    if (a) {
        MYSAOriginalViewDidAppear = (void *)method_getImplementation(a);
        method_setImplementation(a, (IMP)MYSAViewDidAppear);
    }
    if (b) {
        MYSAOriginalViewDidLayoutSubviews = (void *)method_getImplementation(b);
        method_setImplementation(b, (IMP)MYSAViewDidLayoutSubviews);
    }
}

#pragma mark - Public extension API

NSString *MYSAVersion(void) { return kMYSAVersion; }
NSArray<NSString *> *MYSAGetCachedReplies(void) { return gReplies ?: @[]; }

void MYSASetExternalContext(NSString *contact, NSArray<NSString *> *context) {
    dispatch_async(dispatch_get_main_queue(), ^{ MYSASetContextInternal(contact, context, YES); });
}

void MYSAInvalidateReplies(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        gReplies = nil;
        gRepliesFingerprint = nil;
        gLastError = nil;
    });
}

void MYSARequestRefresh(void) {
    dispatch_async(dispatch_get_main_queue(), ^{ MYSASendRequest(YES, NO); });
}

void MYSARegisterExtension(NSString *identifier, NSString *title, MYSAExtensionHandler handler) {
    if (!identifier.length || !handler) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!gExtensions) gExtensions = [NSMutableArray array];
        NSIndexSet *matches = [gExtensions indexesOfObjectsPassingTest:^BOOL(NSDictionary *obj, NSUInteger idx, BOOL *stop) {
            return [obj[@"identifier"] isEqualToString:identifier];
        }];
        if (matches.count) [gExtensions removeObjectsAtIndexes:matches];
        [gExtensions addObject:@{@"identifier": identifier, @"title": title ?: identifier, @"handler": [handler copy]}];
    });
}

NSArray<NSDictionary *> *MYSARegisteredExtensions(void) {
    NSMutableArray *out = [NSMutableArray array];
    for (NSDictionary *item in gExtensions ?: @[]) [out addObject:@{@"identifier": item[@"identifier"] ?: @"", @"title": item[@"title"] ?: @""}];
    return out;
}

BOOL MYSAInvokeExtension(NSString *identifier) {
    for (NSDictionary *item in gExtensions ?: @[]) {
        if ([item[@"identifier"] isEqualToString:identifier]) {
            MYSAExtensionHandler handler = item[@"handler"];
            if (handler) handler();
            return YES;
        }
    }
    return NO;
}

__attribute__((constructor)) static void MYSAInit(void) {
    @autoreleasepool {
        MYSALoadConfig();
        gExtensions = [NSMutableArray array];
        dispatch_async(dispatch_get_main_queue(), ^{ MYSASwizzle(); });
    }
}
