#import <UIKit/UIKit.h>
#import <Foundation/Foundation.h>
#import <objc/runtime.h>

static NSString * const MYLiteVersion = @"0.1.0";
static NSString * const MYLiteDefaultEndpoint = @"https://sublink-worker-pink.vercel.app/api/miyou-ai";
static NSString * const MYLiteDefaultPreset = @"结合聊天上下文判断关系、情绪和氛围，生成自然、合适、不突兀的回复，保持我的说话风格。";
static NSInteger const MYLiteOverlayTag = 0x4D594149;

static NSArray<NSString *> *MYCachedContext;
static NSString *MYCachedContact;
static NSString *MYPendingReply;
static NSTimeInterval MYLastWarmTime = 0;
static const void *MYReplyTextKey = &MYReplyTextKey;

#pragma mark - Small helpers

static UIWindow *MYKeyWindow(void) {
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if (![scene isKindOfClass:[UIWindowScene class]]) continue;
        if (scene.activationState != UISceneActivationStateForegroundActive) continue;
        for (UIWindow *window in ((UIWindowScene *)scene).windows) {
            if (window.isKeyWindow) return window;
        }
    }
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
    return UIApplication.sharedApplication.keyWindow;
#pragma clang diagnostic pop
}

static UIViewController *MYTopControllerFrom(UIViewController *vc) {
    if (!vc) return nil;
    if (vc.presentedViewController) return MYTopControllerFrom(vc.presentedViewController);
    if ([vc isKindOfClass:[UINavigationController class]]) {
        return MYTopControllerFrom(((UINavigationController *)vc).visibleViewController);
    }
    if ([vc isKindOfClass:[UITabBarController class]]) {
        return MYTopControllerFrom(((UITabBarController *)vc).selectedViewController);
    }
    return vc;
}

static UIViewController *MYTopController(void) {
    return MYTopControllerFrom(MYKeyWindow().rootViewController);
}

static NSString *MYTrim(NSString *value) {
    if (![value isKindOfClass:[NSString class]]) return @"";
    return [value stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
}

static void MYCollectTexts(UIView *view, NSMutableArray<NSString *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    if ([view isKindOfClass:[UILabel class]]) {
        NSString *text = MYTrim(((UILabel *)view).text);
        if (text.length) [out addObject:text];
    } else if ([view isKindOfClass:[UIButton class]]) {
        NSString *text = MYTrim([((UIButton *)view) titleForState:UIControlStateNormal]);
        if (text.length) [out addObject:text];
    }
    for (UIView *subview in view.subviews) MYCollectTexts(subview, out);
}

static NSArray<NSString *> *MYTextsInView(UIView *view) {
    NSMutableArray<NSString *> *items = [NSMutableArray array];
    MYCollectTexts(view, items);
    return items;
}

static BOOL MYArrayContainsText(NSArray<NSString *> *items, NSString *needle) {
    for (NSString *item in items) {
        if ([item rangeOfString:needle options:NSCaseInsensitiveSearch].location != NSNotFound) return YES;
    }
    return NO;
}

static void MYCollectTables(UIView *view, NSMutableArray<UITableView *> *out) {
    if (!view || view.hidden) return;
    if ([view isKindOfClass:[UITableView class]]) [out addObject:(UITableView *)view];
    for (UIView *subview in view.subviews) MYCollectTables(subview, out);
}

static void MYCollectInputs(UIView *view, NSMutableArray<UIView *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    if ([view isKindOfClass:[UITextView class]]) {
        UITextView *textView = (UITextView *)view;
        if (textView.editable && textView.userInteractionEnabled) [out addObject:textView];
    } else if ([view isKindOfClass:[UITextField class]]) {
        UITextField *field = (UITextField *)view;
        if (field.enabled && field.userInteractionEnabled && !field.secureTextEntry) [out addObject:field];
    }
    for (UIView *subview in view.subviews) MYCollectInputs(subview, out);
}

static UIView *MYBestChatInput(UIView *root) {
    NSMutableArray<UIView *> *inputs = [NSMutableArray array];
    MYCollectInputs(root, inputs);
    UIWindow *window = MYKeyWindow();
    CGFloat screenHeight = window.bounds.size.height;
    UIView *best = nil;
    CGFloat bestScore = -CGFLOAT_MAX;
    for (UIView *candidate in inputs) {
        CGRect rect = [candidate convertRect:candidate.bounds toView:window];
        if (rect.size.height < 28 || rect.size.width < 80) continue;
        if (CGRectGetMinY(rect) < screenHeight * 0.45) continue;
        CGFloat score = CGRectGetMinY(rect) + rect.size.width * 0.01;
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    }
    return best;
}

static NSString *MYControllerTitle(UIViewController *vc) {
    NSString *title = MYTrim(vc.navigationItem.title ?: vc.title);
    if (title.length) return title;
    NSArray<NSString *> *texts = MYTextsInView(vc.navigationController.navigationBar ?: vc.view);
    return texts.firstObject ?: @"";
}

#pragma mark - Config

static NSString *MYConfigPath(void) {
    NSString *documents = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES).firstObject;
    return [documents stringByAppendingPathComponent:@"MiYouLiteAI.json"];
}

