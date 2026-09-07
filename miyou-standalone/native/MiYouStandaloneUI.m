#import "MiYouStandaloneAI.h"
#import <UIKit/UIKit.h>
#import <QuartzCore/QuartzCore.h>

static NSInteger const kMYUIQuickTag = 0x4D595361;
static NSInteger const kMYUIPanelTag = 0x4D595362;
static NSInteger const kMYUIReplyTag = 0x4D595370;
static dispatch_source_t gMYUITimer;
static NSString *gMYUILastContextKey;
static __weak UIViewController *gMYUILastChatVC;

#pragma mark - Helpers

static NSString *MYUITrim(id value) {
    if (![value isKindOfClass:NSString.class]) return @"";
    return [(NSString *)value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
}

static UIWindow *MYUIKeyWindow(void) {
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

static UIViewController *MYUITopFrom(UIViewController *vc) {
    if (!vc) return nil;
    if (vc.presentedViewController) return MYUITopFrom(vc.presentedViewController);
    if ([vc isKindOfClass:UINavigationController.class]) return MYUITopFrom(((UINavigationController *)vc).visibleViewController);
    if ([vc isKindOfClass:UITabBarController.class]) return MYUITopFrom(((UITabBarController *)vc).selectedViewController);
    return vc;
}

static UIViewController *MYUITopController(void) {
    return MYUITopFrom(MYUIKeyWindow().rootViewController);
}

static void MYUICollectInputs(UIView *view, NSMutableArray<UIView *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    if ([view isKindOfClass:UITextView.class]) {
        UITextView *v = (UITextView *)view;
        if (v.editable && v.userInteractionEnabled) [out addObject:v];
    } else if ([view isKindOfClass:UITextField.class]) {
        UITextField *v = (UITextField *)view;
        if (v.enabled && v.userInteractionEnabled && !v.secureTextEntry) [out addObject:v];
    }
    for (UIView *sub in view.subviews) MYUICollectInputs(sub, out);
}

static UIView *MYUIBestInput(UIViewController *vc) {
    if (!vc || !vc.isViewLoaded || !vc.view.window) return nil;
    NSMutableArray<UIView *> *inputs = [NSMutableArray array];
    MYUICollectInputs(vc.view, inputs);
    UIWindow *window = MYUIKeyWindow();
    CGFloat h = MAX(window.bounds.size.height, 1.0);
    UIView *best = nil;
    CGFloat bestScore = -CGFLOAT_MAX;
    for (UIView *v in inputs) {
        CGRect r = [v convertRect:v.bounds toView:window];
        if (r.size.width < 90 || r.size.height < 26 || r.size.height > 190) continue;
        if (CGRectGetMinY(r) < h * 0.50) continue;
        CGFloat score = CGRectGetMinY(r) + r.size.width * 0.02;
        if (score > bestScore) { best = v; bestScore = score; }
    }
    return best;
}

static void MYUICollectScrolls(UIView *view, NSMutableArray<UIScrollView *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    if ([view isKindOfClass:UIScrollView.class] &&
        ![view isKindOfClass:UITextView.class] &&
        ![view isKindOfClass:UITextField.class]) {
        [out addObject:(UIScrollView *)view];
    }
    for (UIView *sub in view.subviews) MYUICollectScrolls(sub, out);
}

static UIScrollView *MYUIBestMessageScroll(UIViewController *vc, UIView *input) {
    NSMutableArray<UIScrollView *> *scrolls = [NSMutableArray array];
    MYUICollectScrolls(vc.view, scrolls);
    CGRect inputRect = [input convertRect:input.bounds toView:vc.view];
    UIScrollView *best = nil;
    CGFloat bestScore = -CGFLOAT_MAX;
    for (UIScrollView *scroll in scrolls) {
        CGRect r = [scroll convertRect:scroll.bounds toView:vc.view];
        if (r.size.width < vc.view.bounds.size.width * 0.65) continue;
        if (r.size.height < vc.view.bounds.size.height * 0.24) continue;
        if (CGRectGetMinY(r) > CGRectGetMinY(inputRect)) continue;
        CGFloat score = r.size.width * r.size.height;
        if ([scroll isKindOfClass:UITableView.class] || [scroll isKindOfClass:UICollectionView.class]) score += 100000;
        if (score > bestScore) { best = scroll; bestScore = score; }
    }
    return best;
}

static BOOL MYUIBlockedController(UIViewController *vc) {
    NSString *title = MYUITrim(vc.navigationItem.title ?: vc.title);
    NSString *cls = NSStringFromClass(vc.class);
    NSArray *blocked = @[@"设置", @"搜索", @"收藏", @"文件", @"朋友圈", @"通讯录", @"小程序", @"支付", @"钱包", @"登录", @"注册"];
    for (NSString *word in blocked) {
        if ([title containsString:word] || [cls containsString:word]) return YES;
    }
    return NO;
}

static BOOL MYUIIsChat(UIViewController *vc, UIView **inputOut, UIScrollView **scrollOut) {
    if (!vc || !vc.isViewLoaded || !vc.view.window || MYUIBlockedController(vc)) return NO;
    UIView *input = MYUIBestInput(vc);
    if (!input) return NO;
    UIScrollView *scroll = MYUIBestMessageScroll(vc, input);
    NSString *cls = NSStringFromClass(vc.class);
    BOOL classHint = [cls rangeOfString:@"Chat" options:NSCaseInsensitiveSearch].location != NSNotFound ||
                     [cls rangeOfString:@"Message" options:NSCaseInsensitiveSearch].location != NSNotFound ||
                     [cls rangeOfString:@"Conversation" options:NSCaseInsensitiveSearch].location != NSNotFound ||
                     [cls rangeOfString:@"MsgContent" options:NSCaseInsensitiveSearch].location != NSNotFound;
    if (!scroll && !classHint) return NO;
    if (inputOut) *inputOut = input;
    if (scrollOut) *scrollOut = scroll;
    return YES;
}

static BOOL MYUINoise(NSString *text) {
    static NSSet *noise;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        noise = [NSSet setWithArray:@[@"快捷回复", @"AI 快捷回复", @"设置", @"重新生成", @"发送", @"按住 说话", @"照片", @"拍摄", @"文件", @"添加"]];
    });
    return !text.length || text.length > 600 || [noise containsObject:text];
}

