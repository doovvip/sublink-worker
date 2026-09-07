#import "MiYouStandaloneAI.h"
#import <UIKit/UIKit.h>

static NSInteger const kMYSettingsEntryTag = 0x4D595381;
static NSInteger const kMYQuickButtonTag = 0x4D595361;
static NSInteger const kMYQuickPanelSettingsTag = 0x4D595368;
static dispatch_source_t gMYSettingsTimer;

static NSString *MYSettingsTrim(id value) {
    if (![value isKindOfClass:NSString.class]) return @"";
    return [(NSString *)value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
}

static UIWindow *MYSettingsKeyWindow(void) {
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

static UIViewController *MYSettingsTopFrom(UIViewController *vc) {
    if (!vc) return nil;
    if (vc.presentedViewController) return MYSettingsTopFrom(vc.presentedViewController);
    if ([vc isKindOfClass:UINavigationController.class]) return MYSettingsTopFrom(((UINavigationController *)vc).visibleViewController);
    if ([vc isKindOfClass:UITabBarController.class]) return MYSettingsTopFrom(((UITabBarController *)vc).selectedViewController);
    return vc;
}

static UIViewController *MYSettingsTop(void) {
    return MYSettingsTopFrom(MYSettingsKeyWindow().rootViewController);
}

static void MYFindTables(UIView *view, NSMutableArray<UITableView *> *out) {
    if (!view || view.hidden) return;
    if ([view isKindOfClass:UITableView.class]) [out addObject:(UITableView *)view];
    for (UIView *sub in view.subviews) MYFindTables(sub, out);
}

@interface MYStandaloneSettingsController : UITableViewController
@end

@implementation MYStandaloneSettingsController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.title = @"AI助手设置";
    self.tableView.backgroundColor = UIColor.systemGroupedBackgroundColor;
}

- (NSInteger)numberOfSectionsInTableView:(UITableView *)tableView { return 4; }

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section {
    if (section == 0) return 4;
    if (section == 1) return 2;
    if (section == 2) return 2;
    return 2;
}

- (NSString *)tableView:(UITableView *)tableView titleForHeaderInSection:(NSInteger)section {
    if (section == 0) return @"AI 快捷回复";
    if (section == 1) return @"消息设置";
    if (section == 2) return @"功能入口";
    return @"关于";
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath {
    UITableViewCell *cell = [[UITableViewCell alloc] initWithStyle:UITableViewCellStyleValue1 reuseIdentifier:nil];
    cell.backgroundColor = UIColor.secondarySystemGroupedBackgroundColor;
    cell.selectionStyle = UITableViewCellSelectionStyleNone;

    if (indexPath.section == 0) {
        NSArray *titles = @[@"AI 快捷回复", @"后台预生成", @"上下文数量", @"回复预设"];
        NSArray *details = @[@"已开启", @"已开启", @"最近 30 条", @"默认"];
        cell.textLabel.text = titles[indexPath.row];
        cell.detailTextLabel.text = details[indexPath.row];
    } else if (indexPath.section == 1) {
        NSArray *titles = @[@"常驻后台", @"消息防撤回"];
        cell.textLabel.text = titles[indexPath.row];
        cell.detailTextLabel.text = @"待独立接入";
        cell.detailTextLabel.textColor = UIColor.secondaryLabelColor;
    } else if (indexPath.section == 2) {
        NSArray *titles = @[@"秘友设置", @"文件管理"];
        cell.textLabel.text = titles[indexPath.row];
        cell.detailTextLabel.text = @"保留入口";
        cell.detailTextLabel.textColor = UIColor.secondaryLabelColor;
    } else {
        if (indexPath.row == 0) {
            cell.textLabel.text = @"运行模式";
            cell.detailTextLabel.text = @"独立版";
        } else {
            cell.textLabel.text = @"核心版本";
            cell.detailTextLabel.text = MYSAVersion() ?: @"-";
        }
    }
    return cell;
}

@end

@interface MYStandaloneSettingsBridge : NSObject
+ (instancetype)shared;
- (void)openSettings:(id)sender;
@end

@implementation MYStandaloneSettingsBridge
+ (instancetype)shared {
    static MYStandaloneSettingsBridge *obj;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ obj = [MYStandaloneSettingsBridge new]; });
    return obj;
}

- (void)openSettings:(id)sender {
    UIViewController *top = MYSettingsTop();
    if (!top || [top isKindOfClass:MYStandaloneSettingsController.class]) return;
    MYStandaloneSettingsController *settings = [[MYStandaloneSettingsController alloc] initWithStyle:UITableViewStyleInsetGrouped];
    if (top.navigationController) {
        [top.navigationController pushViewController:settings animated:YES];
    } else {
        UINavigationController *nav = [[UINavigationController alloc] initWithRootViewController:settings];
        [top presentViewController:nav animated:YES completion:nil];
    }
}
@end

