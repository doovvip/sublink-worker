#import "MiYouStandaloneAI.h"
#import <QuartzCore/QuartzCore.h>

static NSString * const kMYSAVersion = @"0.2.0";
static NSString * const kMYSAEndpoint = @"https://sublink-worker-pink.vercel.app/api/miyou-ai";
static NSString * const kMYSAPreset = @"结合聊天上下文判断关系、情绪和氛围，生成自然、合适、不突兀的回复，保持我的说话风格。";
static NSInteger const kMYSAButtonTag = 0x4D595341;

static NSArray<NSString *> *gContext = nil;
static NSString *gContact = nil;
static NSString *gFingerprint = nil;
static NSArray<NSString *> *gReplies = nil;
static NSString *gRepliesFingerprint = nil;
static NSString *gLastError = nil;
static NSURLSessionDataTask *gTask = nil;
static NSString *gTaskFingerprint = nil;
static NSTimeInterval gLastRequestAt = 0;
static NSTimeInterval gBackoffUntil = 0;
static NSUInteger gGeneration = 0;
static BOOL gWaitingToOpen = NO;
static NSTimeInterval gExternalContextAt = 0;
static dispatch_source_t gTimer = nil;
static NSMutableArray<NSDictionary *> *gExtensions = nil;
static NSDictionary *gConfig = nil;

@class MYSABridge;
static void MYSASendRequest(BOOL force, BOOL openWhenReady);
static void MYSAShowReplySheet(void);

#pragma mark - Helpers

static NSString *MYSATrim(id value) {
    if (![value isKindOfClass:[NSString class]]) return @"";
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
    if (!vc.isViewLoaded) return nil;
    NSMutableArray<UIView *> *items = [NSMutableArray array];
    MYSACollectInputs(vc.view, items);
    UIWindow *window = MYSAKeyWindow();
    CGFloat screenH = MAX(window.bounds.size.height, 1);
    UIView *best = nil;
    CGFloat bestScore = -CGFLOAT_MAX;
    for (UIView *candidate in items) {
        CGRect r = [candidate convertRect:candidate.bounds toView:window];
        if (r.size.width < 120 || r.size.height < 28) continue;
        if (CGRectGetMinY(r) < screenH * 0.55) continue;
        CGFloat score = CGRectGetMinY(r) + r.size.width * 0.01;
        if (score > bestScore) { bestScore = score; best = candidate; }
    }
    return best;
}

static void MYSACollectTables(UIView *view, NSMutableArray<UITableView *> *out) {
    if (!view || view.hidden) return;
    if ([view isKindOfClass:UITableView.class]) [out addObject:(UITableView *)view];
    for (UIView *sub in view.subviews) MYSACollectTables(sub, out);
}

static UITableView *MYSABestChatTable(UIViewController *vc, UIView *input) {
    NSMutableArray<UITableView *> *tables = [NSMutableArray array];
    MYSACollectTables(vc.view, tables);
    UITableView *best = nil;
    CGFloat bestScore = -1;
    CGRect inputRect = [input convertRect:input.bounds toView:vc.view];
    for (UITableView *table in tables) {
        CGRect r = [table convertRect:table.bounds toView:vc.view];
        NSInteger rows = table.indexPathsForVisibleRows.count;
        if (rows < 1 || CGRectGetMaxY(r) > CGRectGetMinY(inputRect) + 80) continue;
        CGFloat score = rows * 1000 + r.size.width * r.size.height / 1000.0;
        if (score > bestScore) { bestScore = score; best = table; }
    }
    return best;
}

static BOOL MYSAIsNoiseText(NSString *text) {
    if (!text.length || text.length > 700) return YES;
    static NSSet *noise;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        noise = [NSSet setWithArray:@[@"快捷回复", @"发送", @"按住 说话", @"照片", @"拍摄", @"文件", @"添加"]];
    });
    return [noise containsObject:text];
}

typedef struct { CGFloat minX; CGFloat maxX; CGFloat width; BOOL valid; } MYSATextGeometry;