static NSDictionary *MYDefaultConfig(void) {
    return @{
        @"endpoint": MYLiteDefaultEndpoint,
        @"token": @"",
        @"preset": MYLiteDefaultPreset,
        @"maxContext": @30
    };
}

static NSDictionary *MYLoadConfig(void) {
    NSString *path = MYConfigPath();
    NSData *data = [NSData dataWithContentsOfFile:path];
    if (!data.length) {
        NSDictionary *defaults = MYDefaultConfig();
        NSData *json = [NSJSONSerialization dataWithJSONObject:defaults options:NSJSONWritingPrettyPrinted error:nil];
        [json writeToFile:path atomically:YES];
        return defaults;
    }
    NSDictionary *parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    if (![parsed isKindOfClass:[NSDictionary class]]) return MYDefaultConfig();
    NSMutableDictionary *merged = [MYDefaultConfig() mutableCopy];
    [merged addEntriesFromDictionary:parsed];
    return merged;
}

#pragma mark - Context

static BOOL MYLooksLikeSettings(UIViewController *vc) {
    NSString *title = MYControllerTitle(vc);
    NSArray<NSString *> *blocked = @[@"设置", @"工具栏", @"文件管理", @"秘友", @"快捷回复列表"];
    for (NSString *item in blocked) {
        if ([title containsString:item]) return YES;
    }
    return NO;
}

static NSArray<NSString *> *MYTextsFromCell(UITableViewCell *cell) {
    NSMutableArray<NSString *> *items = [NSMutableArray array];
    MYCollectTexts(cell.contentView, items);
    NSMutableArray<NSString *> *filtered = [NSMutableArray array];
    NSSet<NSString *> *noise = [NSSet setWithArray:@[@"快捷回复", @"照片", @"拍摄", @"文件", @"添加"]];
    for (NSString *item in items) {
        NSString *value = MYTrim(item);
        if (!value.length || value.length > 600 || [noise containsObject:value]) continue;
        [filtered addObject:value];
    }
    return filtered;
}