static void MYUICollectContextText(UIView *view, UIView *root, CGFloat maxY, NSMutableArray<NSDictionary *> *out) {
    if (!view || view.hidden || view.alpha < 0.05) return;
    NSString *text = nil;
    if ([view isKindOfClass:UILabel.class]) text = MYUITrim(((UILabel *)view).text);
    else if ([view isKindOfClass:UITextView.class] && !((UITextView *)view).editable) text = MYUITrim(((UITextView *)view).text);
    if (text.length && !MYUINoise(text)) {
        CGRect r = [view convertRect:view.bounds toView:root];
        if (CGRectGetMaxY(r) <= maxY + 8 && CGRectGetMinY(r) >= root.safeAreaInsets.top - 5) {
            [out addObject:@{@"text": text, @"y": @(CGRectGetMidY(r)), @"x": @(CGRectGetMidX(r))}];
        }
    }
    for (UIView *sub in view.subviews) MYUICollectContextText(sub, root, maxY, out);
}

static NSArray<NSString *> *MYUIContext(UIViewController *vc, UIView *input, UIScrollView *scroll) {
    CGRect ir = [input convertRect:input.bounds toView:vc.view];
    NSMutableArray<NSDictionary *> *raw = [NSMutableArray array];
    MYUICollectContextText(scroll ?: vc.view, vc.view, CGRectGetMinY(ir), raw);
    [raw sortUsingComparator:^NSComparisonResult(NSDictionary *a, NSDictionary *b) {
        double ay = [a[@"y"] doubleValue], by = [b[@"y"] doubleValue];
        if (fabs(ay - by) > 1.0) return ay < by ? NSOrderedAscending : NSOrderedDescending;
        return [a[@"x"] doubleValue] < [b[@"x"] doubleValue] ? NSOrderedAscending : NSOrderedDescending;
    }];
    NSMutableArray<NSString *> *items = [NSMutableArray array];
    NSString *last = nil;
    for (NSDictionary *obj in raw) {
        NSString *text = obj[@"text"];
        if (!text.length || [text isEqualToString:last]) continue;
        [items addObject:text];
        last = text;
    }
    if (items.count > 30) return [items subarrayWithRange:NSMakeRange(items.count - 30, 30)];
    return items;
}

static void MYUIUpdateExternalContext(UIViewController *vc, UIView *input, UIScrollView *scroll) {
    NSArray<NSString *> *context = MYUIContext(vc, input, scroll);
    if (!context.count) return;
    NSString *contact = MYUITrim(vc.navigationItem.title ?: vc.title);
    NSString *key = [NSString stringWithFormat:@"%@|%@", contact ?: @"", [context componentsJoinedByString:@"||"]];
    if ([key isEqualToString:gMYUILastContextKey]) return;
    gMYUILastContextKey = key;
    MYSASetExternalContext(contact ?: @"", context);
}