static void MYSACollectCellText(UIView *view, UIView *relative, NSMutableArray<NSString *> *texts, MYSATextGeometry *geo) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    NSString *text = nil;
    if ([view isKindOfClass:UILabel.class]) text = MYSATrim(((UILabel *)view).text);
    else if ([view isKindOfClass:UITextView.class] && !((UITextView *)view).editable) text = MYSATrim(((UITextView *)view).text);
    if (text.length && !MYSAIsNoiseText(text)) {
        [texts addObject:text];
        CGRect r = [view convertRect:view.bounds toView:relative];
        if (r.size.width >= 8 && r.size.height >= 8) {
            if (!geo->valid) { geo->minX = CGRectGetMinX(r); geo->maxX = CGRectGetMaxX(r); geo->width = r.size.width; geo->valid = YES; }
            else { geo->minX = MIN(geo->minX, CGRectGetMinX(r)); geo->maxX = MAX(geo->maxX, CGRectGetMaxX(r)); geo->width += r.size.width; }
        }
    }
    for (UIView *sub in view.subviews) MYSACollectCellText(sub, relative, texts, geo);
}

static NSString *MYSALineFromCell(UITableViewCell *cell) {
    NSMutableArray<NSString *> *texts = [NSMutableArray array];
    MYSATextGeometry geo = {0};
    MYSACollectCellText(cell.contentView, cell.contentView, texts, &geo);
    if (!texts.count) return @"";
    NSString *joined = [texts componentsJoinedByString:@" "];
    CGFloat width = MAX(cell.contentView.bounds.size.width, 1);
    CGFloat center = geo.valid ? ((geo.minX + geo.maxX) * 0.5 / width) : 0.5;
    NSString *prefix = @"消息：";
    if (center > 0.62) prefix = @"我：";
    else if (center < 0.38) prefix = @"对方：";
    return [prefix stringByAppendingString:joined];
}

static NSArray<NSString *> *MYSAVisibleContext(UIViewController *vc, UIView *input) {
    UITableView *table = MYSABestChatTable(vc, input);
    if (!table) return @[];
    NSArray<NSIndexPath *> *rows = [table.indexPathsForVisibleRows sortedArrayUsingComparator:^NSComparisonResult(NSIndexPath *a, NSIndexPath *b) {
        if (a.section != b.section) return a.section < b.section ? NSOrderedAscending : NSOrderedDescending;
        return a.row < b.row ? NSOrderedAscending : (a.row > b.row ? NSOrderedDescending : NSOrderedSame);
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
    return [NSString stringWithFormat:@"%@\u001f%@", contact ?: @"", [context componentsJoinedByString:@"\u001e"]];
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
        @"debounceMs": @550,
        @"minRequestIntervalMs": @1100
    };
}

static void MYSALoadConfig(void) {
    NSDictionary *defaults = MYSADefaultConfig();
    NSData *data = [NSData dataWithContentsOfFile:MYSAConfigPath()];
    NSMutableDictionary *merged = [defaults mutableCopy];
    if (data.length) {
        NSDictionary *parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
        if ([parsed isKindOfClass:NSDictionary.class]) [merged addEntriesFromDictionary:parsed];
    } else {
        NSData *json = [NSJSONSerialization dataWithJSONObject:defaults options:NSJSONWritingPrettyPrinted error:nil];
        [json writeToFile:MYSAConfigPath() atomically:YES];
    }
    gConfig = [merged copy];
}

#pragma mark - State / prefetch

static void MYSASchedulePrefetch(void) {
    if (![gConfig[@"continuousPrefetch"] boolValue] || !gContext.count) return;
    NSUInteger generation = ++gGeneration;
    NSInteger ms = [gConfig[@"debounceMs"] integerValue];
    if (ms < 150 || ms > 3000) ms = 550;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(ms * NSEC_PER_MSEC)), dispatch_get_main_queue(), ^{
        if (generation != gGeneration) return;
        MYSASendRequest(NO, NO);
    });
}

static void MYSASetContextInternal(NSString *contact, NSArray<NSString *> *context, BOOL external) {
    NSString *cleanContact = MYSATrim(contact);
    NSMutableArray<NSString *> *clean = [NSMutableArray array];
    for (id item in context) {
        NSString *text = MYSATrim(item);
        if (text.length) [clean addObject:[text substringToIndex:MIN((NSUInteger)700, text.length)]];
    }
    if (!clean.count) return;
    NSString *fp = MYSAFingerprint(cleanContact, clean);
    if ([fp isEqualToString:gFingerprint]) return;
    gContact = cleanContact;
    gContext = [clean copy];
    gFingerprint = fp;
    gReplies = nil;
    gRepliesFingerprint = nil;
    gLastError = nil;
    if (external) gExternalContextAt = NSDate.date.timeIntervalSince1970;
    [NSNotificationCenter.defaultCenter postNotificationName:@"MiYouStandaloneAIContextDidChange" object:nil];
    MYSASchedulePrefetch();
}