static void MYCacheChatContextFromController(UIViewController *vc) {
    if (!vc || !vc.isViewLoaded || MYLooksLikeSettings(vc)) return;
    if (!MYBestChatInput(vc.view)) return;

    NSMutableArray<UITableView *> *tables = [NSMutableArray array];
    MYCollectTables(vc.view, tables);
    UITableView *bestTable = nil;
    NSUInteger bestCount = 0;
    for (UITableView *table in tables) {
        NSUInteger count = table.indexPathsForVisibleRows.count;
        if (count > bestCount) {
            bestCount = count;
            bestTable = table;
        }
    }
    if (!bestTable || bestCount == 0) return;

    NSArray<NSIndexPath *> *rows = [bestTable.indexPathsForVisibleRows sortedArrayUsingComparator:^NSComparisonResult(NSIndexPath *a, NSIndexPath *b) {
        if (a.section != b.section) return a.section < b.section ? NSOrderedAscending : NSOrderedDescending;
        if (a.row == b.row) return NSOrderedSame;
        return a.row < b.row ? NSOrderedAscending : NSOrderedDescending;
    }];

    NSMutableArray<NSString *> *context = [NSMutableArray array];
    for (NSIndexPath *indexPath in rows) {
        UITableViewCell *cell = [bestTable cellForRowAtIndexPath:indexPath];
        if (!cell) continue;
        NSArray<NSString *> *cellTexts = MYTextsFromCell(cell);
        if (cellTexts.count) [context addObject:[cellTexts componentsJoinedByString:@" "]];
    }

    NSInteger maxContext = [MYLoadConfig()[@"maxContext"] integerValue];
    if (maxContext <= 0 || maxContext > 60) maxContext = 30;
    if (context.count > maxContext) {
        context = [[context subarrayWithRange:NSMakeRange(context.count - maxContext, maxContext)] mutableCopy];
    }

    if (context.count) {
        MYCachedContext = [context copy];
        MYCachedContact = MYControllerTitle(vc);
    }
}

static UIViewController *MYPreviousChatController(UIViewController *vc) {
    UINavigationController *nav = vc.navigationController;
    if (nav.viewControllers.count >= 2) {
        NSUInteger index = [nav.viewControllers indexOfObject:vc];
        if (index != NSNotFound && index > 0) return nav.viewControllers[index - 1];
    }
    return vc.presentingViewController;
}

#pragma mark - Network

static void MYWarmEndpoint(void) {
    NSTimeInterval now = NSDate.date.timeIntervalSince1970;
    if (now - MYLastWarmTime < 60) return;
    MYLastWarmTime = now;
    NSDictionary *config = MYLoadConfig();
    NSString *endpoint = config[@"endpoint"];
    NSURL *url = [NSURL URLWithString:endpoint ?: MYLiteDefaultEndpoint];
    if (!url) return;
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:4];
    request.HTTPMethod = @"GET";
    [[[NSURLSession sharedSession] dataTaskWithRequest:request] resume];
}

static void MYRequestReplies(void (^completion)(NSArray<NSString *> *replies, NSString *errorText)) {
    NSDictionary *config = MYLoadConfig();
    NSString *endpoint = config[@"endpoint"] ?: MYLiteDefaultEndpoint;
    NSURL *url = [NSURL URLWithString:endpoint];
    if (!url) {
        completion(nil, @"AI 地址无效");
        return;
    }

    NSArray<NSString *> *context = MYCachedContext ?: @[];
    if (!context.count) {
        completion(nil, @"没有读取到当前聊天上下文");
        return;
    }

    NSDictionary *payload = @{
        @"contact": MYCachedContact ?: @"",
        @"context": context,
        @"preset": config[@"preset"] ?: MYLiteDefaultPreset,
        @"count": @3,
        @"client": @"MiYouLiteAI",
        @"version": MYLiteVersion
    };

    NSData *body = [NSJSONSerialization dataWithJSONObject:payload options:0 error:nil];
    NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:12];
    request.HTTPMethod = @"POST";
    request.HTTPBody = body;
    [request setValue:@"application/json" forHTTPHeaderField:@"Content-Type"];
    NSString *token = MYTrim(config[@"token"]);
    if (token.length) [request setValue:token forHTTPHeaderField:@"x-miyou-token"];

    NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithRequest:request completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        if (error) {
            completion(nil, error.localizedDescription ?: @"网络请求失败");
            return;
        }
        NSDictionary *json = data.length ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        NSArray *raw = [json isKindOfClass:[NSDictionary class]] ? json[@"replies"] : nil;
        NSMutableArray<NSString *> *replies = [NSMutableArray array];
        if ([raw isKindOfClass:[NSArray class]]) {
            for (id item in raw) {
                NSString *text = MYTrim([item isKindOfClass:[NSString class]] ? item : @"");
                if (text.length) [replies addObject:text];
                if (replies.count == 3) break;
            }
        }
        if (!replies.count) {
            NSString *message = [json isKindOfClass:[NSDictionary class]] ? json[@"error"] : nil;
            completion(nil, MYTrim(message).length ? message : @"AI 没有返回可用回复");
            return;
        }
        completion([replies copy], nil);
    }];
    [task resume];
}