static void MYUIFillInput(UIViewController *vc, NSString *text) {
    UIView *input = MYUIBestInput(vc);
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

#pragma mark - Settings

@interface MYUISettingsController : UITableViewController
@end

@implementation MYUISettingsController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = @"AI 助手设置";
    self.tableView.backgroundColor = UIColor.systemGroupedBackgroundColor;
    if (!self.navigationController.viewControllers.firstObject || self.navigationController.viewControllers.firstObject == self) {
        self.navigationItem.rightBarButtonItem = [[UIBarButtonItem alloc] initWithBarButtonSystemItem:UIBarButtonSystemItemDone target:self action:@selector(closeSettings)];
    }
}

- (void)closeSettings { [self dismissViewControllerAnimated:YES completion:nil]; }
- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView { return 3; }
- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    if (section == 0) return 4;
    if (section == 1) return 5;
    return 1;
}
- (NSString *)tableView:(UITableView *)tableView titleForHeaderInSection:(NSInteger)section {
    return section == 0 ? @"AI 快捷回复" : (section == 1 ? @"功能入口" : @"独立版");
}
- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleValue1 reuseIdentifier:nil];
    cell.selectionStyle = UITableViewCellSelectionStyleNone;
    if (indexPath.section == 0) {
        NSArray *titles = @[@"快捷回复", @"后台预生成", @"上下文", @"核心版本"];
        NSArray *details = @[@"已启用", @"已启用", @"最近 30 条", MYSAVersion() ?: @"-"];
        cell.textLabel.text = titles[indexPath.row];
        cell.detailTextLabel.text = details[indexPath.row];
    } else if (indexPath.section == 1) {
        NSArray *titles = @[@"快捷回复", @"常驻后台", @"消息防撤回", @"秘友设置", @"文件管理"];
        NSArray *details = @[@"已启用", @"保留入口", @"保留入口", @"保留入口", @"保留入口"];
        cell.textLabel.text = titles[indexPath.row];
        cell.detailTextLabel.text = details[indexPath.row];
        if (indexPath.row > 0) cell.detailTextLabel.textColor = UIColor.secondaryLabelColor;
    } else {
        cell.textLabel.text = @"不依赖原 MiYou.dylib";
        cell.detailTextLabel.text = @"独立运行";
    }
    return cell;
}
@end

#pragma mark - Quick reply UI

@interface MYUIBridge : NSObject
+ (instancetype)shared;
- (void)quickTapped:(UIButton *)sender;
- (void)replyTapped:(UIButton *)sender;
- (void)reloadTapped:(UIButton *)sender;
- (void)settingsTapped:(UIButton *)sender;
- (void)quickLongPressed:(UILongPressGestureRecognizer *)gesture;
@end

static void MYUIOpenSettings(void) {
    UIViewController *top = MYUITopController();
    if (!top) return;
    MYUISettingsController *settings = [[MYUISettingsController alloc] initWithStyle:UITableViewStyleInsetGrouped];
    if (top.navigationController) {
        [top.navigationController pushViewController:settings animated:YES];
    } else {
        UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:settings];
        [top presentViewController:nav animated:YES completion:nil];
    }
}

static UIButton *MYUIEnsureQuickButton(UIViewController *vc, UIView *input) {
    UIButton *button = (UIButton *)[vc.view viewWithTag:kMYUIQuickTag];
    if (!button) {
        button = [UIButton buttonWithType:UIButtonTypeSystem];
        button.tag = kMYUIQuickTag;
        [button setTitle:@"快捷回复" forState:UIControlStateNormal];
        button.titleLabel.font = [UIFont systemFontOfSize:13 weight:UIFontWeightSemibold];
        button.backgroundColor = UIColor.secondarySystemBackgroundColor;
        button.layer.cornerRadius = 15;
        button.layer.borderWidth = 0.5;
        button.layer.borderColor = UIColor.separatorColor.CGColor;
        [button addTarget:MYUIBridge.shared action:@selector(quickTapped:) forControlEvents:UIControlEventTouchUpInside];
        UILongPressGestureRecognizer *longPress = [[UILongPressGestureRecognizer alloc] initWithTarget:MYUIBridge.shared action:@selector(quickLongPressed:)];
        longPress.minimumPressDuration = 0.55;
        [button addGestureRecognizer:longPress];
        [vc.view addSubview:button];
    }
    CGRect ir = [input convertRect:input.bounds toView:vc.view];
    CGFloat w = 80, h = 31;
    CGFloat x = MAX(8, CGRectGetMinX(ir));
    CGFloat y = CGRectGetMinY(ir) - h - 6;
    if (y < vc.view.safeAreaInsets.top + 4) y = vc.view.safeAreaInsets.top + 4;
    button.frame = CGRectIntegral(CGRectMake(x, y, w, h));
    button.hidden = NO;
    [vc.view bringSubviewToFront:button];
    return button;
}