static void MYSABackoffForStatus(NSInteger status) {
    NSTimeInterval now = NSDate.date.timeIntervalSince1970;
    if (status == 401 || status == 429 || status == 503) gBackoffUntil = now + 20;
    else if (status >= 500) gBackoffUntil = now + 4;
}

static void MYSASendRequest(BOOL force, BOOL openWhenReady) {
    if (!gContext.count || !gFingerprint.length) return;
    if (!force && gReplies.count && [gRepliesFingerprint isEqualToString:gFingerprint]) {
        if (openWhenReady) MYSAShowReplySheet();
        return;
    }
    NSTimeInterval now = NSDate.date.timeIntervalSince1970;
    if (!force && now < gBackoffUntil) return;
    NSInteger minMs = [gConfig[@"minRequestIntervalMs"] integerValue];
    if (minMs < 300 || minMs > 5000) minMs = 1100;
    NSTimeInterval wait = ((double)minMs / 1000.0) - (now - gLastRequestAt);
    if (!force && wait > 0) {
        NSString *fp = [gFingerprint copy];
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(wait * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            if ([fp isEqualToString:gFingerprint]) MYSASendRequest(NO, openWhenReady);
        });
        return;
    }
    if (gTask) {
        if ([gTaskFingerprint isEqualToString:gFingerprint] && !force) { if (openWhenReady) gWaitingToOpen = YES; return; }
        [gTask cancel];
        gTask = nil;
    }
    NSString *endpoint = MYSATrim(gConfig[@"endpoint"]);
    NSURL *url = [NSURL URLWithString:endpoint.length ? endpoint : kMYSAEndpoint];
    if (!url) { gLastError = @"AI 地址无效"; return; }
    NSString *fp = [gFingerprint copy];
    NSArray *context = [gContext copy];
    NSString *contact = [gContact copy] ?: @"";
    NSDictionary *payload = @{
        @"contact": contact,
        @"context": context,
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
    if (openWhenReady) gWaitingToOpen = YES;
    gTask = [NSURLSession.sharedSession dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSInteger status = [response isKindOfClass:NSHTTPURLResponse.class] ? ((NSHTTPURLResponse *)response).statusCode : 0;
        NSDictionary *json = data.length ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        dispatch_async(dispatch_get_main_queue(), ^{
            if (![fp isEqualToString:gTaskFingerprint]) return;
            gTask = nil;
            gTaskFingerprint = nil;
            if (error && error.code == NSURLErrorCancelled) return;
            NSArray *raw = [json isKindOfClass:NSDictionary.class] ? json[@"replies"] : nil;
            NSMutableArray<NSString *> *parsed = [NSMutableArray array];
            if ([raw isKindOfClass:NSArray.class]) {
                for (id item in raw) {
                    NSString *text = MYSATrim(item);
                    if (text.length) [parsed addObject:text];
                    if (parsed.count == 3) break;
                }
            }
            if (status >= 200 && status < 300 && parsed.count && [fp isEqualToString:gFingerprint]) {
                gReplies = [parsed copy];
                gRepliesFingerprint = fp;
                gLastError = nil;
                gBackoffUntil = 0;
                [NSNotificationCenter.defaultCenter postNotificationName:@"MiYouStandaloneAIRepliesDidUpdate" object:nil];
                if (gWaitingToOpen) { gWaitingToOpen = NO; MYSAShowReplySheet(); }
            } else {
                MYSABackoffForStatus(status);
                NSString *server = [json isKindOfClass:NSDictionary.class] ? MYSATrim(json[@"error"]) : @"";
                gLastError = server.length ? server : (error.localizedDescription ?: @"AI 请求失败");
                if (gWaitingToOpen) { gWaitingToOpen = NO; MYSAShowReplySheet(); }
            }
        });
    }];
    [gTask resume];
}