#pragma mark - Toolbar pruning

static BOOL MYViewHasExactText(UIView *view, NSString *text) {
    return [MYTextsInView(view) containsObject:text];
}

static UIView *MYFindToolbarContainer(UIView *view) {
    if (!view || view.hidden) return nil;
    NSArray<NSString *> *texts = MYTextsInView(view);
    NSInteger hits = 0;
    for (NSString *item in @[@"快捷回复", @"照片", @"拍摄", @"文件", @"添加"]) {
        if ([texts containsObject:item]) hits++;
    }
    if (hits >= 3 && CGRectGetHeight(view.bounds) > 35 && CGRectGetHeight(view.bounds) < 220) return view;
    for (UIView *subview in view.subviews) {
        UIView *found = MYFindToolbarContainer(subview);
        if (found) return found;
    }
    return nil;
}

static BOOL MYSubviewMatchesTitle(UIView *view, NSSet<NSString *> *targets) {
    if ([view isKindOfClass:[UILabel class]]) {
        return [targets containsObject:MYTrim(((UILabel *)view).text)];
    }
    if ([view isKindOfClass:[UIButton class]]) {
        return [targets containsObject:MYTrim([((UIButton *)view) titleForState:UIControlStateNormal])];
    }
    return NO;
}

static void MYHideToolbarTarget(UIView *view, UIView *container, NSSet<NSString *> *targets) {
    if (MYSubviewMatchesTitle(view, targets)) {
        UIView *node = view;
        while (node.superview && node.superview != container && ![node isKindOfClass:[UIControl class]]) {
            if (node.superview.subviews.count > 1) break;
            node = node.superview;
        }
        node.hidden = YES;
        node.userInteractionEnabled = NO;
        return;
    }
    for (UIView *subview in [view.subviews copy]) MYHideToolbarTarget(subview, container, targets);
}

static void MYPruneVisibleChatToolbar(UIViewController *vc) {
    UIView *container = MYFindToolbarContainer(vc.view);
    if (!container || !MYViewHasExactText(container, @"快捷回复")) return;
    NSSet *targets = [NSSet setWithArray:@[@"照片", @"拍摄", @"文件", @"添加"]];
    MYHideToolbarTarget(container, container, targets);
    if ([container isKindOfClass:[UIScrollView class]]) {
        UIScrollView *scroll = (UIScrollView *)container;
        scroll.alwaysBounceHorizontal = NO;
        scroll.showsHorizontalScrollIndicator = NO;
    }
}

static NSString *MYCellJoinedText(UITableViewCell *cell) {
    return [MYTextsInView(cell.contentView) componentsJoinedByString:@" "];
}