static UIView *MYUIBuildPanel(UIViewController *vc, UIView *input) {
    UIView *panel = [[UIView alloc] initWithFrame:CGRectZero];
    panel.tag = kMYUIPanelTag;
    panel.backgroundColor = UIColor.systemBackgroundColor;
    panel.layer.cornerRadius = 14;
    panel.layer.borderWidth = 0.5;
    panel.layer.borderColor = UIColor.separatorColor.CGColor;
    panel.layer.shadowOpacity = 0.14;
    panel.layer.shadowRadius = 10;
    panel.layer.shadowOffset = CGSizeMake(0, -3);

    UILabel *title = [[UILabel alloc] initWithFrame:CGRectZero];
    title.tag = kMYUIReplyTag - 10;
    title.text = @"AI 快捷回复";
    title.font = [UIFont boldSystemFontOfSize:15];
    [panel addSubview:title];

    UIButton *reload = [UIButton buttonWithType:UIButtonTypeSystem];
    reload.tag = kMYUIReplyTag - 9;
    [reload setTitle:@"重新生成" forState:UIControlStateNormal];
    reload.titleLabel.font = [UIFont systemFontOfSize:13];
    [reload addTarget:MYUIBridge.shared action:@selector(reloadTapped:) forControlEvents:UIControlEventTouchUpInside];
    [panel addSubview:reload];

    UIButton *settings = [UIButton buttonWithType:UIButtonTypeSystem];
    settings.tag = kMYUIReplyTag - 8;
    [settings setTitle:@"设置" forState:UIControlStateNormal];
    settings.titleLabel.font = [UIFont systemFontOfSize:13];
    [settings addTarget:MYUIBridge.shared action:@selector(settingsTapped:) forControlEvents:UIControlEventTouchUpInside];
    [panel addSubview:settings];

    for (NSInteger i = 0; i < 3; i++) {
        UIButton *b = [UIButton buttonWithType:UIButtonTypeSystem];
        b.tag = kMYUIReplyTag + i;
        b.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft;
        b.titleLabel.numberOfLines = 2;
        b.titleLabel.font = [UIFont systemFontOfSize:15];
        b.layer.cornerRadius = 9;
        b.backgroundColor = UIColor.secondarySystemBackgroundColor;
        [b addTarget:MYUIBridge.shared action:@selector(replyTapped:) forControlEvents:UIControlEventTouchUpInside];
        [panel addSubview:b];
    }
    [vc.view addSubview:panel];
    return panel;
}

static void MYUILayoutPanel(UIViewController *vc, UIView *panel, UIView *input) {
    CGRect ir = [input convertRect:input.bounds toView:vc.view];
    CGFloat margin = 10;
    CGFloat width = vc.view.bounds.size.width - margin * 2;
    CGFloat headerH = 38, rowH = 50;
    CGFloat height = headerH + rowH * 3 + 10;
    CGFloat y = MAX(vc.view.safeAreaInsets.top + 6, CGRectGetMinY(ir) - height - 8);
    panel.frame = CGRectIntegral(CGRectMake(margin, y, width, height));
    ((UILabel *)[panel viewWithTag:kMYUIReplyTag - 10]).frame = CGRectMake(12, 7, width - 180, 26);
    ((UIButton *)[panel viewWithTag:kMYUIReplyTag - 9]).frame = CGRectMake(width - 150, 5, 82, 28);
    ((UIButton *)[panel viewWithTag:kMYUIReplyTag - 8]).frame = CGRectMake(width - 64, 5, 52, 28);
    for (NSInteger i = 0; i < 3; i++) {
        UIButton *b = (UIButton *)[panel viewWithTag:kMYUIReplyTag + i];
        b.frame = CGRectMake(8, headerH + i * rowH, width - 16, rowH - 4);
    }
    [vc.view bringSubviewToFront:panel];
}