#pragma mark - UI

@interface MYSABridge : NSObject
+ (instancetype)shared;
- (void)quickReplyTapped;
@end

@implementation MYSABridge
+ (instancetype)shared { static id obj; static dispatch_once_t once; dispatch_once(&once, ^{ obj = [self new]; }); return obj; }
- (void)quickReplyTapped {
    if (gReplies.count && [gRepliesFingerprint isEqualToString:gFingerprint]) MYSAShowReplySheet();
    else { gWaitingToOpen = YES; MYSASendRequest(YES, YES); }
}
@end

static void MYSAFillInput(NSString *text) {
    UIViewController *vc = MYSATopController();
    UIView *input = MYSABestChatInput(vc);
    if ([input isKindOfClass:UITextView.class]) {
        UITextView *v = (UITextView *)input;
        v.text = text;
        [NSNotificationCenter.defaultCenter postNotificationName:UITextViewTextDidChangeNotification object:v];
        if ([v.delegate respondsToSelector:@selector(textViewDidChange:)]) [v.delegate textViewDidChange:v];
        [v becomeFirstResponder];
    } else if ([input isKindOfClass:UITextField.class]) {
        UITextField *v = (UITextField *)input;
        v.text = text;
        [v sendActionsForControlEvents:UIControlEventEditingChanged];
        [v becomeFirstResponder];
    }
}

static void MYSAShowReplySheet(void) {
    UIViewController *vc = MYSATopController();
    if (!vc || [vc isKindOfClass:UIAlertController.class]) return;
    NSString *message = nil;
    if (!gReplies.count) message = gLastError.length ? gLastError : @"正在生成回复…";
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:@"快捷回复" message:message preferredStyle:UIAlertControllerStyleActionSheet];
    for (NSString *reply in gReplies ?: @[]) {
        [sheet addAction:[UIAlertAction actionWithTitle:reply style:UIAlertActionStyleDefault handler:^(__unused UIAlertAction *a) { MYSAFillInput(reply); }]];
    }
    [sheet addAction:[UIAlertAction actionWithTitle:@"重新生成" style:UIAlertActionStyleDefault handler:^(__unused UIAlertAction *a) {
        gReplies = nil; gRepliesFingerprint = nil; gLastError = nil; gBackoffUntil = 0; gWaitingToOpen = YES; MYSASendRequest(YES, YES);
    }]];
    [sheet addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    UIPopoverPresentationController *pop = sheet.popoverPresentationController;
    if (pop) { pop.sourceView = vc.view; pop.sourceRect = CGRectMake(CGRectGetMidX(vc.view.bounds), CGRectGetMaxY(vc.view.bounds) - 40, 1, 1); }
    [vc presentViewController:sheet animated:YES completion:nil];
}

static void MYSAEnsureQuickReplyButton(UIViewController *vc, UIView *input) {
    UIButton *button = [vc.view viewWithTag:kMYSAButtonTag];
    if (!button) {
        button = [UIButton buttonWithType:UIButtonTypeSystem];
        button.tag = kMYSAButtonTag;
        [button setTitle:@"💬 快捷回复" forState:UIControlStateNormal];
        button.titleLabel.font = [UIFont systemFontOfSize:15 weight:UIFontWeightMedium];
        [button setTitleColor:UIColor.labelColor forState:UIControlStateNormal];
        button.backgroundColor = [UIColor.secondarySystemBackgroundColor colorWithAlphaComponent:0.96];
        button.layer.cornerRadius = 16;
        button.layer.borderWidth = 0.5;
        button.layer.borderColor = UIColor.separatorColor.CGColor;
        [button addTarget:MYSABridge.shared action:@selector(quickReplyTapped) forControlEvents:UIControlEventTouchUpInside];
        [vc.view addSubview:button];
    }
    CGRect r = [input convertRect:input.bounds toView:vc.view];
    CGFloat x = MAX(12, CGRectGetMinX(r));
    CGFloat y = MAX(vc.view.safeAreaInsets.top + 44, CGRectGetMinY(r) - 38);
    button.frame = CGRectMake(x, y, 112, 32);
    button.hidden = NO;
    [vc.view bringSubviewToFront:button];
}