static void MYPruneToolbarConfig(UIViewController *vc) {
    NSString *title = MYControllerTitle(vc);
    NSArray<NSString *> *screenTexts = MYTextsInView(vc.view);
    if (![title containsString:@"工具栏列表"] && !MYArrayContainsText(screenTexts, @"工具栏列表")) return;

    NSMutableArray<UITableView *> *tables = [NSMutableArray array];
    MYCollectTables(vc.view, tables);
    NSSet<NSString *> *targets = [NSSet setWithArray:@[@"照片", @"拍摄", @"文件", @"添加"]];

    for (UITableView *table in tables) {
        id<UITableViewDataSource> dataSource = table.dataSource;
        SEL commitSEL = @selector(tableView:commitEditingStyle:forRowAtIndexPath:);
        if (![dataSource respondsToSelector:commitSEL]) continue;

        NSMutableArray<NSIndexPath *> *toDelete = [NSMutableArray array];
        for (NSIndexPath *indexPath in table.indexPathsForVisibleRows) {
            UITableViewCell *cell = [table cellForRowAtIndexPath:indexPath];
            NSString *text = MYCellJoinedText(cell);
            for (NSString *target in targets) {
                if ([text containsString:target]) {
                    [toDelete addObject:indexPath];
                    break;
                }
            }
        }
        [toDelete sortUsingComparator:^NSComparisonResult(NSIndexPath *a, NSIndexPath *b) {
            if (a.section != b.section) return a.section > b.section ? NSOrderedAscending : NSOrderedDescending;
            return a.row > b.row ? NSOrderedAscending : NSOrderedDescending;
        }];
        for (NSIndexPath *indexPath in toDelete) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
            NSMethodSignature *sig = [(NSObject *)dataSource methodSignatureForSelector:commitSEL];
            if (!sig) continue;
            NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
            inv.selector = commitSEL;
            inv.target = dataSource;
            UITableViewCellEditingStyle style = UITableViewCellEditingStyleDelete;
            UITableView *argTable = table;
            NSIndexPath *argPath = indexPath;
            [inv setArgument:&argTable atIndex:2];
            [inv setArgument:&style atIndex:3];
            [inv setArgument:&argPath atIndex:4];
            [inv invoke];
#pragma clang diagnostic pop
        }
        if (toDelete.count) [table reloadData];
    }
}

static void MYGateMessageSettings(UIViewController *vc) {
    NSString *title = MYControllerTitle(vc);
    if (![title containsString:@"消息设置"]) return;
    NSMutableArray<UITableView *> *tables = [NSMutableArray array];
    MYCollectTables(vc.view, tables);
    for (UITableView *table in tables) {
        for (NSIndexPath *indexPath in table.indexPathsForVisibleRows) {
            UITableViewCell *cell = [table cellForRowAtIndexPath:indexPath];
            NSString *text = MYCellJoinedText(cell);
            BOOL keep = [text containsString:@"常驻后台"] || [text containsString:@"防撤回"];
            if (!keep && text.length) {
                cell.contentView.hidden = YES;
                cell.userInteractionEnabled = NO;
            }
        }
    }
}

#pragma mark - AI overlay

@interface MYLiteAIActionProxy : NSObject
+ (instancetype)shared;
- (void)replyTapped:(UIButton *)sender;
- (void)reloadTapped:(UIButton *)sender;
@end

static void MYInsertPendingReply(void) {
    if (!MYPendingReply.length) return;
    UIViewController *top = MYTopController();
    UIView *input = top ? MYBestChatInput(top.view) : nil;
    if (!input) return;

    if ([input isKindOfClass:[UITextView class]]) {
        UITextView *textView = (UITextView *)input;
        textView.text = MYPendingReply;
        [textView becomeFirstResponder];
        [[NSNotificationCenter defaultCenter] postNotificationName:UITextViewTextDidChangeNotification object:textView];
        id<UITextViewDelegate> delegate = textView.delegate;
        if ([delegate respondsToSelector:@selector(textViewDidChange:)]) [delegate textViewDidChange:textView];
    } else if ([input isKindOfClass:[UITextField class]]) {
        UITextField *field = (UITextField *)input;
        field.text = MYPendingReply;
        [field becomeFirstResponder];
        [field sendActionsForControlEvents:UIControlEventEditingChanged];
    }
    MYPendingReply = nil;
}