static BOOL MYIsWeChatSettingsController(UIViewController *vc) {
    if (!vc || [vc isKindOfClass:MYStandaloneSettingsController.class]) return NO;
    NSString *title = MYSettingsTrim(vc.navigationItem.title ?: vc.title);
    NSString *cls = NSStringFromClass(vc.class);
    if ([title isEqualToString:@"设置"]) return YES;
    BOOL classLooksSettings = [cls rangeOfString:@"Setting" options:NSCaseInsensitiveSearch].location != NSNotFound ||
                              [cls rangeOfString:@"Settings" options:NSCaseInsensitiveSearch].location != NSNotFound;
    return classLooksSettings && ![title containsString:@"AI助手"];
}

static void MYInstallSettingsEntry(UIViewController *vc) {
    if (!MYIsWeChatSettingsController(vc) || !vc.isViewLoaded || !vc.view.window) return;

    NSMutableArray<UITableView *> *tables = [NSMutableArray array];
    MYFindTables(vc.view, tables);
    UITableView *table = tables.firstObject;

    if (table && ![table.tableHeaderView viewWithTag:kMYSettingsEntryTag]) {
        UIView *oldHeader = table.tableHeaderView;
        CGFloat oldH = oldHeader ? CGRectGetHeight(oldHeader.frame) : 0;
        CGFloat width = MAX(CGRectGetWidth(table.bounds), 320);
        UIView *wrapper = [[UIView alloc] initWithFrame:CGRectMake(0, 0, width, oldH + 66)];
        wrapper.backgroundColor = UIColor.clearColor;
        if (oldHeader) {
            oldHeader.frame = CGRectMake(0, 0, width, oldH);
            [wrapper addSubview:oldHeader];
        }

        UIButton *entry = [UIButton buttonWithType:UIButtonTypeSystem];
        entry.tag = kMYSettingsEntryTag;
        entry.frame = CGRectMake(16, oldH + 8, width - 32, 50);
        entry.backgroundColor = UIColor.secondarySystemGroupedBackgroundColor;
        entry.layer.cornerRadius = 10;
        entry.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft;
        entry.titleLabel.font = [UIFont systemFontOfSize:16];
        [entry setTitle:@"  AI助手设置                                      ›" forState:UIControlStateNormal];
        [entry setTitleColor:UIColor.labelColor forState:UIControlStateNormal];
        [entry addTarget:MYStandaloneSettingsBridge.shared action:@selector(openSettings:) forControlEvents:UIControlEventTouchUpInside];
        [wrapper addSubview:entry];
        table.tableHeaderView = wrapper;
    }

    if (!table && !vc.navigationItem.rightBarButtonItem) {
        vc.navigationItem.rightBarButtonItem = [[UIBarButtonItem alloc] initWithTitle:@"AI助手" style:UIBarButtonItemStylePlain target:MYStandaloneSettingsBridge.shared action:@selector(openSettings:)];
    }
}

static void MYRemoveQuickReplySettingsEntrypoints(UIViewController *vc) {
    if (!vc || !vc.isViewLoaded) return;
    UIView *settingsButton = [vc.view viewWithTag:kMYQuickPanelSettingsTag];
    if (settingsButton) {
        settingsButton.hidden = YES;
        settingsButton.userInteractionEnabled = NO;
    }
    UIView *quick = [vc.view viewWithTag:kMYQuickButtonTag];
    if (quick) {
        for (UIGestureRecognizer *gesture in [quick.gestureRecognizers copy]) {
            if ([gesture isKindOfClass:UILongPressGestureRecognizer.class]) [quick removeGestureRecognizer:gesture];
        }
    }
}

static void MYSettingsTick(void) {
    UIViewController *top = MYSettingsTop();
    if (!top) return;
    MYInstallSettingsEntry(top);
    MYRemoveQuickReplySettingsEntrypoints(top);
}

__attribute__((constructor)) static void MYStandaloneSettingsInit(void) {
    @autoreleasepool {
        dispatch_async(dispatch_get_main_queue(), ^{
            gMYSettingsTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, dispatch_get_main_queue());
            dispatch_source_set_timer(gMYSettingsTimer,
                                      dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.8 * NSEC_PER_SEC)),
                                      (uint64_t)(0.7 * NSEC_PER_SEC),
                                      (uint64_t)(0.1 * NSEC_PER_SEC));
            dispatch_source_set_event_handler(gMYSettingsTimer, ^{ MYSettingsTick(); });
            dispatch_resume(gMYSettingsTimer);
        });
    }
}