static void MYSAHideButtonIfPresent(UIViewController *vc) {
    UIView *button = [vc.view viewWithTag:kMYSAButtonTag];
    if (button) button.hidden = YES;
}

#pragma mark - Runtime

static void MYSAScanTick(void) {
    if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive) return;
    UIViewController *vc = MYSATopController();
    if (!vc || [vc isKindOfClass:UIAlertController.class] || !vc.isViewLoaded) return;
    UIView *input = MYSABestChatInput(vc);
    if (!input) { MYSAHideButtonIfPresent(vc); return; }
    UITableView *table = MYSABestChatTable(vc, input);
    if (!table) { MYSAHideButtonIfPresent(vc); return; }
    MYSAEnsureQuickReplyButton(vc, input);
    NSTimeInterval now = NSDate.date.timeIntervalSince1970;
    if (now - gExternalContextAt < 2.0) return;
    NSArray *context = MYSAVisibleContext(vc, input);
    if (context.count) MYSASetContextInternal(MYSAControllerTitle(vc), context, NO);
}

static void MYSAStartRuntime(void) {
    if (gTimer) return;
    MYSALoadConfig();
    gExtensions = [NSMutableArray array];
    gTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
    dispatch_source_set_timer(gTimer, dispatch_time(DISPATCH_TIME_NOW, 150 * NSEC_PER_MSEC), 450 * NSEC_PER_MSEC, 80 * NSEC_PER_MSEC);
    dispatch_source_set_event_handler(gTimer, ^{ MYSAScanTick(); });
    dispatch_resume(gTimer);
    [NSNotificationCenter.defaultCenter addObserverForName:UIApplicationDidEnterBackgroundNotification object:nil queue:NSOperationQueue.mainQueue usingBlock:^(__unused NSNotification *n) {
        [gTask cancel]; gTask = nil; gTaskFingerprint = nil;
    }];
}

#pragma mark - Exported extension API

NSString *MYSAVersion(void) { return kMYSAVersion; }
NSArray<NSString *> *MYSAGetCachedReplies(void) { return gReplies ? [gReplies copy] : @[]; }

void MYSASetExternalContext(NSString *contact, NSArray<NSString *> *context) {
    dispatch_async(dispatch_get_main_queue(), ^{ MYSASetContextInternal(contact ?: @"", context ?: @[], YES); });
}

void MYSAInvalidateReplies(void) {
    dispatch_async(dispatch_get_main_queue(), ^{ gReplies = nil; gRepliesFingerprint = nil; gLastError = nil; gGeneration++; });
}

void MYSARequestRefresh(void) {
    dispatch_async(dispatch_get_main_queue(), ^{ gBackoffUntil = 0; MYSASendRequest(YES, NO); });
}

void MYSARegisterExtension(NSString *identifier, NSString *title, MYSAExtensionHandler handler) {
    if (!identifier.length || !title.length || !handler) return;
    dispatch_async(dispatch_get_main_queue(), ^{
        if (!gExtensions) gExtensions = [NSMutableArray array];
        NSIndexSet *matches = [gExtensions indexesOfObjectsPassingTest:^BOOL(NSDictionary *obj, NSUInteger idx, BOOL *stop) { return [obj[@"id"] isEqual:identifier]; }];
        if (matches.count) [gExtensions removeObjectsAtIndexes:matches];
        [gExtensions addObject:@{@"id": identifier, @"title": title, @"handler": [handler copy]}];
    });
}

NSArray<NSDictionary *> *MYSARegisteredExtensions(void) {
    NSMutableArray *out = [NSMutableArray array];
    for (NSDictionary *item in gExtensions ?: @[]) [out addObject:@{@"id": item[@"id"] ?: @"", @"title": item[@"title"] ?: @""}];
    return out;
}

BOOL MYSAInvokeExtension(NSString *identifier) {
    for (NSDictionary *item in gExtensions ?: @[]) {
        if ([item[@"id"] isEqual:identifier]) {
            MYSAExtensionHandler handler = item[@"handler"];
            if (handler) handler();
            return YES;
        }
    }
    return NO;
}

__attribute__((constructor)) static void MYSAEntry(void) {
    dispatch_async(dispatch_get_main_queue(), ^{ MYSAStartRuntime(); });
}