static UIView *MYBuildOverlay(UIViewController *vc) {
    UIView *panel = [[UIView alloc] initWithFrame:CGRectZero];
    panel.tag = MYLiteOverlayTag;
    panel.backgroundColor = [UIColor secondarySystemBackgroundColor];
    panel.layer.cornerRadius = 14;
    panel.layer.masksToBounds = YES;
    panel.translatesAutoresizingMaskIntoConstraints = NO;

    UILabel *title = [[UILabel alloc] init];
    title.text = @"AI 快捷回复";
    title.font = [UIFont boldSystemFontOfSize:16];
    title.translatesAutoresizingMaskIntoConstraints = NO;
    [panel addSubview:title];

    UIButton *reload = [UIButton buttonWithType:UIButtonTypeSystem];
    [reload setTitle:@"重新生成" forState:UIControlStateNormal];
    reload.titleLabel.font = [UIFont systemFontOfSize:14];
    reload.translatesAutoresizingMaskIntoConstraints = NO;
    [reload addTarget:[MYLiteAIActionProxy shared] action:@selector(reloadTapped:) forControlEvents:UIControlEventTouchUpInside];
    [panel addSubview:reload];

    NSMutableArray<UIButton *> *buttons = [NSMutableArray array];
    for (NSInteger i = 0; i < 3; i++) {
        UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
        button.tag = 100 + i;
        button.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft;
        button.titleLabel.numberOfLines = 2;
        button.titleLabel.font = [UIFont systemFontOfSize:15];
        [button setTitle:@"正在生成…" forState:UIControlStateNormal];
        button.enabled = NO;
        button.translatesAutoresizingMaskIntoConstraints = NO;
        [button addTarget:[MYLiteAIActionProxy shared] action:@selector(replyTapped:) forControlEvents:UIControlEventTouchUpInside];
        [panel addSubview:button];
        [buttons addObject:button];
    }

    [vc.view addSubview:panel];
    UILayoutGuide *guide = vc.view.safeAreaLayoutGuide;
    [NSLayoutConstraint activateConstraints:@[
        [panel.leadingAnchor constraintEqualToAnchor:guide.leadingAnchor constant:10],
        [panel.trailingAnchor constraintEqualToAnchor:guide.trailingAnchor constant:-10],
        [panel.topAnchor constraintEqualToAnchor:guide.topAnchor constant:8],
        [title.leadingAnchor constraintEqualToAnchor:panel.leadingAnchor constant:14],
        [title.topAnchor constraintEqualToAnchor:panel.topAnchor constant:10],
        [reload.trailingAnchor constraintEqualToAnchor:panel.trailingAnchor constant:-14],
        [reload.centerYAnchor constraintEqualToAnchor:title.centerYAnchor],
        [buttons[0].leadingAnchor constraintEqualToAnchor:panel.leadingAnchor constant:14],
        [buttons[0].trailingAnchor constraintEqualToAnchor:panel.trailingAnchor constant:-14],
        [buttons[0].topAnchor constraintEqualToAnchor:title.bottomAnchor constant:8],
        [buttons[0].heightAnchor constraintGreaterThanOrEqualToConstant:42],
        [buttons[1].leadingAnchor constraintEqualToAnchor:buttons[0].leadingAnchor],
        [buttons[1].trailingAnchor constraintEqualToAnchor:buttons[0].trailingAnchor],
        [buttons[1].topAnchor constraintEqualToAnchor:buttons[0].bottomAnchor constant:2],
        [buttons[1].heightAnchor constraintGreaterThanOrEqualToConstant:42],
        [buttons[2].leadingAnchor constraintEqualToAnchor:buttons[0].leadingAnchor],
        [buttons[2].trailingAnchor constraintEqualToAnchor:buttons[0].trailingAnchor],
        [buttons[2].topAnchor constraintEqualToAnchor:buttons[1].bottomAnchor constant:2],
        [buttons[2].heightAnchor constraintGreaterThanOrEqualToConstant:42],
        [buttons[2].bottomAnchor constraintEqualToAnchor:panel.bottomAnchor constant:-8]
    ]];
    return panel;
}