static void MYUIRefreshPanel(UIViewController *vc) {
    UIView *panel = [vc.view viewWithTag:kMYUIPanelTag];
    if (!panel) return;
    NSArray<NSString *> *replies = MYSAGetCachedReplies();
    for (NSInteger i = 0; i < 3; i++) {
        UIButton *b = (UIButton *)[panel viewWithTag:kMYUIReplyTag + i];
        NSString *text = i < replies.count ? MYUITrim(replies[i]) : @"";
        if (text.length) {
            [b setTitle:text forState:UIControlStateNormal];
            b.accessibilityValue = text;
            b.enabled = YES;
        } else {
            [b setTitle:@"正在生成…" forState:UIControlStateNormal];
            b.accessibilityValue = nil;
            b.enabled = NO;
        }
    }
}

static void MYUIShowPanel(UIViewController *vc, UIView *input) {
    UIView *panel = [vc.view viewWithTag:kMYUIPanelTag];
    if (!panel) panel = MYUIBuildPanel(vc, input);
    MYUILayoutPanel(vc, panel, input);
    MYUIRefreshPanel(vc);
}

@implementation MYUIBridge
+ (instancetype)shared {
    static MYUIBridge *obj;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ obj = [MYUIBridge new]; });
    return obj;
}

- (void)quickTapped:(UIButton *)sender {
    UIViewController *vc = MYUITopController();
    UIView *input = nil; UIScrollView *scroll = nil;
    if (!MYUIIsChat(vc, &input, &scroll)) return;
    MYUIUpdateExternalContext(vc, input, scroll);
    MYUIShowPanel(vc, input);
    if (!MYSAGetCachedReplies().count) MYSARequestRefresh();
}

- (void)replyTapped:(UIButton *)sender {
    NSString *text = MYUITrim(sender.accessibilityValue ?: [sender titleForState:UIControlStateNormal]);
    if (!text.length || [text containsString:@"正在生成"]) return;
    UIViewController *vc = MYUITopController();
    MYUIFillInput(vc, text);
    [[vc.view viewWithTag:kMYUIPanelTag] removeFromSuperview];
}

- (void)reloadTapped:(UIButton *)sender {
    UIViewController *vc = MYUITopController();
    UIView *input = nil; UIScrollView *scroll = nil;
    if (!MYUIIsChat(vc, &input, &scroll)) return;
    MYUIUpdateExternalContext(vc, input, scroll);
    MYSAInvalidateReplies();
    MYUIRefreshPanel(vc);
    MYSARequestRefresh();
}

- (void)settingsTapped:(UIButton *)sender { MYUIOpenSettings(); }

- (void)quickLongPressed:(UILongPressGestureRecognizer *)gesture {
    if (gesture.state == UIGestureRecognizerStateBegan) MYUIOpenSettings();
}
@end

#pragma mark - Foreground monitor

static void MYUITick(void) {
    UIViewController *vc = MYUITopController();
    if (!vc || [vc isKindOfClass:MYUISettingsController.class]) return;
    UIView *input = nil; UIScrollView *scroll = nil;
    if (MYUIIsChat(vc, &input, &scroll)) {
        gMYUILastChatVC = vc;
        MYUIEnsureQuickButton(vc, input);
        MYUIUpdateExternalContext(vc, input, scroll);
        UIView *panel = [vc.view viewWithTag:kMYUIPanelTag];
        if (panel) {
            MYUILayoutPanel(vc, panel, input);
            MYUIRefreshPanel(vc);
        }
    } else {
        UIViewController *old = gMYUILastChatVC;
        if (old && old != vc && old.isViewLoaded) {
            [[old.view viewWithTag:kMYUIQuickTag] removeFromSuperview];
            [[old.view viewWithTag:kMYUIPanelTag] removeFromSuperview];
        }
    }
}

__attribute__((constructor)) static void MYUIInit(void) {
    @autoreleasepool {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (gMYUITimer) return;
            gMYUITimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
            dispatch_source_set_timer(gMYUITimer,
                                      dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.25 * NSEC_PER_SEC)),
                                      (uint64_t)(0.35 * NSEC_PER_SEC),
                                      (uint64_t)(0.05 * NSEC_PER_SEC));
            dispatch_source_set_event_handler(gMYUITimer, ^{ MYUITick(); });
            dispatch_resume(gMYUITimer);
        });
    }
}