static void MYLoadRepliesIntoOverlay(UIViewController *vc, UIView *panel) {
    for (NSInteger i = 0; i < 3; i++) {
        UIButton *button = (UIButton *)[panel viewWithTag:100 + i];
        [button setTitle:@"正在生成…" forState:UIControlStateNormal];
        button.enabled = NO;
        objc_setAssociatedObject(button, MYReplyTextKey, nil, OBJC_ASSOCIATION_COPY_NONATOMIC);
    }

    MYRequestReplies(^(NSArray<NSString *> *replies, NSString *errorText) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!panel.window || MYTopController() != vc) return;
            if (errorText.length) {
                UIButton *first = (UIButton *)[panel viewWithTag:100];
                [first setTitle:[NSString stringWithFormat:@"⚠️ %@", errorText] forState:UIControlStateNormal];
                return;
            }
            for (NSInteger i = 0; i < 3; i++) {
                UIButton *button = (UIButton *)[panel viewWithTag:100 + i];
                NSString *text = i < replies.count ? replies[i] : @"";
                if (text.length) {
                    [button setTitle:text forState:UIControlStateNormal];
                    button.enabled = YES;
                    objc_setAssociatedObject(button, MYReplyTextKey, text, OBJC_ASSOCIATION_COPY_NONATOMIC);
                } else {
                    [button setTitle:@"—" forState:UIControlStateNormal];
                }
            }
        });
    });
}

static BOOL MYIsQuickReplyList(UIViewController *vc) {
    NSString *title = MYControllerTitle(vc);
    if ([title containsString:@"快捷回复列表"]) return YES;
    NSArray<NSString *> *texts = MYTextsInView(vc.view);
    return MYArrayContainsText(texts, @"快捷回复列表");
}

static void MYPresentAIQuickReplies(UIViewController *vc) {
    if (![vc.view viewWithTag:MYLiteOverlayTag]) {
        UIViewController *previous = MYPreviousChatController(vc);
        MYCacheChatContextFromController(previous);
        UIView *panel = MYBuildOverlay(vc);
        MYLoadRepliesIntoOverlay(vc, panel);
    }
}

@implementation MYLiteAIActionProxy
+ (instancetype)shared {
    static MYLiteAIActionProxy *obj;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{ obj = [MYLiteAIActionProxy new]; });
    return obj;
}

- (void)replyTapped:(UIButton *)sender {
    NSString *text = objc_getAssociatedObject(sender, MYReplyTextKey);
    if (!text.length) return;
    MYPendingReply = [text copy];
    UIViewController *top = MYTopController();
    if (top.navigationController && top.navigationController.viewControllers.count > 1) {
        [top.navigationController popViewControllerAnimated:YES];
    } else if (top.presentingViewController) {
        [top dismissViewControllerAnimated:YES completion:nil];
    }
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.45 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        MYInsertPendingReply();
    });
}

- (void)reloadTapped:(UIButton *)sender {
    UIViewController *top = MYTopController();
    UIView *panel = [top.view viewWithTag:MYLiteOverlayTag];
    if (!panel) return;
    UIViewController *previous = MYPreviousChatController(top);
    MYCacheChatContextFromController(previous);
    MYLoadRepliesIntoOverlay(top, panel);
}
@end

#pragma mark - Runtime hook

static void (*MYOriginalViewDidAppear)(UIViewController *, SEL, BOOL) = NULL;
static void MYLiteViewDidAppear(UIViewController *self, SEL _cmd, BOOL animated) {
    if (MYOriginalViewDidAppear) MYOriginalViewDidAppear(self, _cmd, animated);
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.08 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
        if (!self.isViewLoaded || !self.view.window) return;
        MYPruneVisibleChatToolbar(self);
        MYPruneToolbarConfig(self);
        MYGateMessageSettings(self);
        if (MYIsQuickReplyList(self)) {
            MYPresentAIQuickReplies(self);
        } else if (!MYLooksLikeSettings(self)) {
            MYCacheChatContextFromController(self);
            MYWarmEndpoint();
        }
    });
}

__attribute__((constructor)) static void MYLiteAIInit(void) {
    @autoreleasepool {
        MYLoadConfig();
        Class cls = [UIViewController class];
        SEL sel = @selector(viewDidAppear:);
        Method method = class_getInstanceMethod(cls, sel);
        if (!method) return;
        MYOriginalViewDidAppear = (void *)method_getImplementation(method);
        method_setImplementation(method, (IMP)MYLiteViewDidAppear);
    }
}
